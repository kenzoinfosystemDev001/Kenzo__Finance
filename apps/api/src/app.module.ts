import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { VendorsModule } from './vendors/vendors.module';
import { CompaniesModule } from './companies/companies.module';
import { ProductsModule } from './products/products.module';
import { DocumentsModule } from './documents/documents.module';
import { OcrModule } from './ocr/ocr.module';
import { NumberingModule } from './numbering/numbering.module';
import { StorageModule } from './storage/storage.module';
import { SettingsModule } from './settings/settings.module';
import { StockModule } from './stock/stock.module';
import { BrandingModule } from './branding/branding.module';
import { CustomersModule } from './customers/customers.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ProformaInvoicesModule } from './proforma-invoices/proforma-invoices.module';
import { FinalInvoicesModule } from './final-invoices/final-invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo-root .env, so one file configures both apps in development.
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    PrismaModule,
    AuditModule,
    SettingsModule,
    NumberingModule,
    StorageModule,

    AuthModule,
    VendorsModule,
    CompaniesModule,
    ProductsModule,
    StockModule,
    DocumentsModule,
    OcrModule,
    BrandingModule,
    CustomersModule,
    EnquiriesModule,
    QuotationsModule,
    ProformaInvoicesModule,
    FinalInvoicesModule,
    PaymentsModule,
    DeliveriesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: throttle, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
