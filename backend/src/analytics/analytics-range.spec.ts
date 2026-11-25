import { BadRequestException } from '@nestjs/common';
import { endExclusive, previousPeriod, resolvePeriod } from './analytics-range';
import { reportTables } from './analytics-export';
import { buildXlsx } from '../common/export/xlsx';

const today = new Date('2026-11-21T00:00:00.000Z');
const d = (p: { from: Date | null; to: Date }) => [p.from?.toISOString().slice(0, 10) ?? null, p.to.toISOString().slice(0, 10)];

describe('analytics periods', () => {
  it.each([
    ['today', ['2026-11-21', '2026-11-21']],
    ['yesterday', ['2026-11-20', '2026-11-20']],
    ['last7', ['2026-11-15', '2026-11-21']],
    ['last30', ['2026-10-23', '2026-11-21']],
    ['thisMonth', ['2026-11-01', '2026-11-21']],
    ['previousMonth', ['2026-10-01', '2026-10-31']],
    ['thisQuarter', ['2026-10-01', '2026-11-21']],
    ['thisYear', ['2026-01-01', '2026-11-21']],
    ['all', [null, '2026-11-21']],
  ] as const)('%s', (preset, expected) => {
    expect(d(resolvePeriod(preset, undefined, undefined, today))).toEqual(expected);
  });

  it('previous month crosses the year boundary', () => {
    expect(d(resolvePeriod('previousMonth', undefined, undefined, new Date('2026-01-10T00:00:00Z')))).toEqual(['2025-12-01', '2025-12-31']);
  });

  it('validates custom ranges', () => {
    expect(() => resolvePeriod('custom', '2026-01-01', undefined, today)).toThrow(BadRequestException);
    expect(() => resolvePeriod('custom', '2026-02-01', '2026-01-01', today)).toThrow(BadRequestException);
    expect(d(resolvePeriod('custom', '2026-01-01', '2026-01-31', today))).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('previous period has the same length and ends the day before', () => {
    expect(d(previousPeriod(resolvePeriod('last7', undefined, undefined, today))!)).toEqual(['2026-11-08', '2026-11-14']);
    expect(previousPeriod(resolvePeriod('all', undefined, undefined, today))).toBeNull();
  });

  it('end-exclusive bound is the next day', () => {
    expect(endExclusive(resolvePeriod('today', undefined, undefined, today)).toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });
});

describe('analytics exports', () => {
  it('turns a report into summary, row tables and definitions', () => {
    const tables = reportTables({ total: 3, byStatus: [{ status: 'A', count: 2 }, { status: 'B', count: 1 }], empty: [], definitions: { total: 'All of them' } });
    expect(tables.map((t) => t.title)).toEqual(['Summary', 'By Status', 'Empty', 'Definitions']);
    expect(tables[1].rows).toEqual([['A', 2], ['B', 1]]);
  });

  it('writes a valid zip container for xlsx', () => {
    const buf = buildXlsx([{ name: 'S/1', rows: [['a', 'b'], [1, 'x<y']] }]);
    expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(buf.subarray(buf.length - 22, buf.length - 18).toString('hex')).toBe('504b0506');
    expect(buf.toString('utf8')).toContain('x&lt;y');
  });
});
