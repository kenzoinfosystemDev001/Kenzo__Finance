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
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  product: {
    id: string;
    productCode: string;
    name: string;
    isActive: boolean;
    archivedAt: string | null;
    company: { id: string; name: string };
    category: { id: string; name: string } | null;
    _count: { models: number };
  };
  /** Specific models supplied; empty = the product as a whole. */
  models: Array<{
    id: string;
    productModelId: string;
    productModel: { id: string; modelCode: string; modelName: string; modelNumber: string; isActive: boolean };
  }>;
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

export interface Specification {
  name: string;
  value: string;
}

/** Product list row. Stock fields exist only when stock tracking is on. */
export interface Product {
  id: string;
  productCode: string;
  sku: string | null;
  name: string;
  description: string | null;
  reorderLevel: number | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  imageDocumentId: string | null;
  company: { id: string; name: string; code: string | null };
  category: { id: string; name: string } | null;
  _count: { vendors: number; models: number };
  /** Legacy single-model field; null for products created with models. */
  modelNumber?: string | null;
  onHand?: number;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
}

export interface ProductModel {
  id: string;
  modelCode: string;
  modelName: string;
  modelNumber: string;
  description: string | null;
  /** Array of {name,value}; legacy rows may hold a {key: value} object. */
  specifications: Specification[] | Record<string, string> | null;
  isActive: boolean;
  imageDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { vendors: number };
}

export interface ProductVendorMapping {
  id: string;
  vendorId: string;
  vendorSku: string | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  remarks: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  /** Whether the vendor is mapped to this product's brand. */
  brandMapped: boolean;
  vendor: {
    id: string;
    vendorCode: string;
    businessName: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    status: string;
    archivedAt: string | null;
    _count: { products: number };
    contacts: Array<{ name: string; phone: string | null; email: string | null }>;
  };
  models: Array<{ productModelId: string; productModel: { id: string; modelName: string; modelNumber: string } }>;
}

export interface ProductDetail extends Omit<Product, '_count'> {
  stockTrackingEnabled: boolean;
  stockByLocation?: Array<{
    location: { id: string; name: string; code: string } | null;
    onHand: number;
  }>;
  imageDocument: { id: string; originalFilename: string; mimeType: string; sizeBytes: number } | null;
  createdBy: { id: string; fullName: string } | null;
  updatedBy: { id: string; fullName: string } | null;
  models: ProductModel[];
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: { id: string; fullName: string } | null;
  }>;
  vendors: ProductVendorMapping[];
}

export interface ProductSummary {
  products: { total: number; active: number; inactive: number; archived: number; addedLast30Days: number };
  brands: number;
  models: { total: number; active: number };
  vendorMappings: { products: number; models: number };
  generatedAt: string;
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
  product: { id: string; productCode: string; name: string; modelNumber: string | null };
  location: { id: string; name: string; code: string };
  createdBy: { id: string; fullName: string } | null;
}

export interface StockBalanceRow {
  id: string;
  productCode: string;
  name: string;
  modelNumber: string | null;
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

// ---------------------------------------------------------------------------
// Customer Management (Module 3)
// ---------------------------------------------------------------------------

export type CustomerType = 'INDIVIDUAL' | 'BUSINESS';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE';
export type CustomerAddressType = 'BILLING' | 'SHIPPING' | 'OFFICE' | 'REGISTERED' | 'OTHER';

export interface CustomerCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { customers: number };
}

export interface CustomerListItem {
  id: string;
  customerCode: string;
  name: string;
  customerType: CustomerType;
  status: CustomerStatus;
  industry: string | null;
  gstin: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  contacts: Array<{ id: string; name: string; designation: string | null; phone: string | null; email: string | null }>;
  addresses: Array<{ city: string | null; state: string | null; country: string; addressType: CustomerAddressType }>;
  _count: { contacts: number; addresses: number; interests: number; documents: number };
}

export interface CustomerContact {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  isPrimary: boolean;
}

export interface CustomerAddress {
  id: string;
  addressType: CustomerAddressType;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

export interface CustomerProductInterest {
  id: string;
  productId: string;
  productModelId: string | null;
  notes: string | null;
  createdAt: string;
  product: { id: string; productCode: string; name: string; isActive: boolean; archivedAt: string | null; company: { id: string; name: string } };
  productModel: { id: string; modelCode: string; modelName: string; modelNumber: string; isActive: boolean } | null;
  createdBy: { id: string; fullName: string } | null;
}

export interface CustomerDetail {
  id: string;
  customerCode: string;
  customerType: CustomerType;
  name: string;
  status: CustomerStatus;
  industry: string | null;
  website: string | null;
  description: string | null;
  taxCountry: string;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  taxRegistrationNumber: string | null;
  otherRegistration: string | null;
  companySize: string | null;
  businessType: string | null;
  annualTurnoverRange: string | null;
  employeeCount: number | null;
  createdAt: string;
  updatedAt: string;
  category: CustomerCategory | null;
  contacts: CustomerContact[];
  addresses: CustomerAddress[];
  interests: CustomerProductInterest[];
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: { id: string; fullName: string } | null;
  }>;
  createdBy: { id: string; fullName: string } | null;
  updatedBy: { id: string; fullName: string } | null;
}

