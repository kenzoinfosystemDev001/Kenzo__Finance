/**
 * The business's calendar day, as 00:00 UTC of that date (the shape of
 * @db.Date columns).
 *
 * "Today" used to be the UTC date, which in India is still yesterday between
 * 00:00 and 05:30 IST: new enquiries defaulted to yesterday and the
 * today / upcoming / overdue follow-up tabs were a day behind. The zone is
 * configurable (BUSINESS_TIMEZONE); the web app reads the same value from
 * NEXT_PUBLIC_BUSINESS_TIMEZONE so both sides agree on the date.
 */
export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Kolkata';

let cached: { zone: string; formatter: Intl.DateTimeFormat } | null = null;

function formatter(): Intl.DateTimeFormat {
  const zone = process.env.BUSINESS_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  if (!cached || cached.zone !== zone) {
    cached = {
      zone,
      formatter: new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
  }
  return cached.formatter;
}

/** YYYY-MM-DD of `at` in the business time zone. */
export function businessDateIso(at: Date = new Date()): string {
  return formatter().format(at);
}

/** Today in the business time zone, as a date-only value (00:00 UTC). */
export function businessToday(at: Date = new Date()): Date {
  return new Date(`${businessDateIso(at)}T00:00:00.000Z`);
}

/** True when `zone` is a time zone this runtime understands. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
