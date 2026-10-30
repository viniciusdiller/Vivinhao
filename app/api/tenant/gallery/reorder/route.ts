import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

export async function PATCH(request: Request) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "gallery")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const body = await request.json();
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value))
      : [];

    if (orderedIds.length === 0) {
      return NextResponse.json({ error: "Informe a lista ordenada de IDs" }, { status: 400 });
    }

    const { PropertyPhoto, sequelize } = await getDb();
    const tenantId = session.tenantId;

    const photos = await PropertyPhoto.findAll({ where: { tenantId, id: orderedIds } });
    const photoIds = new Set(photos.map((photo) => photo.id));

    if (!orderedIds.every((id: number) => photoIds.has(id))) {
      return NextResponse.json({ error: "Lista contém fotos inválidas" }, { status: 400 });
    }

    await sequelize.transaction(async (transaction) => {
      await Promise.all(
        orderedIds.map((id: number, index: number) =>
          PropertyPhoto.update(
            { sortOrder: index },
            { where: { tenantId, id }, transaction },
          ),
        ),
      );
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao reordenar galeria:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
