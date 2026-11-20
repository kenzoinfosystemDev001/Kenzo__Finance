/**
 * The business's calendar.
 *
 * Date-only values (quotation date, validity, follow-up dates) are stored as
 * UTC midnight of the calendar day the user picked. "Today" must be the same
 * kind of value for the business's own time zone: using the UTC date made
 * everything between 00:00 and 05:30 IST a day behind (new quotations dated
 * yesterday, today's follow-ups shown as upcoming, expired quotations still
 * sendable).
 */
export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in the business time zone, as UTC midnight of that day. */
export function businessToday(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  return new Date(`${formatter.format(now)}T00:00:00.000Z`);
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Milliseconds the business zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant a business calendar day ("YYYY-MM-DD...") starts.
 *
 * For filtering real timestamps (createdAt, occurredAt) by a picked date:
 * "created on 20 Nov" means from 20 Nov 00:00 in the business zone, which in
 * IST is 19 Nov 18:30 UTC. Using UTC midnight put records made between 00:00
 * and 05:30 IST on the previous day.
 */
export function businessDayStart(date: string): Date {
  const utcMidnight = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Date(utcMidnight.getTime() - zoneOffsetMs(utcMidnight));
}

/** The instant the business day after `date` starts: use as an exclusive upper bound. */
export function businessDayEnd(date: string): Date {
  const next = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return businessDayStart(next.toISOString());
}
