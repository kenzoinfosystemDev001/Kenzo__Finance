'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { DuplicateMatch, OcrJob, VendorDetail } from './types';

export interface VendorFormState {
  error?: string;
  fieldErrors?: string[];
  duplicates?: DuplicateMatch[];
  requiresConfirmation?: boolean;
  /** Echoed back so the form can repopulate after a failed submit. */
  values?: Record<string, string>;
}

const TEXT_FIELDS = [
  'businessName', 'legalName', 'contactPerson', 'email', 'phone',
  'alternatePhone', 'website', 'addressLine1', 'addressLine2', 'city',
  'state', 'postalCode', 'country', 'gstin', 'pan', 'categoryId', 'notes',
] as const;

function readFormValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of TEXT_FIELDS) {
    const value = String(formData.get(field) ?? '').trim();
    if (value) values[field] = value;
  }
  return values;
}

/** Turns an ApiError into form state instead of a crash page. */
function toFormState(
  error: unknown,
  values: Record<string, string>,
): VendorFormState {
  if (error instanceof ApiError) {
    const body = error.body as {
      duplicates?: DuplicateMatch[];
      requiresConfirmation?: boolean;
    };

    return {
      error: error.messages[0],
      fieldErrors: error.messages.length > 1 ? error.messages : undefined,
      duplicates: body.duplicates,
      requiresConfirmation: body.requiresConfirmation,
      values,
    };
  }

  return {
    error: 'Could not reach the server. Please try again.',
    values,
  };
}

export async function createVendorAction(
  _prevState: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const values = readFormValues(formData);

  if (!values.businessName) {
    return { error: 'Vendor name is required.', values };
  }

  const companyIds = formData
    .getAll('companyIds')
    .map((value) => String(value))
    .filter(Boolean);

  const ocrJobId = String(formData.get('ocrJobId') ?? '').trim();

  let vendor: VendorDetail;

  try {
    vendor = await apiFetch<VendorDetail>('/vendors', {
      method: 'POST',
      body: {
        ...values,
        ...(companyIds.length > 0 ? { companyIds } : {}),
        ...(ocrJobId ? { ocrJobId } : {}),
        confirmPossibleDuplicate:
          formData.get('confirmPossibleDuplicate') === 'true',
      },
    });
  } catch (error) {
    return toFormState(error, values);
  }

  revalidatePath('/vendors');
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendorAction(
  vendorId: string,
  _prevState: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const values = readFormValues(formData);

  try {
    await apiFetch(`/vendors/${vendorId}`, { method: 'PATCH', body: values });
  } catch (error) {
    return toFormState(error, values);
  }

  revalidatePath('/vendors');
  revalidatePath(`/vendors/${vendorId}`);
  redirect(`/vendors/${vendorId}`);
}

export async function archiveVendorAction(formData: FormData): Promise<void> {
  const vendorId = String(formData.get('vendorId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  await apiFetch(`/vendors/${vendorId}/archive`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });

  revalidatePath('/vendors');
  revalidatePath(`/vendors/${vendorId}`);
}

export async function restoreVendorAction(formData: FormData): Promise<void> {
  const vendorId = String(formData.get('vendorId') ?? '');

  await apiFetch(`/vendors/${vendorId}/restore`, { method: 'POST' });

  revalidatePath('/vendors');
  revalidatePath(`/vendors/${vendorId}`);
}

export interface MappingState {
  error?: string;
  success?: string;
}

export async function mapProductAction(
  _prevState: MappingState,
  formData: FormData,
): Promise<MappingState> {
  const vendorId = String(formData.get('vendorId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const vendorSku = String(formData.get('vendorSku') ?? '').trim();
  const leadTimeDays = String(formData.get('leadTimeDays') ?? '').trim();

  if (!productId) return { error: 'Select a product to map.' };

  try {
    await apiFetch(`/vendors/${vendorId}/products`, {
      method: 'POST',
      body: {
        productId,
        ...(vendorSku ? { vendorSku } : {}),
        ...(leadTimeDays ? { leadTimeDays: Number(leadTimeDays) } : {}),
        isPreferred: formData.get('isPreferred') === 'on',
      },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'Could not map the product.',
    };
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { success: 'Product mapped to this vendor.' };
}

export async function unmapProductAction(formData: FormData): Promise<void> {
  const vendorId = String(formData.get('vendorId') ?? '');
  const productId = String(formData.get('productId') ?? '');

  await apiFetch(`/vendors/${vendorId}/products/${productId}`, {
    method: 'DELETE',
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function mapCompanyAction(
  _prevState: MappingState,
  formData: FormData,
): Promise<MappingState> {
  const vendorId = String(formData.get('vendorId') ?? '');
  const companyId = String(formData.get('companyId') ?? '');

  if (!companyId) return { error: 'Select a brand to map.' };

  try {
    await apiFetch(`/vendors/${vendorId}/companies`, {
      method: 'POST',
      body: { companyId, isAuthorized: formData.get('isAuthorized') === 'on' },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError ? error.messages[0] : 'Could not map the brand.',
    };
  }

  revalidatePath(`/vendors/${vendorId}`);
  return { success: 'Brand mapped to this vendor.' };
}

export async function unmapCompanyAction(formData: FormData): Promise<void> {
  const vendorId = String(formData.get('vendorId') ?? '');
  const companyId = String(formData.get('companyId') ?? '');

  await apiFetch(`/vendors/${vendorId}/companies/${companyId}`, {
    method: 'DELETE',
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export interface OcrUploadState {
  error?: string;
  job?: OcrJob;
}

/**
 * Uploads a document and returns the extracted draft for review.
 * No vendor is created here - the user confirms on the next screen.
 */
export async function uploadVendorDocumentAction(
  _prevState: OcrUploadState,
  formData: FormData,
): Promise<OcrUploadState> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a document to upload.' };
  }

  const upload = new FormData();
  upload.set('file', file);

  try {
    const job = await apiFetch<OcrJob>('/ocr/vendor-documents', {
      method: 'POST',
      formData: upload,
    });
    return { job };
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The document could not be processed.',
    };
  }
}
