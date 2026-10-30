import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";
import { getGalleryPhotos } from "@/services/tenantService";

const MAX_PHOTOS_PER_TENANT = 60;

function sanitizeUrls(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : input !== undefined ? [input] : [];

  return Array.from(
    new Set(
      raw
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export async function GET() {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "gallery")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const photos = await getGalleryPhotos(session.tenantId);
    return NextResponse.json(photos, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao buscar galeria:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "gallery")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const body = await request.json();
    const urls = sanitizeUrls(body.urls ?? body.url);
    const caption = typeof body.caption === "string" ? body.caption.trim() || null : null;

    if (urls.length === 0) {
      return NextResponse.json({ error: "Informe ao menos uma URL de foto" }, { status: 400 });
    }

    const { PropertyPhoto, Tenant } = await getDb();
    const tenantId = session.tenantId;

    await Tenant.findOrCreate({
      where: { id: tenantId },
      defaults: {
        name: session?.tenantName ?? `Tenant ${tenantId}`,
        plan: session?.plan ?? "basic",
        status: "active",
      },
    });

    const currentCount = await PropertyPhoto.count({ where: { tenantId } });
    if (currentCount + urls.length > MAX_PHOTOS_PER_TENANT) {
      return NextResponse.json(
        { error: `Limite de ${MAX_PHOTOS_PER_TENANT} fotos na galeria` },
        { status: 400 },
      );
    }

    const lastPhoto = await PropertyPhoto.findOne({
      where: { tenantId },
      order: [["sortOrder", "DESC"]],
    });
    let nextSortOrder = (lastPhoto?.sortOrder ?? -1) + 1;

    const created = await Promise.all(
      urls.map((url) =>
        PropertyPhoto.create({
          tenantId,
          url,
          caption: urls.length === 1 ? caption : null,
          sortOrder: nextSortOrder++,
        }),
      ),
    );

    return NextResponse.json(
      created.map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
      })),
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Erro ao adicionar foto à galeria:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
