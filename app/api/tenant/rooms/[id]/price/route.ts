import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "rooms")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }
    const tenantId = session.tenantId;
    const { Room } = await getDb();
    const body = await request.json();
    const resolvedParams = await params;
    const roomId = resolvedParams.id; // Ex: 'vm-standard'

    const room = await Room.findOne({
      where: { localRoomId: roomId, tenantId },
    });

    if (!room)
      return NextResponse.json(
        { error: "Quarto não encontrado" },
        { status: 404 },
      );

    const nextPrice = Number(body.price);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      return NextResponse.json({ error: "Preço inválido" }, { status: 400 });
    }

    await room.update({ price: nextPrice });

    return NextResponse.json({
      message: "Preço atualizado com sucesso",
      price: room.price,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
