import 'server-only';
import { apiFetch } from './api';
import { EMPTY_PAYMENT_ALERTS, type PaymentAlertsResponse } from './payment-alerts-types';

/**
 * Open payment due alerts for the signed-in user. A failure is logged and
 * returns no alerts, so the header and dashboard still render. The alerts
 * themselves are computed by the API from current invoice and payment data.
 */
export async function getPaymentAlerts(): Promise<PaymentAlertsResponse> {
  try {
    return await apiFetch<PaymentAlertsResponse>('/payment-alerts');
  } catch (error) {
    console.error('[payment-alerts] Could not load payment due alerts.', error);
    return EMPTY_PAYMENT_ALERTS;
  }
}
