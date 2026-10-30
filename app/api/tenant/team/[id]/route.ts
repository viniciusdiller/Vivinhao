import { NextResponse } from 'next/server';
import { getVerifiedTenantSession } from '@/lib/tenant-session';
import {
  resolveDashboardPermissionsForRole,
  sanitizeDashboardPermissions,
  type DashboardFeatureKey,
} from '@/lib/dashboard-access';
import { getDb } from '@/lib/db';

type MemberActionPayload =
  | {
      action: 'toggle-employment';
    }
  | {
      action: 'toggle-shift';
    }
  | {
      action: 'set-permissions';
      permissions?: DashboardFeatureKey[];
    };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Nao autenticado.' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Somente gestores podem alterar colaboradores.' }, { status: 403 });
  }

  const resolvedParams = await params;
  const memberId = Number(resolvedParams.id);

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return NextResponse.json({ message: 'Colaborador invalido.' }, { status: 400 });
  }

  const body = (await request.json()) as MemberActionPayload;

  if (!body?.action) {
    return NextResponse.json({ message: 'Acao obrigatoria.' }, { status: 400 });
  }

  const { User } = await getDb();

  const user = await User.findOne({
    where: {
      id: memberId,
      tenantId: session.tenantId,
    },
  });

  if (!user || user.role === 'customer') {
    return NextResponse.json({ message: 'Colaborador nao encontrado.' }, { status: 404 });
  }

  if (body.action === 'toggle-employment') {
    if (user.id === session.userId && user.employmentStatus === 'active') {
      return NextResponse.json({ message: 'Nao e permitido inativar o proprio usuario logado.' }, { status: 400 });
    }

    if (user.employmentStatus === 'active') {
      await user.update({
        employmentStatus: 'inactive',
        shiftStatus: 'off',
        lastPunchAt: new Date(),
      });
    } else {
      await user.update({
        employmentStatus: 'active',
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'toggle-shift') {
    if (user.employmentStatus !== 'active') {
      return NextResponse.json({ message: 'Colaborador inativo nao pode bater turno.' }, { status: 400 });
    }

    const nextShiftStatus = user.shiftStatus === 'off' ? 'on_shift' : 'off';

    await user.update({
      shiftStatus: nextShiftStatus,
      lastPunchAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'set-permissions') {
    const permissions = sanitizeDashboardPermissions(body.permissions ?? []);
    const resolved = resolveDashboardPermissionsForRole('staff', permissions);

    await user.update({
      dashboardPermissions: JSON.stringify(resolved),
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: 'Acao invalida.' }, { status: 400 });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Nao autenticado.' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Somente gestores podem excluir colaboradores.' }, { status: 403 });
  }

  const resolvedParams = await params;
  const memberId = Number(resolvedParams.id);

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return NextResponse.json({ message: 'Colaborador invalido.' }, { status: 400 });
  }

  const { User } = await getDb();

  const user = await User.findOne({
    where: {
      id: memberId,
      tenantId: session.tenantId,
    },
  });

  if (!user || user.role === 'customer') {
    return NextResponse.json({ message: 'Colaborador nao encontrado.' }, { status: 404 });
  }

  if (user.id === session.userId) {
    return NextResponse.json({ message: 'Nao e permitido excluir o proprio usuario logado.' }, { status: 400 });
  }

  if (user.role === 'admin') {
    return NextResponse.json({ message: 'Exclusao disponivel apenas para colaboradores.' }, { status: 400 });
  }

  await user.destroy();

  return NextResponse.json({ ok: true });
}
