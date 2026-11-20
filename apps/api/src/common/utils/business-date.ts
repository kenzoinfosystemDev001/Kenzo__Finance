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

let cachedParts: { zone: string; formatter: Intl.DateTimeFormat } | null = null;

function partsFormatter(): Intl.DateTimeFormat {
  const zone = process.env.BUSINESS_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  if (!cachedParts || cachedParts.zone !== zone) {
    cachedParts = {
      zone,
      formatter: new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }
  return cachedParts.formatter;
}

/** Milliseconds the business zone is ahead of UTC at `instant`. */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    partsFormatter().formatToParts(instant).map((p) => [p.type, Number(p.value)]),
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
