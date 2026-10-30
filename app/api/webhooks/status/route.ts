import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import type { TenantStatus } from '@/models/Tenant';
import { getDb } from '@/lib/db';

const validStatuses: TenantStatus[] = ['active', 'suspended'];

// "identificador" é o nome de campo genérico usado pela integração de
// moderação de acesso do Total Software (funciona com qualquer projeto
// externo) — aqui corresponde ao slug do tenant.
type StatusPayload = {
  identificador?: string;
  status?: string;
  webhookSecret?: string;
};

// Mesmo segredo e mesma checagem constant-time do webhook de provisionamento
// (app/api/webhooks/provision/route.ts) — ambos representam a mesma
// fronteira de confiança (o Total Software administrando este tenant).
function isValidWebhookSecret(provided: string | undefined) {
  const expected = process.env.PROVISION_WEBHOOK_SECRET;

  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as StatusPayload;

  if (!isValidWebhookSecret(payload.webhookSecret)) {
    return NextResponse.json({ message: 'Webhook inválido.' }, { status: 401 });
  }

  if (!payload.identificador || !validStatuses.includes(payload.status as TenantStatus)) {
    return NextResponse.json({ message: 'Payload incompleto ou status inválido.' }, { status: 400 });
  }

  const { Tenant } = await getDb();
  const tenant = await Tenant.findOne({ where: { slug: payload.identificador } });

  if (!tenant) {
    return NextResponse.json({ message: 'Tenant não encontrado.' }, { status: 404 });
  }

  await tenant.update({ status: payload.status as TenantStatus });

  return NextResponse.json({ ok: true, tenantId: tenant.id, status: payload.status });
}
