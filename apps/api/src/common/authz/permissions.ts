/**
 * Single source of truth for permission codes.
 *
 * The seed script writes these into the `permissions` table and the
 * `@RequirePermissions()` decorator references the same constants, so a typo
 * becomes a TypeScript error rather than a silently unguarded endpoint.
 */
export const PERMISSIONS = {
  // Vendor management. `vendor.read` is the "view" permission; it predates
  // the granular codes below and is kept so existing grants stay valid.
  VENDOR_READ: 'vendor.read',
  VENDOR_CREATE: 'vendor.create',
  VENDOR_UPDATE: 'vendor.update',
  VENDOR_DEACTIVATE: 'vendor.deactivate',
  VENDOR_ARCHIVE: 'vendor.archive',
  VENDOR_DELETE: 'vendor.delete',
  VENDOR_EXPORT: 'vendor.export',
  VENDOR_MANAGE_CONTACTS: 'vendor.manage_contacts',
  VENDOR_MANAGE_ADDRESSES: 'vendor.manage_addresses',
  VENDOR_MANAGE_BRANDS: 'vendor.manage_brands',
  VENDOR_MANAGE_PRODUCTS: 'vendor.manage_products',
  VENDOR_MANAGE_DOCUMENTS: 'vendor.manage_documents',
  /** Select an inactive vendor in a new business document (later modules). */
  VENDOR_USE_INACTIVE: 'vendor.use_inactive',

  // Brand / company catalogue
  COMPANY_READ: 'company.read',
  COMPANY_CREATE: 'company.create',
  COMPANY_UPDATE: 'company.update',
  COMPANY_ARCHIVE: 'company.archive',

  // Product catalogue
  PRODUCT_READ: 'product.read',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_ARCHIVE: 'product.archive',
  PRODUCT_DELETE: 'product.delete',
  PRODUCT_EXPORT: 'product.export',
  PRODUCT_MANAGE_MODELS: 'product.manage_models',
  PRODUCT_MANAGE_VENDORS: 'product.manage_vendors',
  PRODUCT_UPLOAD_DOCUMENTS: 'product.upload_documents',
  PRODUCT_DELETE_DOCUMENTS: 'product.delete_documents',
  /** Select an inactive product/model in a new business document (later modules). */
  PRODUCT_USE_INACTIVE: 'product.use_inactive',

  // Customer management. customer.read is "view".
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',
  CUSTOMER_DELETE: 'customer.delete',
  CUSTOMER_EXPORT: 'customer.export',
  CUSTOMER_MANAGE_CONTACTS: 'customer.manage_contacts',
  CUSTOMER_MANAGE_ADDRESSES: 'customer.manage_addresses',
  CUSTOMER_MANAGE_PRODUCTS: 'customer.manage_products',
  CUSTOMER_UPLOAD_DOCUMENTS: 'customer.upload_documents',
  CUSTOMER_DELETE_DOCUMENTS: 'customer.delete_documents',
  /** Select an inactive customer in a new business document (later modules). */
  CUSTOMER_USE_INACTIVE: 'customer.use_inactive',

  // Enquiry management. enquiry.read is "view".
  ENQUIRY_READ: 'enquiry.read',
  ENQUIRY_CREATE: 'enquiry.create',
  ENQUIRY_UPDATE: 'enquiry.update',
  ENQUIRY_DELETE: 'enquiry.delete',
  ENQUIRY_ASSIGN: 'enquiry.assign',
  ENQUIRY_CHANGE_STATUS: 'enquiry.change_status',
  ENQUIRY_MANAGE_FOLLOW_UPS: 'enquiry.manage_follow_ups',
  ENQUIRY_UPLOAD_ATTACHMENTS: 'enquiry.upload_attachments',
  ENQUIRY_DELETE_ATTACHMENTS: 'enquiry.delete_attachments',
  ENQUIRY_CONVERT: 'enquiry.convert',
  ENQUIRY_EXPORT: 'enquiry.export',

  // Quotation management. quotation.read is "view".
  QUOTATION_READ: 'quotation.read',
  QUOTATION_CREATE: 'quotation.create',
  /** Create a quotation without an enquiry. */
  QUOTATION_CREATE_MANUAL: 'quotation.create_manual',
  QUOTATION_UPDATE: 'quotation.update',
  QUOTATION_REVISE: 'quotation.revise',
  QUOTATION_SUBMIT: 'quotation.submit',
  QUOTATION_APPROVE: 'quotation.approve',
  /** Mark as sent and record customer responses (accept/reject/negotiate). */
  QUOTATION_SEND: 'quotation.send',
  QUOTATION_DOWNLOAD: 'quotation.download',
  QUOTATION_CANCEL: 'quotation.cancel',
  QUOTATION_DELETE: 'quotation.delete',
  QUOTATION_EXPORT: 'quotation.export',
  QUOTATION_REPORTS: 'quotation.reports',

  // Proforma invoices (Module 6)
  PROFORMA_READ: 'proforma.read',
  PROFORMA_CREATE: 'proforma.create',
  PROFORMA_UPDATE: 'proforma.update',
  PROFORMA_SUBMIT: 'proforma.submit',
  PROFORMA_APPROVE: 'proforma.approve',
  PROFORMA_ISSUE: 'proforma.issue',
  PROFORMA_DOWNLOAD: 'proforma.download',
  PROFORMA_CANCEL: 'proforma.cancel',
  PROFORMA_DELETE: 'proforma.delete',
  PROFORMA_EXPORT: 'proforma.export',

  // Final invoices (Module 7)
  INVOICE_READ: 'invoice.read',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_SUBMIT: 'invoice.submit',
  INVOICE_APPROVE: 'invoice.approve',
  INVOICE_ISSUE: 'invoice.issue',
  INVOICE_CANCEL: 'invoice.cancel',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_DOWNLOAD: 'invoice.download',
  INVOICE_EXPORT: 'invoice.export',
  INVOICE_REPORTS: 'invoice.reports',

  // Payments (Module 8)
  PAYMENT_READ: 'payment.read',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_UPDATE: 'payment.update',
  PAYMENT_VERIFY: 'payment.verify',
  PAYMENT_REJECT: 'payment.reject',
  PAYMENT_REVERSE: 'payment.reverse',
  PAYMENT_DOWNLOAD: 'payment.download',
  PAYMENT_EXPORT: 'payment.export',
  PAYMENT_REPORTS: 'payment.reports',

  // Deliveries (Module 9)
  DELIVERY_READ: 'delivery.read',
  DELIVERY_CREATE: 'delivery.create',
  DELIVERY_UPDATE: 'delivery.update',
  DELIVERY_SCHEDULE: 'delivery.schedule',
  DELIVERY_DISPATCH: 'delivery.dispatch',
  DELIVERY_TRACK: 'delivery.track',
  DELIVERY_CONFIRM: 'delivery.confirm',
  DELIVERY_CANCEL: 'delivery.cancel',
  DELIVERY_UPLOAD_POD: 'delivery.upload_pod',
  DELIVERY_DOWNLOAD: 'delivery.download',
  DELIVERY_EXPORT: 'delivery.export',
  DELIVERY_REPORTS: 'delivery.reports',

  // Stock / inventory
  STOCK_READ: 'stock.read',
  // Posting a movement changes recorded inventory, so it is separate from
  // simply viewing balances.
  STOCK_POST: 'stock.post',
  STOCK_MANAGE_LOCATIONS: 'stock.manage_locations',

  // Documents
  DOCUMENT_READ: 'document.read',
  DOCUMENT_UPLOAD: 'document.upload',
  DOCUMENT_DOWNLOAD: 'document.download',
  DOCUMENT_ARCHIVE: 'document.archive',

  // OCR
  OCR_SUBMIT: 'ocr.submit',
  OCR_READ: 'ocr.read',

  // Administration
  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_ARCHIVE: 'user.archive',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  module: string;
  action: string;
  description: string;
}

