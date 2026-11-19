/**
 * Reference-data seed.
 *
 * Seeds ONLY what the system needs to function: permissions, roles, document
 * sequences, vendor categories and one administrator account.
 *
 * It does NOT create sample vendors, brands, products or transactions.
 * Fake business records in a production database are indistinguishable from
 * real ones once someone quotes against them.
 *
 * Safe to re-run: every write is an upsert.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Algorithm, hash } from '@node-rs/argon2';

config({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_CODES,
  ROLE_DEFINITIONS,
} from '../src/common/authz/permissions';

/** Starting vendor categories. Editable by a Super Admin at runtime. */
const VENDOR_CATEGORIES = [
  { name: 'Manufacturer', sortOrder: 10, description: 'Produces the hardware directly' },
  { name: 'National Distributor', sortOrder: 20, description: 'Authorised country-level distributor' },
  { name: 'Regional Distributor', sortOrder: 30, description: 'Authorised regional distributor' },
  { name: 'Dealer', sortOrder: 40, description: 'Authorised dealer or channel partner' },
  { name: 'Reseller', sortOrder: 50, description: 'Trader or reseller' },
  { name: 'Service Provider', sortOrder: 60, description: 'Installation, AMC or repair services' },
  { name: 'Other', sortOrder: 99, description: 'Uncategorised vendor' },
];

const DOCUMENT_SEQUENCES = [
  { key: 'VENDOR', prefix: 'KI/VEN/', padding: 4 },
  { key: 'PRODUCT', prefix: 'KI/PRD/', padding: 5 },
];

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function seedPermissions(): Promise<void> {
  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
    });
  }
  console.log(`  permissions: ${PERMISSION_DEFINITIONS.length}`);
}

async function seedRoles(): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: { ...role, isSystem: true },
      update: { name: role.name, description: role.description },
    });
  }

  const allPermissions = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const permissionIdByCode = new Map(
    allPermissions.map((permission) => [permission.code, permission.id]),
  );

  // Super Admin receives every permission, including any added later.
  const superAdmin = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SUPER_ADMIN },
  });

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdmin.id,
          permissionId: permission.id,
        },
      },
      create: { roleId: superAdmin.id, permissionId: permission.id },
      update: {},
    });
  }

  for (const [roleCode, permissionCodes] of Object.entries(
    DEFAULT_ROLE_PERMISSIONS,
  )) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) continue;

    for (const code of permissionCodes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) continue;

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  console.log(`  roles: ${ROLE_DEFINITIONS.length} (with default permission grants)`);
}

async function seedSequences(): Promise<void> {
  for (const sequence of DOCUMENT_SEQUENCES) {
    await prisma.documentSequence.upsert({
      where: { key: sequence.key },
      create: sequence,
      // nextValue is never reset: that would re-issue existing codes.
      update: { prefix: sequence.prefix, padding: sequence.padding },
    });
  }
  console.log(`  document sequences: ${DOCUMENT_SEQUENCES.length}`);
}

async function seedVendorCategories(): Promise<void> {
  for (const category of VENDOR_CATEGORIES) {
    await prisma.vendorCategory.upsert({
      where: { normalizedName: normalizeName(category.name) },
      create: {
        name: category.name,
        normalizedName: normalizeName(category.name),
        description: category.description,
        sortOrder: category.sortOrder,
      },
      update: { description: category.description, sortOrder: category.sortOrder },
    });
  }
  console.log(`  vendor categories: ${VENDOR_CATEGORIES.length}`);
}

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  const fullName = process.env.SEED_SUPERADMIN_NAME?.trim() || 'System Administrator';

  if (!email) {
    console.log('  super admin: skipped (SEED_SUPERADMIN_EMAIL not set)');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Never silently reset the password of an existing account from a seed.
    console.log(`  super admin: ${email} already exists, left unchanged`);
    return;
  }

  if (!password || password.length < 12) {
    console.log(
      '  super admin: SKIPPED - set SEED_SUPERADMIN_PASSWORD to at least 12 characters.',
    );
    console.log('    No default password is created: a known default is a backdoor.');
    return;
  }

  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SUPER_ADMIN },
  });

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: role.id } },
    },
  });

  console.log(`  super admin: created ${user.email}`);
  console.log('    Change this password after the first sign-in.');
}

async function main(): Promise<void> {
  console.log('Seeding Kenzo Infosystems ERP reference data...');

  await seedPermissions();
  await seedRoles();
  await seedSequences();
  await seedVendorCategories();
  await seedSuperAdmin();

  console.log('Seed complete. No sample business data was created.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
