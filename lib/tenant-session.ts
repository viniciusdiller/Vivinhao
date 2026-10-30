import { getAuthenticatedSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  parseStoredDashboardPermissions,
  resolveDashboardPermissionsForRole,
  type DashboardFeatureKey,
  type UserAccessRole,
} from '@/lib/dashboard-access';
import type { TenantPlan } from '@/models/Tenant';

export type VerifiedTenantSession = {
  userId: number;
  tenantId: number;
  tenantName: string;
  plan: TenantPlan;
  role: UserAccessRole;
  permissions: DashboardFeatureKey[];
};

/**
 * Diferente de getAuthenticatedSession (que só valida a assinatura/expiração
 * do cookie), esta função reconsulta usuário e tenant no banco a cada
 * chamada. Isso garante que desativar um colaborador ou alterar suas
 * permissões tenha efeito imediato nas rotas de API, em vez de esperar o
 * token (de até 8h) expirar. Deve ser usada só em rotas/server actions
 * (Node runtime) — nunca em middleware.ts, que roda em Edge e não pode
 * acessar o MySQL.
 */
export async function getVerifiedTenantSession(): Promise<VerifiedTenantSession | null> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return null;
  }

  // A sessão de administrador definida por env (ADMIN_EMAIL/ADMIN_PASSWORD)
  // não existe na tabela users; seu payload é fixo e não tem estado
  // (permissões/ativação) que possa ficar obsoleto.
  if (session.userId < 0) {
    return {
      userId: session.userId,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      plan: session.plan,
      role: session.role,
      permissions: session.permissions,
    };
  }

  const { User, Tenant } = await getDb();
  const user = await User.findOne({
    where: { id: session.userId },
    include: [{ model: Tenant, as: 'tenant' }],
  });

  if (!user) {
    return null;
  }

  const tenant = user.get('tenant') as InstanceType<typeof Tenant> | undefined;

  if (!tenant || tenant.status !== 'active') {
    return null;
  }

  if (user.employmentStatus === 'inactive') {
    return null;
  }

  const permissions = resolveDashboardPermissionsForRole(
    user.role,
    parseStoredDashboardPermissions(user.dashboardPermissions),
  );

  return {
    userId: user.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    plan: tenant.plan,
    role: user.role,
    permissions,
  };
}

export function hasFeatureAccess(session: VerifiedTenantSession, feature: DashboardFeatureKey) {
  if (session.role === 'admin') {
    return true;
  }

  return session.permissions.includes(feature);
}
