import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  correlationId: string;
  details?: unknown;
}

/**
 * Single error shape for the whole API, so the frontend never has to guess.
 *
 * Unexpected errors are logged with a correlation id and returned as a generic
 * message - internal details (SQL, stack traces, constraint internals) must
 * not leak to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = randomUUID();

    const body = this.toErrorBody(exception, request, correlationId);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${correlationId}] ${request.method} ${request.url} -> ${body.statusCode}: ${String(body.message)}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(
    exception: unknown,
    request: Request,
    correlationId: string,
  ): ErrorBody {
    const base = {
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          ...base,
          statusCode: status,
          error: HttpStatus[status] ?? 'ERROR',
          message: payload,
        };
      }

      const { message, statusCode: _ignoredStatus, error: _ignoredError, ...rest } =
        payload as Record<string, unknown> & {
          message?: string | string[];
        };

      // Keep any extra keys the thrower attached - for example the
      // `duplicates` and `requiresConfirmation` fields on a vendor conflict,
      // which the review UI needs in order to offer "create anyway".
      return {
        ...base,
        ...rest,
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: message ?? exception.message,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { ...base, ...this.mapPrismaError(exception) };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'BAD_REQUEST',
        message: 'The request did not match the expected data shape.',
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message:
        'An unexpected error occurred. Quote the correlation id when reporting this.',
    };
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    error: string;
    message: string;
    details?: unknown;
  } {
    const target = (error.meta?.target as string[] | string | undefined) ?? [];
    const fields = Array.isArray(target) ? target.join(', ') : String(target);

    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'CONFLICT',
          message: fields
            ? `A record with this ${fields} already exists.`
            : 'A record with these unique values already exists.',
          details: { fields: target },
        };

      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BAD_REQUEST',
          message:
            'A referenced record does not exist. Check the linked identifiers.',
        };

      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'NOT_FOUND',
          message: 'The requested record was not found.',
        };

      case 'P2023':
        // Malformed value for the column type, e.g. a non-UUID id that
        // reached a query without passing a ParseUUIDPipe.
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'BAD_REQUEST',
          message: 'A supplied identifier is not valid.',
        };

      case 'P2014':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'CONFLICT',
          message:
            'This record is referenced by other records and cannot be removed.',
        };

      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'DATABASE_ERROR',
          message: 'A database error occurred.',
        };
    }
  }
}
