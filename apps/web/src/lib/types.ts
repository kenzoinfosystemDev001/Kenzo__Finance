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
  /** Proforma invoices raised from this quotation (newest first). activeRevisionId is null once cancelled. */
  proformaInvoices: Array<{ id: string; piNumber: string; status: ProformaStatus; piDate: string; grandTotal: string; activeRevisionId: string | null }>;
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

// ---------------------------------------------------------------------------
// Module 6 - Proforma Invoice
// ---------------------------------------------------------------------------

export type ProformaStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ISSUED' | 'SENT' | 'CANCELLED';
export type ProformaDocumentKind = 'PROFORMA_PDF' | 'PROFORMA_ATTACHMENT';

export interface ProformaBankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  swift?: string;
  branch?: string;
}

export interface ProformaListItem {
  id: string;
  piNumber: string;
  piDate: string;
  dueDate: string | null;
  status: ProformaStatus;
  currency: string;
  grandTotal: string;
  advanceAmount: string | null;
  issuedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; customerCode: string };
  quotation: { id: string; quotationNumber: string };
  quotationRevision: { id: string; revisionNumber: number };
  assignedTo: UserRef | null;
}

export interface ProformaSummary {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  issued: number;
  sent: number;
  cancelled: number;
  issuedValue: Array<{ currency: string; total: string }>;
  approvalRequired: boolean;
  paymentTrackingAvailable: boolean;
  generatedAt: string;
}

/** A line copied from the accepted quotation revision. */
export interface ProformaItem {
  id?: string;
  quotationItemId: string | null;
  productId: string;
  productModelId: string | null;
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

export interface ProformaTotals {
  subtotal: string;
  itemDiscountTotal: string;
  additionalDiscount: string;
  taxableAmount: string;
  taxTotal: string;
  otherChargesLabel: string | null;
  otherCharges: string;
  grandTotal: string;
  taxBreakdown: QuotationTaxGroup[] | null;
}

export interface EligibleQuotation {
  id: string;
  quotationNumber: string;
  currency: string;
  customer: { id: string; name: string; customerCode: string };
  assignedTo: UserRef | null;
  revisionId: string;
  revisionNumber: number;
  quotationDate: string;
  grandTotal: string;
  acceptedAt: string | null;
  cancelledProforma: { id: string; piNumber: string } | null;
}

/** GET /proforma-invoices/from-quotation/:id - pre-fill for a new PI (creates nothing). */
export interface ProformaFromQuotation {
  ready: boolean;
  problems: string[];
  existingProforma: { id: string; piNumber: string; status: ProformaStatus } | null;
  replaces: { id: string; piNumber: string } | null;
  quotation: {
    id: string;
    quotationNumber: string;
    revisionId: string;
    revisionNumber: number;
    quotationDate: string;
    acceptedAt: string | null;
    subject: string | null;
    referenceNumber: string | null;
    enquiry: { id: string; enquiryNumber: string } | null;
  };
  customer: { id: string; name: string; customerCode: string };
  customerSnapshot: QuotationCustomerSnapshot;
  contacts: Array<{ id: string; name: string; designation: string | null; isPrimary: boolean }>;
  contactId: string | null;
  assignedToId: string | null;
  currency: string;
  items: ProformaItem[];
  totals: ProformaTotals;
  terms: { paymentTerms: string | null; deliveryTerms: string | null; warrantyTerms: string | null; termsAndConditions: string | null; notes: string | null };
  defaults: { piDate: string; bankDetails: ProformaBankDetails | null; paymentInstructions: string | null };
  approvalRequired: boolean;
}

export interface ProformaStatusChange {
  id: string;
  previousStatus: ProformaStatus | null;
  newStatus: ProformaStatus;
  remarks: string | null;
  changedAt: string;
  changedBy: UserRef | null;
}

export interface ProformaDetail extends ProformaTotals {
  id: string;
  piNumber: string;
  status: ProformaStatus;
  piDate: string;
  dueDate: string | null;
  currency: string;
  subject: string | null;
  referenceNumber: string | null;
  internalRemarks: string | null;
  customerId: string;
  contactId: string | null;
  assignedToId: string | null;
  customerSnapshot: QuotationCustomerSnapshot;
  advanceAmount: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  warrantyTerms: string | null;
  termsAndConditions: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  bankDetails: ProformaBankDetails | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: ProformaItem[];
  customer: { id: string; name: string; customerCode: string; customerType: CustomerType; status: CustomerStatus };
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
  quotation: { id: string; quotationNumber: string; status: QuotationStatus; enquiry: { id: string; enquiryNumber: string } | null; acceptedAt: string | null };
  quotationRevision: { id: string; revisionNumber: number; quotationDate: string; grandTotal: string; validUntil: string | null };
  replaces: { id: string; piNumber: string; status: ProformaStatus } | null;
  replacedBy: { id: string; piNumber: string; status: ProformaStatus } | null;
  assignedTo: UserRef | null;
  issuedBy: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  statusHistory: ProformaStatusChange[];
  pdfDocument: { id: string; originalFilename: string; sizeBytes: number; createdAt: string } | null;
  documents: Array<{
    id: string;
    kind: ProformaDocumentKind;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: UserRef | null;
  }>;
  approvalRequired: boolean;
  deletable: boolean;
  /** Final invoices raised from this PI (activeProformaId is null once cancelled). */
  finalInvoices: Array<{ id: string; invoiceNumber: string | null; status: FinalInvoiceStatus; invoiceDate: string; grandTotal: string; activeProformaId: string | null }>;
}

export interface ProformaSettings {
  bankDetails: ProformaBankDetails | null;
  paymentInstructions: string;
  approvalRequired: boolean;
}

// ---------------------------------------------------------------------------
// Module 7 - Final Invoice
// ---------------------------------------------------------------------------

export type FinalInvoiceStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ISSUED' | 'SENT' | 'CANCELLED';
export type FinalInvoiceDocumentKind = 'FINAL_INVOICE_PDF' | 'FINAL_INVOICE_ATTACHMENT';

export interface FinalInvoiceListItem {
  id: string;
  /** Null until the invoice is issued (allocated at issue). */
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  status: FinalInvoiceStatus;
  currency: string;
  grandTotal: string;
  taxTotal: string;
  purchaseOrderNumber: string | null;
  issuedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; customerCode: string };
  proformaInvoice: { id: string; piNumber: string };
  quotation: { id: string; quotationNumber: string };
  assignedTo: UserRef | null;
  /** Verified payments received (Payment Management is the source of truth). */
  amountReceived: string;
  paymentState: InvoicePaymentState;
  outstanding: string;
  /** Overdue: issued / sent, due date passed and not fully paid. */
  pastDue: boolean;
}

