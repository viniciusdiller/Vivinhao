'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { createExpenseAction } from '@/actions/expense';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils';
import type { ExpenseCategory } from '@/types/domain';

const expenseCategories: ExpenseCategory[] = ['limpeza', 'manutenção', 'impostos', 'insumos', 'comissões', 'outros'];

type FormState = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  date: string;
};

const initialState: FormState = {
  description: '',
  amount: '',
  category: 'limpeza',
  date: new Date().toISOString().slice(0, 10),
};

export function ExpenseModalForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const amount = parseCurrencyInput(form.amount);
    if (!form.description || !form.date || Number.isNaN(amount) || amount <= 0) {
      setError('Preencha descrição, valor e data com valores válidos.');
      return;
    }

    startTransition(async () => {
      try {
        await createExpenseAction({
          description: form.description,
          date: form.date,
          amount,
          category: form.category,
        });
        setForm(initialState);
        setIsOpen(false);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Falha ao salvar despesa.');
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-950/30"
      >
        <Plus className="h-4 w-4" />
        Nova Despesa
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="w-full max-w-xl rounded-[30px] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Nova despesa</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">Lançar custo operacional</h3>
                </div>
                <button onClick={() => setIsOpen(false)} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-slate-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Descrição</span>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Material de limpeza, Conserto do ar-condicionado"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Valor</span>
                    <input
                      type="text"
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: formatCurrencyInput(event.target.value) }))}
                      placeholder="R$ 0,00"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Data</span>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Categoria</span>
                  <select
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as ExpenseCategory }))}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  >
                    {expenseCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                {error ? <p className="text-sm text-rose-300">{error}</p> : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-950/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
