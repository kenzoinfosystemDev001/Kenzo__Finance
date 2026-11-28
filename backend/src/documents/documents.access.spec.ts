import { NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@prisma/client';
import { PERMISSIONS } from '../common/authz/permissions';
import { DocumentsService } from './documents.service';

type Row = {
  kind: DocumentKind;
  vendorId: string | null;
  productId: string | null;
  customerId: string | null;
  enquiryId: string | null;
  quotationId: string | null;
  uploadedById: string | null;
  ocrJobs: Array<{ id: string }>;
};

const unattached = (overrides: Partial<Row> = {}): Row => ({
  kind: DocumentKind.VENDOR_OTHER,
  vendorId: null,
  productId: null,
  customerId: null,
  enquiryId: null,
  quotationId: null,
  uploadedById: 'uploader',
  ocrJobs: [],
  ...overrides,
});

function serviceFor(row: Row): DocumentsService {
  const prisma = { document: { findUnique: jest.fn().mockResolvedValue(row) } };
  // Only the Prisma client is used by assertGenericAccess.
  const Ctor = DocumentsService as unknown as new (...args: unknown[]) => DocumentsService;
  return new Ctor(prisma, {}, {}, {});
}

const user = (id: string, permissions: string[] = [PERMISSIONS.DOCUMENT_READ]) =>
  ({ id, roles: [], permissions }) as never;

describe('DocumentsService.assertGenericAccess (read)', () => {
  it('lets the uploader read their own unattached upload', async () => {
    await expect(serviceFor(unattached()).assertGenericAccess('d1', user('uploader'), 'read')).resolves.toBeUndefined();
  });

  it("hides another user's unattached upload behind a 404", async () => {
    await expect(serviceFor(unattached()).assertGenericAccess('d1', user('someone-else'), 'read')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an OCR reviewer read an OCR source document', async () => {
    const row = unattached({ ocrJobs: [{ id: 'job' }] });
    await expect(serviceFor(row).assertGenericAccess('d1', user('reviewer', [PERMISSIONS.DOCUMENT_READ, PERMISSIONS.OCR_READ]), 'read')).resolves.toBeUndefined();
  });

  it('lets a settings administrator read any unattached upload', async () => {
    await expect(serviceFor(unattached()).assertGenericAccess('d1', user('admin', [PERMISSIONS.SETTINGS_MANAGE]), 'read')).resolves.toBeUndefined();
  });

  it('still requires the owning module permission for attached documents', async () => {
    const row = unattached({ vendorId: 'v1', uploadedById: 'someone-else' });
    await expect(serviceFor(row).assertGenericAccess('d1', user('u', [PERMISSIONS.DOCUMENT_READ]), 'read')).rejects.toBeInstanceOf(NotFoundException);
    await expect(serviceFor(row).assertGenericAccess('d1', user('u', [PERMISSIONS.DOCUMENT_READ, PERMISSIONS.VENDOR_READ]), 'read')).resolves.toBeUndefined();
  });
});
