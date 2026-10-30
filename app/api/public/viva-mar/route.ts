import { NextResponse } from "next/server";
import { getAvailableRooms } from "@/services/tenantService";
import { createPublicReservation } from "@/actions/reservation";
import { resolvePublicTenantId } from "@/lib/public-tenant";

function removeInternalRoomFields(room: Record<string, unknown>) {
  const { channexRoomTypeId: _channexRoomTypeId, ...publicRoom } = room;
  return publicRoom;
}

// 1. GET: Busca os quartos e calcula a disponibilidade
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");

  try {
    const tenantId = await resolvePublicTenantId(request);

    if (!tenantId) {
      return NextResponse.json([], {
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      });
    }

    const rooms = (await getAvailableRooms(
      tenantId,
      checkIn || undefined,
      checkOut || undefined,
    )).map((room) => removeInternalRoomFields(room as Record<string, unknown>));

    return NextResponse.json(rooms, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Erro no GET Viva Mar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Cria a reserva vinda da Landing Page
export async function POST(request: Request) {
  const body = await request.json();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const tenantId = await resolvePublicTenantId(request);

    if (!tenantId) {
      return NextResponse.json(
        { error: "Nenhuma propriedade disponível para reservas no momento." },
        { status: 503, headers: corsHeaders },
      );
    }

    const novaReserva = await createPublicReservation({
      tenantId,
      roomId: body.roomId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      entryType: "manual_reservation",
      guestName: body.guestName,
      guestEmail: body.guestEmail,
      guestPhone: body.guestPhone,
      guestCpf: body.guestCpf,
      notes: body.notes ?? "",
      couponCode: typeof body.couponCode === "string" ? body.couponCode : undefined,
      paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : undefined,
      createdByUserId: null,
    });

    return NextResponse.json(novaReserva, {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Erro no POST Viva Mar:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao criar reserva",
      },
      { status: 400, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
