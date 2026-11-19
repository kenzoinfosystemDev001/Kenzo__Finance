import clsx from 'clsx';
import {
  ENQUIRY_PRIORITY_LABELS,
  ENQUIRY_PRIORITY_TONES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_TONES,
  type EnquiryTone,
} from '@/lib/enquiry-labels';
import type { EnquiryPriority, EnquiryStatus } from '@/lib/types';

/** Coloured status / priority pills for enquiries (server- and client-safe). */

const TONE: Record<EnquiryTone, { pill: string; dot: string }> = {
  accent: { pill: 'border-accent/25 bg-accent-subtle text-accent', dot: 'bg-accent' },
  violet: { pill: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  sky: { pill: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  warning: { pill: 'border-warning/25 bg-warning-subtle text-warning', dot: 'bg-warning' },
  teal: { pill: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  success: { pill: 'border-success/25 bg-success-subtle text-success', dot: 'bg-success' },
  neutral: { pill: 'border-border bg-surface-muted text-ink-muted', dot: 'bg-ink-subtle' },
  danger: { pill: 'border-danger/25 bg-danger-subtle text-danger', dot: 'bg-danger' },
};

export function Pill({ tone, children }: { tone: EnquiryTone; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE[tone].pill)}>
      <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', TONE[tone].dot)} />
      {children}
    </span>
  );
}

export function EnquiryStatusBadge({ status }: { status: EnquiryStatus }) {
  return <Pill tone={ENQUIRY_STATUS_TONES[status]}>{ENQUIRY_STATUS_LABELS[status]}</Pill>;
}

export function EnquiryPriorityBadge({ priority }: { priority: EnquiryPriority }) {
  return <Pill tone={ENQUIRY_PRIORITY_TONES[priority]}>{ENQUIRY_PRIORITY_LABELS[priority]}</Pill>;
}
