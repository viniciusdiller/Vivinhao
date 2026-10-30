import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

// LISTAR: Pega todos os cupons do tenant autenticado
export async function GET() {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "promotions")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const { Coupon } = await getDb();
    const coupons = await Coupon.findAll({
      where: { tenantId: session.tenantId },
      order: [["createdAt", "DESC"]],
    });
    return NextResponse.json(coupons, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// CRIAR: Adiciona um novo cupom no banco
export async function POST(request: Request) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "promotions")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const body = await request.json();
    const { Coupon } = await getDb();

    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "Código do cupom é obrigatório." }, { status: 400 });
    }

    const discountPercentage = Number(body.discountPercentage);
    if (!Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
      return NextResponse.json(
        { error: "Percentual de desconto deve estar entre 1 e 100." },
        { status: 400 },
      );
    }

    let usageLimit: number | null = null;
    if (body.usageLimit !== undefined && body.usageLimit !== null && body.usageLimit !== "") {
      const parsedLimit = Number(body.usageLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json(
          { error: "Limite de uso deve ser um número inteiro maior que zero." },
          { status: 400 },
        );
      }
      usageLimit = parsedLimit;
    }

    const validFrom = body.validFrom ? String(body.validFrom).trim().slice(0, 10) : null;
    const validUntil = body.validUntil ? String(body.validUntil).trim().slice(0, 10) : null;

    if (validFrom && Number.isNaN(new Date(validFrom).getTime())) {
      return NextResponse.json({ error: "Data de início inválida." }, { status: 400 });
    }

    if (validUntil && Number.isNaN(new Date(validUntil).getTime())) {
      return NextResponse.json({ error: "Data de término inválida." }, { status: 400 });
    }

    if (validFrom && validUntil && validUntil < validFrom) {
      return NextResponse.json(
        { error: "A data de término não pode ser antes da data de início." },
        { status: 400 },
      );
    }

    // Verifica se o código já existe
    const existing = await Coupon.findOne({
      where: { tenantId: session.tenantId, code },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um cupom com este código." },
        { status: 400 },
      );
    }

    const newCoupon = await Coupon.create({
      tenantId: session.tenantId,
      code,
      discountPercentage,
      usageLimit,
      validFrom,
      validUntil,
      status: "active",
      usedCount: 0,
    });

    return NextResponse.json(newCoupon, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
