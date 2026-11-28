/**
 * Every module and sub-section of the application, with the page it opens.
 * Each href is an existing page: the console links to modules, it does not
 * copy them. Shown to administrators, who hold every permission.
 */
export interface DirectoryLink {
  label: string;
  href: string;
  /** Shown only to users holding this permission. */
  permission?: string;
}

export interface DirectoryModule {
  title: string;
  links: DirectoryLink[];
}

export const MODULE_DIRECTORY: DirectoryModule[] = [
  { title: 'Dashboard', links: [{ label: 'Dashboard', href: '/dashboard' }] },
  {
    title: 'Vendor Management',
   
    links: [
      { label: 'All vendors', href: '/vendors' },
      { label: 'Add vendor', href: '/vendors/new' },
      { label: 'Import with OCR', href: '/vendors/ocr' },
    ],
  },
  {
    title: 'Product Management',
   
    links: [
      { label: 'All products', href: '/products' },
      { label: 'Add product', href: '/products/new' },
      { label: 'Product categories', href: '/products/categories' },
      { label: 'Brands', href: '/companies' },
    ],
  },
  {
    title: 'Inventory',
   
    links: [
      { label: 'Inventory', href: '/inventory' },
      { label: 'Stock locations', href: '/inventory/locations' },
      { label: 'Stock ledger', href: '/inventory/ledger' },
    ],
  },
  {
    title: 'Customer Management',
   
    links: [
      { label: 'All customers', href: '/customers' },
      { label: 'Top customers', href: '/customers?view=top' },
      { label: 'Favourite customers', href: '/customers?view=favourite' },
      { label: 'Add customer', href: '/customers/new' },
      { label: 'Customer categories', href: '/customers/categories' },
    ],
  },
  {
    title: 'Enquiry Management',
   
    links: [
      { label: 'All enquiries', href: '/enquiries' },
      { label: 'Add enquiry', href: '/enquiries/new' },
      { label: 'Follow-ups', href: '/enquiries/follow-ups' },
      { label: 'Enquiry sources', href: '/enquiries/sources' },
    ],
  },
  {
    title: 'Quotation Management',
   
    links: [
      { label: 'All quotations', href: '/quotations' },
      { label: 'New quotation', href: '/quotations/new' },
      { label: 'Quotation reports', href: '/quotations/reports' },
    ],
  },
  {
    title: 'Proforma Invoice',
   
    links: [
      { label: 'All proforma invoices', href: '/proforma-invoices' },
      { label: 'New proforma invoice', href: '/proforma-invoices/new' },
    ],
  },
  {
    title: 'Final Invoice',
   
    links: [
      { label: 'All final invoices', href: '/final-invoices' },
      { label: 'New final invoice', href: '/final-invoices/new' },
      { label: 'Overdue invoices', href: '/final-invoices?pastDueOnly=true' },
      { label: 'Final invoice reports', href: '/final-invoices/reports' },
    ],
  },
  {
    title: 'Payment Management',
   
    links: [
      { label: 'All payments', href: '/payments' },
      { label: 'Record payment', href: '/payments/new' },
      { label: 'Payment reports', href: '/payments/reports' },
    ],
  },
  {
    title: 'Delivery Management',
   
    links: [
      { label: 'All deliveries', href: '/deliveries' },
      { label: 'New delivery', href: '/deliveries/new' },
      { label: 'Delivery reports', href: '/deliveries/reports' },
    ],
  },
  {
    title: 'Reports & Analytics',
   
    links: [
      { label: 'Reports overview', href: '/reports' },
      { label: 'Executive overview', href: '/reports/overview' },
      { label: 'Sales', href: '/reports/sales' },
      { label: 'Customers', href: '/reports/customers' },
      { label: 'Vendors', href: '/reports/vendors' },
      { label: 'Products', href: '/reports/products' },
      { label: 'Enquiries', href: '/reports/enquiries' },
      { label: 'Quotations', href: '/reports/quotations' },
      { label: 'Proforma', href: '/reports/proforma' },
      { label: 'Invoices', href: '/reports/invoices' },
      { label: 'Payments', href: '/reports/payments' },
      { label: 'Deliveries', href: '/reports/deliveries' },
      { label: 'Insights', href: '/reports/insights' },
      { label: 'Sales history', href: '/sales-history' },
    ],
  },
  {
    title: 'Settings and appearance',
   
    links: [
      { label: 'Settings', href: '/settings' },
      { label: 'Appearance', href: '/appearance' },
      { label: 'My account', href: '/account' },
    ],
  },
  {
    title: 'Administration',
    links: [
      { label: 'Users', href: '/users', permission: 'user.read' },
      { label: 'Roles and permissions', href: '/users/roles', permission: 'role.read' },
      { label: 'Audit log', href: '/admin/audit-logs', permission: 'audit.read' },
    ],
  },
];
