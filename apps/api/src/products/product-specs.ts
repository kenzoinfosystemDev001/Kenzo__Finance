import { Prisma } from '@prisma/client';

/**
 * Model specifications are stored as an ordered JSON array of
 * { name, value } so each category can carry its own attributes and the
 * order the user entered is kept (a JSON object would not keep key order in
 * PostgreSQL jsonb).
 */
export interface Specification {
  name: string;
  value: string;
}

export function toSpecificationJson(
  specs?: Specification[] | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const cleaned = (specs ?? [])
    .map((spec) => ({ name: spec.name.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.name && spec.value);

  const seen = new Set<string>();
  const unique = cleaned.filter((spec) => {
    const key = spec.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length ? (unique as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
}

/**
 * Reads either shape: the array written by this module, or the legacy
 * { key: value } object carried over from the old one-row-per-model products.
 */
export function readSpecifications(value: unknown): Specification[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is Specification => Boolean(item && typeof item === 'object' && 'name' in item))
      .map((item) => ({ name: String(item.name), value: String(item.value ?? '') }));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([name, v]) => ({ name, value: String(v) }));
  }
  return [];
}

/** "lat 5450-u5" and "LAT5450-U5" are the same model number. */
export function normalizeModelNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}
