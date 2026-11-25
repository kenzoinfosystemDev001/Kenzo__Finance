'use client';

import { DocumentsManager } from '@/components/documents-manager';
import {
  removeVendorDocumentAction,
  replaceVendorDocumentAction,
  uploadVendorDocumentAction,
} from '@/lib/vendor-actions';
import { DOCUMENT_KIND_LABELS, UPLOADABLE_DOCUMENT_KINDS } from '@/lib/vendor-labels';
import type { VendorDocument } from '@/lib/types';

const KINDS = UPLOADABLE_DOCUMENT_KINDS.map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABELS[kind] }));

export function DocumentsPanel({
  vendorId,
  documents,
  canManage,
  canDownload,
}: {
  vendorId: string;
  documents: VendorDocument[];
  canManage: boolean;
  canDownload: boolean;
}) {
  return (
    <DocumentsManager
      basePath={`/vendors/${vendorId}/documents`}
      documents={documents}
      kinds={KINDS}
      canUpload={canManage}
      canRemove={canManage}
      canDownload={canDownload}
      emptyText="Upload the visiting card, GST certificate, PAN, registration certificate, agreement or catalogue."
      onUpload={(formData) => uploadVendorDocumentAction(vendorId, formData)}
      onReplace={(documentId, formData) => replaceVendorDocumentAction(vendorId, documentId, formData)}
      onRemove={(documentId) => removeVendorDocumentAction(vendorId, documentId)}
    />
  );
}
