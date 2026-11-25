-- Module 10 (Reports & Analytics) permissions and the packing-list number
-- sequence used by Module 9. Data only; no schema change. Idempotent.

INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'PACKING_LIST', 'KI/PKG/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt") VALUES
  (gen_random_uuid(), 'analytics.dashboard',  'analytics', 'dashboard',  'View the executive analytics dashboard and summary', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.vendors',    'analytics', 'vendors',    'View vendor reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.products',   'analytics', 'products',   'View product reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.customers',  'analytics', 'customers',  'View customer reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.enquiries',  'analytics', 'enquiries',  'View enquiry reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.quotations', 'analytics', 'quotations', 'View quotation reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.proforma',   'analytics', 'proforma',   'View proforma invoice reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.invoices',   'analytics', 'invoices',   'View final invoice and sales reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.payments',   'analytics', 'payments',   'View payment and collection reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.deliveries', 'analytics', 'deliveries', 'View delivery reports', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.export',     'analytics', 'export',     'Export analytics reports (Excel, CSV, PDF)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'analytics.financial',  'analytics', 'financial',  'See monetary figures in analytics', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Default grants (a proposal; editable at runtime). Super Admin gets everything.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."module" = 'analytics'
WHERE r."code" IN ('SUPER_ADMIN', 'ADMIN')
   OR (r."code" = 'ACCOUNTS_MANAGER' AND p."code" IN ('analytics.dashboard', 'analytics.customers', 'analytics.proforma', 'analytics.invoices', 'analytics.payments', 'analytics.deliveries', 'analytics.export', 'analytics.financial'))
   OR (r."code" = 'SALES_MANAGER' AND p."code" IN ('analytics.dashboard', 'analytics.customers', 'analytics.products', 'analytics.vendors', 'analytics.enquiries', 'analytics.quotations', 'analytics.proforma', 'analytics.export'))
   OR (r."code" = 'DELIVERY_MANAGER' AND p."code" IN ('analytics.dashboard', 'analytics.deliveries', 'analytics.export'))
ON CONFLICT DO NOTHING;
