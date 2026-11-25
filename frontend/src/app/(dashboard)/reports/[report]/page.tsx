import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-actions';
import { canViewReport, parseFilters, REPORT_PERMISSIONS, REPORT_TITLES, SECTION_REPORTS, type SectionReport } from '@/lib/analytics';
import { ErrorState } from '@/components/ui';
import { LoadError, loadReport, ReportShell } from '../_components/report-ui';
import { REPORT_BODIES, REPORT_DESCRIPTIONS } from './sections';

const isSection = (value: string): value is SectionReport => (SECTION_REPORTS as readonly string[]).includes(value);

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }): Promise<Metadata> {
  const { report } = await params;
  return { title: isSection(report) ? `${REPORT_TITLES[report]} Report` : 'Reports & Analytics' };
}

export default async function SectionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { report } = await params;
  if (!isSection(report)) notFound();
  const filters = parseFilters(await searchParams);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  if (!canViewReport(report, permissions)) {
    const missing = REPORT_PERMISSIONS[report].filter((p) => !permissions.includes(p));
    return (
      <ReportShell active={report} permissions={permissions} filters={filters}>
        <ErrorState title="Not allowed" message={`You do not have permission to view the ${REPORT_TITLES[report].toLowerCase()} report (missing: ${missing.join(', ')}).`} />
      </ReportShell>
    );
  }

  const result = await loadReport<unknown>(report, filters);
  const Body = REPORT_BODIES[report];

  return (
    <ReportShell active={report} permissions={permissions} filters={filters} period={result.ok ? (result.data as { period?: string }).period : undefined} description={REPORT_DESCRIPTIONS[report]}>
      {result.ok ? <Body data={result.data as never} permissions={permissions} /> : <LoadError result={result} what={`the ${REPORT_TITLES[report].toLowerCase()} report`} />}
    </ReportShell>
  );
}
