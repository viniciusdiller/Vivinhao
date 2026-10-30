import { NextResponse } from 'next/server';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import { deleteExpense } from '@/services/tenantService';

type RouteContext = {
  params: Promise<{
    expenseId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }
  if (!hasFeatureAccess(session, 'finance')) {
    return NextResponse.json({ message: 'Sem permissão para esta ação.' }, { status: 403 });
  }

  const { expenseId } = await context.params;

  if (!expenseId) {
    return NextResponse.json({ message: 'Despesa inválida.' }, { status: 400 });
  }

  try {
    await deleteExpense(session.tenantId, expenseId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao excluir despesa.';
    return NextResponse.json({ message }, { status: 400 });
  }
}