export interface FinalInvoiceSummary {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  issued: number;
  sent: number;
  cancelled: number;
  pastDue: number;
  unpaid: number;
  partiallyPaid: number;
  fullyPaid: number;
  invoicedValue: Array<{ currency: string; count: number; total: string; received: string; outstanding: string }>;
  approvalRequired: boolean;
  paymentTrackingAvailable: boolean;
  generatedAt: string;
}

/** A line copied from the proforma invoice. */
export interface FinalInvoiceItem extends Omit<ProformaItem, 'quotationItemId'> {
  proformaInvoiceItemId: string | null;
}

export interface EligibleProforma {
  id: string;
  piNumber: string;
  piDate: string;
  status: ProformaStatus;
  currency: string;
  grandTotal: string;
  customer: { id: string; name: string; customerCode: string };
  contact: { id: string; name: string } | null;
  quotation: { id: string; quotationNumber: string };
  cancelledInvoice: { id: string; invoiceNumber: string | null } | null;
}

/** GET /final-invoices/from-proforma/:id - pre-fill for a new invoice (creates nothing). */
export interface FinalInvoiceFromProforma {
  ready: boolean;
  problems: string[];
  existingInvoice: { id: string; invoiceNumber: string | null; status: FinalInvoiceStatus } | null;
  replaces: { id: string; invoiceNumber: string | null } | null;
  proforma: {
    id: string;
    piNumber: string;
    piDate: string;
    status: ProformaStatus;
    issuedAt: string | null;
    dueDate: string | null;
    advanceAmount: string | null;
    quotation: { id: string; quotationNumber: string; enquiry: { id: string; enquiryNumber: string } | null };
    quotationRevision: { id: string; revisionNumber: number };
  };
  customer: { id: string; name: string; customerCode: string };
  customerSnapshot: QuotationCustomerSnapshot;
  contacts: Array<{ id: string; name: string; designation: string | null; isPrimary: boolean }>;
  contactId: string | null;
  assignedToId: string | null;
  currency: string;
  items: FinalInvoiceItem[];
  totals: ProformaTotals;
  terms: {
    paymentTerms: string | null;
    deliveryTerms: string | null;
    warrantyTerms: string | null;
    termsAndConditions: string | null;
    notes: string | null;
    paymentInstructions: string | null;
  };
  defaults: { invoiceDate: string; bankDetails: ProformaBankDetails | null; purchaseOrderNumber: string | null; subject: string | null };
  approvalRequired: boolean;
}

