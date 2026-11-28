import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { PasswordResetService } from './password-reset.service';

@Module({
  // JwtModule is registered globally: JwtAuthGuard is bound as an APP_GUARD in
  // AppModule, outside this module's injector, so it needs JwtService to be
  // resolvable application-wide. Secrets are passed per sign/verify call.
  imports: [JwtModule.register({ global: true }), AuditModule, EmailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, PasswordResetService],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
