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
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_POST, PERMISSIONS.STOCK_MANAGE_LOCATIONS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD, PERMISSIONS.DOCUMENT_ARCHIVE,
    PERMISSIONS.OCR_SUBMIT, PERMISSIONS.OCR_READ,
    PERMISSIONS.USER_READ, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE, PERMISSIONS.USER_ARCHIVE,
    PERMISSIONS.ROLE_READ, PERMISSIONS.AUDIT_READ,
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
    PERMISSIONS.PRODUCT_EXPORT, PERMISSIONS.STOCK_READ, PERMISSIONS.DOCUMENT_READ,
  ],
  [ROLE_CODES.SALES_EXECUTIVE]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_CREATE, PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CUSTOMER_MANAGE_CONTACTS, PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES,
    PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS, PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.STOCK_READ,
  ],
  [ROLE_CODES.ACCOUNTS_MANAGER]: [
    PERMISSIONS.CUSTOMER_READ, PERMISSIONS.CUSTOMER_EXPORT, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ, PERMISSIONS.DOCUMENT_READ,
  ],
  // Dispatch reduces stock, so this role may post movements.
  [ROLE_CODES.DELIVERY_MANAGER]: [
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.VENDOR_READ, PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ, PERMISSIONS.STOCK_POST,
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
