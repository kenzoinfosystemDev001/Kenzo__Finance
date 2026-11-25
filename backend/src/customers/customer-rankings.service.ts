import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { CustomerRankingsQueryDto } from './dto/customer-rankings.dto';
import { escapeLike, isRankable, moneyString, rankingOrderBy } from './customer-rankings';

const CUSTOMER_ENTITY = 'Customer';
const FAVOURITE_NOT_READY = 'Favourite customers are not available until the database update that adds them has been applied.';

interface RankingRow {
  id: string;
  name: string;
  customerCode: string;
  status: string;
  currency: string | null;
  orders: bigint;
  invoiced: Prisma.Decimal;
  units: bigint;
  products: bigint;
  lastInvoiceDate: Date | null;
  total: bigint;
}

/**
 * Customer rankings from issued final invoices only.
 *
 * Counts an invoice when it is ISSUED or SENT. A cancelled invoice, and an
 * invoice replaced by a revision, has a different status, so neither is
 * counted. Quotations and proforma invoices never contribute. Nothing is
 * stored: the figures are computed on each request, so they follow the latest
 * invoice data.
 *
 * Favourites use raw SQL on the favourite column, so the rest of the customer
 * module keeps working while that column is not yet in the database. Until the
 * update is applied, favourite reads report that favourites are unavailable,
 * and marking a favourite is refused with a clear message.
 */
@Injectable()
export class CustomerRankingsService {
  private readonly logger = new Logger(CustomerRankingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: CustomerRankingsQueryDto) {
    const favourites = await this.favouriteIds();

    if (query.view === 'favourite') {
      if (!favourites.available) throw new ConflictException(FAVOURITE_NOT_READY);
      if (favourites.ids.length === 0) return this.empty(query, true);
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const search = query.search ? `%${escapeLike(query.search)}%` : null;

    const filters: Prisma.Sql[] = [];
    if (query.view === 'top') filters.push(Prisma.sql`COALESCE(inv.orders, 0) > 0`);
    if (query.view === 'favourite') filters.push(Prisma.sql`c.id = ANY(${favourites.ids}::uuid[])`);
    if (search) filters.push(Prisma.sql`(c.name ILIKE ${search} OR c."customerCode" ILIKE ${search})`);
    const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

    const orderBy = rankingOrderBy(query.sortBy, query.sortDir);
    const rows = await this.prisma.$queryRaw<RankingRow[]>`
      WITH inv AS (
        SELECT fi."customerId" AS cid, fi.currency, COUNT(*) AS orders, SUM(fi."grandTotal") AS invoiced, MAX(fi."invoiceDate") AS "lastInvoiceDate"
        FROM final_invoices fi
        WHERE fi.status IN ('ISSUED', 'SENT')
        GROUP BY fi."customerId", fi.currency
      ),
      units AS (
        SELECT fi."customerId" AS cid, fi.currency, COALESCE(SUM(i.quantity), 0) AS units, COUNT(DISTINCT i."productId") AS products
        FROM final_invoice_items i
        JOIN final_invoices fi ON fi.id = i."finalInvoiceId"
        WHERE fi.status IN ('ISSUED', 'SENT')
        GROUP BY fi."customerId", fi.currency
      ),
      ranked AS (
        SELECT c.id, c.name, c."customerCode", c.status, inv.currency,
               COALESCE(inv.orders, 0) AS orders,
               COALESCE(inv.invoiced, 0) AS invoiced,
               COALESCE(units.units, 0) AS units,
               COALESCE(units.products, 0) AS products,
               inv."lastInvoiceDate"
        FROM customers c
        LEFT JOIN inv ON inv.cid = c.id
        LEFT JOIN units ON units.cid = c.id AND units.currency = inv.currency
        ${where}
      )
      SELECT ranked.*, COUNT(*) OVER () AS total
      FROM ranked
      ORDER BY ${Prisma.raw(orderBy)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

    const total = rows.length ? Number(rows[0].total) : 0;
    const favouriteSet = new Set(favourites.ids);
    const items = rows
      .filter((row) => query.view !== 'top' || isRankable(Number(row.orders)))
      .map((row) => ({
        customer: { id: row.id, name: row.name, customerCode: row.customerCode, status: row.status },
        currency: row.currency,
        orders: Number(row.orders),
        invoicedAmount: moneyString(row.invoiced),
        unitsPurchased: Number(row.units),
        distinctProducts: Number(row.products),
        lastInvoiceDate: row.lastInvoiceDate ? row.lastInvoiceDate.toISOString().slice(0, 10) : null,
        favourite: favouriteSet.has(row.id),
      }));

    return {
      view: query.view,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      items,
      favouritesAvailable: favourites.available,
      meta: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /** Marks or unmarks a favourite. Callers must check settings.manage; the audit entry records who did it. */
  async setFavourite(id: string, isFavourite: boolean, actor: AuthenticatedUser, context: RequestContext | null) {
    const found = await this.prisma.$queryRaw<Array<{ name: string; isFavourite: boolean }>>`
      SELECT name, "isFavourite" FROM customers WHERE id = ${id}::uuid`.catch(() => {
      throw new ConflictException(FAVOURITE_NOT_READY);
    });
    const current = found[0];
    if (!current) throw new NotFoundException(`Customer ${id} was not found`);
    if (current.isFavourite === isFavourite) return { id, isFavourite, changed: false };

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE customers
        SET "isFavourite" = ${isFavourite},
            "favouritedAt" = ${isFavourite ? new Date() : null},
            "favouritedById" = ${isFavourite ? actor.id : null}::uuid
        WHERE id = ${id}::uuid`;
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: isFavourite ? 'customer.favourite_mark' : 'customer.favourite_unmark',
          entityType: CUSTOMER_ENTITY,
          entityId: id,
          summary: `${isFavourite ? 'Marked' : 'Unmarked'} ${current.name} as a favourite customer`,
          before: { isFavourite: current.isFavourite },
          after: { isFavourite },
          ipAddress: context?.ipAddress ?? null,
          userAgent: context?.userAgent ?? null,
        },
        tx,
      );
    });
    return { id, isFavourite, changed: true };
  }

  private async favouriteIds(): Promise<{ available: boolean; ids: string[] }> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM customers WHERE "isFavourite" = true`;
      return { available: true, ids: rows.map((r) => r.id) };
    } catch (error) {
      this.logger.warn(`Favourite customers unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return { available: false, ids: [] };
    }
  }

  private empty(query: CustomerRankingsQueryDto, favouritesAvailable: boolean) {
    return {
      view: query.view,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      items: [],
      favouritesAvailable,
      meta: { page: query.page, pageSize: query.pageSize, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    };
  }
}
