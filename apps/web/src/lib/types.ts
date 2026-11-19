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
  _count: { products: number; companies: number };
}

export interface VendorDetail extends Omit<VendorListItem, '_count'> {
  alternatePhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  country: string;
  pan: string | null;
  notes: string | null;
  contacts: VendorContact[];
  companies: VendorCompanyMapping[];
  products: VendorProductMapping[];
  documents: VendorDocument[];
  createdBy: { id: string; fullName: string } | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface VendorContact {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface VendorCompanyMapping {
  id: string;
  companyId: string;
  isAuthorized: boolean;
  remarks: string | null;
  company: { id: string; name: string; code: string | null };
}

export interface VendorProductMapping {
  id: string;
  productId: string;
  vendorSku: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  remarks: string | null;
  product: {
    id: string;
    productCode: string;
    name: string;
    modelNumber: string;
    designNumber: string | null;
    company: { id: string; name: string };
    category: { id: string; name: string } | null;
  };
}

export interface VendorDocument {
  id: string;
  kind: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
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
  matchedOn: 'gstin' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
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
  } | null;
  document: {
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
  prefill?: Record<string, string>;
}
