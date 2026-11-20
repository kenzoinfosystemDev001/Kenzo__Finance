import { ProformaStatus } from '@prisma/client';

/**
 * Proforma invoice lifecycle.
 *
 *   DRAFT ── issue ──▶ ISSUED ── record sent ──▶ SENT
 *     │  (approval on: DRAFT ── submit ──▶ PENDING_APPROVAL ── approve ──▶ APPROVED ── issue ──▶ ISSUED)
 *     │                                   └── send back ──▶ DRAFT
 *   any state except CANCELLED ── cancel ──▶ CANCELLED
 *
 * - Issuing allocates nothing new (the number is given at creation) but
 *   freezes the document: customer snapshot, bank details and terms are
 *   fixed and the PDF is rendered once and stored.
 * - "Sent" records that someone gave the PI to the customer; the application
 *   does not email anything.
 * - Payment states (partially / fully paid) are NOT statuses: they will be
 *   derived from Payment records (Module 7). Nobody can mark a PI paid.
 * - A cancelled PI is kept (never deleted once issued). Cancelling frees the
 *   accepted revision so a replacement PI can be created, which links back to
 *   the cancelled one. Whether a replacement needs extra authorisation is a
 *   pending business decision.
 */
export const TRANSITIONS: Record<ProformaStatus, ProformaStatus[]> = {
  DRAFT: [ProformaStatus.PENDING_APPROVAL, ProformaStatus.ISSUED, ProformaStatus.CANCELLED],
  PENDING_APPROVAL: [ProformaStatus.APPROVED, ProformaStatus.DRAFT, ProformaStatus.CANCELLED],
  APPROVED: [ProformaStatus.ISSUED, ProformaStatus.CANCELLED],
  ISSUED: [ProformaStatus.SENT, ProformaStatus.CANCELLED],
  SENT: [ProformaStatus.CANCELLED],
  CANCELLED: [],
};

/** Content can change only while the PI is a draft. */
export const EDITABLE: ProformaStatus[] = [ProformaStatus.DRAFT];

/** States in which the PI is a live, customer-facing document. */
export const ISSUED_STATES: ProformaStatus[] = [ProformaStatus.ISSUED, ProformaStatus.SENT];

export const label = (status: ProformaStatus) => status.toLowerCase().replace(/_/g, ' ');
