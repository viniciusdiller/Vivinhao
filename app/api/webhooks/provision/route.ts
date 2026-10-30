import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import type { Transaction } from 'sequelize';
import type { TenantPlan } from '@/models/Tenant';
import { getDb } from '@/lib/db';
import { generateUniqueTenantSlug } from '@/lib/tenant-slug';

const validPlans: TenantPlan[] = ['basic', 'pro', 'premium'];

type ProvisionPayload = {
  tenantName?: string;
  slug?: string;
  adminEmail?: string;
  adminPassword?: string;
  plan?: string;
  webhookSecret?: string;
};

function isValidWebhookSecret(provided: string | undefined) {
  const expected = process.env.PROVISION_WEBHOOK_SECRET;

  // Falha fechado: sem segredo configurado no ambiente, nenhuma requisição
  // é aceita — mesmo que o payload também venha sem `webhookSecret`
  // (nesse caso `undefined !== undefined` deixaria passar com `!==`).
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
  const payload = (await request.json()) as ProvisionPayload;

  if (!isValidWebhookSecret(payload.webhookSecret)) {
    return NextResponse.json({ message: 'Webhook inválido.' }, { status: 401 });
  }

  if (!payload.tenantName || !payload.adminEmail || !payload.adminPassword || !payload.plan) {
    return NextResponse.json({ message: 'Payload incompleto.' }, { status: 400 });
  }

  if (!validPlans.includes(payload.plan as TenantPlan)) {
    return NextResponse.json({ message: 'Plano inválido.' }, { status: 400 });
  }

  const { sequelize, Tenant, User } = await getDb();

  try {
    await sequelize.transaction(async (transaction: Transaction) => {
      const slug = payload.slug
        ? payload.slug
        : await generateUniqueTenantSlug(payload.tenantName!, async (candidate) => {
            const existing = await Tenant.findOne({ where: { slug: candidate }, transaction });
            return Boolean(existing);
          });

      const tenant = await Tenant.create(
        {
          name: payload.tenantName!,
          slug,
          plan: payload.plan as TenantPlan,
        },
        { transaction },
      );

      const passwordHash = await bcrypt.hash(payload.adminPassword!, 12);

      await User.create(
        {
          name: payload.adminEmail!.split('@')[0],
          email: payload.adminEmail!,
          passwordHash,
          role: 'admin',
          tenantId: tenant.id,
        },
        { transaction },
      );
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: 'Falha ao provisionar tenant.', detail: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 },
    );
  }
}
