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
      .setTitle('Kenzo Infosystems ERP API')
      .setDescription(
        'ERP and Business Management System. Module 1: Vendor Management.',
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
