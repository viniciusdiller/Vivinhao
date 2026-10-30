import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

// ATUALIZAR: edita dados do pacote/adicional ou liga/desliga
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "addons")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const resolvedParams = await params;
    const body = await request.json();
    const { Addon } = await getDb();

    const addon = await Addon.findOne({
      where: { id: resolvedParams.id, tenantId: session.tenantId },
    });

    if (!addon) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 });
    }

    const updates: Partial<{
      name: string;
      description: string | null;
      price: number;
      status: "active" | "inactive";
    }> = {};

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "inactive") {
        return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Nome do pacote é obrigatório." }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.description !== undefined) {
      updates.description = String(body.description ?? "").trim() || null;
    }

    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "Informe um preço maior que zero." }, { status: 400 });
      }
      updates.price = price;
    }

    await addon.update(updates);

    return NextResponse.json(addon, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETAR: remove o pacote/adicional
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "addons")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const resolvedParams = await params;
    const { Addon } = await getDb();
    const addon = await Addon.findOne({
      where: { id: resolvedParams.id, tenantId: session.tenantId },
    });

    if (!addon) {
      return NextResponse.json({ error: "Pacote não encontrado" }, { status: 404 });
    }

    await addon.destroy();

    return NextResponse.json({ message: "Pacote excluído com sucesso" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
