import type {
  VendorAddress,
  VendorAddressType,
  VendorContactType,
  VendorDocumentKind,
} from './types';

/** Display labels for vendor enums. One place, so every screen agrees. */

export const CONTACT_TYPE_LABELS: Record<VendorContactType, string> = {
  GENERAL: 'General',
  SALES: 'Sales',
  ACCOUNTS: 'Accounts',
  SUPPORT: 'Support / Service',
  MANAGEMENT: 'Management',
  LOGISTICS: 'Logistics',
};

export const ADDRESS_TYPE_LABELS: Record<VendorAddressType, string> = {
  REGISTERED_OFFICE: 'Registered Office',
  OFFICE: 'Office',
  WAREHOUSE: 'Warehouse',
  OTHER: 'Other',
};

/** Product document kinds (images are handled separately). */
export const PRODUCT_DOCUMENT_KIND_LABELS = {
  PRODUCT_BROCHURE: 'Product Brochure',
  PRODUCT_TECH_SPEC: 'Technical Specification',
  PRODUCT_DATASHEET: 'Datasheet',
  PRODUCT_MANUAL: 'Product Manual',
  PRODUCT_WARRANTY: 'Warranty Document',
  PRODUCT_OTHER: 'Other Document',
} as const;

export type ProductDocumentKind = keyof typeof PRODUCT_DOCUMENT_KIND_LABELS;

export const DOCUMENT_KIND_LABELS: Record<VendorDocumentKind, string> = {
  VENDOR_VISITING_CARD: 'Visiting Card',
  VENDOR_GST_CERTIFICATE: 'GST Certificate',
  VENDOR_PAN: 'PAN Document',
  VENDOR_REGISTRATION_CERTIFICATE: 'Company Registration Certificate',
  VENDOR_AGREEMENT: 'Vendor Agreement',
  VENDOR_PRODUCT_CATALOGUE: 'Product Catalogue',
  VENDOR_ONBOARDING: 'Onboarding Document',
  VENDOR_OTHER: 'Other Document',
};

/** Kinds offered in upload pickers, in the order users expect them. */
export const UPLOADABLE_DOCUMENT_KINDS: VendorDocumentKind[] = [
  'VENDOR_VISITING_CARD',
  'VENDOR_GST_CERTIFICATE',
  'VENDOR_PAN',
  'VENDOR_REGISTRATION_CERTIFICATE',
  'VENDOR_AGREEMENT',
  'VENDOR_PRODUCT_CATALOGUE',
  'VENDOR_OTHER',
];

export function documentKindLabel(kind: string): string {
  return (
    DOCUMENT_KIND_LABELS[kind as VendorDocumentKind] ??
    PRODUCT_DOCUMENT_KIND_LABELS[kind as ProductDocumentKind] ??
    kind.replace(/_/g, ' ').toLowerCase()
  );
}

/** Specifications arrive as [{name,value}] or, for legacy rows, as {key: value}. */
export function specificationList(value: unknown): Array<{ name: string; value: string }> {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object' && 'name' in item)
      .map((item) => ({ name: String(item.name), value: String(item.value ?? '') }));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([name, v]) => ({ name, value: String(v) }));
  }
  return [];
}

export const ACTIVITY_LABELS: Record<string, string> = {
  'vendor.create': 'Vendor created',
  'vendor.update': 'Vendor updated',
  'vendor.activate': 'Vendor activated',
  'vendor.deactivate': 'Vendor deactivated',
  'vendor.archive': 'Vendor archived',
  'vendor.restore': 'Vendor restored',
  'vendor.delete': 'Vendor deleted',
  'vendor.contact.create': 'Contact added',
  'vendor.contact.update': 'Contact updated',
  'vendor.contact.delete': 'Contact removed',
  'vendor.address.create': 'Address added',
  'vendor.address.update': 'Address updated',
  'vendor.address.delete': 'Address removed',
  'vendor.company.map': 'Brand mapped',
  'vendor.company.update': 'Brand mapping updated',
  'vendor.company.unmap': 'Brand removed',
  'vendor.product.map': 'Product mapped',
  'vendor.product.update': 'Product mapping updated',
  'vendor.product.unmap': 'Product removed',
  'document.upload': 'Document uploaded',
  'document.replace': 'Document replaced',
  'document.archive': 'Document removed',
  'document.download': 'Document downloaded',
  'document.preview': 'Document previewed',
  'product.create': 'Product created',
  'product.update': 'Product updated',
  'product.activate': 'Product activated',
  'product.deactivate': 'Product deactivated',
  'product.archive': 'Product archived',
  'product.restore': 'Product restored',
  'product.delete': 'Product deleted',
  'product.image.set': 'Product image added',
  'product.image.replace': 'Product image replaced',
  'product.image.remove': 'Product image removed',
  'product.model.create': 'Model added',
  'product.model.update': 'Model updated',
  'product.model.activate': 'Model activated',
  'product.model.deactivate': 'Model deactivated',
  'product.model.delete': 'Model deleted',
  'product.model.image.set': 'Model image added',
  'product.model.image.replace': 'Model image replaced',
  'product.model.image.remove': 'Model image removed',
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "+919876543210" -> "+91 98765 43210"; anything else is returned as stored. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\+91)?(\d{5})(\d{5})$/.exec(value);
  if (match) return `${match[1] ? '+91 ' : ''}${match[2]} ${match[3]}`;
  return value;
}

export function canPreviewInline(mimeType: string): boolean {
  return ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType);
}

/** Address as display lines: street, street 2, "City, State - PIN", country. */
export function formatAddress(
  address: Pick<VendorAddress, 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'postalCode' | 'country'>,
): string[] {
  const locality =
    [address.city, address.state].filter(Boolean).join(', ') +
    (address.postalCode ? ` - ${address.postalCode}` : '');
  return [address.addressLine1, address.addressLine2, locality, address.country].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
}
