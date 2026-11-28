'use client';

import { useCallback, useState, useTransition } from 'react';
import { isEmail, Modal, TextField } from '@/components/client-ui';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import {
  searchQuotationRecipientsAction,
  sendQuotationEmailAction,
  type EmailRecipientOption,
  type EmailRecipientType,
  type QuotationEmailRecord,
} from '@/lib/quotation-email-actions';

const MAX_CC = 5;
const MESSAGE_MAX = 1000;

/** Splits "a@x.com, b@y.com" (or semicolons, spaces, new lines) into addresses. */
function parseCc(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Email action for one issued revision. Opens a fresh dialog each time, so every opening is a new send. */
export function QuotationEmailButton({
  quotationId,
  quotationNumber,
  revisionNumber,
}: {
  quotationId: string;
  quotationNumber: string;
  revisionNumber: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-secondary h-8 px-3 text-sm"
        onClick={() => setOpen(true)}
        aria-label={`Email revision ${revisionNumber}`}
      >
        Email
      </button>
      {open && (
        <QuotationEmailDialog
          quotationId={quotationId}
          quotationNumber={quotationNumber}
          revisionNumber={revisionNumber}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function QuotationEmailDialog({
  quotationId,
  quotationNumber,
  revisionNumber,
  onClose,
}: {
  quotationId: string;
  quotationNumber: string;
  revisionNumber: number;
  onClose: () => void;
}) {
  const [type, setType] = useState<EmailRecipientType>('CUSTOMER');
  const [selected, setSelected] = useState<SearchOption[]>([]);
  const [recipient, setRecipient] = useState<EmailRecipientOption | null>(null);
  const [toEmail, setToEmail] = useState('');
  const [ccText, setCcText] = useState('');
  const [message, setMessage] = useState('');
  const [record, setRecord] = useState<QuotationEmailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per opening. A failed attempt gets a new key, so a retry is a real new send.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [sending, startSending] = useTransition();
  // Options seen in the latest search, so a pick can read its saved address.
  const [seen, setSeen] = useState<Map<string, EmailRecipientOption>>(new Map());

  const cc = parseCc(ccText);
  const ccInvalid = cc.some((address) => !isEmail(address)) || cc.length > MAX_CC;
  const toValid = isEmail(toEmail.trim());
  const accepted = record?.status === 'ACCEPTED';
  const canSend = Boolean(recipient) && toValid && !ccInvalid && !sending && !accepted;

  function changeType(next: EmailRecipientType) {
    setType(next);
    setSelected([]);
    setRecipient(null);
    setToEmail('');
    setError(null);
  }

  // Stable across renders: the picker refetches whenever this function changes.
  const search = useCallback(
    async (term: string): Promise<SearchOption[]> => {
      const result = await searchQuotationRecipientsAction(quotationId, type, term);
      if (result.error) setError(result.error);
      setSeen((previous) => {
        const next = new Map(previous);
        result.items.forEach((item) => next.set(item.id, item));
        return next;
      });
      return result.items.map((item) => ({
        id: item.id,
        label: item.name,
        detail: item.email ?? 'No saved email address',
      }));
    },
    [quotationId, type],
  );

  function pick(options: SearchOption[]) {
    setSelected(options);
    const chosen = options[0] ? seen.get(options[0].id) ?? null : null;
    setRecipient(chosen);
    setToEmail(chosen?.email ?? '');
    setError(null);
  }

  function send() {
    if (!recipient || !canSend) return;
    setError(null);
    startSending(async () => {
      const result = await sendQuotationEmailAction(quotationId, revisionNumber, {
        recipientType: recipient.type,
        recipientId: recipient.id,
        toEmail: toEmail.trim(),
        ccEmails: cc,
        message,
        idempotencyKey,
      });
      if (result.record) setRecord(result.record);
      if (result.error) {
        setError(result.error);
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Email quotation ${quotationNumber}`}
      description={`Sends revision ${revisionNumber} as a PDF attachment.`}
      size="lg"
      footer={
        accepted ? (
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
            <button type="button" className="btn-primary" onClick={send} disabled={!canSend}>
              {sending ? 'Sending...' : 'Send email'}
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Send to</legend>
          <div role="radiogroup" className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
            {(['CUSTOMER', 'VENDOR'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
                disabled={sending || accepted}
                onClick={() => changeType(option)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  type === option ? 'bg-sidebar text-white shadow-card' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {option === 'CUSTOMER' ? 'Customer' : 'Vendor'}
              </button>
            ))}
          </div>
        </fieldset>

        <SearchSelect
          label={type === 'CUSTOMER' ? 'Customer' : 'Vendor'}
          search={search}
          selected={selected}
          onChange={pick}
          emptyText="No matching records"
        />

        {recipient && (
          <div className="rounded-lg border border-border bg-surface-muted/60 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">{recipient.name}</p>
            <p className="text-ink-muted">
              {recipient.email ? `Saved address: ${recipient.email}` : 'No saved address on this record. Enter one for this email only.'}
            </p>
          </div>
        )}

        <TextField
          label="Recipient email"
          type="email"
          value={toEmail}
          onChange={(value) => setToEmail(value)}
          placeholder="name@company.com"
          error={toEmail.trim() && !toValid ? 'Enter a valid email address.' : undefined}
          hint="Used for this email only. The saved record is not changed."
        />

        <TextField
          label="CC (optional)"
          value={ccText}
          onChange={(value) => setCcText(value)}
          placeholder="Separate addresses with commas"
          error={ccInvalid ? `Enter valid addresses, up to ${MAX_CC}.` : undefined}
        />

        <div>
          <label htmlFor="quotation-email-message" className="mb-1.5 block text-sm font-medium text-ink">
            Personal message (optional)
          </label>
          <textarea
            id="quotation-email-message"
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            className="field-input min-h-[5rem] w-full py-2"
            placeholder="Added above the standard closing paragraph"
          />
          <p className="mt-1 text-right text-xs text-ink-subtle">{message.length}/{MESSAGE_MAX}</p>
        </div>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-ink-muted">
          <p>
            Attachment: quotation {quotationNumber}, revision {revisionNumber}, the same PDF as the download.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {accepted && record && (
          <div role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success">
            <p className="font-semibold">Accepted by the mail server</p>
            <p className="mt-1 text-ink-muted">
              Sent from {record.senderEmail} to {record.recipientEmail}
              {record.ccEmails.length > 0 && `, CC ${record.ccEmails.join(', ')}`}.
            </p>
            {record.messageId && <p className="mt-1 break-all font-mono text-xs text-ink-subtle">Reference: {record.messageId}</p>}
            <p className="mt-2 text-xs text-ink-subtle">
              The mail server confirmed it accepted the message. It does not confirm delivery to the recipient&apos;s inbox.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
