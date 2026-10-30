import { getDb } from '@/lib/db';

// Fallback legado para integrações/logins que ainda não informam
// slug/tenantId: só é seguro enquanto houver um único tenant ativo. Com
// 2+ pousadas, novas integrações devem sempre passar `?slug=` (rotas
// públicas) ou um tenantId explícito (login).
export async function resolveDefaultTenantId(): Promise<number | null> {
  const { Room } = await getDb();
  const firstRoom = await Room.findOne({
    attributes: ['tenantId'],
    order: [
      ['tenantId', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  return firstRoom?.tenantId ?? null;
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

  if (fromSlug) {
    const { Tenant } = await getDb();
    const tenant = await Tenant.findOne({ where: { slug: fromSlug, status: 'active' } });
    return tenant?.id ?? null;
  }

  const fromQuery = searchParams.get('tenantId');
  const fromEnv = process.env.PUBLIC_ROOMS_TENANT_ID;

  const parsedQuery = fromQuery ? Number(fromQuery) : NaN;
  if (Number.isInteger(parsedQuery) && parsedQuery > 0) {
    return parsedQuery;
  }

  const parsedEnv = fromEnv ? Number(fromEnv) : NaN;
  if (Number.isInteger(parsedEnv) && parsedEnv > 0) {
    return parsedEnv;
  }

  return resolveDefaultTenantId();
}
