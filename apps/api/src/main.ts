import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  const webUrl = configService.get<string>('WEB_URL', 'http://localhost:3000');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  app.enableCors({
    origin: webUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown keys and reject payloads that carry them, so a client
      // cannot smuggle fields past a DTO into a Prisma call.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  // Swagger documents the contract for the frontend; it is not exposed in
  // production, where it would leak the full API surface to anonymous callers.
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Axiom Technologies Business Management API')
      .setDescription(
        'Shared API for all modules. Module 1: Vendor Management; ' +
          'Module 2 catalogue and inventory.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, config),
      { swaggerOptions: { persistAuthorization: true } },
    );
    logger.log(`API documentation: http://localhost:${port}/api/docs`);
  }

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
