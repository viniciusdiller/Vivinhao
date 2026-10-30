'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';

type ExpenseDeleteButtonProps = {
  expenseId: string;
  description: string;
};

export function ExpenseDeleteButton({ expenseId, description }: ExpenseDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/tenant/expenses/${expenseId}`, {
        method: 'DELETE',
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Falha ao excluir despesa.');
      }

      setOpen(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Falha ao excluir despesa.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-300/50 hover:bg-rose-500/20"
        aria-label={`Excluir despesa ${description}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Excluir
      </button>

      <ConfirmDialog
        open={open}
        title="Excluir despesa"
        description={`Deseja realmente excluir \"${description}\"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir despesa"
        loading={isDeleting}
        error={error}
        onCancel={() => {
          if (!isDeleting) {
            setOpen(false);
            setError(null);
          }
        }}
        onConfirm={handleConfirm}
      />
    </>
  );
}