/** Expanded definitions used by the seed script. */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { code: PERMISSIONS.VENDOR_READ, module: 'vendor', action: 'read', description: 'View vendors, vendor details and activity history' },
  { code: PERMISSIONS.VENDOR_CREATE, module: 'vendor', action: 'create', description: 'Create vendors (manually or from a reviewed OCR draft)' },
  { code: PERMISSIONS.VENDOR_UPDATE, module: 'vendor', action: 'update', description: 'Edit vendor details' },
  { code: PERMISSIONS.VENDOR_DEACTIVATE, module: 'vendor', action: 'deactivate', description: 'Activate or deactivate vendors' },
  { code: PERMISSIONS.VENDOR_ARCHIVE, module: 'vendor', action: 'archive', description: 'Archive or restore vendors' },
  { code: PERMISSIONS.VENDOR_DELETE, module: 'vendor', action: 'delete', description: 'Permanently delete an unreferenced vendor' },
  { code: PERMISSIONS.VENDOR_EXPORT, module: 'vendor', action: 'export', description: 'Export vendor data' },
  { code: PERMISSIONS.VENDOR_MANAGE_CONTACTS, module: 'vendor', action: 'manage_contacts', description: 'Add, edit and remove vendor contact persons' },
  { code: PERMISSIONS.VENDOR_MANAGE_ADDRESSES, module: 'vendor', action: 'manage_addresses', description: 'Add, edit and remove vendor addresses' },
  { code: PERMISSIONS.VENDOR_MANAGE_BRANDS, module: 'vendor', action: 'manage_brands', description: 'Map and unmap brands supplied by a vendor' },
  { code: PERMISSIONS.VENDOR_MANAGE_PRODUCTS, module: 'vendor', action: 'manage_products', description: 'Map and unmap products/models supplied by a vendor' },
  { code: PERMISSIONS.VENDOR_MANAGE_DOCUMENTS, module: 'vendor', action: 'manage_documents', description: 'Upload, replace and remove vendor documents' },
  { code: PERMISSIONS.VENDOR_USE_INACTIVE, module: 'vendor', action: 'use_inactive', description: 'Select inactive vendors in new business documents' },

  { code: PERMISSIONS.COMPANY_READ, module: 'company', action: 'read', description: 'View brands/companies' },
  { code: PERMISSIONS.COMPANY_CREATE, module: 'company', action: 'create', description: 'Create brands/companies' },
  { code: PERMISSIONS.COMPANY_UPDATE, module: 'company', action: 'update', description: 'Edit brands/companies' },
  { code: PERMISSIONS.COMPANY_ARCHIVE, module: 'company', action: 'archive', description: 'Archive brands/companies' },

  { code: PERMISSIONS.PRODUCT_READ, module: 'product', action: 'read', description: 'View products' },
  { code: PERMISSIONS.PRODUCT_CREATE, module: 'product', action: 'create', description: 'Create products' },
  { code: PERMISSIONS.PRODUCT_UPDATE, module: 'product', action: 'update', description: 'Edit products' },
  { code: PERMISSIONS.PRODUCT_ARCHIVE, module: 'product', action: 'archive', description: 'Archive and restore products' },
  { code: PERMISSIONS.PRODUCT_EXPORT, module: 'product', action: 'export', description: 'Export the product catalogue' },
  { code: PERMISSIONS.PRODUCT_DELETE, module: 'product', action: 'delete', description: 'Permanently delete an unreferenced product or model' },
  { code: PERMISSIONS.PRODUCT_MANAGE_MODELS, module: 'product', action: 'manage_models', description: 'Add, edit, activate and deactivate product models' },
  { code: PERMISSIONS.PRODUCT_MANAGE_VENDORS, module: 'product', action: 'manage_vendors', description: 'Map vendors to products and models from the product side' },
  { code: PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS, module: 'product', action: 'upload_documents', description: 'Upload and replace product documents and images' },
  { code: PERMISSIONS.PRODUCT_DELETE_DOCUMENTS, module: 'product', action: 'delete_documents', description: 'Remove product documents and images' },
  { code: PERMISSIONS.PRODUCT_USE_INACTIVE, module: 'product', action: 'use_inactive', description: 'Select inactive products/models in new business documents' },

  { code: PERMISSIONS.CUSTOMER_READ, module: 'customer', action: 'read', description: 'View customers, contacts, addresses, documents and activity' },
  { code: PERMISSIONS.CUSTOMER_CREATE, module: 'customer', action: 'create', description: 'Create customers' },
  { code: PERMISSIONS.CUSTOMER_UPDATE, module: 'customer', action: 'update', description: 'Edit customers and change their status' },
  { code: PERMISSIONS.CUSTOMER_DELETE, module: 'customer', action: 'delete', description: 'Permanently delete an unreferenced customer' },
  { code: PERMISSIONS.CUSTOMER_EXPORT, module: 'customer', action: 'export', description: 'Export customer data' },
  { code: PERMISSIONS.CUSTOMER_MANAGE_CONTACTS, module: 'customer', action: 'manage_contacts', description: 'Add, edit and remove customer contact persons' },
  { code: PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES, module: 'customer', action: 'manage_addresses', description: 'Add, edit and remove customer addresses' },
  { code: PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS, module: 'customer', action: 'manage_products', description: 'Manage customer products of interest' },
  { code: PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS, module: 'customer', action: 'upload_documents', description: 'Upload and replace customer documents' },
  { code: PERMISSIONS.CUSTOMER_DELETE_DOCUMENTS, module: 'customer', action: 'delete_documents', description: 'Remove customer documents' },
  { code: PERMISSIONS.CUSTOMER_USE_INACTIVE, module: 'customer', action: 'use_inactive', description: 'Select inactive customers in new business documents' },

  { code: PERMISSIONS.ENQUIRY_READ, module: 'enquiry', action: 'read', description: 'View enquiries, follow-ups and attachments' },
  { code: PERMISSIONS.ENQUIRY_CREATE, module: 'enquiry', action: 'create', description: 'Create enquiries' },
  { code: PERMISSIONS.ENQUIRY_UPDATE, module: 'enquiry', action: 'update', description: 'Edit enquiry details and product requirements' },
  { code: PERMISSIONS.ENQUIRY_DELETE, module: 'enquiry', action: 'delete', description: 'Delete an enquiry that has no history' },
  { code: PERMISSIONS.ENQUIRY_ASSIGN, module: 'enquiry', action: 'assign', description: 'Assign enquiries to employees' },
  { code: PERMISSIONS.ENQUIRY_CHANGE_STATUS, module: 'enquiry', action: 'change_status', description: 'Change enquiry status (close, lose, hold, reopen)' },
  { code: PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS, module: 'enquiry', action: 'manage_follow_ups', description: 'Record and edit follow-ups' },
  { code: PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS, module: 'enquiry', action: 'upload_attachments', description: 'Upload and replace enquiry attachments' },
  { code: PERMISSIONS.ENQUIRY_DELETE_ATTACHMENTS, module: 'enquiry', action: 'delete_attachments', description: 'Remove enquiry attachments' },
  { code: PERMISSIONS.ENQUIRY_CONVERT, module: 'enquiry', action: 'convert', description: 'Convert an enquiry to a quotation' },
  { code: PERMISSIONS.ENQUIRY_EXPORT, module: 'enquiry', action: 'export', description: 'Export enquiries' },

  { code: PERMISSIONS.QUOTATION_READ, module: 'quotation', action: 'read', description: 'View quotations, revisions and documents' },
  { code: PERMISSIONS.QUOTATION_CREATE, module: 'quotation', action: 'create', description: 'Create quotations from enquiries' },
  { code: PERMISSIONS.QUOTATION_CREATE_MANUAL, module: 'quotation', action: 'create_manual', description: 'Create quotations without an enquiry' },
  { code: PERMISSIONS.QUOTATION_UPDATE, module: 'quotation', action: 'update', description: 'Edit draft quotation revisions' },
  { code: PERMISSIONS.QUOTATION_REVISE, module: 'quotation', action: 'revise', description: 'Create new quotation revisions' },
  { code: PERMISSIONS.QUOTATION_SUBMIT, module: 'quotation', action: 'submit', description: 'Submit quotations for approval' },
  { code: PERMISSIONS.QUOTATION_APPROVE, module: 'quotation', action: 'approve', description: 'Approve or send back quotations' },
  { code: PERMISSIONS.QUOTATION_SEND, module: 'quotation', action: 'send', description: 'Mark quotations sent and record customer responses' },
  { code: PERMISSIONS.QUOTATION_DOWNLOAD, module: 'quotation', action: 'download', description: 'Download quotation PDFs' },
  { code: PERMISSIONS.QUOTATION_CANCEL, module: 'quotation', action: 'cancel', description: 'Cancel quotations' },
  { code: PERMISSIONS.QUOTATION_DELETE, module: 'quotation', action: 'delete', description: 'Delete never-issued draft quotations' },
  { code: PERMISSIONS.QUOTATION_EXPORT, module: 'quotation', action: 'export', description: 'Export quotations' },
  { code: PERMISSIONS.QUOTATION_REPORTS, module: 'quotation', action: 'reports', description: 'View quotation reports' },

  { code: PERMISSIONS.PROFORMA_READ, module: 'proforma', action: 'read', description: 'View proforma invoices and their documents' },
  { code: PERMISSIONS.PROFORMA_CREATE, module: 'proforma', action: 'create', description: 'Create proforma invoices from accepted quotations' },
  { code: PERMISSIONS.PROFORMA_UPDATE, module: 'proforma', action: 'update', description: 'Edit draft proforma invoices' },
  { code: PERMISSIONS.PROFORMA_SUBMIT, module: 'proforma', action: 'submit', description: 'Submit proforma invoices for approval' },
  { code: PERMISSIONS.PROFORMA_APPROVE, module: 'proforma', action: 'approve', description: 'Approve or send back proforma invoices' },
  { code: PERMISSIONS.PROFORMA_ISSUE, module: 'proforma', action: 'issue', description: 'Issue proforma invoices and record them as sent' },
  { code: PERMISSIONS.PROFORMA_DOWNLOAD, module: 'proforma', action: 'download', description: 'Download proforma invoice PDFs' },
  { code: PERMISSIONS.PROFORMA_CANCEL, module: 'proforma', action: 'cancel', description: 'Cancel proforma invoices' },
  { code: PERMISSIONS.PROFORMA_DELETE, module: 'proforma', action: 'delete', description: 'Delete never-issued draft proforma invoices' },
  { code: PERMISSIONS.PROFORMA_EXPORT, module: 'proforma', action: 'export', description: 'Export proforma invoices' },

  { code: PERMISSIONS.INVOICE_READ, module: 'invoice', action: 'read', description: 'View final invoices and their documents' },
  { code: PERMISSIONS.INVOICE_CREATE, module: 'invoice', action: 'create', description: 'Create final invoices from issued proforma invoices' },
  { code: PERMISSIONS.INVOICE_UPDATE, module: 'invoice', action: 'update', description: 'Edit draft final invoices' },
  { code: PERMISSIONS.INVOICE_SUBMIT, module: 'invoice', action: 'submit', description: 'Submit final invoices for approval' },
  { code: PERMISSIONS.INVOICE_APPROVE, module: 'invoice', action: 'approve', description: 'Approve or send back final invoices' },
  { code: PERMISSIONS.INVOICE_ISSUE, module: 'invoice', action: 'issue', description: 'Issue final invoices (allocates the number) and record them as sent' },
  { code: PERMISSIONS.INVOICE_CANCEL, module: 'invoice', action: 'cancel', description: 'Cancel issued final invoices' },
  { code: PERMISSIONS.INVOICE_DELETE, module: 'invoice', action: 'delete', description: 'Delete never-issued draft final invoices' },
  { code: PERMISSIONS.INVOICE_DOWNLOAD, module: 'invoice', action: 'download', description: 'Download final invoice PDFs' },
  { code: PERMISSIONS.INVOICE_EXPORT, module: 'invoice', action: 'export', description: 'Export the invoice register' },
  { code: PERMISSIONS.INVOICE_REPORTS, module: 'invoice', action: 'reports', description: 'View invoice reports' },

  { code: PERMISSIONS.PAYMENT_READ, module: 'payment', action: 'read', description: 'View payments and their documents' },
  { code: PERMISSIONS.PAYMENT_CREATE, module: 'payment', action: 'create', description: 'Record payments against final invoices' },
  { code: PERMISSIONS.PAYMENT_UPDATE, module: 'payment', action: 'update', description: 'Edit payments pending verification' },
  { code: PERMISSIONS.PAYMENT_VERIFY, module: 'payment', action: 'verify', description: 'Verify payments (they then count towards the invoice)' },
  { code: PERMISSIONS.PAYMENT_REJECT, module: 'payment', action: 'reject', description: 'Reject pending payments' },
  { code: PERMISSIONS.PAYMENT_REVERSE, module: 'payment', action: 'reverse', description: 'Reverse verified payments' },
  { code: PERMISSIONS.PAYMENT_DOWNLOAD, module: 'payment', action: 'download', description: 'Download payment receipts' },
  { code: PERMISSIONS.PAYMENT_EXPORT, module: 'payment', action: 'export', description: 'Export the payment register' },
  { code: PERMISSIONS.PAYMENT_REPORTS, module: 'payment', action: 'reports', description: 'View payment reports' },
  { code: PERMISSIONS.DELIVERY_READ, module: 'delivery', action: 'read', description: 'View deliveries, items and tracking history' },
  { code: PERMISSIONS.DELIVERY_CREATE, module: 'delivery', action: 'create', description: 'Create delivery drafts from final invoices' },
  { code: PERMISSIONS.DELIVERY_UPDATE, module: 'delivery', action: 'update', description: 'Edit delivery drafts' },
  { code: PERMISSIONS.DELIVERY_SCHEDULE, module: 'delivery', action: 'schedule', description: 'Schedule deliveries' },
  { code: PERMISSIONS.DELIVERY_DISPATCH, module: 'delivery', action: 'dispatch', description: 'Dispatch deliveries' },
  { code: PERMISSIONS.DELIVERY_TRACK, module: 'delivery', action: 'track', description: 'Update shipment tracking' },
  { code: PERMISSIONS.DELIVERY_CONFIRM, module: 'delivery', action: 'confirm', description: 'Confirm customer delivery' },
  { code: PERMISSIONS.DELIVERY_CANCEL, module: 'delivery', action: 'cancel', description: 'Cancel deliveries' },
  { code: PERMISSIONS.DELIVERY_UPLOAD_POD, module: 'delivery', action: 'upload_pod', description: 'Upload proof of delivery documents' },
  { code: PERMISSIONS.DELIVERY_DOWNLOAD, module: 'delivery', action: 'download', description: 'Download delivery documents' },
  { code: PERMISSIONS.DELIVERY_EXPORT, module: 'delivery', action: 'export', description: 'Export delivery registers and reports' },
  { code: PERMISSIONS.DELIVERY_REPORTS, module: 'delivery', action: 'reports', description: 'View delivery reports' },

  { code: PERMISSIONS.STOCK_READ, module: 'stock', action: 'read', description: 'View stock balances and the movement ledger' },
  { code: PERMISSIONS.STOCK_POST, module: 'stock', action: 'post', description: 'Post stock movements (opening balance, receipt, issue, adjustment, return)' },
  { code: PERMISSIONS.STOCK_MANAGE_LOCATIONS, module: 'stock', action: 'manage_locations', description: 'Create and edit stock locations' },

  { code: PERMISSIONS.DOCUMENT_READ, module: 'document', action: 'read', description: 'View document metadata' },
  { code: PERMISSIONS.DOCUMENT_UPLOAD, module: 'document', action: 'upload', description: 'Upload documents' },
  { code: PERMISSIONS.DOCUMENT_DOWNLOAD, module: 'document', action: 'download', description: 'Download stored documents' },
  { code: PERMISSIONS.DOCUMENT_ARCHIVE, module: 'document', action: 'archive', description: 'Archive documents' },

  { code: PERMISSIONS.OCR_SUBMIT, module: 'ocr', action: 'submit', description: 'Submit documents for OCR extraction' },
  { code: PERMISSIONS.OCR_READ, module: 'ocr', action: 'read', description: 'View OCR jobs and extracted drafts' },

  { code: PERMISSIONS.USER_READ, module: 'user', action: 'read', description: 'View users' },
  { code: PERMISSIONS.USER_CREATE, module: 'user', action: 'create', description: 'Create users' },
  { code: PERMISSIONS.USER_UPDATE, module: 'user', action: 'update', description: 'Edit users and assign roles' },
  { code: PERMISSIONS.USER_ARCHIVE, module: 'user', action: 'archive', description: 'Deactivate users' },
  { code: PERMISSIONS.ROLE_READ, module: 'role', action: 'read', description: 'View roles and permissions' },
  { code: PERMISSIONS.ROLE_MANAGE, module: 'role', action: 'manage', description: 'Create roles and assign permissions' },
  { code: PERMISSIONS.AUDIT_READ, module: 'audit', action: 'read', description: 'View audit logs' },
  { code: PERMISSIONS.SETTINGS_MANAGE, module: 'settings', action: 'manage', description: 'Manage system settings' },
];

