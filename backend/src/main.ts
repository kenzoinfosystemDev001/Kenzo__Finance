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
  // A platform-injected PORT takes precedence over the local API_PORT.
  const port =
    configService.get<number>('PORT') ?? configService.get<number>('API_PORT', 4000);
  const webUrl = configService.get<string>('WEB_URL', 'http://localhost:3000');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  // Business data is never cached by browsers or shared caches. Routes that
  // may be cached (e.g. the public login background) set their own header,
  // which overrides this default.
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  // PostgreSQL cannot store NUL characters. A URL carrying one is refused here with a clear 400,
  // instead of reaching the database and failing as a server error.
  app.use((request: { originalUrl?: string; url?: string }, response: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    const url = request.originalUrl ?? request.url ?? '';
    if (url.includes('\u0000') || /%00/i.test(url)) {
      response.status(400).json({ statusCode: 400, error: 'BAD_REQUEST', message: 'The request contains an invalid character.' });
      return;
    }
    next();
  });

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
      .setTitle('Kenzo Infosystems Business Management API')
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

  // Bind to all interfaces. Containers route external traffic to the
  // container IP, so listening only on localhost would be unreachable.
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on port ${port} (base path /api/v1)`);
  logger.log(`CORS origin: ${webUrl}`);
}

void bootstrap();
