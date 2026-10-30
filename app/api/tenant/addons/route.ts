import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

// LISTAR: pega todos os pacotes/adicionais do tenant autenticado
export async function GET() {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "addons")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const { Addon } = await getDb();
    const addons = await Addon.findAll({
      where: { tenantId: session.tenantId },
      order: [
        ["sortOrder", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    return NextResponse.json(addons, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// CRIAR: adiciona um novo pacote/adicional
export async function POST(request: Request) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "addons")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const body = await request.json();
    const { Addon } = await getDb();

    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Nome do pacote é obrigatório." }, { status: 400 });
    }

    const description = String(body.description ?? "").trim() || null;

    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "Informe um preço maior que zero." }, { status: 400 });
    }

    const newAddon = await Addon.create({
      tenantId: session.tenantId,
      name,
      description,
      price,
      status: "active",
      sortOrder: 0,
    });

    return NextResponse.json(newAddon, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
