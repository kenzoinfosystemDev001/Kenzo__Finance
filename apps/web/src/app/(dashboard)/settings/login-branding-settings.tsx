'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ConfirmDialog, isEmail, ResultAlert, TextField } from '@/components/client-ui';
import { IconTrash, IconUpload } from '@/components/icons';
import {
  removeLoginBackgroundAction,
  updateSupportEmailAction,
  uploadLoginBackgroundAction,
} from '@/lib/branding-actions';
import type { ActionResult } from '@/lib/vendor-actions';

const MAX_BYTES = 5 * 1024 * 1024;

export function LoginBrandingSettings({
  backgroundUrl,
  supportEmail,
  canManage,
}: {
  backgroundUrl: string | null;
  supportEmail: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageResult, setImageResult] = useState<ActionResult & { success?: string }>({});
  const [emailResult, setEmailResult] = useState<ActionResult & { success?: string }>({});
  const [email, setEmail] = useState(supportEmail ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [savingEmail, startEmail] = useTransition();

  const upload = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageResult({ error: 'Choose a PNG, JPEG or WEBP image.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setImageResult({ error: 'The image must be 5 MB or smaller.' });
      return;
    }
    const formData = new FormData();
    formData.set('file', file);
    startUpload(async () => {
      const outcome = await uploadLoginBackgroundAction(formData);
      setImageResult(outcome.ok ? { success: 'Background updated. It now shows on the sign-in page.' } : outcome);
      if (fileRef.current) fileRef.current.value = '';
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-base font-medium text-ink">Background image</p>
          <p className="mt-1 text-sm text-ink-muted">
            Shown behind the welcome panel on the sign-in page, under a navy overlay so the text stays
            readable. Use a wide landscape photo, at least 1600 px wide. PNG, JPEG or WEBP, up to 5 MB.
          </p>
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                id="login-background-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              <label htmlFor="login-background-file" className={`btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                <IconUpload size={16} />
                {uploading ? 'Uploading...' : backgroundUrl ? 'Replace image' : 'Upload image'}
              </label>
              {backgroundUrl && (
                <button type="button" className="btn-secondary" onClick={() => setConfirmRemove(true)} disabled={uploading}>
                  <IconTrash size={16} /> Remove
                </button>
              )}
            </div>
          )}
          <div className="mt-3">
            <ResultAlert result={imageResult} />
          </div>
        </div>

        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-border bg-[#0b1a3d]">
          {backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- streamed preview of an uploaded image
            <img src={backgroundUrl} alt="Current sign-in background" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div
            aria-hidden
            className={`absolute inset-0 ${
              backgroundUrl
                ? 'bg-gradient-to-r from-[#071434]/95 via-[#0b1f4d]/80 to-[#0b1f4d]/30'
                : 'bg-gradient-to-br from-[#071434] via-[#0c2257] to-[#1d4fd8]'
            }`}
          />
          <div className="relative flex h-full flex-col justify-center p-5 text-white">
            <p className="text-xl font-bold">
              Welcome <span className="text-[#5b9dff]">Back!</span>
            </p>
            <p className="mt-1 text-xs text-blue-50/80">Preview of the sign-in panel</p>
            {!backgroundUrl && <p className="mt-3 text-xs text-blue-100/70">No image set &mdash; the plain navy design is used.</p>}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-base font-medium text-ink">Administrator contact</p>
        <p className="mt-1 text-sm text-ink-muted">
          Shown on the sign-in page as &ldquo;Contact Administrator&rdquo; and in the Forgot Password help.
          Leave empty to hide the button.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TextField
            className="w-full max-w-sm"
            label="Support email"
            type="email"
            value={email}
            onChange={(value) => {
              setEmail(value);
              setEmailResult({});
            }}
            placeholder="it-support@company.com"
            error={email.trim() && !isEmail(email) ? 'Enter a valid email address.' : undefined}
          />
          {canManage && (
            <button
              type="button"
              className="btn-primary"
              disabled={savingEmail || Boolean(email.trim() && !isEmail(email)) || email.trim() === (supportEmail ?? '')}
              onClick={() =>
                startEmail(async () => {
                  const outcome = await updateSupportEmailAction(email);
                  setEmailResult(outcome.ok ? { success: 'Saved.' } : outcome);
                  if (outcome.ok) router.refresh();
                })
              }
            >
              {savingEmail ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        <div className="mt-3 max-w-sm">
          <ResultAlert result={emailResult} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove background image?"
        message="The sign-in page will use the plain navy design. The image is archived, not deleted."
        confirmLabel="Remove image"
        onConfirm={async () => {
          const outcome = await removeLoginBackgroundAction();
          if (outcome.ok) {
            setImageResult({ success: 'Background removed.' });
            router.refresh();
          }
          return outcome;
        }}
      />
    </div>
  );
}
