import { apiFetch, ApiError } from '@/lib/api';
import type { QuotationEmailRecord, QuotationEmailStatus } from '@/lib/quotation-email-actions';
import { formatDateTime } from '@/lib/vendor-labels';
import { Badge, EmptyState, ErrorState } from '@/components/ui';

const STATUS: Record<QuotationEmailStatus, { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  ACCEPTED: { label: 'Accepted by mail server', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  PENDING: { label: 'Sending', tone: 'warning' },
};

/**
 * Every email attempt for a quotation, newest first. "Accepted by mail server"
 * is the SMTP server's acceptance; delivery to the inbox is not confirmed.
 */
export async function EmailHistory({ quotationId }: { quotationId: string }) {
  let rows: QuotationEmailRecord[] = [];
  let error: string | null = null;
  try {
    rows = await apiFetch<QuotationEmailRecord[]>(`/quotations/${quotationId}/emails`);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.messages[0] : 'Email history could not be loaded.';
  }

  if (error) return <ErrorState title="Email history unavailable" message={error} />;
  if (rows.length === 0) {
    return <EmptyState title="No emails sent yet" description="Revisions emailed from the Documents tab appear here with their result." />;
  }

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-bold text-ink">Email history</h2>
        <p className="mt-1 text-sm text-ink-muted">
          &ldquo;Accepted by mail server&rdquo; means the mail server took the message. It does not confirm delivery to the inbox.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Sent</th>
              <th scope="col">Recipient</th>
              <th scope="col">Revision</th>
              <th scope="col">Sent by</th>
              <th scope="col">Result</th>
              <th scope="col">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = STATUS[row.status];
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td>
                    <p className="font-medium text-ink">{row.recipientName}</p>
                    <p className="text-xs text-ink-muted">{row.recipientEmail}</p>
                    {row.ccEmails.length > 0 && <p className="text-xs text-ink-subtle">CC {row.ccEmails.join(', ')}</p>}
                  </td>
                  <td className="tabular-nums">R{row.revisionNumber}</td>
                  <td>{row.sentByName ?? '—'}</td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {row.errorMessage && <p className="mt-1 max-w-xs text-xs text-danger">{row.errorMessage}</p>}
                  </td>
                  <td className="max-w-[16rem] break-all font-mono text-xs text-ink-subtle">{row.messageId ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
