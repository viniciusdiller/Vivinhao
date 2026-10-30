import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedTenantSession, hasFeatureAccess } from "@/lib/tenant-session";
import { getRooms } from "@/services/tenantService";
import { toPublicUploadUrl } from "@/lib/uploads";
import { parseRoomPolicyArray, parseMaybeNumber, type RoomClosurePeriod, type RoomMinimumStayPeriod, type RoomSeasonalRate } from "@/lib/room-policies";
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

export async function GET() {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "rooms")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }
    const tenantId = session.tenantId;
    const rooms = await getRooms(tenantId);

    return NextResponse.json(rooms, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao buscar quartos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function slugifyRoomName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedTenantSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (!hasFeatureAccess(session, "rooms")) {
      return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    }
    const tenantId = session.tenantId;
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const price = Number(body.price);
    const quantity = Number(body.quantity);
    const maxGuests = Number(body.maxGuests);
    const minStayNights = parseMaybeNumber(body.minStayNights);
    const minStayDays = parseMaybeNumber(body.minStayDays);
    const amenities = sanitizeStringArray(body.amenities);
    const photoUrls = sanitizeStringArray(body.photoUrls);
    const seasonalRates = sanitizeSeasonalRates(body.seasonalRates);
    const minimumStayPeriods = sanitizeMinimumStayPeriods(body.minimumStayPeriods);
    const closurePeriods = sanitizeClosurePeriods(body.closurePeriods);
    const beds = sanitizeBeds(body.beds);

    if (!name) {
      return NextResponse.json({ error: "Nome do quarto é obrigatório" }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Preço inválido" }, { status: 400 });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: "Quantidade deve ser um número inteiro maior que zero" }, { status: 400 });
    }

    if (!Number.isInteger(maxGuests) || maxGuests < 1) {
      return NextResponse.json({ error: "Capacidade deve ser um número inteiro maior que zero" }, { status: 400 });
    }

    const { Room, Tenant } = await getDb();

    await Tenant.findOrCreate({
      where: { id: tenantId },
      defaults: {
        name: session?.tenantName ?? `Tenant ${tenantId}`,
        plan: session?.plan ?? "basic",
        status: "active",
      },
    });

    const localPrefix = slugifyRoomName(name) || "quarto";
    const uniqueSuffix = Date.now().toString(36);
    const localRoomId = `${localPrefix}-${uniqueSuffix}`;

    const room = await Room.create({
      tenantId,
      localRoomId,
      channexRoomTypeId: `local-${localRoomId}`,
      name,
      price,
      minStayNights,
      minStayDays,
      quantity,
      maxGuests,
      status: "active",
      amenities: amenities.length > 0 ? JSON.stringify(amenities) : null,
      photoUrls: photoUrls.length > 0 ? JSON.stringify(photoUrls) : null,
      seasonalRates: seasonalRates.length > 0 ? JSON.stringify(seasonalRates) : null,
      minimumStayPeriods: minimumStayPeriods.length > 0 ? JSON.stringify(minimumStayPeriods) : null,
      closurePeriods: closurePeriods.length > 0 ? JSON.stringify(closurePeriods) : null,
      beds: beds.length > 0 ? JSON.stringify(beds) : null,
    });

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
        amenities: amenities,
        photoUrls: photoUrls.map(toPublicUploadUrl),
        seasonalRates,
        minimumStayPeriods,
        closurePeriods,
        beds,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Erro ao criar quarto:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
