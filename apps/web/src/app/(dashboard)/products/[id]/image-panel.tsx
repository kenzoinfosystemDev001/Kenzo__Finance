'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  removeProductImageAction,
  uploadProductImageAction,
  type ImageUploadState,
} from '@/lib/inventory-actions';

function UploadButton({ hasImage }: { hasImage: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-secondary w-full" disabled={pending}>
      {pending ? 'Uploading...' : hasImage ? 'Replace image' : 'Upload image'}
    </button>
  );
}

export function ProductImagePanel({
  productId,
  imageDocumentId,
  imageFilename,
  canEdit,
}: {
  productId: string;
  imageDocumentId: string | null;
  imageFilename: string | null;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<ImageUploadState, FormData>(
    uploadProductImageAction.bind(null, productId),
    {},
  );

  return (
    <section className="card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Catalogue image</h2>
      </div>

      <div className="p-4">
        {imageDocumentId ? (
          <>
            {/* Streamed through a permission-checked route; storage is private
                so there is no public URL to point at. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/products/${productId}/image/${imageDocumentId}`}
              alt={imageFilename ?? 'Product image'}
              className="mb-3 w-full rounded-md border border-border bg-surface-muted object-contain"
              style={{ maxHeight: 220 }}
            />
            <p className="mb-3 truncate text-sm text-ink-subtle">{imageFilename}</p>
          </>
        ) : (
          <div className="mb-3 flex h-40 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted">
            <p className="text-sm text-ink-subtle">No image uploaded</p>
          </div>
        )}

        {canEdit && (
          <div className="space-y-2">
            <form action={formAction} className="space-y-2">
              <input
                name="file"
                type="file"
                required
                accept="image/png,image/jpeg,image/webp,image/tiff"
                className="field-input text-sm file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-2 file:py-1 file:text-sm file:text-ink"
                aria-label="Product image file"
              />
              <UploadButton hasImage={Boolean(imageDocumentId)} />
            </form>

            {imageDocumentId && (
              <form action={removeProductImageAction}>
                <input type="hidden" name="productId" value={productId} />
                <button
                  type="submit"
                  className="w-full text-sm text-danger hover:underline"
                >
                  Remove image
                </button>
              </form>
            )}

            {state.error && (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            )}
            {state.success && (
              <p role="status" className="text-sm text-success">
                {state.success}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
