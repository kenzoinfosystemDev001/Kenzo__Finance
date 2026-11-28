import { Controller, Get, Headers, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import { PaymentAlertsService } from './payment-alerts.service';

/** Constant-time comparison, so the token cannot be guessed one character at a time. */
function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@ApiTags('Payment alerts')
@Controller('payment-alerts')
export class PaymentAlertsController {
  constructor(private readonly alerts: PaymentAlertsService) {}

  /** Open alerts for the signed-in user, computed from current invoice and payment data. */
  @Get()
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Open payment due alerts (due soon, due today, overdue)' })
  async list() {
    return this.alerts.openAlerts();
  }

  /** Reminders recorded for one invoice, with the customer email outcome. */
  @Get('invoices/:finalInvoiceId/reminders')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.INVOICE_READ)
  @ApiOperation({ summary: 'Payment reminder history of an invoice' })
  async history(@Param('finalInvoiceId', ParseUUIDPipe) finalInvoiceId: string) {
    return this.alerts.history(finalInvoiceId);
  }

  /** Records alert stages for today. Administrators run it on demand. */
  @Post('sweep')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record today\'s payment due alert stages (idempotent)' })
  async sweep() {
    return this.alerts.sweep(new Date());
  }

  /**
   * For an external scheduler, so alerts are recorded even while the API host
   * is asleep. Disabled unless PAYMENT_ALERT_CRON_TOKEN is set; the caller must
   * send the same value in the x-alert-token header.
   */
  @Post('cron')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-alert-token', required: true })
  @ApiOperation({ summary: 'Scheduled sweep for an external cron (token protected)' })
  async cron(@Headers('x-alert-token') token: string | undefined) {
    const expected = process.env.PAYMENT_ALERT_CRON_TOKEN;
    if (!expected || expected.length < 16) throw new NotFoundException();
    if (!tokenMatches(token, expected)) throw new UnauthorizedException('Invalid alert token.');
    return this.alerts.sweep(new Date());
  }
}
