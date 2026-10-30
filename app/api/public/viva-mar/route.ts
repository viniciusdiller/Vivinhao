import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from "next/server";
import { getAvailableRooms } from "@/services/tenantService";
import { createPublicReservation, ReservationError } from "@/services/reservationService";
import { resolvePublicTenantId } from "@/lib/public-tenant";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { assertAllowedKeys, isValidDateString } from "@/lib/validators";

function removeInternalRoomFields(room: Record<string, unknown>) {
  const { channexRoomTypeId: _channexRoomTypeId, ...publicRoom } = room;
  return publicRoom;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  const ipLimit = checkRateLimit(clientIp, "public-reservations-get", {
    limit: 60,
    windowMs: 60_000,
  });
  if (!ipLimit.allowed) {
    const res = rateLimitResponse(ipLimit, "Muitas consultas de disponibilidade. Aguarde um momento.");
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  }

  const { searchParams } = new URL(request.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");

  if (checkIn && !isValidDateString(checkIn)) {
    return NextResponse.json(
      { error: "Data de check-in inválida. Use o formato AAAA-MM-DD." },
      { status: 400, headers: corsHeaders }
    );
  }

  if (checkOut && !isValidDateString(checkOut)) {
    return NextResponse.json(
      { error: "Data de check-out inválida. Use o formato AAAA-MM-DD." },
      { status: 400, headers: corsHeaders }
    );
  }

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
  } catch (error) {
    const message = "Não foi possível consultar a disponibilidade.";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  const expected = process.env.RESERVATION_API_SECRET;
  if (!expected || expected.length < 32) return NextResponse.json({ error: 'Confirmação temporariamente indisponível.' }, { status: 503, headers: corsHeaders });
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const expectedHash = createHash('sha256').update(expected).digest();
  const providedHash = createHash('sha256').update(provided).digest();
  if (!timingSafeEqual(expectedHash, providedHash)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401, headers: corsHeaders });
  const clientIp = getClientIp(request);
  const ipLimit = checkRateLimit(clientIp, "public-reservations-post-ip", {
    limit: 120,
    windowMs: 60_000,
  });
  if (!ipLimit.allowed) {
    const res = rateLimitResponse(ipLimit, "Limite de tentativas de reserva atingido para este IP. Aguarde alguns minutos.");
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  }

  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido. Envie um objeto JSON." },
        { status: 400, headers: corsHeaders }
      );
    }

    assertAllowedKeys(
      rawBody as Record<string, unknown>,
      [
        "roomId",
        "checkIn",
        "checkOut",
        "guestName",
        "guestEmail",
        "guestPhone",
        "guestCpf",
        "notes",
        "couponCode",
        "paymentReference",
      ],
      "Criação de Reserva"
    );

    const body = rawBody as Record<string, unknown>;

    if (body.guestEmail) {
      const emailLimit = checkRateLimit(String(body.guestEmail).trim().toLowerCase(), "public-reservations-post-email", {
        limit: 5,
        windowMs: 600_000,
      });
      if (!emailLimit.allowed) {
        const res = rateLimitResponse(emailLimit, "Limite de reservas para este e-mail atingido. Aguarde alguns minutos.");
        for (const [k, v] of Object.entries(corsHeaders)) {
          res.headers.set(k, v);
        }
        return res;
      }
    }

    const tenantId = await resolvePublicTenantId(request);

    if (!tenantId) {
      return NextResponse.json(
        { error: "Nenhuma propriedade disponível para reservas no momento." },
        { status: 503, headers: corsHeaders },
      );
    }

    const novaReserva = await createPublicReservation({
      tenantId,
      roomId: String(body.roomId || ""),
      checkIn: String(body.checkIn || ""),
      checkOut: String(body.checkOut || ""),
      entryType: "manual_reservation",
      guestName: String(body.guestName || ""),
      guestEmail: String(body.guestEmail || ""),
      guestPhone: String(body.guestPhone || ""),
      guestCpf: String(body.guestCpf || ""),
      notes: typeof body.notes === "string" ? body.notes : "",
      couponCode: typeof body.couponCode === "string" ? body.couponCode : undefined,
      paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : undefined,
      createdByUserId: null,
    });

    return NextResponse.json(novaReserva, {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ReservationError
            ? error.message
            : "Erro interno ao criar reserva",
      },
      { status: 400, headers: corsHeaders },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
