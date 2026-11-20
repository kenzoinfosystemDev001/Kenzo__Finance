import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export const SEQUENCE_KEYS = {
  VENDOR: 'VENDOR',
  PRODUCT: 'PRODUCT',
  PRODUCT_MODEL: 'PRODUCT_MODEL',
  CUSTOMER: 'CUSTOMER',
  ENQUIRY: 'ENQUIRY',
  QUOTATION: 'QUOTATION',
  PROFORMA_INVOICE: 'PROFORMA_INVOICE',
  FINAL_INVOICE: 'FINAL_INVOICE',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT',
  DELIVERY: 'DELIVERY',
} as const;

export type SequenceKey = (typeof SEQUENCE_KEYS)[keyof typeof SEQUENCE_KEYS];

@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocates the next human-readable code for a sequence.
   *
   * Concurrency safety comes from a single atomic `UPDATE ... RETURNING`:
   * PostgreSQL takes a row lock for the duration of the statement, so two
   * simultaneous requests are serialised and can never receive the same
   * number. Read-then-write in application code would not be safe here.
   *
   * MUST be called with the same transaction client as the record it numbers,
   * so a rolled-back create does not burn a number.
   */
  async allocate(
    key: SequenceKey | string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;

    const rows = await client.$queryRaw<
      Array<{ prefix: string; padding: number; nextValue: number }>
    >`
      UPDATE document_sequences
         SET "nextValue" = "nextValue" + 1,
             "updatedAt" = NOW()
       WHERE key = ${key}
      RETURNING prefix, padding, "nextValue" - 1 AS "nextValue"
    `;

    if (rows.length === 0) {
      throw new Error(
        `Document sequence "${key}" is not configured. Run the database seed.`,
      );
    }

    const { prefix, padding, nextValue } = rows[0];
    return `${prefix}${String(nextValue).padStart(padding, '0')}`;
  }

  /** Reads the next value without consuming it. For previews only. */
  async peek(key: SequenceKey | string): Promise<string | null> {
    const sequence = await this.prisma.documentSequence.findUnique({
      where: { key },
    });
    if (!sequence) return null;
    return `${sequence.prefix}${String(sequence.nextValue).padStart(sequence.padding, '0')}`;
  }
}
