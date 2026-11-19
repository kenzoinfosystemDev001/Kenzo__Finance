'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { ConfirmDialog, Modal, ResultAlert, SelectField, TextField } from '@/components/client-ui';
import { DocumentsManager } from '@/components/documents-manager';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { RequirementFields, toItemPayload, validateRequirement, emptyRequirement, type RequirementRow } from '@/components/enquiry-form';
import { IconArrowRight, IconClock, IconPencil, IconPlus, IconTrash, IconUser } from '@/components/icons';
import {
  addEnquiryItemAction,
  addFollowUpAction,
  assignEnquiryAction,
  changeEnquiryStatusAction,
  deleteFollowUpAction,
  removeEnquiryAttachmentAction,
  removeEnquiryItemAction,
  replaceEnquiryAttachmentAction,
  updateEnquiryItemAction,
  updateFollowUpAction,
  uploadEnquiryAttachmentAction,
  type FollowUpPayload,
} from '@/lib/enquiry-actions';
import {
  ENQUIRY_DOCUMENT_KIND_LABELS,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_TRANSITIONS,
  FOLLOW_UP_METHOD_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  isEnquiryLocked,
  statusReasonRequired,
} from '@/lib/enquiry-labels';
import { formatDate, formatDateTime, specificationList } from '@/lib/vendor-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type {
  EnquiryAssignee,
  EnquiryDetail,
  EnquiryFollowUp,
  EnquiryItem,
  EnquiryStatus,
  FollowUpMethod,
  FollowUpOutcome,
} from '@/lib/types';
import { canConvertStatus, EnquiryRowActions, useEnquiryConversion } from '../enquiry-row-actions';

const remover = 'icon-btn hover:bg-danger-subtle hover:text-danger';

// ---------------------------------------------------------------------------
// Header actions: edit, status, assignment, conversion, close / delete
// ---------------------------------------------------------------------------

