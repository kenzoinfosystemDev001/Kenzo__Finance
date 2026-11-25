'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';

/**
 * Quotation email (Quotation -> Email). Every call goes to the API, which
 * enforces quotation.send and reads recipients and their saved addresses from
 * the shared customer and vendor records. Nothing here is trusted on its own.
 */

export type QuotationEmailStatus = 'PENDING' | 'ACCEPTED' | 'FAILED';
export type EmailRecipientType = 'CUSTOMER' | 'VENDOR';

export interface QuotationEmailRecord {
  id: string;
  revisionNumber: number;
  recipientType: EmailRecipientType;
  recipientName: string;
  recipientEmail: string;
  ccEmails: string[];
  subject: string;
  senderEmail: string;
  status: QuotationEmailStatus;
  messageId: string | null;
  serverResponse: string | null;
  errorMessage: string | null;
  sentByName: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EmailRecipientOption {
  id: string;
  type: EmailRecipientType;
  name: string;
  email: string | null;
}

export interface SendQuotationEmailInput {
  recipientType: EmailRecipientType;
  recipientId: string;
  toEmail: string;
  ccEmails: string[];
  message: string;
  idempotencyKey: string;
}

export type SendQuotationEmailResult = ActionResult & { record?: QuotationEmailRecord };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendQuotationEmailAction(
  quotationId: string,
  revisionNumber: number,
  input: SendQuotationEmailInput,
): Promise<SendQuotationEmailResult> {
  if (!UUID.test(quotationId) || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
    return { error: 'The quotation could not be identified. Reload the page and try again.' };
  }
  try {
    const record = await apiFetch<QuotationEmailRecord>(`/quotations/${quotationId}/revisions/${revisionNumber}/email`, {
      method: 'POST',
      body: {
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        toEmail: input.toEmail.trim(),
        ccEmails: input.ccEmails.length > 0 ? input.ccEmails : undefined,
        message: input.message.trim() || undefined,
        idempotencyKey: input.idempotencyKey,
      },
    });
    revalidatePath(`/quotations/${quotationId}`);
    if (record.status === 'ACCEPTED') return { ok: true, record };
    return { error: record.errorMessage ?? 'The mail server did not accept the email.', record };
  } catch (error) {
    return { error: error instanceof ApiError ? error.messages[0] : 'The email could not be sent. Try again.' };
  }
}

/** Customers or vendors matching a search, each with its saved email (if any). */
export async function searchQuotationRecipientsAction(
  quotationId: string,
  type: EmailRecipientType,
  term: string,
): Promise<{ items: EmailRecipientOption[]; error?: string }> {
  if (!UUID.test(quotationId)) return { items: [], error: 'The quotation could not be identified.' };
  try {
    const params = new URLSearchParams({ type });
    if (term.trim()) params.set('q', term.trim().slice(0, 100));
    const items = await apiFetch<EmailRecipientOption[]>(`/quotations/${quotationId}/email-recipients?${params.toString()}`);
    return { items };
  } catch (error) {
    return { items: [], error: error instanceof ApiError ? error.messages[0] : 'Recipients could not be loaded.' };
  }
}