export const ROLE_CODES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  VENDOR_MANAGER: 'VENDOR_MANAGER',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES_EXECUTIVE: 'SALES_EXECUTIVE',
  ACCOUNTS_MANAGER: 'ACCOUNTS_MANAGER',
  DELIVERY_MANAGER: 'DELIVERY_MANAGER',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

/**
 * Default role -> permission grants for the Module 1 surface area.
 *
 * These are the PRD's *proposed* roles (docs/01_PRD.md 3). They are seeded as
 * a starting point and are editable by a Super Admin at runtime - the client
 * has not signed off the final permission matrix yet.
 *
 * SUPER_ADMIN is intentionally absent: it is granted every permission
 * programmatically so new permissions are never accidentally withheld from it.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  [ROLE_CODES.ADMIN]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_CREATE, PERMISSIONS.VENDOR_UPDATE,
    PERMISSIONS.VENDOR_DEACTIVATE, PERMISSIONS.VENDOR_ARCHIVE, PERMISSIONS.VENDOR_EXPORT,
    PERMISSIONS.VENDOR_MANAGE_CONTACTS, PERMISSIONS.VENDOR_MANAGE_ADDRESSES,
    PERMISSIONS.VENDOR_MANAGE_BRANDS, PERMISSIONS.VENDOR_MANAGE_PRODUCTS,
    PERMISSIONS.VENDOR_MANAGE_DOCUMENTS,
    PERMISSIONS.VENDOR_DELETE, PERMISSIONS.VENDOR_USE_INACTIVE,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE, PERMISSIONS.COMPANY_ARCHIVE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_ARCHIVE, PERMISSIONS.PRODUCT_EXPORT,
    PERMISSIONS.PRODUCT_DELETE, PERMISSIONS.PRODUCT_MANAGE_MODELS, PERMISSIONS.PRODUCT_MANAGE_VENDORS,
    PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS, PERMISSIONS.PRODUCT_DELETE_DOCUMENTS, PERMISSIONS.PRODUCT_USE_INACTIVE,
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_CREATE, PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CUSTOMER_EXPORT, PERMISSIONS.CUSTOMER_MANAGE_CONTACTS, PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES,
    PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS, PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS,
    PERMISSIONS.CUSTOMER_DELETE, PERMISSIONS.CUSTOMER_DELETE_DOCUMENTS, PERMISSIONS.CUSTOMER_USE_INACTIVE,
    PERMISSIONS.ENQUIRY_READ, PERMISSIONS.ENQUIRY_CREATE, PERMISSIONS.ENQUIRY_UPDATE, PERMISSIONS.ENQUIRY_ASSIGN,
    PERMISSIONS.ENQUIRY_CHANGE_STATUS, PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS, PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS,
    PERMISSIONS.ENQUIRY_CONVERT, PERMISSIONS.ENQUIRY_EXPORT,
    PERMISSIONS.ENQUIRY_DELETE, PERMISSIONS.ENQUIRY_DELETE_ATTACHMENTS,
    PERMISSIONS.QUOTATION_READ, PERMISSIONS.QUOTATION_CREATE, PERMISSIONS.QUOTATION_UPDATE, PERMISSIONS.QUOTATION_REVISE,
    PERMISSIONS.QUOTATION_SUBMIT, PERMISSIONS.QUOTATION_SEND, PERMISSIONS.QUOTATION_DOWNLOAD,
    PERMISSIONS.QUOTATION_CREATE_MANUAL, PERMISSIONS.QUOTATION_APPROVE, PERMISSIONS.QUOTATION_CANCEL,
    PERMISSIONS.QUOTATION_DELETE, PERMISSIONS.QUOTATION_EXPORT, PERMISSIONS.QUOTATION_REPORTS,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_POST, PERMISSIONS.STOCK_MANAGE_LOCATIONS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD, PERMISSIONS.DOCUMENT_ARCHIVE,
    PERMISSIONS.OCR_SUBMIT, PERMISSIONS.OCR_READ,
    PERMISSIONS.USER_READ, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE, PERMISSIONS.USER_ARCHIVE,
    PERMISSIONS.ROLE_READ, PERMISSIONS.AUDIT_READ,
    PERMISSIONS.PROFORMA_READ, PERMISSIONS.PROFORMA_CREATE, PERMISSIONS.PROFORMA_UPDATE, PERMISSIONS.PROFORMA_SUBMIT,
    PERMISSIONS.PROFORMA_APPROVE, PERMISSIONS.PROFORMA_ISSUE, PERMISSIONS.PROFORMA_DOWNLOAD, PERMISSIONS.PROFORMA_CANCEL,
    PERMISSIONS.PROFORMA_DELETE, PERMISSIONS.PROFORMA_EXPORT,
    PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_CREATE, PERMISSIONS.INVOICE_UPDATE, PERMISSIONS.INVOICE_SUBMIT,
    PERMISSIONS.INVOICE_APPROVE, PERMISSIONS.INVOICE_ISSUE, PERMISSIONS.INVOICE_CANCEL, PERMISSIONS.INVOICE_DELETE,
    PERMISSIONS.INVOICE_DOWNLOAD, PERMISSIONS.INVOICE_EXPORT, PERMISSIONS.INVOICE_REPORTS,
    PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_CREATE, PERMISSIONS.PAYMENT_UPDATE, PERMISSIONS.PAYMENT_VERIFY,
    PERMISSIONS.PAYMENT_REJECT, PERMISSIONS.PAYMENT_REVERSE, PERMISSIONS.PAYMENT_DOWNLOAD, PERMISSIONS.PAYMENT_EXPORT,
    PERMISSIONS.PAYMENT_REPORTS,
  ],

  [ROLE_CODES.VENDOR_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_CREATE, PERMISSIONS.VENDOR_UPDATE,
    PERMISSIONS.VENDOR_DEACTIVATE, PERMISSIONS.VENDOR_ARCHIVE, PERMISSIONS.VENDOR_EXPORT,
    PERMISSIONS.VENDOR_MANAGE_CONTACTS, PERMISSIONS.VENDOR_MANAGE_ADDRESSES,
    PERMISSIONS.VENDOR_MANAGE_BRANDS, PERMISSIONS.VENDOR_MANAGE_PRODUCTS,
    PERMISSIONS.VENDOR_MANAGE_DOCUMENTS,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_MANAGE_MODELS,
    PERMISSIONS.PRODUCT_MANAGE_VENDORS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.OCR_SUBMIT, PERMISSIONS.OCR_READ,
  ],

  // Owns the catalogue and the stock ledger end to end.
  [ROLE_CODES.INVENTORY_MANAGER]: [
    PERMISSIONS.VENDOR_READ,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.PRODUCT_ARCHIVE, PERMISSIONS.PRODUCT_EXPORT, PERMISSIONS.PRODUCT_MANAGE_MODELS,
    PERMISSIONS.PRODUCT_MANAGE_VENDORS, PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS,
    PERMISSIONS.PRODUCT_DELETE_DOCUMENTS, PERMISSIONS.VENDOR_MANAGE_PRODUCTS,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_POST, PERMISSIONS.STOCK_MANAGE_LOCATIONS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  // Sales/accounts/delivery roles look vendors and products up while quoting
  // and can see stock, but cannot change it. Their own modules arrive later.
  [ROLE_CODES.SALES_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_CREATE, PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CUSTOMER_EXPORT, PERMISSIONS.CUSTOMER_MANAGE_CONTACTS, PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES,
    PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS, PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS,
    PERMISSIONS.CUSTOMER_DELETE_DOCUMENTS, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.ENQUIRY_READ, PERMISSIONS.ENQUIRY_CREATE, PERMISSIONS.ENQUIRY_UPDATE, PERMISSIONS.ENQUIRY_ASSIGN,
    PERMISSIONS.ENQUIRY_CHANGE_STATUS, PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS, PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS,
    PERMISSIONS.ENQUIRY_CONVERT, PERMISSIONS.ENQUIRY_EXPORT,
    PERMISSIONS.ENQUIRY_DELETE_ATTACHMENTS,
    PERMISSIONS.QUOTATION_READ, PERMISSIONS.QUOTATION_CREATE, PERMISSIONS.QUOTATION_UPDATE, PERMISSIONS.QUOTATION_REVISE,
    PERMISSIONS.QUOTATION_SUBMIT, PERMISSIONS.QUOTATION_SEND, PERMISSIONS.QUOTATION_DOWNLOAD,
    PERMISSIONS.QUOTATION_CREATE_MANUAL, PERMISSIONS.QUOTATION_APPROVE, PERMISSIONS.QUOTATION_CANCEL,
    PERMISSIONS.QUOTATION_DELETE, PERMISSIONS.QUOTATION_EXPORT, PERMISSIONS.QUOTATION_REPORTS,
    PERMISSIONS.PRODUCT_EXPORT, PERMISSIONS.STOCK_READ, PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.PROFORMA_READ, PERMISSIONS.PROFORMA_CREATE, PERMISSIONS.PROFORMA_UPDATE, PERMISSIONS.PROFORMA_SUBMIT,
    PERMISSIONS.PROFORMA_DOWNLOAD, PERMISSIONS.PROFORMA_EXPORT,
    PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_DOWNLOAD, PERMISSIONS.INVOICE_REPORTS,
    PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_DOWNLOAD, PERMISSIONS.PAYMENT_REPORTS,
  ],
  [ROLE_CODES.SALES_EXECUTIVE]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_CREATE, PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CUSTOMER_MANAGE_CONTACTS, PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES,
    PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS, PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.ENQUIRY_READ, PERMISSIONS.ENQUIRY_CREATE, PERMISSIONS.ENQUIRY_UPDATE,
    PERMISSIONS.ENQUIRY_CHANGE_STATUS, PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS, PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS,
    PERMISSIONS.QUOTATION_READ, PERMISSIONS.QUOTATION_CREATE, PERMISSIONS.QUOTATION_UPDATE, PERMISSIONS.QUOTATION_REVISE,
    PERMISSIONS.QUOTATION_SUBMIT, PERMISSIONS.QUOTATION_SEND, PERMISSIONS.QUOTATION_DOWNLOAD,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.PROFORMA_READ, PERMISSIONS.PROFORMA_DOWNLOAD,
    PERMISSIONS.INVOICE_READ,
  ],
  [ROLE_CODES.ACCOUNTS_MANAGER]: [
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_EXPORT, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.ENQUIRY_READ,
    PERMISSIONS.QUOTATION_READ, PERMISSIONS.QUOTATION_DOWNLOAD, PERMISSIONS.QUOTATION_REPORTS,
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ, PERMISSIONS.DOCUMENT_READ,
    // Accounts owns proforma invoices end to end.
    PERMISSIONS.PROFORMA_READ, PERMISSIONS.PROFORMA_CREATE, PERMISSIONS.PROFORMA_UPDATE, PERMISSIONS.PROFORMA_SUBMIT,
    PERMISSIONS.PROFORMA_APPROVE, PERMISSIONS.PROFORMA_ISSUE, PERMISSIONS.PROFORMA_DOWNLOAD, PERMISSIONS.PROFORMA_CANCEL,
    PERMISSIONS.PROFORMA_DELETE, PERMISSIONS.PROFORMA_EXPORT,
    PERMISSIONS.INVOICE_READ, PERMISSIONS.INVOICE_CREATE, PERMISSIONS.INVOICE_UPDATE, PERMISSIONS.INVOICE_SUBMIT,
    PERMISSIONS.INVOICE_APPROVE, PERMISSIONS.INVOICE_ISSUE, PERMISSIONS.INVOICE_CANCEL, PERMISSIONS.INVOICE_DELETE,
    PERMISSIONS.INVOICE_DOWNLOAD, PERMISSIONS.INVOICE_EXPORT, PERMISSIONS.INVOICE_REPORTS,
    PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_CREATE, PERMISSIONS.PAYMENT_UPDATE, PERMISSIONS.PAYMENT_VERIFY,
    PERMISSIONS.PAYMENT_REJECT, PERMISSIONS.PAYMENT_REVERSE, PERMISSIONS.PAYMENT_DOWNLOAD, PERMISSIONS.PAYMENT_EXPORT,
    PERMISSIONS.PAYMENT_REPORTS,
  ],
  // Dispatch reduces stock, so this role may post movements.
  [ROLE_CODES.DELIVERY_MANAGER]: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.VENDOR_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_POST,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.DELIVERY_READ, PERMISSIONS.DELIVERY_CREATE, PERMISSIONS.DELIVERY_UPDATE,
    PERMISSIONS.DELIVERY_SCHEDULE, PERMISSIONS.DELIVERY_DISPATCH, PERMISSIONS.DELIVERY_TRACK,
    PERMISSIONS.DELIVERY_CONFIRM, PERMISSIONS.DELIVERY_CANCEL, PERMISSIONS.DELIVERY_UPLOAD_POD,
    PERMISSIONS.DELIVERY_DOWNLOAD, PERMISSIONS.DELIVERY_EXPORT, PERMISSIONS.DELIVERY_REPORTS,
  ],
};

export const ROLE_DEFINITIONS: Array<{ code: RoleCode; name: string; description: string }> = [
  { code: ROLE_CODES.SUPER_ADMIN, name: 'Super Admin', description: 'Full system access including users, roles and settings' },
  { code: ROLE_CODES.ADMIN, name: 'Admin', description: 'Operational administration and oversight' },
  { code: ROLE_CODES.VENDOR_MANAGER, name: 'Vendor Manager', description: 'Vendor onboarding, records and vendor-product relationships' },
  { code: ROLE_CODES.INVENTORY_MANAGER, name: 'Inventory Manager', description: 'Product catalogue and stock operations' },
  { code: ROLE_CODES.SALES_MANAGER, name: 'Sales Manager', description: 'Sales oversight and quotation approval' },
  { code: ROLE_CODES.SALES_EXECUTIVE, name: 'Sales Executive', description: 'Customers, enquiries and quotation preparation' },
  { code: ROLE_CODES.ACCOUNTS_MANAGER, name: 'Accounts Manager', description: 'Invoices, payments and receivables' },
  { code: ROLE_CODES.DELIVERY_MANAGER, name: 'Delivery Manager', description: 'Dispatch and delivery tracking' },
];
