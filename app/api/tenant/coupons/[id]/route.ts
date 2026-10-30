import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

// ATUALIZAR: Liga ou desliga o cupom
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "promotions")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const { Coupon } = await getDb();

    const coupon = await Coupon.findOne({
      where: { id: resolvedParams.id, tenantId: session.tenantId },
    });
    if (!coupon)
      return NextResponse.json(
        { error: "Cupom não encontrado" },
        { status: 404 },
      );

    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "inactive") {
        return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.discountPercentage !== undefined) {
      const discountPercentage = Number(body.discountPercentage);
      if (!Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
        return NextResponse.json(
          { error: "Percentual de desconto deve estar entre 1 e 100." },
          { status: 400 },
        );
      }
      updates.discountPercentage = discountPercentage;
    }

    if (body.usageLimit !== undefined) {
      if (body.usageLimit === null || body.usageLimit === "") {
        updates.usageLimit = null;
      } else {
        const usageLimit = Number(body.usageLimit);
        if (!Number.isInteger(usageLimit) || usageLimit < 1) {
          return NextResponse.json(
            { error: "Limite de uso deve ser um número inteiro maior que zero." },
            { status: 400 },
          );
        }
        if (usageLimit < coupon.usedCount) {
          return NextResponse.json(
            {
              error: `O cupom já foi usado ${coupon.usedCount} vez(es) — o novo limite não pode ser menor que isso.`,
            },
            { status: 400 },
          );
        }
        updates.usageLimit = usageLimit;
      }
    }

    if (body.validFrom !== undefined) {
      const validFrom = body.validFrom ? String(body.validFrom).trim().slice(0, 10) : null;
      if (validFrom && Number.isNaN(new Date(validFrom).getTime())) {
        return NextResponse.json({ error: "Data de início inválida." }, { status: 400 });
      }
      updates.validFrom = validFrom;
    }

    if (body.validUntil !== undefined) {
      const validUntil = body.validUntil ? String(body.validUntil).trim().slice(0, 10) : null;
      if (validUntil && Number.isNaN(new Date(validUntil).getTime())) {
        return NextResponse.json({ error: "Data de término inválida." }, { status: 400 });
      }
      updates.validUntil = validUntil;
    }

    const nextValidFrom = (updates.validFrom as string | null | undefined) ?? coupon.validFrom;
    const nextValidUntil = (updates.validUntil as string | null | undefined) ?? coupon.validUntil;
    if (nextValidFrom && nextValidUntil && nextValidUntil < nextValidFrom) {
      return NextResponse.json(
        { error: "A data de término não pode ser antes da data de início." },
        { status: 400 },
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    await coupon.update(updates);

    return NextResponse.json(coupon, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETAR: Remove o cupom do banco
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "promotions")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const resolvedParams = await params;
    const { Coupon } = await getDb();
    const coupon = await Coupon.findOne({
      where: { id: resolvedParams.id, tenantId: session.tenantId },
    });

    if (!coupon)
      return NextResponse.json(
        { error: "Cupom não encontrado" },
        { status: 404 },
      );

    await coupon.destroy();

    return NextResponse.json(
      { message: "Cupom excluído com sucesso" },
      { status: 200 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
