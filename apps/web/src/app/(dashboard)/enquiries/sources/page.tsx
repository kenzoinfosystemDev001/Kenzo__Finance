import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EnquirySource } from '@/lib/types';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { MasterRecordActions } from '@/components/master-record-actions';
import { setEnquirySourceActiveAction, updateEnquirySourceAction, deleteEnquirySourceAction } from '@/lib/enquiry-actions';
import { CreateEnquirySourceForm } from './create-source-form';

export const metadata: Metadata = { title: 'Enquiry Sources' };

/** Configurable enquiry sources (Website, Email, Phone Call, ...). */
export default async function EnquirySourcesPage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;
  const sources: EnquirySource[] = await apiFetch<EnquirySource[]>('/enquiries/sources?includeInactive=true').catch(() => []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Enquiry sources"
        description="Where enquiries come from. Used on the enquiry form and to filter the enquiry list. Managed by administrators."
        actions={<Link href="/enquiries" className="btn-secondary">Back to enquiries</Link>}
      />
      {canManage && <div className="card mb-4 p-4"><CreateEnquirySourceForm /></div>}
      <div className="card overflow-hidden">
        {sources.length === 0 ? (
          <EmptyState title="No sources" description="Add the channels enquiries arrive through, such as Website, Email or Phone Call." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="text-right">Enquiries</th>
                  <th scope="col">Status</th>
                  {canManage && <th scope="col" className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td className="text-ink-muted">{s.description ?? '-'}</td>
                    <td className="text-right tabular-nums">
                      {s._count?.enquiries ? <Link href={`/enquiries?sourceId=${s.id}`} className="hover:text-accent hover:underline">{s._count.enquiries}</Link> : 0}
                    </td>
                    <td>{s.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    {canManage && (
                      <td>
                        <MasterRecordActions
                          entityLabel="Source"
                          recordName={s.name}
                          isActive={s.isActive}
                          fields={[
                            { name: 'name', label: 'Source Name', required: true, maxLength: 100 },
                            { name: 'description', label: 'Description', maxLength: 300 },
                          ]}
                          initialValues={{ name: s.name, description: s.description ?? '' }}
                          deactivateNote={`${s.name} will no longer be offered on the enquiry form. Enquiries already from it keep it.`}
                          onSave={updateEnquirySourceAction.bind(null, s.id)}
                          onSetActive={setEnquirySourceActiveAction.bind(null, s.id)}
                          onDelete={deleteEnquirySourceAction.bind(null, s.id)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
