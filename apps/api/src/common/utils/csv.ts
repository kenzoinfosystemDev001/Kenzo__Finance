/**
 * Minimal RFC 4180 CSV writer.
 *
 * A leading =, +, - or @ is prefixed with a single quote so spreadsheet
 * software treats the cell as text rather than a formula (CSV injection).
 */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCell).join(',')];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  }

  return lines.join('\r\n');
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = value instanceof Date ? value.toISOString() : String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