export function EnquiryHeaderActions({
  enquiry,
  permissions,
  assignees,
}: {
  enquiry: Pick<EnquiryDetail, 'id' | 'enquiryNumber' | 'status' | 'customerId' | 'assignedToId'>;
  permissions: string[];
  assignees: EnquiryAssignee[];
}) {
  const can = (p: string) => permissions.includes(p);
  const locked = isEnquiryLocked(enquiry.status);
  const [open, setOpen] = useState<'status' | 'assign' | null>(null);
  const conversion = useEnquiryConversion(enquiry);
  const nextStatuses = ENQUIRY_STATUS_TRANSITIONS[enquiry.status];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {can('enquiry.update') && !locked && (
        <Link href={`/enquiries/${enquiry.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit</Link>
      )}
      {can('enquiry.change_status') && nextStatuses.length > 0 && (
        <button type="button" className="btn-secondary" onClick={() => setOpen('status')}>Change status</button>
      )}
      {can('enquiry.assign') && !locked && (
        <button type="button" className="btn-secondary" onClick={() => setOpen('assign')}><IconUser size={16} /> Assign</button>
      )}
      {can('enquiry.convert') && canConvertStatus(enquiry.status) && (
        <button type="button" className="btn-secondary" onClick={conversion.start} disabled={conversion.pending}>
          <IconArrowRight size={16} /> {conversion.pending ? 'Checking...' : 'Convert to Quotation'}
        </button>
      )}
      <EnquiryRowActions enquiry={enquiry} permissions={permissions} compact={false} afterDelete="list" />
      {conversion.dialog}
      <StatusModal key={`status-${open === 'status'}`} enquiry={enquiry} open={open === 'status'} onClose={() => setOpen(null)} />
      <AssignModal key={`assign-${open === 'assign'}`} enquiry={enquiry} assignees={assignees} open={open === 'assign'} onClose={() => setOpen(null)} />
    </div>
  );
}

function StatusModal({ enquiry, open, onClose }: { enquiry: Pick<EnquiryDetail, 'id' | 'status'>; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const options = ENQUIRY_STATUS_TRANSITIONS[enquiry.status];
  const [status, setStatus] = useState<EnquiryStatus | ''>('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const needsReason = status !== '' && statusReasonRequired(enquiry.status, status);

  const save = () => {
    if (!status) return setResult({ error: 'Choose the new status.' });
    if (needsReason && !reason.trim()) return setResult({ error: `Give a reason for moving the enquiry to ${ENQUIRY_STATUS_LABELS[status]}.` });
    startTransition(async () => {
      const outcome = await changeEnquiryStatusAction(enquiry.id, status, reason);
      if (outcome.ok) {
        onClose();
        router.refresh();
      } else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Change status"
      description={`Currently ${ENQUIRY_STATUS_LABELS[enquiry.status]}. Only allowed next steps are listed.`}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Change status'}</button></>}
    >
      <div className="space-y-4">
        <SelectField label="New status" required value={status} onChange={(v) => setStatus(v as EnquiryStatus)} placeholder="Select..." options={options.map((s) => ({ value: s, label: ENQUIRY_STATUS_LABELS[s] }))} />
        <div>
          <label htmlFor="status-reason" className="field-label">
            Reason{needsReason ? <span className="text-danger"> *</span> : ' (optional)'}
          </label>
          <textarea id="status-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="field-input" />
          <p className="field-hint">Kept in the status history.</p>
        </div>
        <p className="text-xs text-ink-subtle">Converted to Quotation is set automatically when a quotation is created from this enquiry.</p>
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

function AssignModal({
  enquiry,
  assignees,
  open,
  onClose,
}: {
  enquiry: Pick<EnquiryDetail, 'id' | 'status' | 'assignedToId'>;
  assignees: EnquiryAssignee[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [assignedToId, setAssignedToId] = useState(enquiry.assignedToId ?? '');
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const outcome = await assignEnquiryAction(enquiry.id, assignedToId || null);
      if (outcome.ok) {
        onClose();
        router.refresh();
      } else setResult(outcome);
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Assign enquiry"
      description={enquiry.status === 'NEW' ? 'Assigning a new enquiry marks it Assigned.' : undefined}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending || assignedToId === (enquiry.assignedToId ?? '')}>{pending ? 'Saving...' : 'Save'}</button></>}
    >
      <div className="space-y-4">
        <SelectField label="Assigned employee" value={assignedToId} onChange={setAssignedToId} placeholder="Unassigned" options={assignees.map((a) => ({ value: a.id, label: `${a.fullName} (${a.email})` }))} />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Product requirements
// ---------------------------------------------------------------------------

const rowFromItem = (item: EnquiryItem): RequirementRow => ({
  ...emptyRequirement(),
  brand: [{ id: item.product.company.id, label: item.product.company.name }],
  product: [{ id: item.product.id, label: item.product.name, detail: item.product.productCode, meta: { id: item.product.company.id, label: item.product.company.name } }],
  productCode: item.product.productCode,
  productModelId: item.productModelId ?? '',
  quantity: String(item.quantity),
  unit: item.unit,
  technicalRequirements: item.technicalRequirements ?? '',
  remarks: item.remarks ?? '',
});

export function EnquiryItemsPanel({
  enquiry,
  canManage,
  canViewProducts,
  canCreateProduct,
}: {
  enquiry: EnquiryDetail;
  canManage: boolean;
  canViewProducts: boolean;
  canCreateProduct: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EnquiryItem | 'new' | null>(null);
  const [removing, setRemoving] = useState<EnquiryItem | null>(null);
  const locked = isEnquiryLocked(enquiry.status);
  const manage = canManage && !locked;

  return (
    <section className="card">
      <PanelHeader
        title="Products & requirements"
        description={locked ? `Read-only: the enquiry is ${ENQUIRY_STATUS_LABELS[enquiry.status].toLowerCase()}.` : 'Existing products and models from Product Management. At least one is kept.'}
        actions={manage && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><IconPlus size={16} /> Add product</button>}
      />
      {enquiry.items.length === 0 ? (
        <EmptyStateClient title="No product requirements" description="Add the products and models the customer needs." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" className="w-10">#</th>
                <th scope="col">Product</th>
                <th scope="col">Product Code</th>
                <th scope="col">Brand</th>
                <th scope="col">Model</th>
                <th scope="col" className="text-right">Quantity</th>
                <th scope="col">Technical Requirements</th>
                <th scope="col">Remarks</th>
                {manage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {enquiry.items.map((item, index) => {
                const specs = specificationList(item.productModel?.specifications);
                return (
                  <tr key={item.id}>
                    <td className="tabular-nums text-ink-subtle">{index + 1}</td>
                    <td className="min-w-[160px] font-semibold">
                      {canViewProducts ? <Link href={`/products/${item.product.id}`} className="hover:text-accent hover:underline">{item.product.name}</Link> : item.product.name}
                      {(!item.product.isActive || item.product.archivedAt) && <p className="text-xs font-normal text-warning">Product no longer active</p>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs text-ink-muted">{item.product.productCode}</td>
                    <td>{item.product.company.name}</td>
                    <td className="min-w-[160px]">
                      {item.productModel ? (
                        <>
                          <p>{item.productModel.modelName} <span className="font-mono text-xs text-ink-muted">{item.productModel.modelNumber}</span></p>
                          {!item.productModel.isActive && <p className="text-xs text-warning">Model inactive</p>}
                          {specs.length > 0 && (
                            <p className="mt-0.5 text-xs text-ink-subtle">{specs.map((s) => `${s.name}: ${s.value}`).join(' · ')}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-subtle">Not specified</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{item.quantity} {item.unit}</td>
                    <td className="max-w-[280px] whitespace-pre-line text-sm text-ink-muted">{item.technicalRequirements ?? '—'}</td>
                    <td className="max-w-[200px] text-sm text-ink-muted">{item.remarks ?? '—'}</td>
                    {manage && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <button type="button" className="icon-btn" onClick={() => setEditing(item)} aria-label={`Edit ${item.product.name}`}><IconPencil /></button>
                          {enquiry.items.length > 1 && (
                            <button type="button" className={remover} onClick={() => setRemoving(item)} aria-label={`Remove ${item.product.name}`}><IconTrash /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {manage && (
        <>
          <ItemModal
            key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
            enquiryId={enquiry.id}
            item={editing === 'new' ? null : editing}
            open={editing !== null}
            canCreateProduct={canCreateProduct}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove product requirement?"
            message={<><strong className="text-ink">{removing?.product.name}{removing?.productModel ? ` - ${removing.productModel.modelName}` : ''}</strong> will be removed from this enquiry. The change is kept in the activity history.</>}
            confirmLabel="Remove"
            onConfirm={async () => {
              const outcome = await removeEnquiryItemAction(enquiry.id, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function ItemModal({
  enquiryId,
  item,
  open,
  canCreateProduct,
  onClose,
  onSaved,
}: {
  enquiryId: string;
  item: EnquiryItem | null;
  open: boolean;
  canCreateProduct: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [row, setRow] = useState<RequirementRow>(() => (item ? rowFromItem(item) : emptyRequirement()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const save = () => {
    const found = validateRequirement(row);
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const payload = toItemPayload(row);
      const outcome = item ? await updateEnquiryItemAction(enquiryId, item.id, payload) : await addEnquiryItemAction(enquiryId, payload);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.product.name}` : 'Add product requirement'}
      description="Only existing products and models can be chosen."
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save'}</button></>}
    >
      <div className="space-y-4">
        <RequirementFields row={row} onChange={(change) => { setRow((r) => ({ ...r, ...change })); setErrors({}); }} errors={errors} />
        {canCreateProduct && (
          <Link href="/products/new" target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Product missing? Open Product Management <IconArrowRight size={14} />
          </Link>
        )}
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

/** Date -> value for <input type="datetime-local"> in the browser's time zone. */
const toLocalInput = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function EnquiryFollowUpsPanel({
  enquiry,
  assignees,
  canManage,
  canDelete,
  autoOpen,
}: {
  enquiry: EnquiryDetail;
  assignees: EnquiryAssignee[];
  canManage: boolean;
  canDelete: boolean;
  autoOpen: boolean;
}) {
  const router = useRouter();
  const allowed = canManage && enquiry.status !== 'CONVERTED';
  const [editing, setEditing] = useState<EnquiryFollowUp | 'new' | null>(allowed && autoOpen ? 'new' : null);
  const [removing, setRemoving] = useState<EnquiryFollowUp | null>(null);

  return (
    <section className="card">
      <PanelHeader
        title="Follow-up history"
        description={enquiry.status === 'CONVERTED' ? 'This enquiry has been converted; record further follow-ups on the quotation.' : 'Each follow-up updates the next follow-up date. Edits and removals are kept in the activity history.'}
        actions={allowed && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><IconPlus size={16} /> Add follow-up</button>}
      />
      {enquiry.followUps.length === 0 ? (
        <EmptyStateClient title="No follow-ups yet" description="Record calls, emails, meetings and the customer's response here." />
      ) : (
        <ol className="divide-y divide-border">
          {enquiry.followUps.map((f) => (
            <li key={f.id} className="flex gap-4 px-5 py-4">
              <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">
                      {FOLLOW_UP_METHOD_LABELS[f.method]} &middot; <span className="text-accent">{FOLLOW_UP_OUTCOME_LABELS[f.outcome]}</span>
                    </p>
                    <p className="text-xs text-ink-subtle">
                      <time dateTime={f.followUpDate}>{formatDateTime(f.followUpDate)}</time>
                      {f.contact && <> &middot; with {f.contact.name}</>}
                      {f.createdBy && <> &middot; recorded by {f.createdBy.fullName}</>}
                    </p>
                  </div>
                  {(allowed || (canDelete && canManage)) && (
                    <div className="flex gap-1">
                      {allowed && <button type="button" className="icon-btn" onClick={() => setEditing(f)} aria-label="Edit follow-up"><IconPencil /></button>}
                      {canDelete && canManage && <button type="button" className={remover} onClick={() => setRemoving(f)} aria-label="Remove follow-up"><IconTrash /></button>}
                    </div>
                  )}
                </div>
                <p className="whitespace-pre-line text-sm text-ink">{f.discussionSummary}</p>
                {f.customerResponse && <p className="whitespace-pre-line text-sm text-ink-muted"><span className="font-medium text-ink">Customer response:</span> {f.customerResponse}</p>}
                {f.internalNotes && <p className="whitespace-pre-line text-sm text-ink-muted"><span className="font-medium text-ink">Internal notes:</span> {f.internalNotes}</p>}
                <p className="flex flex-wrap gap-x-4 text-xs text-ink-muted">
                  {f.nextFollowUpDate && <span className="inline-flex items-center gap-1"><IconClock size={12} /> Next follow-up {formatDate(f.nextFollowUpDate)}</span>}
                  {f.assignedTo && <span>Assigned to {f.assignedTo.fullName}</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {allowed && (
        <FollowUpModal
          key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
          enquiry={enquiry}
          followUp={editing === 'new' ? null : editing}
          assignees={assignees}
          open={editing !== null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.replace(`/enquiries/${enquiry.id}?tab=followups`, { scroll: false });
            router.refresh();
          }}
        />
      )}
      {canDelete && canManage && (
        <ConfirmDialog
          open={removing !== null}
          onClose={() => setRemoving(null)}
          title="Remove follow-up?"
          message={<>The follow-up of <strong className="text-ink">{removing ? formatDateTime(removing.followUpDate) : ''}</strong> will be removed. Its full record is kept in the activity history.</>}
          confirmLabel="Remove follow-up"
          onConfirm={async () => {
            const outcome = await deleteFollowUpAction(enquiry.id, removing!.id);
            if (outcome.ok) router.refresh();
            return outcome;
          }}
        />
      )}
    </section>
  );
}

const METHODS = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOMES = Object.entries(FOLLOW_UP_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

function FollowUpModal({
  enquiry,
  followUp,
  assignees,
  open,
  onClose,
  onSaved,
}: {
  enquiry: EnquiryDetail;
  followUp: EnquiryFollowUp | null;
  assignees: EnquiryAssignee[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    followUpDate: toLocalInput(followUp ? new Date(followUp.followUpDate) : new Date()),
    contactId: followUp ? followUp.contactId ?? '' : enquiry.customerContactId ?? '',
    method: (followUp?.method ?? 'PHONE') as FollowUpMethod,
    discussionSummary: followUp?.discussionSummary ?? '',
    customerResponse: followUp?.customerResponse ?? '',
    outcome: (followUp?.outcome ?? 'INTERESTED') as FollowUpOutcome,
    nextFollowUpDate: followUp?.nextFollowUpDate?.slice(0, 10) ?? '',
    assignedToId: followUp ? followUp.assignedToId ?? '' : enquiry.assignedToId ?? '',
    internalNotes: followUp?.internalNotes ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _r, ...rest }) => rest);
  };

  const save = () => {
    const e: Record<string, string> = {};
    const when = new Date(form.followUpDate);
    if (!form.followUpDate || Number.isNaN(when.getTime())) e.followUpDate = 'Enter when the follow-up happened.';
    else if (when.getTime() > Date.now() + 5 * 60_000) e.followUpDate = 'A follow-up records an interaction that happened; use the next follow-up date to plan one.';
    if (!form.discussionSummary.trim()) e.discussionSummary = 'Discussion summary is required.';
    if (form.nextFollowUpDate && form.followUpDate && form.nextFollowUpDate < form.followUpDate.slice(0, 10)) e.nextFollowUpDate = 'The next follow-up cannot be before this follow-up.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload: FollowUpPayload = { ...form, followUpDate: when.toISOString() };
    startTransition(async () => {
      const outcome = followUp ? await updateFollowUpAction(enquiry.id, followUp.id, payload) : await addFollowUpAction(enquiry.id, payload);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  const area = (field: 'discussionSummary' | 'customerResponse' | 'internalNotes', label: string, max: number, required = false) => (
    <div className="sm:col-span-2">
      <label htmlFor={`fu-${field}`} className="field-label">{label}{required && <span className="text-danger"> *</span>}</label>
      <textarea id={`fu-${field}`} rows={field === 'discussionSummary' ? 3 : 2} maxLength={max} value={form[field]} onChange={(e) => set(field, e.target.value)} className={clsx('field-input', errors[field] && 'border-danger')} />
      {errors[field] && <p className="field-error">{errors[field]}</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={followUp ? 'Edit follow-up' : 'Add follow-up'}
      description={`${enquiry.enquiryNumber} · ${enquiry.customer.name}`}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save follow-up'}</button></>}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Follow-up Date & Time" type="datetime-local" required value={form.followUpDate} onChange={(v) => set('followUpDate', v)} error={errors.followUpDate} />
        <SelectField
          label="Contact Person"
          value={form.contactId}
          onChange={(v) => set('contactId', v)}
          placeholder={enquiry.customer.contacts.length ? 'Not specified' : 'No contacts on this customer'}
          options={enquiry.customer.contacts.map((c) => ({ value: c.id, label: `${c.name}${c.isPrimary ? ' (primary)' : ''}` }))}
        />
        <SelectField label="Communication Method" required value={form.method} onChange={(v) => set('method', v as FollowUpMethod)} options={METHODS} />
        <SelectField label="Outcome" required value={form.outcome} onChange={(v) => set('outcome', v as FollowUpOutcome)} options={OUTCOMES} />
        {area('discussionSummary', 'Discussion Summary', 4000, true)}
        {area('customerResponse', 'Customer Response', 2000)}
        <TextField label="Next Follow-up Date" type="date" value={form.nextFollowUpDate} onChange={(v) => set('nextFollowUpDate', v)} error={errors.nextFollowUpDate} hint="Leave empty if no further follow-up is planned" />
        <SelectField label="Assigned Employee" value={form.assignedToId} onChange={(v) => set('assignedToId', v)} placeholder="Not assigned" options={assignees.map((a) => ({ value: a.id, label: a.fullName }))} />
        {area('internalNotes', 'Internal Notes', 2000)}
        <div className="sm:col-span-2"><ResultAlert result={result} /></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

const KINDS = Object.entries(ENQUIRY_DOCUMENT_KIND_LABELS).map(([value, label]) => ({ value, label }));

export function EnquiryAttachmentsPanel({
  enquiry,
  canUpload,
  canRemove,
  canDownload,
}: {
  enquiry: EnquiryDetail;
  canUpload: boolean;
  canRemove: boolean;
  canDownload: boolean;
}) {
  return (
    <DocumentsManager
      basePath={`/enquiries/${enquiry.id}/attachments`}
      documents={enquiry.documents}
      kinds={KINDS}
      canUpload={canUpload}
      canRemove={canRemove}
      canDownload={canDownload}
      emptyText="Upload the customer's requirement document, technical specifications, reference images or an existing quotation."
      onUpload={(data) => uploadEnquiryAttachmentAction(enquiry.id, data)}
      onReplace={(documentId, data) => replaceEnquiryAttachmentAction(enquiry.id, documentId, data)}
      onRemove={(documentId) => removeEnquiryAttachmentAction(enquiry.id, documentId)}
    />
  );
}
