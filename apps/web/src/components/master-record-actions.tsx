'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ConfirmDialog, Modal, ResultAlert, TextField } from './client-ui';
import { IconCheckCircle, IconPause, IconPencil } from './icons';

export interface MasterField {
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
}

/**
 * Edit and activate/deactivate for a shared master record (brand, category).
 * The API enforces uniqueness and permissions; errors are shown in place.
 */
export function MasterRecordActions({
  entityLabel,
  recordName,
  isActive,
  fields,
  initialValues,
  deactivateNote,
  onSave,
  onSetActive,
}: {
  entityLabel: string;
  recordName: string;
  isActive: boolean;
  fields: MasterField[];
  initialValues: Record<string, string>;
  deactivateNote: string;
  onSave: (values: Record<string, string>) => Promise<{ ok?: boolean; error?: string }>;
  onSetActive: (isActive: boolean) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [result, setResult] = useState<{ error?: string }>({});
  const [pending, startTransition] = useTransition();

  const save = () => {
    const missing = fields.find((field) => field.required && !values[field.name]?.trim());
    if (missing) return setResult({ error: `${missing.label} is required.` });
    startTransition(async () => {
      const outcome = await onSave(values);
      if (outcome.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setResult(outcome);
      }
    });
  };

  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setValues(initialValues);
          setResult({});
          setEditing(true);
        }}
        aria-label={`Edit ${recordName}`}
        title="Edit"
      >
        <IconPencil />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setToggling(true)}
        aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${recordName}`}
        title={isActive ? 'Deactivate' : 'Activate'}
      >
        {isActive ? <IconPause /> : <IconCheckCircle />}
      </button>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${entityLabel.toLowerCase()}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={pending}>
              {pending ? 'Saving...' : 'Save'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {fields.map((field) => (
            <TextField
              key={field.name}
              label={field.label}
              required={field.required}
              value={values[field.name] ?? ''}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              hint={field.hint}
            />
          ))}
          <ResultAlert result={result} />
        </div>
      </Modal>

      <ConfirmDialog
        open={toggling}
        onClose={() => setToggling(false)}
        title={`${isActive ? 'Deactivate' : 'Activate'} ${recordName}?`}
        message={isActive ? deactivateNote : `${recordName} will be selectable again.`}
        confirmLabel={isActive ? 'Deactivate' : 'Activate'}
        tone={isActive ? 'danger' : 'primary'}
        onConfirm={async () => {
          const outcome = await onSetActive(!isActive);
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
    </div>
  );
}
