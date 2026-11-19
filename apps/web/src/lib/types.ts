export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export type VendorStatus = 'ACTIVE' | 'INACTIVE';

export type VendorContactType =
  | 'GENERAL'
  | 'SALES'
  | 'ACCOUNTS'
  | 'SUPPORT'
  | 'MANAGEMENT'
  | 'LOGISTICS';

export type VendorAddressType = 'REGISTERED_OFFICE' | 'OFFICE' | 'WAREHOUSE' | 'OTHER';

export type VendorDocumentKind =
  | 'VENDOR_VISITING_CARD'
  | 'VENDOR_GST_CERTIFICATE'
  | 'VENDOR_PAN'
  | 'VENDOR_REGISTRATION_CERTIFICATE'
  | 'VENDOR_AGREEMENT'
  | 'VENDOR_PRODUCT_CATALOGUE'
  | 'VENDOR_ONBOARDING'
  | 'VENDOR_OTHER';

export interface VendorListItem {
  id: string;
  vendorCode: string;
  businessName: string;
  legalName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  status: VendorStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  contacts: Array<{
    id: string;
    name: string;
    designation: string | null;
    phone: string | null;
    email: string | null;
  }>;
  companies: Array<{ company: { id: string; name: string } }>;
  _count: { products: number; companies: number };
}

export interface VendorSummary {
  vendors: {
    total: number;
    active: number;
    inactive: number;
    archived: number;
    addedLast30Days: number;
  };
  brandsCovered: number;
  productMappings: { total: number; addedLast30Days: number };
  productsCovered: number;
  generatedAt: string;
}

export interface VendorDetail
  extends Omit<VendorListItem, '_count' | 'contacts' | 'companies'> {
  registrationNumber: string | null;
  alternateEmail: string | null;
  alternatePhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  country: string;
  pan: string | null;
  notes: string | null;
  contacts: VendorContact[];
  addresses: VendorAddress[];
  companies: VendorCompanyMapping[];
  products: VendorProductMapping[];
  documents: VendorDocument[];
  createdBy: { id: string; fullName: string } | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface VendorContact {
  id: string;
  contactType: VendorContactType;
  name: string;
  designation: string | null;
  email: string | null;
  alternateEmail: string | null;
  phone: string | null;
  alternatePhone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface VendorAddress {
  id: string;
  addressType: VendorAddressType;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  isPrimary: boolean;
}

export interface VendorCompanyMapping {
  id: string;
  companyId: string;
  isAuthorized: boolean;
  remarks: string | null;
  createdAt: string;
  company: { id: string; name: string; code: string | null };
}

export interface VendorProductMapping {
  id: string;
  productId: string;
  vendorSku: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  remarks: string | null;
  createdAt: string;
  product: {
    id: string;
    productCode: string;
    name: string;
    modelNumber: string;
    designNumber: string | null;
    isActive: boolean;
    archivedAt: string | null;
    company: { id: string; name: string };
    category: { id: string; name: string } | null;
  };
}

export interface VendorDocument {
  id: string;
  kind: VendorDocumentKind | string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  replacesDocumentId: string | null;
  uploadedBy: { id: string; fullName: string } | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

export interface VendorCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { vendors: number };
}

export interface Company {
  id: string;
  name: string;
  code: string | null;
  website: string | null;
  isActive: boolean;
  _count?: { products: number; vendors: number };
}

export interface Product {
  id: string;
  productCode: string;
  name: string;
  modelNumber: string;
  designNumber: string | null;
  description: string | null;
  specifications: Record<string, string> | null;
  reorderLevel: number | null;
  isActive: boolean;
  archivedAt: string | null;
  imageDocumentId: string | null;
  company: { id: string; name: string; code: string | null };
  category: { id: string; name: string } | null;
  _count?: { vendors: number };
  // Present only when stock tracking is enabled.
  onHand?: number;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
}

export interface ProductDetail extends Product {
  createdAt: string;
  updatedAt: string;
  stockTrackingEnabled: boolean;
  stockByLocation?: Array<{
    location: { id: string; name: string; code: string } | null;
    onHand: number;
  }>;
  imageDocument: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  vendors: Array<{
    id: string;
    vendorId: string;
    vendorSku: string | null;
    leadTimeDays: number | null;
    isPreferred: boolean;
    vendor: {
      id: string;
      vendorCode: string;
      businessName: string;
      phone: string | null;
      email: string | null;
      city: string | null;
      status: string;
      archivedAt: string | null;
    };
  }>;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { products: number };
}

export type StockMovementType =
  | 'OPENING_BALANCE'
  | 'RECEIPT'
  | 'ISSUE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RETURN_IN'
  | 'RETURN_OUT';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
  product: { id: string; productCode: string; name: string; modelNumber: string };
  location: { id: string; name: string; code: string };
  createdBy: { id: string; fullName: string } | null;
}

export interface StockBalanceRow {
  id: string;
  productCode: string;
  name: string;
  modelNumber: string;
  reorderLevel: number | null;
  onHand: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  company: { id: string; name: string };
  category: { id: string; name: string } | null;
}

export interface StockSummary {
  trackedProducts: number;
  totalUnits: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
  movements: number;
  locations: number;
}

export interface StockLocation {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count?: { movements: number };
}

export interface AppSetting {
  key: string;
  value: unknown;
  description: string;
}

export interface DuplicateMatch {
  vendorId: string;
  vendorCode: string;
  businessName: string;
  status?: VendorStatus;
  archived?: boolean;
  matchedOn: 'gstin' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
}

export interface OcrEngineStatus {
  provider: string;
  readsScannedDocuments: boolean;
  message: string;
}

export interface OcrJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  provider: string;
  overallConfidence: number | null;
  errorMessage: string | null;
  consumedAt: string | null;
  resultingVendorId: string | null;
  createdAt: string;
  normalizedResult: {
    draft?: Record<string, { value: string | null; confidence: number | null }>;
    note?: string | null;
    suggestedBrands?: Array<{ id: string; name: string }>;
  } | null;
  document: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
  prefill?: Record<string, string>;
}
