'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { ActionMenu, CheckboxField, ConfirmDialog, Modal, ResultAlert, SelectField, TextField, type MenuItem } from '@/components/client-ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { IconDownload, IconEye, IconFile, IconPencil, IconPlus, IconTrash, IconUpload, IconX } from '@/components/icons';
import {
  addTrackingAction,
  amendPodAction,
  cancelDeliveryAction,
  changeDeliveryStatusAction,
  confirmDeliveryAction,
  dispatchDeliveryAction,
  recordFailureAction,
  removeDeliveryDocumentAction,
  scheduleDeliveryAction,
  setDeliveryPackagesAction,
  uploadDeliveryDocumentAction,
  type DispatchPayload,
} from '@/lib/delivery-actions';
import {
  DELIVERY_DOCUMENT_KIND_LABELS,
  DELIVERY_UPLOAD_KINDS,
  deliveryActions,
  isUploadKind,
  TRANSPORT_MODE_LABELS,
  TRANSPORT_MODES,
  type DeliveryActionKey,
} from '@/lib/delivery-labels';
import { canPreviewInline, formatBytes, formatDateTime } from '@/lib/vendor-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { DeliveryDocument, DeliveryPackage, DeliveryStatus, ProofOfDeliveryRecord, TransportMode } from '@/lib/types';

/** Calendar day of an API date (a @db.Date column serialises as YYYY-MM-DDT00:00:00Z); used for input limits only. */
const dayOf = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

export interface DeliveryActionRef {
  id: string;
  deliveryNumber: string;
  status: DeliveryStatus;
  canEditItems: boolean;
  hasDispatchDocuments: boolean;
  deliveryDate: string;
  expectedDate: string | null;
  dispatchDate: string | null;
  customerId: string;
  finalInvoiceId: string;
  items: Array<{ id: string; productName: string; modelName: string | null; quantity: number; unit: string }>;
  packages: DeliveryPackage[];
  currentPod: ProofOfDeliveryRecord | null;
}

// ---------------------------------------------------------------------------
// Generic form modal
// ---------------------------------------------------------------------------

function FormModal({
  open,
  onClose,
  title,
  description,
  submitLabel,
  tone = 'primary',
  size = 'md',
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel: string;
  tone?: 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onSubmit: () => Promise<ActionResult>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const submit = () =>
    startTransition(async () => {
      const outcome = await onSubmit();
      if (outcome.ok) {
        onClose();
        router.refresh();
      } else setResult(outcome);
    });
  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Close</button>
          <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={submit} disabled={pending}>
            {pending ? 'Saving...' : submitLabel}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {children}
        <ResultAlert result={result} />
      </form>
    </Modal>
  );
}

