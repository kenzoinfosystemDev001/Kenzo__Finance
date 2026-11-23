'use client';

import { useState } from 'react';
import { IconDownload } from '@/components/icons';

/** Filename the server sent in Content-Disposition, if any. */
function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Download button for an export route. It fetches the file first so a failure
 * shows a readable message on the page, instead of a raw error in a new tab.
 */
export function ExportButton({ href, label }: { href: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(href, { credentials: 'same-origin' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'The export could not be generated. Try again.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFrom(response.headers.get('content-disposition')) ?? 'export';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className="btn-secondary h-10" onClick={download} disabled={busy}>
        <IconDownload size={16} />
        {busy ? 'Preparing...' : label}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-right text-sm text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
