import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolvePublicTenantId } from "@/lib/public-tenant";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

// GET: lista os pacotes/adicionais ativos do tenant, para a landing page
// pública montar a tela de "Pacotes & Adicionais" na reserva.
export async function GET(request: Request) {
  try {
    const tenantId = await resolvePublicTenantId(request);

    if (!tenantId) {
      return NextResponse.json([], { status: 200, headers: corsHeaders });
    }

    const { Addon } = await getDb();
    const addons = await Addon.findAll({
      where: { tenantId, status: "active" },
      order: [
        ["sortOrder", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    const publicAddons = addons.map((addon) => ({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      price: Number(addon.price),
    }));

    return NextResponse.json(publicAddons, { status: 200, headers: corsHeaders });
  } catch (error: any) {
    console.error("Erro ao buscar pacotes/adicionais públicos:", error);
    return NextResponse.json(
      { error: error.message ?? "Erro interno ao buscar pacotes" },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
