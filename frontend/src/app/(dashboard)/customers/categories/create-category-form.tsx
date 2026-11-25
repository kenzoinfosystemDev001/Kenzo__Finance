'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ResultAlert, TextField } from '@/components/client-ui';
import { createCustomerCategoryAction } from '@/lib/customer-actions';
import type { ActionResult } from '@/lib/vendor-actions';

export function CreateCustomerCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<ActionResult & { success?: string }>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await createCustomerCategoryAction(name, description);
          if (outcome.ok) {
            setResult({ success: `Category "${name.trim()}" added.` });
            setName('');
            setDescription('');
            router.refresh();
          } else setResult(outcome);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <TextField label="New category" required value={name} onChange={setName} maxLength={100} />
        <TextField label="Description" value={description} onChange={setDescription} maxLength={300} />
        <button type="submit" className="btn-primary h-10" disabled={pending || !name.trim()}>
          {pending ? 'Adding...' : 'Add category'}
        </button>
      </div>
      <ResultAlert result={result} />
    </form>
  );
}
