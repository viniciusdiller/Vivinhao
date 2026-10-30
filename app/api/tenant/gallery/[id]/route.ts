import path from "path";
import { unlink } from "fs/promises";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

export const runtime = "nodejs";

async function loadPhoto(tenantId: number, id: string) {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId)) {
    return null;
  }

  const { PropertyPhoto } = await getDb();
  return PropertyPhoto.findOne({ where: { tenantId, id: parsedId } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "gallery")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const { id } = await params;
    const photo = await loadPhoto(session.tenantId, id);
    if (!photo) {
      return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const updates: { caption?: string | null; sortOrder?: number } = {};

    if (body.caption !== undefined) {
      const caption = typeof body.caption === "string" ? body.caption.trim() : "";
      updates.caption = caption.length > 0 ? caption : null;
    }

    if (body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return NextResponse.json({ error: "sortOrder inválido" }, { status: 400 });
      }
      updates.sortOrder = sortOrder;
    }

    await photo.update(updates);

    return NextResponse.json(
      { id: photo.id, url: photo.url, caption: photo.caption, sortOrder: photo.sortOrder },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Erro ao atualizar foto da galeria:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "gallery")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }

    const { id } = await params;
    const photo = await loadPhoto(session.tenantId, id);
    if (!photo) {
      return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    }

    const photoUrl = photo.url;
    await photo.destroy();

    if (photoUrl.startsWith("/uploads/gallery/")) {
      const filepath = path.join(process.cwd(), "public", photoUrl);
      try {
        await unlink(filepath);
      } catch {
        // Arquivo já pode ter sido removido manualmente; não é um erro fatal.
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao remover foto da galeria:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
