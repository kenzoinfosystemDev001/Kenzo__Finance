import type { Cell, Sheet } from './xlsx';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * One worksheet from record objects: the first record's keys become the
 * header row, so Excel and CSV exports share the same column map and cannot
 * drift apart. Missing values become blank cells, not "undefined".
 */
export function recordsToSheet(name: string, records: Array<Record<string, Cell>>): Sheet {
  if (records.length === 0) return { name, rows: [['No records']] };
  const headers = Object.keys(records[0]);
  const rows: Cell[][] = [headers, ...records.map((record) => headers.map((h) => record[h] ?? ''))];
  return { name, rows };
}

/** Only the two formats the export endpoints support; anything else falls back to CSV. */
export function requestedFormat(value: string | undefined): 'csv' | 'xlsx' {
  return value === 'xlsx' ? 'xlsx' : 'csv';
}
