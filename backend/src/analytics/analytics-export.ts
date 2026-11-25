import PDFDocument from 'pdfkit';
import { toCsv } from '../common/utils/csv';
import { buildXlsx, type Cell } from '../common/export/xlsx';
import type { PdfCompanyProfile } from '../common/pdf/commercial-pdf';

/**
 * Turns any analytics report (the exact object the API returns and the UI
 * shows) into tables, so CSV / Excel / PDF exports always contain the same
 * figures as the screen: scalar figures go into a "Summary" table, every list
 * of rows becomes its own table (nested objects flattened as a.b columns),
 * and the metric definitions are included.
 */
export interface Table {
  title: string;
  columns: string[];
  rows: Cell[][];
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
const human = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' › ').replace(/^./, (c) => c.toUpperCase());

function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, Cell> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v instanceof Date) out[key] = v.toISOString().slice(0, 10);
    else if (isPlain(v)) flatten(v, key, out);
    else if (Array.isArray(v)) out[key] = v.map((x) => (isPlain(x) ? Object.values(x).join(' ') : String(x))).join('; ');
    else if (typeof v === 'bigint') out[key] = Number(v);
    else if (typeof v === 'number' || typeof v === 'string' || v === null || v === undefined) out[key] = v as Cell;
    else if (typeof v === 'boolean') out[key] = v ? 'Yes' : 'No';
    else out[key] = String(v);
  }
  return out;
}

/** A money string like "1234.50" stays text in CSV but becomes a number in Excel. */
const cellValue = (v: Cell) => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16 ? Number(v) : v);

export function reportTables(report: Record<string, unknown>): Table[] {
  const tables: Table[] = [];
  const summary: Cell[][] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (!value.length) {
        tables.push({ title: human(path), columns: ['(no records)'], rows: [] });
        return;
      }
      if (value.every(isPlain)) {
        const flat = value.map((row) => flatten(row as Record<string, unknown>));
        const columns = [...new Set(flat.flatMap((r) => Object.keys(r)))];
        tables.push({ title: human(path), columns: columns.map(human), rows: flat.map((r) => columns.map((c) => r[c] ?? '')) });
      } else {
        summary.push([human(path), value.join(', ')]);
      }
      return;
    }
    if (isPlain(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
      return;
    }
    if (value instanceof Date) summary.push([human(path), value.toISOString().slice(0, 10)]);
    else if (value !== undefined) summary.push([human(path), value === null ? '' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value as Cell)]);
  };
  const { definitions, ...rest } = report as { definitions?: Record<string, string> };
  walk(rest, '');
  if (summary.length) tables.unshift({ title: 'Summary', columns: ['Figure', 'Value'], rows: summary });
  if (definitions) tables.push({ title: 'Definitions', columns: ['Metric', 'How it is calculated'], rows: Object.entries(definitions).map(([k, v]) => [human(k), v]) });
  return tables;
}

export interface ExportMeta {
  title: string;
  period: string;
  filters: string[];
  generatedAt: Date;
  company: PdfCompanyProfile;
}

const metaRows = (m: ExportMeta): Cell[][] => [
  ['Report', m.title],
  ['Company', m.company.name ?? ''],
  ['Period', m.period],
  ['Filters', m.filters.length ? m.filters.join('; ') : 'None'],
  ['Generated', m.generatedAt.toISOString()],
];

export function toCsvExport(meta: ExportMeta, tables: Table[]): string {
  const blocks = [toCsv(metaRows(meta).map(([k, v]) => ({ Field: k, Value: v })))];
  for (const t of tables) {
    blocks.push(`\r\n${t.title}`);
    blocks.push(t.rows.length ? toCsv(t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? ''])))) : t.columns.join(','));
  }
  return '﻿' + blocks.join('\r\n');
}

export function toXlsxExport(meta: ExportMeta, tables: Table[]): Buffer {
  return buildXlsx([
    { name: 'About', rows: [['Field', 'Value'], ...metaRows(meta)] },
    ...tables.map((t) => ({ name: t.title, rows: [t.columns, ...t.rows.map((r) => r.map(cellValue))] })),
  ]);
}

export function toPdfExport(meta: ExportMeta, tables: Table[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 36, bottom: 36, left: 36, right: 36 }, bufferPages: true, info: { Title: meta.title, Author: meta.company.name ?? '' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const pageW = 841.89;
  const pageH = 595.28;
  const left = 36;
  const width = pageW - 72;
  const bottom = pageH - 36 - 20;
  let y = 36;
  const text = (v: string, x: number, top: number, o: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string } = {}) => {
    const { size = 8, bold = false, color = '#111827', ...rest } = o;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(v, x, top, rest);
    return doc.y;
  };
  const h = (v: string, w: number, size = 8, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).heightOfString(v || ' ', { width: w });

  y = text(meta.company.name ?? '', left, y, { size: 12, bold: true, width });
  y = text(meta.title, left, y + 2, { size: 15, bold: true, width });
  y = text(`Period: ${meta.period}    Filters: ${meta.filters.length ? meta.filters.join('; ') : 'None'}    Generated: ${meta.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`, left, y + 2, { size: 8, color: '#6b7280', width }) + 10;

  for (const t of tables) {
    const cols = t.columns.slice(0, 10); // keep landscape tables readable
    const colW = width / cols.length;
    const header = () => {
      const hh = Math.max(...cols.map((c) => h(c, colW - 6, 7.5, true))) + 8;
      doc.rect(left, y, width, hh).fill('#1e293b');
      cols.forEach((c, i) => text(c, left + i * colW + 3, y + 4, { size: 7.5, bold: true, color: '#ffffff', width: colW - 6 }));
      y += hh;
    };
    if (y + 60 > bottom) {
      doc.addPage();
      y = 36;
    }
    y = text(t.title, left, y, { size: 10, bold: true, width }) + 3;
    header();
    if (!t.rows.length) {
      y = text('No records for these filters.', left + 3, y + 4, { size: 8, color: '#6b7280', width }) + 8;
      continue;
    }
    t.rows.forEach((row, r) => {
      const cells = cols.map((_, i) => (row[i] === null || row[i] === undefined ? '' : String(row[i])).slice(0, 400));
      const rh = Math.max(...cells.map((c) => h(c, colW - 6))) + 6;
      if (y + rh > bottom) {
        doc.addPage();
        y = 36;
        header();
      }
      if (r % 2 === 1) doc.rect(left, y, width, rh).fill('#f8fafc');
      cells.forEach((c, i) => text(c, left + i * colW + 3, y + 3, { size: 8, width: colW - 6 }));
      y += rh;
    });
    if (t.columns.length > cols.length) y = text(`(${t.columns.length - cols.length} more column(s) in the Excel/CSV export)`, left, y + 2, { size: 7, color: '#6b7280' });
    y += 12;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor('#6b7280');
    doc.text(`${meta.title} · ${meta.period}`, left, pageH - 36 - 10, { width: width * 0.7, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width * 0.7, pageH - 36 - 10, { width: width * 0.3, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
