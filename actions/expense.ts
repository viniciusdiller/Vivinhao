'use server';

import { revalidatePath } from 'next/cache';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import { createExpense } from '@/services/tenantService';
import type { ExpenseCategory } from '@/types/domain';

type ExpenseInput = {
  description: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
};

export async function createExpenseAction(input: ExpenseInput) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    throw new Error('Sessão inválida.');
  }

  if (!hasFeatureAccess(session, 'finance')) {
    throw new Error('Sem permissão para esta ação.');
  }

  await createExpense(
    session.tenantId,
    {
      description: input.description,
      amount: input.amount,
      date: input.date,
      category: input.category,
    },
    session.userId,
  );

  revalidatePath('/dashboard/finance');
}
