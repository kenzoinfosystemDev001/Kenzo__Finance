'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from './client-ui';
import { IconTrash } from './icons';

export type DeleteOutcome = { ok?: boolean; error?: string };

/**
 * Permanent delete with a confirmation dialog.
 *
 * The row only disappears after the server confirms the delete: the dialog
 * closes on success and the page is refreshed from the database. A refusal
 * (still in use, no permission, network error) stays in the dialog as the
 * server's message. While a delete is running, the confirm button is disabled
 * by ConfirmDialog, so a double click cannot send two requests.
 *
 * `blockedReason` shows the button disabled with the reason, for records that
 * are known to be in use, so no action is offered that would only be refused.
 */
export function DeleteRecordButton({
  recordName,
  message,
  onDelete,
  blockedReason,
}: {
  recordName: string;
  message: string;
  onDelete: () => Promise<DeleteOutcome>;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="icon-btn hover:bg-danger-subtle hover:text-danger"
        onClick={() => setOpen(true)}
        disabled={Boolean(blockedReason)}
        aria-label={`Delete ${recordName}`}
        title={blockedReason ?? 'Delete permanently'}
      >
        <IconTrash />
      </button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${recordName}?`}
        message={message}
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={async () => {
          const outcome = await onDelete();
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
    </>
  );
}
