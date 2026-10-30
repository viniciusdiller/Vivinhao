import { getDb } from '@/lib/db';

// Fallback legado para integrações/logins que ainda não informam
// slug/tenantId: só é seguro enquanto houver um único tenant ativo. Com
// 2+ pousadas, novas integrações devem sempre passar `?slug=` (rotas
// públicas) ou um tenantId explícito (login).
export async function resolveDefaultTenantId(): Promise<number | null> {
  const { Tenant } = await getDb();
  const tenants = await Tenant.findAll({ where: { status: 'active' }, attributes: ['id'], limit: 2 });
  return tenants.length === 1 ? tenants[0].id : null;
}

/**
 * Resolve o tenant usado pelas rotas públicas (`/api/public/**`, consumidas
 * pela landing page externa, sem sessão). Centralizado aqui para que
 * listagem de quartos, validação de cupom e criação de reserva pública
 * sempre concordem sobre qual tenant estão servindo — antes, cada rota
 * resolvia isso de um jeito diferente (algumas tinham `tenantId: 1`
 * hardcoded), o que quebrava a criação de reserva sempre que o tenant real
 * não era o de id 1.
 */
export async function resolvePublicTenantId(request: Request): Promise<number | null> {
  const { searchParams } = new URL(request.url);
  const fromSlug = searchParams.get('slug');
  const { Tenant } = await getDb();

  if (fromSlug) {
    const tenant = await Tenant.findOne({ where: { slug: fromSlug, status: 'active' } });
    return tenant?.id ?? null;
  }

  const fromQuery = searchParams.get('tenantId');
  const fromEnv = process.env.PUBLIC_ROOMS_TENANT_ID;
  if (fromQuery && !/^[1-9]\d*$/.test(fromQuery)) return null;

  const parsedQuery = fromQuery ? Number(fromQuery) : NaN;
  if (Number.isInteger(parsedQuery) && parsedQuery > 0) {
    const tenant = await Tenant.findOne({ where: { id: parsedQuery, status: 'active' } });
    return tenant?.id ?? null;
  }

  const parsedEnv = fromEnv ? Number(fromEnv) : NaN;
  if (Number.isInteger(parsedEnv) && parsedEnv > 0) {
    const tenant = await Tenant.findOne({ where: { id: parsedEnv, status: 'active' } });
    return tenant?.id ?? null;
  }

  return resolveDefaultTenantId();
}
