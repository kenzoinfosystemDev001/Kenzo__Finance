import { PERMISSIONS, ROLE_CODES } from '../common/authz/permissions';
import { SearchService } from './search.service';

const MODELS = ['vendor', 'company', 'product', 'customer', 'enquiry', 'quotation', 'proformaInvoice', 'finalInvoice', 'payment', 'delivery', 'user'] as const;

function prismaMock() {
  const prisma: Record<string, { findMany: jest.Mock }> = {};
  for (const model of MODELS) prisma[model] = { findMany: jest.fn().mockResolvedValue([]) };
  return prisma;
}

const user = (permissions: string[], roles: string[] = []) =>
  ({ id: 'u1', email: 'u@kenzo.test', fullName: 'U', roles, permissions }) as never;

describe('SearchService', () => {
  it('searches only the modules the user may read', async () => {
    const prisma = prismaMock();
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Laser Printer', productCode: 'KI/PRD/0001' }]);
    const service = new SearchService(prisma as never);

    const { results } = await service.search('printer', user([PERMISSIONS.PRODUCT_READ]));

    expect(results).toEqual([{ type: 'product', id: 'p1', title: 'Laser Printer', subtitle: 'KI/PRD/0001' }]);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    for (const model of MODELS.filter((m) => m !== 'product')) expect(prisma[model].findMany).not.toHaveBeenCalled();
  });

  it('lets a super admin search every module', async () => {
    const prisma = prismaMock();
    const service = new SearchService(prisma as never);
    await service.search('acme', user([], [ROLE_CODES.SUPER_ADMIN]));
    for (const model of MODELS) expect(prisma[model].findMany).toHaveBeenCalledTimes(1);
  });

  it('does not query for a term shorter than two characters', async () => {
    const prisma = prismaMock();
    const service = new SearchService(prisma as never);
    expect(await service.search(' a ', user([PERMISSIONS.VENDOR_READ]))).toEqual({ query: 'a', results: [] });
    expect(prisma.vendor.findMany).not.toHaveBeenCalled();
  });

  it('matches case-insensitively, trims the term and leaves archived vendors out', async () => {
    const prisma = prismaMock();
    const service = new SearchService(prisma as never);
    await service.search('  Shree  ', user([PERMISSIONS.VENDOR_READ]));
    const where = prisma.vendor.findMany.mock.calls[0][0].where;
    expect(where.archivedAt).toBeNull();
    expect(where.OR).toContainEqual({ businessName: { contains: 'Shree', mode: 'insensitive' } });
  });

  it('finds documents by customer name and labels unnumbered drafts', async () => {
    const prisma = prismaMock();
    prisma.finalInvoice.findMany.mockResolvedValue([{ id: 'i1', invoiceNumber: null, customer: { name: 'Acme' } }]);
    const service = new SearchService(prisma as never);
    const { results } = await service.search('acme', user([PERMISSIONS.INVOICE_READ]));
    expect(prisma.finalInvoice.findMany.mock.calls[0][0].where.OR).toContainEqual({ customer: { name: { contains: 'acme', mode: 'insensitive' } } });
    expect(results).toEqual([{ type: 'invoice', id: 'i1', title: 'Draft invoice', subtitle: 'Acme' }]);
  });
});