export interface CustomerSummary {
  total: number;
  active: number;
  inactive: number;
  individual: number;
  business: number;
  newThisMonth: number;
  generatedAt: string;
}

export interface CustomerDuplicate {
  customerId: string;
  customerCode: string;
  name: string;
  status: CustomerStatus;
  matchedOn: 'gstin' | 'pan' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
}

// ---------------------------------------------------------------------------
// Enquiry Management (Module 4)
// ---------------------------------------------------------------------------

export type EnquiryStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'FOLLOW_UP_PENDING'
  | 'REQUIREMENT_CLARIFICATION'
  | 'READY_FOR_QUOTATION'
  | 'CONVERTED'
  | 'ON_HOLD'
  | 'LOST'
  | 'CLOSED';
export type EnquiryPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type FollowUpMethod = 'PHONE' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'OTHER';
export type FollowUpOutcome =
  | 'INTERESTED'
  | 'CLARIFICATION_NEEDED'
  | 'AWAITING_RESPONSE'
  | 'NEGOTIATION_REQUIRED'
  | 'READY_FOR_QUOTATION'
  | 'NOT_INTERESTED'
  | 'OTHER';
export type EnquiryDocumentKind =
  | 'ENQUIRY_REQUIREMENT'
  | 'ENQUIRY_TECH_SPEC'
  | 'ENQUIRY_REFERENCE_IMAGE'
  | 'ENQUIRY_EXISTING_QUOTATION'
  | 'ENQUIRY_OTHER';

export interface UserRef {
  id: string;
  fullName: string;
}

export interface EnquirySource {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  _count?: { enquiries: number };
}

export interface EnquiryAssignee {
  id: string;
  fullName: string;
  email: string;
}

export interface EnquiryListItem {
  id: string;
  enquiryNumber: string;
  enquiryDate: string;
  status: EnquiryStatus;
  priority: EnquiryPriority;
  nextFollowUpDate: string | null;
  createdAt: string;
  customer: { id: string; customerCode: string; name: string; customerType: CustomerType; status: CustomerStatus };
  customerContact: { id: string; name: string; phone: string | null; email: string | null } | null;
  /** The chosen contact, or the customer's primary contact when none was chosen. */
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
  source: { id: string; name: string } | null;
  assignedTo: UserRef | null;
  _count: { items: number; followUps: number };
}

export interface EnquirySummary {
  total: number;
  new: number;
  inProgress: number;
  followUpPending: number;
  quotationPending: number;
  converted: number;
  lostClosed: number;
  onHold: number;
  overdueFollowUps: number;
  generatedAt: string;
}

export interface EnquiryItem {
  id: string;
  enquiryId: string;
  productId: string;
  productModelId: string | null;
  quantity: number;
  unit: string;
  technicalRequirements: string | null;
  remarks: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  product: { id: string; productCode: string; name: string; isActive: boolean; archivedAt: string | null; company: { id: string; name: string } };
  productModel: {
    id: string;
    modelCode: string;
    modelName: string;
    modelNumber: string;
    specifications: Specification[] | Record<string, string> | null;
    isActive: boolean;
  } | null;
}

export interface EnquiryFollowUp {
  id: string;
  enquiryId: string;
  contactId: string | null;
  followUpDate: string;
  method: FollowUpMethod;
  discussionSummary: string;
  customerResponse: string | null;
  outcome: FollowUpOutcome;
  nextFollowUpDate: string | null;
  assignedToId: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string } | null;
  assignedTo: UserRef | null;
  createdBy: UserRef | null;
}

export interface EnquiryStatusChange {
  id: string;
  previousStatus: EnquiryStatus | null;
  newStatus: EnquiryStatus;
  reason: string | null;
  changedAt: string;
  changedBy: UserRef | null;
}