export interface FinalInvoiceStatusChange {
  id: string;
  previousStatus: FinalInvoiceStatus | null;
  newStatus: FinalInvoiceStatus;
  remarks: string | null;
  changedAt: string;
  changedBy: UserRef | null;
}

export interface FinalInvoiceDetail extends ProformaTotals {
  id: string;
  invoiceNumber: string | null;
  status: FinalInvoiceStatus;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  subject: string | null;
  purchaseOrderNumber: string | null;
  internalRemarks: string | null;
  proformaInvoiceId: string;
  activeProformaId: string | null;
  customerId: string;
  contactId: string | null;
  assignedToId: string | null;
  customerSnapshot: QuotationCustomerSnapshot;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  warrantyTerms: string | null;
  termsAndConditions: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  bankDetails: ProformaBankDetails | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  pastDue: boolean;
  items: Array<FinalInvoiceItem & { id: string }>;
  customer: { id: string; name: string; customerCode: string; customerType: CustomerType; status: CustomerStatus };
  contact: { id: string; name: string; phone: string | null; email: string | null } | null;
  proformaInvoice: { id: string; piNumber: string; piDate: string; status: ProformaStatus; grandTotal: string; issuedAt: string | null; advanceAmount: string | null };
  quotation: { id: string; quotationNumber: string; enquiry: { id: string; enquiryNumber: string } | null };
  quotationRevision: { id: string; revisionNumber: number; quotationDate: string; grandTotal: string };
  replaces: { id: string; invoiceNumber: string | null; status: FinalInvoiceStatus } | null;
  replacedBy: { id: string; invoiceNumber: string | null; status: FinalInvoiceStatus } | null;
  assignedTo: UserRef | null;
  issuedBy: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  statusHistory: FinalInvoiceStatusChange[];
  pdfDocument: { id: string; originalFilename: string; sizeBytes: number; createdAt: string } | null;
  documents: Array<{
    id: string;
    kind: FinalInvoiceDocumentKind;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: UserRef | null;
  }>;
  approvalRequired: boolean;
  deletable: boolean;
  amountReceived: string;
  paymentState: InvoicePaymentState;
  outstanding: string;
  /** Derived from verified payments by Payment Management. */
  payments: {
    available: boolean;
    received: string;
    outstanding: string;
    pendingVerification: string;
    state: InvoicePaymentState;
    transactions: Array<{
      id: string;
      receiptNumber: string;
      paymentDate: string;
      amount: string;
      method: string;
      transactionReference: string | null;
      status: PaymentStatus;
      verifiedAt: string | null;
      allocated: string;
    }>;
  };
}

export interface InvoiceNumbering {
  prefix: string;
  padding: number;
  financialYear: boolean;
  /** 1-12; 4 = April. */
  fyStartMonth: number;
}

export interface FinalInvoiceSettings {
  approvalRequired: boolean;
  numbering: InvoiceNumbering;
  nextNumber: string;
  /** False while the numbering is still the untouched default. */
  numberingConfirmed: boolean;
  warnings: string[];
}

export interface FinalInvoiceReports {
  range: { dateFrom: string | null; dateTo: string | null; customerId: string | null };
  byMonth: Array<{ month: string; currency: string; count: number; taxable: string; tax: string; total: string }>;
  byCustomer: Array<{ customer: { id: string; name: string; customerCode: string }; currency: string; count: number; total: string }>;
  taxSummary: Array<{ label: string; rate: string; currency: string; taxable: string; tax: string }>;
  pastDue: FinalInvoiceListItem[];
  paymentTrackingAvailable: boolean;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Module 8 - Payment Management
// ---------------------------------------------------------------------------

export type PaymentStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'REVERSED';

export interface PaymentMethodOption {
  code: string;
  label: string;
  active: boolean;
}

export interface PaymentListItem {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: string;
  transactionReference: string | null;
  status: PaymentStatus;
  duplicateReferenceConfirmed: boolean;
  createdAt: string;
  verifiedAt: string | null;
  customer: { id: string; name: string; customerCode: string };
  receivedBy: UserRef | null;
  allocations: Array<{
    amount: string;
    finalInvoice: { id: string; invoiceNumber: string | null; grandTotal: string; paymentState: InvoicePaymentState };
  }>;
}

export type InvoicePaymentState = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface EligiblePaymentInvoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  grandTotal: string;
  amountReceived: string;
  paymentState: InvoicePaymentState;
  outstanding: string;
  pendingVerification: string;
  available: string;
  overdue: boolean;
}

