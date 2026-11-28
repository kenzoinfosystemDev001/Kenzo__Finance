import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PERMISSIONS, ROLE_CODES, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

export type SearchResultType =
  | 'vendor'
  | 'brand'
  | 'product'
  | 'customer'
  | 'enquiry'
  | 'quotation'
  | 'proforma'
  | 'invoice'
  | 'payment'
  | 'delivery'
  | 'user';

export interface SearchHit {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
}

/** Hits returned per module; the header shows a short list, not a report. */
export const HITS_PER_TYPE = 5;

const insensitive = (value: string): Prisma.StringFilter => ({ contains: value, mode: 'insensitive' });
const customerName = (value: string) => ({ customer: { name: insensitive(value) } });

/**
 * Searches across every module the caller may read, in one request.
 *
 * Each module is searched on its own identifying fields (names, codes and
 * document numbers, plus the customer name for documents) and only when the
 * caller holds that module's read permission, so nothing leaks between
 * modules. Archived master records are left out. Queries run in parallel and
 * are parameterised by Prisma.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, actor: AuthenticatedUser): Promise<{ query: string; results: SearchHit[] }> {
    const q = rawQuery.trim();
    if (q.length < 2) return { query: q, results: [] };

    const can = (permission: PermissionCode) =>
      actor.roles.includes(ROLE_CODES.SUPER_ADMIN) || actor.permissions.includes(permission);
    const take = HITS_PER_TYPE;
    const jobs: Array<Promise<SearchHit[]>> = [];

    if (can(PERMISSIONS.VENDOR_READ)) {
      jobs.push(
        this.prisma.vendor
          .findMany({
            where: { archivedAt: null, OR: [{ businessName: insensitive(q) }, { legalName: insensitive(q) }, { vendorCode: insensitive(q) }, { email: insensitive(q) }] },
            select: { id: true, businessName: true, vendorCode: true },
            orderBy: { businessName: 'asc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'vendor' as const, id: r.id, title: r.businessName, subtitle: r.vendorCode }))),
      );
    }

    if (can(PERMISSIONS.COMPANY_READ)) {
      jobs.push(
        this.prisma.company
          .findMany({
            where: { archivedAt: null, OR: [{ name: insensitive(q) }, { code: insensitive(q) }] },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'brand' as const, id: r.id, title: r.name, subtitle: r.code }))),
      );
    }

    if (can(PERMISSIONS.PRODUCT_READ)) {
      jobs.push(
        this.prisma.product
          .findMany({
            where: {
              archivedAt: null,
              OR: [{ name: insensitive(q) }, { productCode: insensitive(q) }, { sku: insensitive(q) }, { modelNumber: insensitive(q) }],
            },
            select: { id: true, name: true, productCode: true },
            orderBy: { name: 'asc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'product' as const, id: r.id, title: r.name, subtitle: r.productCode }))),
      );
    }

    if (can(PERMISSIONS.CUSTOMER_READ)) {
      jobs.push(
        this.prisma.customer
          .findMany({
            where: { OR: [{ name: insensitive(q) }, { customerCode: insensitive(q) }, { gstin: insensitive(q) }] },
            select: { id: true, name: true, customerCode: true },
            orderBy: { name: 'asc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'customer' as const, id: r.id, title: r.name, subtitle: r.customerCode }))),
      );
    }

    if (can(PERMISSIONS.ENQUIRY_READ)) {
      jobs.push(
        this.prisma.enquiry
          .findMany({
            where: { OR: [{ enquiryNumber: insensitive(q) }, customerName(q)] },
            select: { id: true, enquiryNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'enquiry' as const, id: r.id, title: r.enquiryNumber, subtitle: r.customer.name }))),
      );
    }

    if (can(PERMISSIONS.QUOTATION_READ)) {
      jobs.push(
        this.prisma.quotation
          .findMany({
            where: { OR: [{ quotationNumber: insensitive(q) }, { referenceNumber: insensitive(q) }, customerName(q)] },
            select: { id: true, quotationNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'quotation' as const, id: r.id, title: r.quotationNumber, subtitle: r.customer.name }))),
      );
    }

    if (can(PERMISSIONS.PROFORMA_READ)) {
      jobs.push(
        this.prisma.proformaInvoice
          .findMany({
            where: { OR: [{ piNumber: insensitive(q) }, { referenceNumber: insensitive(q) }, customerName(q)] },
            select: { id: true, piNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'proforma' as const, id: r.id, title: r.piNumber, subtitle: r.customer.name }))),
      );
    }

    if (can(PERMISSIONS.INVOICE_READ)) {
      jobs.push(
        this.prisma.finalInvoice
          .findMany({
            where: { OR: [{ invoiceNumber: insensitive(q) }, { purchaseOrderNumber: insensitive(q) }, customerName(q)] },
            select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) =>
            rows.map((r) => ({ type: 'invoice' as const, id: r.id, title: r.invoiceNumber ?? 'Draft invoice', subtitle: r.customer.name })),
          ),
      );
    }

    if (can(PERMISSIONS.PAYMENT_READ)) {
      jobs.push(
        this.prisma.payment
          .findMany({
            where: { OR: [{ receiptNumber: insensitive(q) }, customerName(q)] },
            select: { id: true, receiptNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'payment' as const, id: r.id, title: r.receiptNumber, subtitle: r.customer.name }))),
      );
    }

    if (can(PERMISSIONS.DELIVERY_READ)) {
      jobs.push(
        this.prisma.delivery
          .findMany({
            where: {
              OR: [{ deliveryNumber: insensitive(q) }, { trackingNumber: insensitive(q) }, { lrGrNumber: insensitive(q) }, customerName(q)],
            },
            select: { id: true, deliveryNumber: true, customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'delivery' as const, id: r.id, title: r.deliveryNumber, subtitle: r.customer.name }))),
      );
    }

    if (can(PERMISSIONS.USER_READ)) {
      jobs.push(
        this.prisma.user
          .findMany({
            where: { archivedAt: null, OR: [{ fullName: insensitive(q) }, { email: insensitive(q) }] },
            select: { id: true, fullName: true, email: true },
            orderBy: { fullName: 'asc' },
            take,
          })
          .then((rows) => rows.map((r) => ({ type: 'user' as const, id: r.id, title: r.fullName, subtitle: r.email }))),
      );
    }

    const groups = await Promise.all(jobs);
    return { query: q, results: groups.flat() };
  }
}
