/**
 * Single source of truth for permission codes.
 *
 * The seed script writes these into the `permissions` table and the
 * `@RequirePermissions()` decorator references the same constants, so a typo
 * becomes a TypeScript error rather than a silently unguarded endpoint.
 */
export const PERMISSIONS = {
  // Vendor management
  VENDOR_READ: 'vendor.read',
  VENDOR_CREATE: 'vendor.create',
  VENDOR_UPDATE: 'vendor.update',
  VENDOR_ARCHIVE: 'vendor.archive',
  VENDOR_EXPORT: 'vendor.export',
  VENDOR_MAP_PRODUCTS: 'vendor.map_products',

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
  { code: PERMISSIONS.VENDOR_READ, module: 'vendor', action: 'read', description: 'View vendors and vendor details' },
  { code: PERMISSIONS.VENDOR_CREATE, module: 'vendor', action: 'create', description: 'Create vendors' },
  { code: PERMISSIONS.VENDOR_UPDATE, module: 'vendor', action: 'update', description: 'Edit vendor details' },
  { code: PERMISSIONS.VENDOR_ARCHIVE, module: 'vendor', action: 'archive', description: 'Archive or restore vendors' },
  { code: PERMISSIONS.VENDOR_EXPORT, module: 'vendor', action: 'export', description: 'Export vendor data' },
  { code: PERMISSIONS.VENDOR_MAP_PRODUCTS, module: 'vendor', action: 'map_products', description: 'Manage vendor brand and product mappings' },

  { code: PERMISSIONS.COMPANY_READ, module: 'company', action: 'read', description: 'View brands/companies' },
  { code: PERMISSIONS.COMPANY_CREATE, module: 'company', action: 'create', description: 'Create brands/companies' },
  { code: PERMISSIONS.COMPANY_UPDATE, module: 'company', action: 'update', description: 'Edit brands/companies' },
  { code: PERMISSIONS.COMPANY_ARCHIVE, module: 'company', action: 'archive', description: 'Archive brands/companies' },

  { code: PERMISSIONS.PRODUCT_READ, module: 'product', action: 'read', description: 'View products' },
  { code: PERMISSIONS.PRODUCT_CREATE, module: 'product', action: 'create', description: 'Create products' },
  { code: PERMISSIONS.PRODUCT_UPDATE, module: 'product', action: 'update', description: 'Edit products' },
  { code: PERMISSIONS.PRODUCT_ARCHIVE, module: 'product', action: 'archive', description: 'Archive products' },

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
    PERMISSIONS.VENDOR_ARCHIVE, PERMISSIONS.VENDOR_EXPORT, PERMISSIONS.VENDOR_MAP_PRODUCTS,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE, PERMISSIONS.COMPANY_ARCHIVE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_ARCHIVE,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD, PERMISSIONS.DOCUMENT_ARCHIVE,
    PERMISSIONS.OCR_SUBMIT, PERMISSIONS.OCR_READ,
    PERMISSIONS.USER_READ, PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE, PERMISSIONS.USER_ARCHIVE,
    PERMISSIONS.ROLE_READ, PERMISSIONS.AUDIT_READ,
  ],

  [ROLE_CODES.VENDOR_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_CREATE, PERMISSIONS.VENDOR_UPDATE,
    PERMISSIONS.VENDOR_ARCHIVE, PERMISSIONS.VENDOR_EXPORT, PERMISSIONS.VENDOR_MAP_PRODUCTS,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
    PERMISSIONS.OCR_SUBMIT, PERMISSIONS.OCR_READ,
  ],

  [ROLE_CODES.INVENTORY_MANAGER]: [
    PERMISSIONS.VENDOR_READ,
    PERMISSIONS.COMPANY_READ, PERMISSIONS.COMPANY_CREATE, PERMISSIONS.COMPANY_UPDATE,
    PERMISSIONS.PRODUCT_READ, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_ARCHIVE,
    PERMISSIONS.DOCUMENT_READ, PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.DOCUMENT_DOWNLOAD,
  ],

  // Sales/accounts/delivery roles only need to look vendors and products up
  // while quoting. Their own modules arrive in later phases.
  [ROLE_CODES.SALES_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ, PERMISSIONS.DOCUMENT_READ,
  ],
  [ROLE_CODES.SALES_EXECUTIVE]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ,
  ],
  [ROLE_CODES.ACCOUNTS_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.COMPANY_READ, PERMISSIONS.PRODUCT_READ, PERMISSIONS.DOCUMENT_READ,
  ],
  [ROLE_CODES.DELIVERY_MANAGER]: [
    PERMISSIONS.VENDOR_READ, PERMISSIONS.PRODUCT_READ,
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