export interface EnquiryDetail {
  id: string;
  enquiryNumber: string;
  enquiryDate: string;
  status: EnquiryStatus;
  priority: EnquiryPriority;
  customerId: string;
  customerContactId: string | null;
  sourceId: string | null;
  assignedToId: string | null;
  description: string | null;
  internalRemarks: string | null;
  expectedDecisionDate: string | null;
  /** Prisma Decimal, serialised as a string. */
  expectedBudget: string | null;
  currency: string;
  expectedDeliveryTimeline: string | null;
  paymentPreference: string | null;
  commercialNotes: string | null;
  nextFollowUpDate: string | null;
  convertedAt: string | null;
  convertedReference: string | null;
  createdAt: string;
  updatedAt: string;
  customer: Pick<
    CustomerDetail,
    'id' | 'customerCode' | 'customerType' | 'name' | 'status' | 'industry' | 'website' | 'gstin' | 'pan' | 'taxCountry'
  > & {
    category: { id: string; name: string } | null;
    contacts: CustomerContact[];
    /** Default addresses only. */
    addresses: CustomerAddress[];
  };
  customerContact: CustomerContact | null;
  source: { id: string; name: string } | null;
  assignedTo: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  convertedBy: UserRef | null;
  items: EnquiryItem[];
  followUps: EnquiryFollowUp[];
  statusHistory: EnquiryStatusChange[];
  documents: Array<{
    id: string;
    kind: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: UserRef | null;
  }>;
}

/** Row of the follow-up board for today / upcoming / overdue (open enquiries by next follow-up). */
export interface FollowUpBoardEnquiry {
  id: string;
  enquiryNumber: string;
  status: EnquiryStatus;
  priority: EnquiryPriority;
  nextFollowUpDate: string | null;
  customer: { id: string; name: string };
  customerContact: { name: string; phone: string | null } | null;
  assignedTo: UserRef | null;
  followUps: Array<{ followUpDate: string; outcome: FollowUpOutcome; discussionSummary: string }>;
}

/** Row of the follow-up board for completed (recorded follow-ups). */
export interface FollowUpBoardRecord extends Omit<EnquiryFollowUp, 'contact'> {
  enquiry: { id: string; enquiryNumber: string; status: EnquiryStatus; customer: { id: string; name: string } };
  contact: { name: string } | null;
}

export interface FollowUpCounts {
  today: number;
  upcoming: number;
  overdue: number;
  completed: number;
}

/** Active customer offered in pickers (GET /customers/lookup). */
export interface CustomerLookupItem {
  id: string;
  customerCode: string;
  name: string;
  customerType: CustomerType;
  status: CustomerStatus;
  gstin: string | null;
  contacts: Array<{ name: string; phone: string | null; email: string | null }>;
  addresses: Array<{ id: string; addressType: CustomerAddressType; city: string | null; state: string | null; country: string }>;
}

