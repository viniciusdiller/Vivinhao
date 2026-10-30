import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";
import { parseMaybeNumber, parseRoomPolicyArray, type RoomClosurePeriod, type RoomMinimumStayPeriod, type RoomSeasonalRate } from "@/lib/room-policies";
import { toPublicUploadUrl } from "@/lib/uploads";
import { BED_TYPES, type BedType, type RoomBed } from "@/types/domain";

function sanitizeStringArray(input: unknown) {
  if (!Array.isArray(input)) {
    if (typeof input !== "string" || input.trim().length === 0) {
      return [] as string[];
    }

    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed
              .map((item) => String(item ?? "").trim())
              .filter((item) => item.length > 0),
          ),
        );
      }
    } catch {
      return Array.from(
        new Set(
          input
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      );
    }

    return [] as string[];
  }

  return Array.from(
    new Set(
      input
        .map((item) => String(item ?? "").trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function sanitizeSeasonalRates(input: unknown): RoomSeasonalRate[] {
  return parseRoomPolicyArray(input, (item) => {
    const startMonthDay = String(item.startMonthDay ?? item.start_month_day ?? "").trim();
    const endMonthDay = String(item.endMonthDay ?? item.end_month_day ?? "").trim();
    const price = Number(item.price ?? item.rate ?? item.value);

    if (!startMonthDay || !endMonthDay || !Number.isFinite(price) || price < 0) {
      return null;
    }

    return {
      label: String(item.label ?? "").trim() || undefined,
      startMonthDay,
      endMonthDay,
      price,
    };
  });
}

function sanitizeMinimumStayPeriods(input: unknown): RoomMinimumStayPeriod[] {
  return parseRoomPolicyArray(input, (item) => {
    const startMonthDay = String(item.startMonthDay ?? item.start_month_day ?? "").trim();
    const endMonthDay = String(item.endMonthDay ?? item.end_month_day ?? "").trim();
    const minStayNights = Number(item.minStayNights ?? item.min_stay_nights);

    if (!startMonthDay || !endMonthDay || !Number.isInteger(minStayNights) || minStayNights < 1) {
      return null;
    }

    return {
      label: String(item.label ?? "").trim() || undefined,
      startMonthDay,
      endMonthDay,
      minStayNights,
    };
  });
}

function sanitizeBeds(input: unknown): RoomBed[] {
  return parseRoomPolicyArray(input, (item) => {
    const type = String(item.type ?? "").trim() as BedType;
    const quantity = Number(item.quantity);

    if (!BED_TYPES.includes(type) || !Number.isInteger(quantity) || quantity < 1) {
      return null;
    }

    return { type, quantity };
  });
}

function sanitizeClosurePeriods(input: unknown): RoomClosurePeriod[] {
  return parseRoomPolicyArray(input, (item) => {
    const startDate = String(item.startDate ?? item.start_date ?? "").trim();
    const endDate = String(item.endDate ?? item.end_date ?? "").trim();
    const kind = String(item.kind ?? "blocked").trim();

    if (!startDate || !endDate) {
      return null;
    }

    return {
      label: String(item.label ?? "").trim() || undefined,
      startDate,
      endDate,
      kind: kind === "closed" ? "closed" : "blocked",
    };
  });
}

function parseStoredPolicyArray<T>(input: unknown): T[] {
  if (Array.isArray(input)) {
    return input as T[];
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    return [] as T[];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [] as T[];
  }
}

function parseStringArray(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item)).filter((item) => item.length > 0);
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item)).filter((item) => item.length > 0)
      : [];
  } catch {
    return [] as string[];
  }
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
    if (!hasFeatureAccess(session, "rooms")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }
    const tenantId = session.tenantId;
    const resolvedParams = await params;
    const localRoomId = resolvedParams.id;
    const body = await request.json();

    const { Room } = await getDb();

    const room = await Room.findOne({
      where: { tenantId, localRoomId },
    });

    if (!room) {
      return NextResponse.json({ error: "Quarto não encontrado" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const nextName = String(body.name).trim();
      if (!nextName) {
        return NextResponse.json({ error: "Nome do quarto inválido" }, { status: 400 });
      }
      updates.name = nextName;
    }

    if (body.price !== undefined) {
      const nextPrice = Number(body.price);
      if (!Number.isFinite(nextPrice) || nextPrice < 0) {
        return NextResponse.json({ error: "Preço inválido" }, { status: 400 });
      }
      updates.price = nextPrice;
    }

    if (body.minStayNights !== undefined) {
      updates.minStayNights = parseMaybeNumber(body.minStayNights);
    }

    if (body.minStayDays !== undefined) {
      updates.minStayDays = parseMaybeNumber(body.minStayDays);
    }

    if (body.quantity !== undefined) {
      const nextQuantity = Number(body.quantity);
      if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
        return NextResponse.json({ error: "Quantidade deve ser um número inteiro maior que zero" }, { status: 400 });
      }
      updates.quantity = nextQuantity;
    }

    if (body.maxGuests !== undefined) {
      const nextMaxGuests = Number(body.maxGuests);
      if (!Number.isInteger(nextMaxGuests) || nextMaxGuests < 1) {
        return NextResponse.json({ error: "Capacidade deve ser um número inteiro maior que zero" }, { status: 400 });
      }
      updates.maxGuests = nextMaxGuests;
    }

    if (body.amenities !== undefined) {
      const amenities = sanitizeStringArray(body.amenities);
      updates.amenities = amenities.length > 0 ? JSON.stringify(amenities) : null;
    }

    if (body.photoUrls !== undefined) {
      const photoUrls = sanitizeStringArray(body.photoUrls);
      updates.photoUrls = photoUrls.length > 0 ? JSON.stringify(photoUrls) : null;
    }

    if (body.seasonalRates !== undefined) {
      const seasonalRates = sanitizeSeasonalRates(body.seasonalRates);
      updates.seasonalRates = seasonalRates.length > 0 ? JSON.stringify(seasonalRates) : null;
    }

    if (body.minimumStayPeriods !== undefined) {
      const minimumStayPeriods = sanitizeMinimumStayPeriods(body.minimumStayPeriods);
      updates.minimumStayPeriods = minimumStayPeriods.length > 0 ? JSON.stringify(minimumStayPeriods) : null;
    }

    if (body.closurePeriods !== undefined) {
      const closurePeriods = sanitizeClosurePeriods(body.closurePeriods);
      updates.closurePeriods = closurePeriods.length > 0 ? JSON.stringify(closurePeriods) : null;
    }

    if (body.beds !== undefined) {
      const beds = sanitizeBeds(body.beds);
      updates.beds = beds.length > 0 ? JSON.stringify(beds) : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 });
    }

    await room.update(updates);

    return NextResponse.json(
      {
        id: room.localRoomId,
        channexRoomTypeId: room.channexRoomTypeId,
        name: room.name,
        maxGuests: room.maxGuests,
        status: room.status,
        price: Number(room.price),
        minStayNights: room.minStayNights,
        minStayDays: room.minStayDays,
        quantity: room.quantity,
        amenities: room.amenities,
        amenitiesList: parseStringArray(room.amenities),
        photoUrls: parseStringArray(room.photoUrls).map(toPublicUploadUrl),
        seasonalRates: parseStoredPolicyArray<RoomSeasonalRate>(room.seasonalRates),
        minimumStayPeriods: parseStoredPolicyArray<RoomMinimumStayPeriod>(room.minimumStayPeriods),
        closurePeriods: parseStoredPolicyArray<RoomClosurePeriod>(room.closurePeriods),
        beds: parseStoredPolicyArray<RoomBed>(room.beds),
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Erro ao atualizar quarto:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
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
    const resolvedParams = await params;
    const localRoomId = resolvedParams.id;

    const { Room, Reservation } = await getDb();

    const room = await Room.findOne({
      where: { tenantId, localRoomId },
    });

    if (!room) {
      return NextResponse.json({ error: "Quarto não encontrado" }, { status: 404 });
    }

    const reservationsCount = await Reservation.count({
      where: { tenantId, roomId: room.id },
    });

    if (reservationsCount > 0) {
      return NextResponse.json(
        { error: "Não é possível remover quarto com reservas vinculadas" },
        { status: 409 },
      );
    }

    await room.destroy();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao remover quarto:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
