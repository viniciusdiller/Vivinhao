import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import {
  resolveDashboardPermissionsForRole,
  sanitizeDashboardPermissions,
  type DashboardFeatureKey,
} from '@/lib/dashboard-access';
import { getDb } from '@/lib/db';
import {
  employmentStatusFromDb,
  shiftLabelFromDb,
  shiftLabelToDb,
  shiftStatusFromDb,
  TEAM_ROLE_OPTIONS,
  TEAM_SHIFT_OPTIONS,
  type TeamShift,
} from '@/lib/team';

type TeamCreatePayload = {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: string;
  shift?: TeamShift;
  permissions?: DashboardFeatureKey[];
};

function parsePermissions(raw: string | null | undefined) {
  if (!raw) {
    return [];
  }

  try {
    return sanitizeDashboardPermissions(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function ensureTenantContext(tenantId: number, tenantName: string, plan: 'basic' | 'pro' | 'premium') {
  const { Tenant } = await getDb();

  await Tenant.findOrCreate({
    where: { id: tenantId },
    defaults: {
      id: tenantId,
      name: tenantName,
      plan,
      status: 'active',
    },
  });
}

export async function GET() {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Nao autenticado.' }, { status: 401 });
  }

  if (!hasFeatureAccess(session, 'team')) {
    return NextResponse.json({ message: 'Sem permissao para esta acao.' }, { status: 403 });
  }

  await ensureTenantContext(session.tenantId, session.tenantName, session.plan);

  const { User } = await getDb();
  const teamUsers = await User.findAll({
    where: {
      tenantId: session.tenantId,
      role: {
        [Op.in]: ['admin', 'staff'],
      },
    },
    order: [['createdAt', 'DESC']],
  });

  const team = teamUsers.map((user) => {
    const rawPermissions = parsePermissions(user.dashboardPermissions);
    const permissions = resolveDashboardPermissionsForRole(user.role, rawPermissions);

    return {
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      phone: user.phone ?? 'Nao informado',
      role: user.teamRole,
      shift: shiftLabelFromDb(user.shiftLabel),
      employmentStatus: employmentStatusFromDb(user.employmentStatus),
      shiftStatus: shiftStatusFromDb(user.shiftStatus),
      lastPunch: user.lastPunchAt ? user.lastPunchAt.toISOString() : null,
      permissions,
      isCurrentUser: user.id === session.userId,
      accountRole: user.role,
    };
  });

  return NextResponse.json({
    canManage: session.role === 'admin',
    members: team,
  });
}

export async function POST(request: Request) {
  const session = await getVerifiedTenantSession();

  if (!session) {
    return NextResponse.json({ message: 'Nao autenticado.' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Somente gestores podem cadastrar colaboradores.' }, { status: 403 });
  }

  await ensureTenantContext(session.tenantId, session.tenantName, session.plan);

  const body = (await request.json()) as TeamCreatePayload;

  if (!body.name || !body.email || !body.password || !body.role || !body.shift) {
    return NextResponse.json({ message: 'Preencha nome, e-mail, senha, funcao e turno.' }, { status: 400 });
  }

  if (!TEAM_ROLE_OPTIONS.includes(body.role as (typeof TEAM_ROLE_OPTIONS)[number])) {
    return NextResponse.json({ message: 'Funcao invalida.' }, { status: 400 });
  }

  const teamRole = body.role as (typeof TEAM_ROLE_OPTIONS)[number];

  if (!TEAM_SHIFT_OPTIONS.includes(body.shift)) {
    return NextResponse.json({ message: 'Turno invalido.' }, { status: 400 });
  }

  const permissions = sanitizeDashboardPermissions(body.permissions ?? []);
  const passwordHash = await bcrypt.hash(body.password, 10);

  const { User } = await getDb();

  try {
    await User.create({
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash,
      role: 'staff',
      tenantId: session.tenantId,
      phone: body.phone?.trim() || null,
      teamRole,
      shiftLabel: shiftLabelToDb(body.shift),
      shiftStatus: 'off',
      employmentStatus: 'active',
      dashboardPermissions: JSON.stringify(permissions),
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Erro ao cadastrar colaborador:', error);

    if (error instanceof Error && /unique/i.test(error.message)) {
      return NextResponse.json({ message: 'E-mail ja cadastrado em outro usuario.' }, { status: 409 });
    }

    if (error instanceof Error && /team_role|Data truncated/i.test(error.message)) {
      try {
        await User.create({
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          passwordHash,
          role: 'staff',
          tenantId: session.tenantId,
          phone: body.phone?.trim() || null,
          // Compatibilidade com bases legadas que possam ter ENUM antigo na coluna.
          teamRole: 'Recepcao',
          shiftLabel: shiftLabelToDb(body.shift),
          shiftStatus: 'off',
          employmentStatus: 'active',
          dashboardPermissions: JSON.stringify(permissions),
        });

        return NextResponse.json({ ok: true }, { status: 201 });
      } catch (fallbackError) {
        console.error('Erro no fallback de cadastro de colaborador:', fallbackError);
      }
    }

    return NextResponse.json({ message: 'Falha ao cadastrar colaborador.' }, { status: 500 });
  }
}
