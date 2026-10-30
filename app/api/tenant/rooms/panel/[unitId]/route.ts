import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";

const VALID_STATUSES = [
  "vacant",
  "cleaning",
  "awaiting_guest",
  "maintenance",
  "occupied",
] as const;

type OperationalStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ unitId: string }> }
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
    const resolvedParams = await params;
    const unitId = resolvedParams.unitId;

    // unitId format: ${localRoomId}_${unitNumber}
    // localRoomId only contains [a-z0-9-], so the last "_" separates it from unitNumber
    const lastUnderscore = unitId.lastIndexOf("_");
    if (lastUnderscore === -1) {
      return NextResponse.json({ error: "unitId inválido" }, { status: 400 });
    }

    const localRoomId = unitId.slice(0, lastUnderscore);
    const unitNumber = parseInt(unitId.slice(lastUnderscore + 1), 10);

    if (!localRoomId || !Number.isInteger(unitNumber) || unitNumber < 1) {
      return NextResponse.json({ error: "unitId inválido" }, { status: 400 });
    }

    const body = await request.json();
    const status = body.status as string;

    if (!VALID_STATUSES.includes(status as OperationalStatus)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const { Room, RoomUnitStatus } = await getDb();

    const room = await Room.findOne({ where: { tenantId, localRoomId } });
    if (!room) {
      return NextResponse.json(
        { error: "Quarto não encontrado" },
        { status: 404 }
      );
    }

    if (unitNumber > room.quantity) {
      return NextResponse.json(
        { error: "Número de unidade inválido" },
        { status: 400 }
      );
    }

    await RoomUnitStatus.upsert({
      roomId: room.id,
      unitNumber,
      tenantId,
      status: status as OperationalStatus,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Erro ao atualizar status da unidade:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