export interface PaymentSettings {
  methods: PaymentMethodOption[];
  autoVerifyMethods: string[];
  /** False while the methods are still the untouched defaults. */
  methodsConfirmed: boolean;
}

export interface PaymentDuplicate {
  id: string;
  receiptNumber: string;
  amount: string;
  status: PaymentStatus;
  customer: string;
}

type PaymentReportRow = { key: string; currency: string; count: number; total: string };

export interface PaymentOpenInvoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  grandTotal: string;
  amountReceived: string;
  paymentState: InvoicePaymentState;
  customer: { id: string; name: string };
  outstanding: string;
  overdue: boolean;
}

export interface PaymentReports {
  filters: { dateFrom: string | null; dateTo: string | null; customerId: string | null; method: string | null };
  daily: PaymentReportRow[];
  monthly: PaymentReportRow[];
  byCustomer: Array<PaymentReportRow & { customer: { id: string; name: string; customerCode: string } }>;
  byMethod: Array<PaymentReportRow & { label: string }>;
  byInvoice: Array<PaymentReportRow & { invoiceNumber: string | null }>;
  pendingVerification: PaymentListItem[];
  rejectedOrReversed: Array<PaymentListItem & { rejectionReason: string | null; reversalReason: string | null }>;
  outstandingInvoices: PaymentOpenInvoice[];
  overdueInvoices: PaymentOpenInvoice[];
  generatedAt: string;
}

export interface PaymentSummary {
  totalReceived: Array<{ currency: string; count: number; total: string }>;
  receivedToday: Array<{ currency: string; count: number; total: string }>;
  receivedThisMonth: Array<{ currency: string; count: number; total: string }>;
  pendingVerification: Array<{ currency: string; count: number; total: string }>;
  outstanding: Array<{ currency: string; invoices: number; total: string }>;
  partiallyPaidInvoices: number;
  fullyPaidInvoices: number;
  overdueInvoices: number;
  generatedAt: string;
}

export interface PaymentDetail extends PaymentListItem {
  bankReference: string | null;
  notes: string | null;
  receivedBy: UserRef | null;
  verifiedBy: UserRef | null;
  rejectedBy: UserRef | null;
  reversedBy: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  methodLabel: string;
  allocations: Array<{
    amount: string;
    finalInvoice: {
      id: string;
      invoiceNumber: string | null;
      invoiceDate: string;
      dueDate: string | null;
      currency: string;
      grandTotal: string;
      amountReceived: string;
      paymentState: InvoicePaymentState;
      status: FinalInvoiceStatus;
      proformaInvoice: { id: string; piNumber: string } | null;
    };
  }>;
  statusHistory: Array<{
    id: string;
    previousStatus: PaymentStatus | null;
    newStatus: PaymentStatus;
    remarks: string | null;
    changedAt: string;
    changedBy: UserRef | null;
  }>;
  receiptDocument: { id: string; originalFilename: string; sizeBytes: number; createdAt: string } | null;
  receivedById: string | null;
  rejectionReason: string | null;
  reversalReason: string | null;
  rejectedAt: string | null;
  reversedAt: string | null;
  updatedAt: string;
  documents: Array<{
    id: string;
    kind: 'PAYMENT_RECEIPT' | 'PAYMENT_PROOF';
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    replacesDocumentId: string | null;
    uploadedBy: UserRef | null;
  }>;
  invoiceSummary: {
    invoiceTotal: string;
    otherVerifiedPayments: string;
    thisPayment: string;
    totalVerified: string;
    pendingVerification: string;
    outstanding: string;
    paymentState: InvoicePaymentState;
  };
}

export interface InvoicePaymentHistory {
  invoice: {
    id: string;
    invoiceNumber: string | null;
    currency: string;
    grandTotal: string;
    amountReceived: string;
    paymentState: InvoicePaymentState;
    dueDate: string | null;
    outstanding: string;
    pendingVerification: string;
  };
  payments: PaymentListItem[];
}

export interface CustomerPaymentHistory {
  customer: { id: string; name: string; customerCode: string };
  totals: Array<{ currency: string; invoiced: string; verifiedPayments: string; outstanding: string }>;
  paymentCount: number;
  lastPaymentDate: string | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    dueDate: string | null;
    currency: string;
    grandTotal: string;
    amountReceived: string;
    paymentState: InvoicePaymentState;
    outstanding: string;
    overdue: boolean;
  }>;
  payments: PaymentListItem[];
}