export interface EnquiryConversionCheck {
  ready: boolean;
  problems: string[];
  enquiryId: string;
  enquiryNumber: string;
  customerId: string;
  customerContactId: string | null;
  currency: string;
  items: Array<{ enquiryItemId: string; productId: string; productModelId: string | null; quantity: number; unit: string; technicalRequirements: string | null }>;
  quotationModuleAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Quotation Management (Module 5). Money values are decimal strings.
// ---------------------------------------------------------------------------

export type QuotationStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'UNDER_NEGOTIATION'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUPERSEDED';
export type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';
export type QuotationDocumentKind = 'QUOTATION_PDF' | 'QUOTATION_CUSTOMER_DOCUMENT' | 'QUOTATION_ATTACHMENT';

export interface QuotationListItem {
  id: string;
  quotationNumber: string;
  status: QuotationStatus;
  currency: string;
  currentRevisionNumber: number;
  currentTotal: string;
  createdAt: string;
  customer: { id: string; name: string; customerCode: string };
  enquiry: { id: string; enquiryNumber: string } | null;
  assignedTo: UserRef | null;
  quotationDate: string | null;
  validUntil: string | null;
  /** Validity date passed while still open (not marked expired). */
  pastValidity: boolean;
}

export interface QuotationSummary {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  sent: number;
  underNegotiation: number;
  accepted: number;
  rejected: number;
  expired: number;
  cancelled: number;
  /** Open quotations whose current revision's validity date has passed. */
  pastValidity: number;
  approvalRequired: boolean;
  generatedAt: string;
}

export interface QuotationAddressSnapshot {
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
}

/** Customer details stored on a revision (frozen once issued). */
export interface QuotationCustomerSnapshot {
  customerCode: string;
  name: string;
  customerType: CustomerType;
  contactName: string | null;
  contactDesignation: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: QuotationAddressSnapshot | null;
  shippingAddress: QuotationAddressSnapshot | null;
  taxCountry: string | null;
  gstin: string | null;
  pan: string | null;
  taxRegistrationNumber: string | null;
}

export interface QuotationItem {
  id: string;
  revisionId: string;
  sortOrder: number;
  productId: string;
  productModelId: string | null;
  enquiryItemId: string | null;
  productName: string;
  productCode: string;
  brandName: string;
  modelName: string | null;
  modelNumber: string | null;
  description: string | null;
  specifications: Specification[] | Record<string, string> | null;
  quantity: number;
  unit: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  discountAmount: string;
  taxLabel: string | null;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  remarks: string | null;
}

export interface QuotationTaxGroup {
  label: string;
  rate: string;
  taxable: string;
  tax: string;
}

export interface QuotationRevision {
  id: string;
  quotationId: string;
  revisionNumber: number;
  status: QuotationStatus;
  quotationDate: string;
  validUntil: string | null;
  customerSnapshot: QuotationCustomerSnapshot;
  internalRemarks: string | null;
  termsAndConditions: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  warrantyTerms: string | null;
  notes: string | null;
  subtotal: string;
  itemDiscountTotal: string;
  additionalDiscount: string;
  taxableAmount: string;
  taxTotal: string;
  otherChargesLabel: string | null;
  otherCharges: string;
  grandTotal: string;
  taxBreakdown: QuotationTaxGroup[] | null;
  issuedAt: string | null;
  pdfDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  items: QuotationItem[];
  createdBy: UserRef | null;
  pdfDocument: { id: string; originalFilename: string; sizeBytes: number; createdAt: string } | null;
}

export interface QuotationStatusChange {
  id: string;
  previousStatus: QuotationStatus | null;
  newStatus: QuotationStatus;
  remarks: string | null;
  changedAt: string;
  changedBy: UserRef | null;
  revision: { revisionNumber: number };
}

export interface QuotationCommunication {
  id: string;
  revisionNumber: number | null;
  occurredAt: string;
  channel: FollowUpMethod;
  contactName: string | null;
  summary: string;
  createdAt: string;
  createdBy: UserRef | null;
}

export interface QuotationDetail {
  id: string;
  quotationNumber: string;
  customerId: string;
  enquiryId: string | null;
  contactId: string | null;
  assignedToId: string | null;
  subject: string | null;
  referenceNumber: string | null;
  currency: string;
  status: QuotationStatus;
  currentRevisionNumber: number;
  currentTotal: string;
  acceptedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; customerCode: string; customerType: CustomerType; status: CustomerStatus };
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
  enquiry: { id: string; enquiryNumber: string; status: EnquiryStatus } | null;
  assignedTo: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  /** Newest first; the first entry is the current revision. */
  revisions: QuotationRevision[];
  statusHistory: QuotationStatusChange[];
  communications: QuotationCommunication[];
  documents: Array<{
    id: string;
    kind: QuotationDocumentKind;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: UserRef | null;
  }>;
  approvalRequired: boolean;
}

export interface QuotationCompareChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface QuotationCompareResult {
  from: { revisionNumber: number; status: QuotationStatus };
  to: { revisionNumber: number; status: QuotationStatus };
  items: Array<{ change: 'added' | 'removed' | 'modified'; item: string; fields: QuotationCompareChange[] }>;
  header: QuotationCompareChange[];
}

export interface QuotationCompanyProfile {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
}

export interface QuotationSettings {
  defaultTerms: string;
  companyProfile: QuotationCompanyProfile;
  approvalRequired: boolean;
}

/** GET /quotations/from-enquiry/:enquiryId - what a new quotation pre-fills from an enquiry. */
export interface QuotationEnquiryHandoff extends EnquiryConversionCheck {
  enquiry: {
    id: string;
    enquiryNumber: string;
    description: string | null;
    commercialNotes: string | null;
    expectedDeliveryTimeline: string | null;
    paymentPreference: string | null;
    assignedTo: UserRef | null;
    customer: { id: string; name: string; customerCode: string };
    customerContact: { id: string; name: string } | null;
    items: EnquiryItem[];
  };
  defaultTerms: string | null;
}

export interface CurrencyTotal {
  currency: string;
  total: string;
}

export interface QuotationReports {
  byStatus: Array<{ status: QuotationStatus; count: number; totals: CurrencyTotal[] }>;
  byCustomer: Array<{ customer: { id: string; name: string; customerCode: string } | null; count: number; totals: CurrencyTotal[] }>;
  byEmployee: Array<{ employee: UserRef | null; count: number; totals: CurrencyTotal[] }>;
  acceptedVsRejected: { accepted: number; rejected: number; acceptanceRate: number | null };
  conversion: { enquiries: number; converted: number; rate: number | null };
  revisions: { quotations: number; average: number | null; max: number | null };
}
