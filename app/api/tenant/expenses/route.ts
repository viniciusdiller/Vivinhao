import { NextResponse } from 'next/server';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import { createExpense, getExpenses, getReservations } from '@/services/tenantService';
import type { Expense } from '@/types/domain';

function canAccessFinance(session: NonNullable<Awaited<ReturnType<typeof getVerifiedTenantSession>>>) {
  return hasFeatureAccess(session, 'finance');
}

export async function GET() {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccessFinance(session)) {
    return NextResponse.json({ message: 'Sem permissão para esta ação.' }, { status: 403 });
  }

  const [reservations, expenses] = await Promise.all([
    getReservations(session.tenantId),
    getExpenses(session.tenantId),
  ]);

  return NextResponse.json({ reservations, expenses });
}

export async function POST(request: Request) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }
  if (!canAccessFinance(session)) {
    return NextResponse.json({ message: 'Sem permissão para esta ação.' }, { status: 403 });
  }

  const body = (await request.json()) as { expense?: Omit<Expense, 'id'> };

  if (!body.expense) {
    return NextResponse.json({ message: 'Despesa inválida.' }, { status: 400 });
  }

  try {
    const expense = await createExpense(session.tenantId, body.expense, session.userId);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar despesa.';
    return NextResponse.json({ message }, { status: 400 });
  }
}