function TextArea({ label, value, onChange, required, rows = 2, maxLength = 2000, hint }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; rows?: number; maxLength?: number; hint?: string }) {
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className="field-label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <textarea id={fieldId} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} className="field-input" />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header actions: only the steps valid for the current status and permissions
// ---------------------------------------------------------------------------

export function DeliveryHeaderActions({ delivery, permissions, today }: { delivery: DeliveryActionRef; permissions: string[]; today: string }) {
  const router = useRouter();
  const can = (p: string) => permissions.includes(p);
  const actions = deliveryActions(
    { status: delivery.status, canEditItems: delivery.canEditItems, hasProof: delivery.currentPod !== null, hasDispatchDocuments: delivery.hasDispatchDocuments },
    permissions,
  );
  const [open, setOpen] = useState<DeliveryActionKey | null>(null);
  const close = () => setOpen(null);
  const has = (k: DeliveryActionKey) => actions.has(k);

  const scheduleLabel = delivery.status === 'DELIVERY_FAILED' ? 'Reschedule attempt' : delivery.status === 'READY_FOR_DISPATCH' ? 'Reschedule' : 'Schedule';

  const menu: MenuItem[] = [];
  if (has('returned')) menu.push({ label: 'Mark returned', tone: 'danger', onSelect: () => setOpen('returned') });
  if (has('amendPod')) menu.push({ label: 'Amend proof of delivery', onSelect: () => setOpen('amendPod') });
  if (has('cancel')) menu.push({ label: 'Cancel delivery', icon: <IconX size={16} />, tone: 'danger', onSelect: () => setOpen('cancel') });

  return (
    <div className="flex max-w-2xl flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {has('edit') && <Link href={`/deliveries/${delivery.id}/edit`} className="btn-secondary"><IconPencil size={16} /> Edit</Link>}
        {has('packages') && <button type="button" className="btn-secondary" onClick={() => setOpen('packages')}>Packages</button>}
        {has('schedule') && <button type="button" className="btn-secondary" onClick={() => setOpen('schedule')}>{scheduleLabel}</button>}
        {has('ready') && <button type="button" className="btn-secondary" onClick={() => setOpen('ready')}>Mark ready for dispatch</button>}
        {has('dispatch') && <button type="button" className="btn-primary" onClick={() => setOpen('dispatch')}>Dispatch</button>}
        {has('inTransit') && <button type="button" className="btn-secondary" onClick={() => setOpen('inTransit')}>Mark in transit</button>}
        {has('tracking') && <button type="button" className="btn-secondary" onClick={() => setOpen('tracking')}>Add tracking update</button>}
        {has('confirm') && <button type="button" className="btn-primary" onClick={() => setOpen('confirm')}>Confirm delivery</button>}
        {has('failure') && <button type="button" className="btn-danger" onClick={() => setOpen('failure')}>Record failure</button>}
        {has('redeliver') && (
          <Link href={`/deliveries/new?customerId=${delivery.customerId}&invoiceId=${delivery.finalInvoiceId}&redeliveryOf=${delivery.id}`} className="btn-primary">
            <IconPlus size={16} /> Create redelivery
          </Link>
        )}
        {can('delivery.download') && (
          <>
            <a href={`/deliveries/${delivery.id}/challan`} className="btn-secondary"><IconDownload size={16} /> {delivery.hasDispatchDocuments ? 'Challan' : 'Draft challan'}</a>
            <a href={`/deliveries/${delivery.id}/packing-list`} className="btn-secondary"><IconDownload size={16} /> {delivery.hasDispatchDocuments ? 'Packing list' : 'Draft packing list'}</a>
          </>
        )}
        {menu.length > 0 && <ActionMenu items={menu} label={`More actions for ${delivery.deliveryNumber}`} />}
      </div>
      {can('delivery.download') && !delivery.hasDispatchDocuments && (
        <p className="text-right text-xs text-ink-subtle">Before dispatch the challan and packing list are previews watermarked DRAFT; the final documents are stored at dispatch.</p>
      )}

      {open === 'schedule' && <ScheduleModal delivery={delivery} today={today} title={scheduleLabel} onClose={close} />}
      {open === 'dispatch' && <DispatchModal delivery={delivery} today={today} onClose={close} />}
      {open === 'tracking' && <TrackingModal delivery={delivery} onClose={close} />}
      {open === 'failure' && <FailureModal delivery={delivery} today={today} onClose={close} />}
      {open === 'confirm' && <ConfirmDeliveryModal delivery={delivery} today={today} onClose={close} />}
      {open === 'amendPod' && delivery.currentPod && <AmendPodModal delivery={delivery} pod={delivery.currentPod} today={today} onClose={close} />}
      {open === 'packages' && <PackagesModal delivery={delivery} onClose={close} />}

      <ConfirmDialog
        open={open === 'ready'}
        onClose={close}
        tone="primary"
        title="Mark ready for dispatch?"
        message={<><strong className="text-ink">{delivery.deliveryNumber}</strong> is packed and ready to leave.</>}
        confirmLabel="Mark ready"
        withReason
        reasonLabel="Remarks (optional, kept in the status history)"
        onConfirm={async (remarks) => {
          const r = await changeDeliveryStatusAction(delivery.id, 'READY_FOR_DISPATCH', remarks);
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <ConfirmDialog
        open={open === 'inTransit'}
        onClose={close}
        tone="primary"
        title="Mark in transit?"
        message={<><strong className="text-ink">{delivery.deliveryNumber}</strong> is on its way to the customer. A tracking entry is recorded.</>}
        confirmLabel="Mark in transit"
        withReason
        reasonLabel="Remarks (optional)"
        onConfirm={async (remarks) => {
          const r = await changeDeliveryStatusAction(delivery.id, 'IN_TRANSIT', remarks);
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <ConfirmDialog
        open={open === 'returned'}
        onClose={close}
        title="Mark goods returned?"
        message={<>The goods of <strong className="text-ink">{delivery.deliveryNumber}</strong> came back. Their quantities are released so they can be delivered again with a redelivery. This cannot be undone.</>}
        confirmLabel="Mark returned"
        withReason
        reasonLabel="Reason for the return (required)"
        onConfirm={async (remarks) => {
          if (!remarks.trim()) return { error: 'Give the reason the goods were returned.' };
          const r = await changeDeliveryStatusAction(delivery.id, 'RETURNED', remarks);
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <ConfirmDialog
        open={open === 'cancel'}
        onClose={close}
        title="Cancel delivery?"
        message={<><strong className="text-ink">{delivery.deliveryNumber}</strong> has not been dispatched. Cancelling releases its quantities back to the invoice. This cannot be undone.</>}
        confirmLabel="Cancel delivery"
        withReason
        reasonLabel="Cancellation reason (required)"
        onConfirm={async (reason) => {
          if (!reason.trim()) return { error: 'Cancellation reason is required.' };
          const r = await cancelDeliveryAction(delivery.id, reason);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}

function ScheduleModal({ delivery, today, title, onClose }: { delivery: DeliveryActionRef; today: string; title: string; onClose: () => void }) {
  const [expectedDate, setExpectedDate] = useState(dayOf(delivery.expectedDate) || today);
  const [remarks, setRemarks] = useState('');
  return (
    <FormModal
      open
      onClose={onClose}
      title={`${title} ${delivery.deliveryNumber}`}
      description="Set the date the customer should receive the goods."
      submitLabel={title}
      onSubmit={() => scheduleDeliveryAction(delivery.id, expectedDate, remarks)}
    >
      <TextField label="Expected delivery date" type="date" required value={expectedDate} onChange={setExpectedDate} hint="Not before the delivery date." />
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
    </FormModal>
  );
}

const EMPTY_DISPATCH = (today: string): DispatchPayload => ({
  dispatchDate: today,
  dispatchTime: '',
  transportMode: 'TRANSPORT',
  transporterName: '',
  vehicleNumber: '',
  driverName: '',
  driverContact: '',
  courierCompany: '',
  trackingNumber: '',
  lrGrNumber: '',
  dispatchRemarks: '',
});

/** Fields relevant to each transport mode; the first one is required (mirrors dispatchProblems on the API). */
const MODE_FIELDS: Record<TransportMode, Array<keyof DispatchPayload>> = {
  COURIER: ['courierCompany', 'trackingNumber'],
  TRANSPORT: ['transporterName', 'lrGrNumber', 'vehicleNumber', 'driverName', 'driverContact', 'trackingNumber'],
  OWN_VEHICLE: ['vehicleNumber', 'driverName', 'driverContact'],
  DIRECT: [],
};

const FIELD_LABELS: Partial<Record<keyof DispatchPayload, { label: string; max: number }>> = {
  courierCompany: { label: 'Courier company', max: 200 },
  trackingNumber: { label: 'Tracking / AWB number', max: 200 },
  transporterName: { label: 'Transporter name', max: 200 },
  lrGrNumber: { label: 'LR / GR number', max: 100 },
  vehicleNumber: { label: 'Vehicle number', max: 50 },
  driverName: { label: 'Driver name', max: 200 },
  driverContact: { label: 'Driver contact', max: 50 },
};

function DispatchModal({ delivery, today, onClose }: { delivery: DeliveryActionRef; today: string; onClose: () => void }) {
  const [values, setValues] = useState<DispatchPayload>(EMPTY_DISPATCH(today));
  const set = (k: keyof DispatchPayload, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const fields = MODE_FIELDS[values.transportMode];
  const required = fields[0];
  return (
    <FormModal
      open
      onClose={onClose}
      size="lg"
      title={`Dispatch ${delivery.deliveryNumber}`}
      description="The goods leave the premises. The delivery challan and packing list are stored now and can no longer change; the delivery can then only be delivered, fail or be returned."
      submitLabel="Dispatch"
      onSubmit={async () => {
        if (!values.dispatchDate) return { error: 'Enter the dispatch date.' };
        if (values.dispatchDate > today) return { error: 'The dispatch date cannot be in the future.' };
        if (required && !values[required].trim()) return { error: `${FIELD_LABELS[required]!.label} is required for ${TRANSPORT_MODE_LABELS[values.transportMode].toLowerCase()} dispatch.` };
        // Fields that do not belong to the chosen mode are not sent.
        const clean = { ...values };
        for (const k of Object.keys(FIELD_LABELS) as Array<keyof DispatchPayload>) if (!fields.includes(k)) (clean as Record<string, string>)[k] = '';
        return dispatchDeliveryAction(delivery.id, clean);
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="Dispatch date" type="date" required value={values.dispatchDate} onChange={(v) => set('dispatchDate', v)} hint="Today or earlier." />
        <TextField label="Dispatch time" type="time" value={values.dispatchTime} onChange={(v) => set('dispatchTime', v)} hint="HH:MM (optional)" />
        <SelectField
          label="Transport mode"
          required
          value={values.transportMode}
          onChange={(v) => set('transportMode', v)}
          options={TRANSPORT_MODES.map((m) => ({ value: m, label: TRANSPORT_MODE_LABELS[m] }))}
        />
      </div>
      {fields.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((k) => (
            <TextField key={k} label={FIELD_LABELS[k]!.label} required={k === required} maxLength={FIELD_LABELS[k]!.max} value={values[k]} onChange={(v) => set(k, v)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No carrier details are needed when the goods are handed over directly.</p>
      )}
      <TextArea label="Dispatch remarks" value={values.dispatchRemarks} onChange={(v) => set('dispatchRemarks', v)} />
    </FormModal>
  );
}

/** datetime-local value for "now" in the browser's time zone. */
function nowLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TrackingModal({ delivery, onClose }: { delivery: DeliveryActionRef; onClose: () => void }) {
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [eventAt, setEventAt] = useState(nowLocal());
  const [markInTransit, setMarkInTransit] = useState(delivery.status === 'DISPATCHED');
  return (
    <FormModal
      open
      onClose={onClose}
      title={`Tracking update for ${delivery.deliveryNumber}`}
      description="Recorded as a manual update with your name."
      submitLabel="Add update"
      onSubmit={async () => {
        if (!status.trim()) return { error: 'Enter the shipment status.' };
        const when = eventAt ? new Date(eventAt) : null;
        if (when && Number.isNaN(when.getTime())) return { error: 'Invalid event time.' };
        return addTrackingAction(delivery.id, { status, location, remarks, eventAt: when ? when.toISOString() : '', markInTransit: delivery.status === 'DISPATCHED' && markInTransit });
      }}
    >
      <TextField label="Shipment status" required maxLength={100} value={status} onChange={setStatus} placeholder="e.g. Reached Pune hub" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Location" maxLength={200} value={location} onChange={setLocation} />
        <TextField label="When" type="datetime-local" value={eventAt} onChange={setEventAt} hint="Cannot be in the future." />
      </div>
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
      {delivery.status === 'DISPATCHED' && <CheckboxField label="Also mark the delivery in transit" checked={markInTransit} onChange={setMarkInTransit} />}
    </FormModal>
  );
}

function FailureModal({ delivery, today, onClose }: { delivery: DeliveryActionRef; today: string; onClose: () => void }) {
  const [failureDate, setFailureDate] = useState(today);
  const [failureReason, setFailureReason] = useState('');
  const [nextAttemptDate, setNextAttemptDate] = useState('');
  const [remarks, setRemarks] = useState('');
  return (
    <FormModal
      open
      onClose={onClose}
      tone="danger"
      title={`Delivery failed: ${delivery.deliveryNumber}`}
      description="The attempt did not reach the customer. Afterwards the delivery can be rescheduled or marked returned."
      submitLabel="Record failure"
      onSubmit={async () => {
        if (!failureDate) return { error: 'Enter the failure date.' };
        if (failureDate > today) return { error: 'The failure date cannot be in the future.' };
        if (delivery.dispatchDate && failureDate < dayOf(delivery.dispatchDate)) return { error: 'The failure date cannot be before the dispatch date.' };
        if (nextAttemptDate && nextAttemptDate < failureDate) return { error: 'The next attempt cannot be before the failure date.' };
        return recordFailureAction(delivery.id, { failureDate, failureReason, nextAttemptDate, remarks });
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Failure date" type="date" required value={failureDate} onChange={setFailureDate} />
        <TextField label="Next attempt date" type="date" value={nextAttemptDate} onChange={setNextAttemptDate} />
      </div>
      <TextArea label="Failure reason" required value={failureReason} onChange={setFailureReason} />
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
    </FormModal>
  );
}

function ConfirmDeliveryModal({ delivery, today, onClose }: { delivery: DeliveryActionRef; today: string; onClose: () => void }) {
  const [receiverName, setReceiverName] = useState('');
  const [receiverContact, setReceiverContact] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(() => Object.fromEntries(delivery.items.map((i) => [i.id, String(i.quantity)])));
  const short = delivery.items.some((i) => Number(received[i.id]) < i.quantity);
  return (
    <FormModal
      open
      onClose={onClose}
      size="lg"
      title={`Confirm delivery of ${delivery.deliveryNumber}`}
      description="Record proof of delivery. If less was received than dispatched, the delivery becomes Partially Delivered."
      submitLabel="Confirm delivery"
      onSubmit={async () => {
        const items: Array<{ deliveryItemId: string; deliveredQuantity: number }> = [];
        for (const i of delivery.items) {
          const raw = (received[i.id] ?? '').trim();
          if (!/^\d+$/.test(raw)) return { error: `${i.productName}: enter the received quantity (a whole number).` };
          const qty = Number(raw);
          if (qty > i.quantity) return { error: `${i.productName}: received ${qty} exceeds the ${i.quantity} ${i.unit} dispatched.` };
          items.push({ deliveryItemId: i.id, deliveredQuantity: qty });
        }
        if (items.every((i) => i.deliveredQuantity === 0)) return { error: 'Nothing was received: record a delivery failure or return instead.' };
        if (!actualDeliveryDate) return { error: 'Enter the date the goods were received.' };
        if (actualDeliveryDate > today) return { error: 'The delivery date cannot be in the future.' };
        if (delivery.dispatchDate && actualDeliveryDate < dayOf(delivery.dispatchDate)) return { error: 'The delivery date cannot be before the dispatch date.' };
        return confirmDeliveryAction(delivery.id, { receiverName, receiverContact, actualDeliveryDate, deliveryConfirmation: confirmed, remarks, items });
      }}
    >
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table">
          <thead>
            <tr><th scope="col">Item</th><th scope="col" className="text-right">Dispatched</th><th scope="col" className="w-40">Received</th></tr>
          </thead>
          <tbody>
            {delivery.items.map((i) => (
              <tr key={i.id}>
                <td>{i.productName}{i.modelName && <span className="block text-xs text-ink-subtle">{i.modelName}</span>}</td>
                <td className="text-right tabular-nums">{i.quantity} {i.unit}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={i.quantity}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Received quantity of ${i.productName}`}
                    value={received[i.id] ?? ''}
                    onChange={(e) => setReceived((r) => ({ ...r, [i.id]: e.target.value }))}
                    className="field-input"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {short && <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">Less than dispatched: this will be recorded as a partial delivery.</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="Receiver name" required maxLength={200} value={receiverName} onChange={setReceiverName} />
        <TextField label="Receiver contact" maxLength={50} value={receiverContact} onChange={setReceiverContact} />
        <TextField label="Received on" type="date" required value={actualDeliveryDate} onChange={setActualDeliveryDate} />
      </div>
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
      <CheckboxField label="The customer has received the goods listed above" checked={confirmed} onChange={setConfirmed} hint="Required. Upload the signed POD, signature or photo in the Documents tab." />
    </FormModal>
  );
}

function AmendPodModal({ delivery, pod, today, onClose }: { delivery: DeliveryActionRef; pod: ProofOfDeliveryRecord; today: string; onClose: () => void }) {
  const [receiverName, setReceiverName] = useState(pod.receiverName);
  const [receiverContact, setReceiverContact] = useState(pod.receiverContact ?? '');
  const [actualDeliveryDate, setActualDeliveryDate] = useState(dayOf(pod.actualDeliveryDate));
  const [remarks, setRemarks] = useState(pod.remarks ?? '');
  const [amendmentReason, setAmendmentReason] = useState('');
  return (
    <FormModal
      open
      onClose={onClose}
      title={`Amend proof of delivery: ${delivery.deliveryNumber}`}
      description="The recorded proof is kept; the correction is added as an amendment with your reason. Received quantities are not changed here."
      submitLabel="Save amendment"
      onSubmit={async () => {
        if (actualDeliveryDate > today) return { error: 'The delivery date cannot be in the future.' };
        return amendPodAction(delivery.id, { receiverName, receiverContact, actualDeliveryDate, remarks, amendmentReason });
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="Receiver name" required maxLength={200} value={receiverName} onChange={setReceiverName} />
        <TextField label="Receiver contact" maxLength={50} value={receiverContact} onChange={setReceiverContact} />
        <TextField label="Received on" type="date" required value={actualDeliveryDate} onChange={setActualDeliveryDate} />
      </div>
      <TextArea label="Remarks" value={remarks} onChange={setRemarks} />
      <TextArea label="Reason for the amendment" required value={amendmentReason} onChange={setAmendmentReason} />
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
// Packages (packing list), replaced as a whole before dispatch
// ---------------------------------------------------------------------------

interface PackageDraft {
  key: number;
  packageNumber: string;
  description: string;
  weight: string;
  dimensions: string;
  remarks: string;
  qty: Record<string, string>;
}

function PackagesModal({ delivery, onClose }: { delivery: DeliveryActionRef; onClose: () => void }) {
  const counter = useRef(0);
  const blank = (n: number): PackageDraft => ({ key: ++counter.current, packageNumber: String(n), description: '', weight: '', dimensions: '', remarks: '', qty: {} });
  const [packages, setPackages] = useState<PackageDraft[]>(() =>
    delivery.packages.map((p) => ({
      key: ++counter.current,
      packageNumber: String(p.packageNumber),
      description: p.description ?? '',
      weight: p.weight ?? '',
      dimensions: p.dimensions ?? '',
      remarks: p.remarks ?? '',
      qty: Object.fromEntries(p.items.map((l) => [l.deliveryItemId, String(l.quantity)])),
    })),
  );
  const update = (key: number, change: Partial<PackageDraft>) => setPackages((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const packed = (itemId: string) => packages.reduce((s, p) => s + (Number(p.qty[itemId]) || 0), 0);

  return (
    <FormModal
      open
      onClose={onClose}
      size="lg"
      title={`Packages of ${delivery.deliveryNumber}`}
      description="Saving replaces the whole packing list. Weight and dimensions are stored exactly as entered."
      submitLabel="Save packages"
      onSubmit={async () => {
        const numbers = new Set<number>();
        const body = [];
        for (const p of packages) {
          const n = Number(p.packageNumber);
          if (!/^\d+$/.test(p.packageNumber.trim()) || n < 1) return { error: 'Each package needs a number of 1 or more.' };
          if (numbers.has(n)) return { error: 'Package numbers must be unique.' };
          numbers.add(n);
          const items = [];
          for (const i of delivery.items) {
            const raw = (p.qty[i.id] ?? '').trim();
            if (!raw || raw === '0') continue;
            if (!/^\d+$/.test(raw)) return { error: `Package ${n}: enter whole quantities.` };
            items.push({ deliveryItemId: i.id, quantity: Number(raw) });
          }
          if (items.length === 0) return { error: `Package ${n} has no items.` };
          body.push({ packageNumber: n, description: p.description, weight: p.weight, dimensions: p.dimensions, remarks: p.remarks, items });
        }
        for (const i of delivery.items) if (packed(i.id) > i.quantity) return { error: `${i.productName}: packed quantity exceeds the ${i.quantity} ${i.unit} on this delivery.` };
        return setDeliveryPackagesAction(delivery.id, body);
      }}
    >
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="data-table">
          <thead><tr><th scope="col">Item</th><th scope="col" className="text-right">On delivery</th><th scope="col" className="text-right">Packed</th></tr></thead>
          <tbody>
            {delivery.items.map((i) => (
              <tr key={i.id}>
                <td>{i.productName}{i.modelName && <span className="block text-xs text-ink-subtle">{i.modelName}</span>}</td>
                <td className="text-right tabular-nums">{i.quantity} {i.unit}</td>
                <td className={clsx('text-right tabular-nums', packed(i.id) > i.quantity && 'font-semibold text-danger')}>{packed(i.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {packages.length === 0 && <p className="text-sm text-ink-muted">No packages. Saving with none clears the packing list.</p>}
      {packages.map((p) => (
        <fieldset key={p.key} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <legend className="font-semibold text-ink">Package {p.packageNumber || '?'}</legend>
            <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" aria-label={`Remove package ${p.packageNumber}`} onClick={() => setPackages((list) => list.filter((x) => x.key !== p.key))}>
              <IconTrash size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <TextField label="Package no." required inputMode="numeric" value={p.packageNumber} onChange={(v) => update(p.key, { packageNumber: v })} />
            <TextField label="Description" maxLength={500} value={p.description} onChange={(v) => update(p.key, { description: v })} />
            <TextField label="Weight" maxLength={50} placeholder="e.g. 12.5 kg" value={p.weight} onChange={(v) => update(p.key, { weight: v })} />
            <TextField label="Dimensions" maxLength={100} placeholder="e.g. 60x40x40 cm" value={p.dimensions} onChange={(v) => update(p.key, { dimensions: v })} />
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {delivery.items.map((i) => (
              <label key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{i.productName}{i.modelName ? ` (${i.modelName})` : ''}</span>
                <input
                  type="number"
                  min={0}
                  max={i.quantity}
                  step={1}
                  value={p.qty[i.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => update(p.key, { qty: { ...p.qty, [i.id]: e.target.value } })}
                  className="field-input w-28"
                />
              </label>
            ))}
          </div>
          <TextField label="Remarks" maxLength={1000} value={p.remarks} onChange={(v) => update(p.key, { remarks: v })} />
        </fieldset>
      ))}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => setPackages((list) => [...list, blank(list.reduce((m, x) => Math.max(m, Number(x.packageNumber) || 0), 0) + 1)])}
      >
        <IconPlus size={16} /> Add package
      </button>
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
// Documents: POD, signature, photo, attachments (+ stored dispatch documents)
// ---------------------------------------------------------------------------

export function DeliveryDocumentsPanel({
  deliveryId,
  documents,
  canUpload,
  canRemove,
  canDownload,
  canDownloadDispatchDocuments,
  removeBlockedReason,
}: {
  deliveryId: string;
  documents: DeliveryDocument[];
  canUpload: boolean;
  canRemove: boolean;
  canDownload: boolean;
  canDownloadDispatchDocuments: boolean;
  removeBlockedReason: string | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<DeliveryDocument | null>(null);
  const href = (d: DeliveryDocument, preview: boolean) => `/deliveries/${deliveryId}/documents/${d.id}/content${preview ? '?preview=1' : ''}`;

  return (
    <section className="card">
      <PanelHeader
        title="Documents"
        description="Proof of delivery, receiver signature, photos and supporting files. Stored privately and served through permission-checked links."
        actions={canUpload && <button type="button" className="btn-primary" onClick={() => setUploading(true)}><IconUpload size={16} /> Upload document</button>}
      />
      {removeBlockedReason && <p className="border-b border-border px-5 py-2 text-xs text-ink-subtle">{removeBlockedReason}</p>}
      {documents.length === 0 ? (
        <EmptyStateClient title="No documents" description="Upload the signed proof of delivery, the receiver's signature or delivery photos." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th scope="col">Document</th><th scope="col">Type</th><th scope="col" className="text-right">Size</th><th scope="col">Uploaded</th><th scope="col" className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const upload = isUploadKind(d.kind);
                const downloadable = canDownload && (upload || canDownloadDispatchDocuments);
                return (
                  <tr key={d.id}>
                    <td className="min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent"><IconFile size={16} /></span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{d.originalFilename}</p>
                          <p className="text-xs text-ink-subtle">{d.mimeType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{DELIVERY_DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</td>
                    <td className="text-right tabular-nums">{formatBytes(d.sizeBytes)}</td>
                    <td className="whitespace-nowrap">
                      {formatDateTime(d.createdAt)}
                      {d.uploadedBy && <p className="text-xs text-ink-subtle">by {d.uploadedBy.fullName}</p>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {downloadable && canPreviewInline(d.mimeType) && (
                          <a href={href(d, true)} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={`Preview ${d.originalFilename}`} title="Preview"><IconEye /></a>
                        )}
                        {downloadable && <a href={href(d, false)} className="icon-btn" aria-label={`Download ${d.originalFilename}`} title="Download"><IconDownload /></a>}
                        {canRemove && upload && (
                          <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(d)} aria-label={`Remove ${d.originalFilename}`} title="Remove"><IconTrash /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {uploading && <UploadModal deliveryId={deliveryId} onClose={() => setUploading(false)} />}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove document?"
        message={<><strong className="text-ink">{removing?.originalFilename}</strong> will be removed. The file and its record are kept in the audit trail.</>}
        confirmLabel="Remove document"
        onConfirm={async () => {
          const r = await removeDeliveryDocumentAction(deliveryId, removing!.id);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </section>
  );
}

const MAX_BYTES = 10 * 1024 * 1024;

function UploadModal({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <FormModal
      open
      onClose={onClose}
      title="Upload delivery document"
      submitLabel="Upload"
      onSubmit={async () => {
        const form = boxRef.current?.closest('form');
        if (!form) return { error: 'Choose a file to upload.' };
        const data = new FormData(form);
        const file = data.get('file');
        if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
        if (file.size > MAX_BYTES) return { error: 'The file is larger than 10 MB.' };
        return uploadDeliveryDocumentAction(deliveryId, data);
      }}
    >
      <div ref={boxRef} className="space-y-4">
        <div>
          <label htmlFor="delivery-doc-kind" className="field-label">Document type</label>
          <select id="delivery-doc-kind" name="kind" defaultValue="DELIVERY_POD" className="field-input">
            {DELIVERY_UPLOAD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="delivery-doc-file" className="field-label">File</label>
          <input
            id="delivery-doc-file"
            name="file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
            className="field-input file:mr-3 file:rounded file:border-0 file:bg-accent-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
          />
          <p className="field-hint">PDF or image, up to 10 MB. The type is verified from the file contents.</p>
        </div>
      </div>
    </FormModal>
  );
}
