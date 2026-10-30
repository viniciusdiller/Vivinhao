import { getDb } from "@/lib/db";
import { toPublicUploadUrl } from "@/lib/uploads";
import { BED_TYPES, type BedType, type Expense, type Reservation, type Room, type RoomBed } from "@/types/domain";
import { Op } from "sequelize";
import {
  differenceInNights,
  findBlockingClosure,
  getRoomEffectivePrice,
  getRoomMinimumStay,
  parseRoomPolicyArray,
  type RoomClosurePeriod,
  type RoomMinimumStayPeriod,
  type RoomSeasonalRate,
} from "@/lib/room-policies";

// Sequelize devolve DataTypes.DATE como objeto Date (não a string original),
// então `String(valor).slice(0, 10)` produz lixo como "Mon Mar 01" em vez de
// "2026-03-01" — sempre usar esta função para extrair a data (YYYY-MM-DD).
function formatDbDate(val: unknown): string {
  if (!val) return "";
  const str = typeof val === "string" ? val : new Date(val as string | number | Date).toISOString();
  return str.substring(0, 10);
}

function parseJsonArray(input: unknown) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => String(item).trim()).filter((item) => item.length > 0);
  } catch {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}

function parseSeasonalRates(input: unknown): RoomSeasonalRate[] {
  return parseRoomPolicyArray(input, (item) => {
    const startMonthDay = String(item.startMonthDay ?? item.start_month_day ?? "").trim();
    const endMonthDay = String(item.endMonthDay ?? item.end_month_day ?? "").trim();
    const price = Number(item.price ?? item.value ?? item.tariff ?? item.rate);

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

function parseMinimumStayPeriods(input: unknown): RoomMinimumStayPeriod[] {
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

function parseClosurePeriods(input: unknown): RoomClosurePeriod[] {
  return parseRoomPolicyArray(input, (item) => {
    const startDate = String(item.startDate ?? item.start_date ?? "").trim();
    const endDate = String(item.endDate ?? item.end_date ?? "").trim();
    const kind = String(item.kind ?? "blocked").trim() as RoomClosurePeriod["kind"];

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

function parseRoomBeds(input: unknown): RoomBed[] {
  return parseRoomPolicyArray(input, (item) => {
    const type = String(item.type ?? "").trim() as BedType;
    const quantity = Number(item.quantity);

    if (!BED_TYPES.includes(type) || !Number.isInteger(quantity) || quantity < 1) {
      return null;
    }

    return { type, quantity };
  });
}

function mapRoom(
  room: InstanceType<Awaited<ReturnType<typeof getDb>>["Room"]>,
): Room {
  const amenitiesList = parseJsonArray(room.amenities);
  const photoUrls = parseJsonArray(room.photoUrls).map(toPublicUploadUrl);
  const seasonalRates = parseSeasonalRates(room.seasonalRates);
  const minimumStayPeriods = parseMinimumStayPeriods(room.minimumStayPeriods);
  const closurePeriods = parseClosurePeriods(room.closurePeriods);
  const beds = parseRoomBeds(room.beds);

  return {
    id: room.localRoomId,
    channexRoomTypeId: room.channexRoomTypeId,
    name: room.name,
    maxGuests: room.maxGuests,
    status: room.status,
    price: Number(room.price),
    minStayNights: room.minStayNights ?? null,
    minStayDays: room.minStayDays ?? null,
    seasonalRates,
    minimumStayPeriods,
    closurePeriods,
    beds,
    quantity: room.quantity,
    amenities: room.amenities,
    amenitiesList,
    photoUrls,
  };
}

function mapGalleryPhoto(
  photo: InstanceType<Awaited<ReturnType<typeof getDb>>["PropertyPhoto"]>,
) {
  return {
    id: photo.id,
    url: toPublicUploadUrl(photo.url),
    caption: photo.caption,
    sortOrder: photo.sortOrder,
  };
}

function mapReservation(
  reservation: InstanceType<Awaited<ReturnType<typeof getDb>>["Reservation"]>,
  roomLocalRoomId: string,
): Reservation {
  return {
    id: reservation.channexReservationId,
    roomId: roomLocalRoomId,
    checkIn: formatDbDate(reservation.checkIn),
    checkOut: formatDbDate(reservation.checkOut),
    status: reservation.status,
    otaSource: reservation.otaSource,
    channelReference: reservation.channelReference,
    amount: Number(reservation.amount),
    currency: reservation.currency,
    customer: {
      name: reservation.guestName,
      email: reservation.guestEmail,
      phone: reservation.guestPhone,
      cpf: reservation.guestCpf ?? undefined,
    },
    notes: reservation.notes,
    unitNumber: reservation.unitNumber ?? null,
  };
}

function mapExpense(
  expense: InstanceType<Awaited<ReturnType<typeof getDb>>["Expense"]>,
): Expense {
  return {
    id: String(expense.id),
    description: expense.description,
    amount: Number(expense.amount),
    date: expense.date,
    category: expense.category,
  };
}

export async function getReservations(
  tenantId: number,
): Promise<Reservation[]> {
  try {
    const { Room, Reservation } = await getDb();
    const reservations = await Reservation.findAll({
      where: { tenantId },
      include: [{ model: Room, as: "room" }],
      order: [["checkIn", "ASC"]],
    });

    return reservations
      .map((reservation) => {
        const room = reservation.get("room") as InstanceType<typeof Room> | null;
        if (!room) {
          return null;
        }

        return mapReservation(reservation, room.localRoomId);
      })
      .filter((reservation): reservation is Reservation => reservation !== null);
  } catch (error) {
    console.error("[tenantService] Falha ao carregar reservas:", error);
    return [];
  }
}

export async function getRooms(tenantId: number): Promise<Room[]> {
  try {
    const { Room } = await getDb();
    const rooms = await Room.findAll({
      where: { tenantId },
      order: [["name", "ASC"]],
    });

    return rooms.map((room) => mapRoom(room));
  } catch (error) {
    console.error("[tenantService] Falha ao carregar quartos:", error);
    return [];
  }
}

export async function getGalleryPhotos(tenantId: number) {
  try {
    const { PropertyPhoto } = await getDb();
    const photos = await PropertyPhoto.findAll({
      where: { tenantId },
      order: [
        ["sortOrder", "ASC"],
        ["id", "ASC"],
      ],
    });

    return photos.map((photo) => mapGalleryPhoto(photo));
  } catch (error) {
    console.error("[tenantService] Falha ao carregar galeria:", error);
    return [];
  }
}

export async function updateReservation(
  tenantId: number,
  updatedReservation: Reservation,
): Promise<Reservation> {
  const { sequelize, Room, Reservation } = await getDb();

  return sequelize.transaction(async (transaction) => {
    const room = await Room.findOne({
      where: { tenantId, localRoomId: updatedReservation.roomId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!room) {
      throw new Error("Quarto não encontrado para este tenant.");
    }

    const reservation = await Reservation.findOne({
      where: {
        tenantId,
        channexReservationId: updatedReservation.id,
      },
      transaction,
    });

    if (!reservation) {
      throw new Error("Reserva não encontrada para este tenant.");
    }

    let assignedUnitNumber: number | null = reservation.unitNumber;

    if (updatedReservation.status !== "cancelled") {
      const checkIn = new Date(updatedReservation.checkIn);
      const checkOut = new Date(updatedReservation.checkOut);

      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
        throw new Error("Período inválido para a reserva.");
      }

      const roomPolicy = {
        minStayNights: room.minStayNights,
        minStayDays: room.minStayDays,
        seasonalRates: parseSeasonalRates(room.seasonalRates),
        minimumStayPeriods: parseMinimumStayPeriods(room.minimumStayPeriods),
        closurePeriods: parseClosurePeriods(room.closurePeriods),
      };

      const minimumStay = getRoomMinimumStay(roomPolicy, checkIn);
      const stayLength = differenceInNights(checkIn, checkOut);

      if (minimumStay.nights > 0 && stayLength < minimumStay.nights) {
        throw new Error(`Este quarto exige pelo menos ${minimumStay.nights} noites.`);
      }

      if (minimumStay.days > 0 && stayLength < minimumStay.days) {
        throw new Error(`Este quarto exige pelo menos ${minimumStay.days} dias.`);
      }

      const blockingClosure = findBlockingClosure(roomPolicy, checkIn, checkOut);
      if (blockingClosure) {
        throw new Error("Este quarto está fechado ou bloqueado para o período informado.");
      }

      const overlappingReservations = await Reservation.findAll({
        where: {
          tenantId,
          roomId: room.id,
          id: { [Op.ne]: reservation.id },
          status: { [Op.ne]: "cancelled" },
          checkIn: { [Op.lt]: checkOut },
          checkOut: { [Op.gt]: checkIn },
        },
        attributes: ["unitNumber"],
        transaction,
      });

      if (overlappingReservations.length >= room.quantity) {
        throw new Error("Não há unidades disponíveis deste quarto para este período.");
      }

      const takenUnits = new Set(overlappingReservations.map((res) => res.unitNumber ?? 1));
      const currentUnit = reservation.unitNumber ?? 1;
      if (!takenUnits.has(currentUnit)) {
        assignedUnitNumber = currentUnit;
      } else {
        let candidate = 1;
        while (takenUnits.has(candidate) && candidate <= room.quantity) {
          candidate += 1;
        }
        assignedUnitNumber = candidate;
      }
    }

    await reservation.update(
      {
        roomId: room.id,
        checkIn: updatedReservation.checkIn,
        checkOut: updatedReservation.checkOut,
        status: updatedReservation.status,
        otaSource: updatedReservation.otaSource,
        channelReference: updatedReservation.channelReference,
        amount: updatedReservation.amount,
        currency: updatedReservation.currency,
        guestName: updatedReservation.customer.name,
        guestEmail: updatedReservation.customer.email,
        guestPhone: updatedReservation.customer.phone,
        guestCpf: updatedReservation.customer.cpf ?? reservation.guestCpf ?? null,
        notes: updatedReservation.notes,
        unitNumber: assignedUnitNumber,
      },
      { transaction },
    );

    return mapReservation(reservation, room.localRoomId);
  });
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function checkInReservation(tenantId: number, reservationId: string) {
  const { sequelize, Reservation } = await getDb();
  const parsedId = Number(reservationId);

  // Trava a linha da reserva dentro da transação: sem isso, dois cliques
  // (ou dois pedidos) quase simultâneos no botão de check-in liam
  // checkedInAt como null nos dois, e ambos passavam pela validação e
  // gravavam — gerando dois registros de "check-in realizado" idênticos.
  return sequelize.transaction(async (transaction) => {
    const reservation = await Reservation.findOne({
      where: { tenantId, id: Number.isInteger(parsedId) ? parsedId : -1 },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      throw new Error("Reserva não encontrada para este tenant.");
    }

    if (reservation.status === "cancelled") {
      throw new Error("Não é possível fazer check-in de uma reserva cancelada.");
    }

    if (reservation.checkedInAt) {
      throw new Error("Check-in já realizado para esta reserva.");
    }

    const todayKey = toLocalDateKey(new Date());
    const checkInKey = formatDbDate(reservation.checkIn);

    if (checkInKey !== todayKey) {
      throw new Error("Check-in permitido somente na data de chegada da reserva.");
    }

    await reservation.update({ checkedInAt: new Date() }, { transaction });
    return reservation.toJSON();
  });
}

export async function checkOutReservation(tenantId: number, reservationId: string) {
  const { sequelize, Reservation } = await getDb();
  const parsedId = Number(reservationId);

  return sequelize.transaction(async (transaction) => {
    const reservation = await Reservation.findOne({
      where: { tenantId, id: Number.isInteger(parsedId) ? parsedId : -1 },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      throw new Error("Reserva não encontrada para este tenant.");
    }

    if (!reservation.checkedInAt) {
      throw new Error("Não é possível fazer check-out sem check-in registrado.");
    }

    if (reservation.checkedOutAt) {
      throw new Error("Check-out já realizado para esta reserva.");
    }

    const todayKey = toLocalDateKey(new Date());
    const checkOutKey = formatDbDate(reservation.checkOut);

    if (checkOutKey !== todayKey) {
      throw new Error("Check-out permitido somente na data de saída da reserva.");
    }

    await reservation.update({ checkedOutAt: new Date() }, { transaction });
    return reservation.toJSON();
  });
}

export async function deleteReservation(
  tenantId: number,
  reservationId: string,
): Promise<void> {
  const { Reservation } = await getDb();
  const parsedId = Number(reservationId);

  const deletedCount = await Reservation.destroy({
    where: {
      tenantId,
      [Op.or]: [
        { channexReservationId: reservationId },
        ...(Number.isInteger(parsedId) ? [{ id: parsedId }] : []),
      ],
    },
  });

  if (deletedCount === 0) {
    throw new Error("Reserva não encontrada para este tenant.");
  }
}

export async function getExpenses(tenantId: number): Promise<Expense[]> {
  try {
    const { Expense } = await getDb();
    const expenses = await Expense.findAll({
      where: { tenantId },
      order: [
        ["date", "DESC"],
        ["id", "DESC"],
      ],
    });
    return expenses.map((expense) => mapExpense(expense));
  } catch (error) {
    console.error("[tenantService] Falha ao carregar despesas:", error);
    return [];
  }
}

export async function createExpense(
  tenantId: number,
  input: Omit<Expense, "id">,
  createdByUserId: number | null = null,
): Promise<Expense> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Informe um valor de despesa maior que zero.");
  }

  if (!input.description || !input.description.trim()) {
    throw new Error("Informe uma descrição para a despesa.");
  }

  const { Expense, User } = await getDb();

  let authorId = createdByUserId ?? 0;
  if (!Number.isInteger(authorId) || authorId <= 0) {
    const tenantUser = await User.findOne({ where: { tenantId }, order: [["id", "ASC"]] });
    const fallbackUser = tenantUser ?? (await User.findOne({ order: [["id", "ASC"]] }));

    if (!fallbackUser) {
      throw new Error("Nenhum usuário encontrado para registrar a despesa.");
    }

    authorId = fallbackUser.id;
  }

  const expense = await Expense.create({
    ...input,
    tenantId,
    createdByUserId: authorId,
  });

  return mapExpense(expense);
}

export async function deleteExpense(
  tenantId: number,
  expenseId: string,
): Promise<void> {
  const { Expense } = await getDb();
  const parsedId = Number(expenseId);

  if (!Number.isInteger(parsedId)) {
    throw new Error("Despesa inválida.");
  }

  const deletedCount = await Expense.destroy({
    where: {
      tenantId,
      id: parsedId,
    },
  });

  if (deletedCount === 0) {
    throw new Error("Despesa não encontrada para este tenant.");
  }
}

export async function getAvailableRooms(
  tenantId: number,
  checkIn?: string,
  checkOut?: string,
) {
  const { Room, Reservation } = await getDb();
  const allRooms = await Room.findAll({ where: { tenantId } });

  if (!checkIn || !checkOut) {
    return allRooms.map((room) => ({
      ...mapRoom(room),
      price: getRoomEffectivePrice(mapRoom(room), undefined),
      remainingQuantity: room.quantity,
    }));
  }

  const reservations = await Reservation.findAll({
    where: {
      tenantId,
      status: { [Op.ne]: "cancelled" },
      [Op.or]: [
        { checkIn: { [Op.lt]: checkOut }, checkOut: { [Op.gt]: checkIn } },
      ],
    },
  });

  return allRooms.map((room) => {
    const roomData = mapRoom(room);
    const matchingReservations = reservations.filter((res) => res.roomId === room.id);
    const occupiedCount = matchingReservations.length;
    const remaining = room.quantity - occupiedCount;
    const minimumStay = getRoomMinimumStay(roomData, checkIn);
    const stayLength = differenceInNights(checkIn, checkOut);
    const closure = findBlockingClosure(roomData, checkIn, checkOut);
    const isShortStay =
      (minimumStay.nights > 0 && stayLength < minimumStay.nights) ||
      (minimumStay.days > 0 && stayLength < minimumStay.days);

    const effectivePrice = getRoomEffectivePrice(roomData, checkIn);

    return {
      ...roomData,
      price: effectivePrice,
      // Mínimo de estadia efetivo para a data pesquisada — uma tarifa
      // sazonal pode exigir mais noites que o padrão do quarto (ex.:
      // Réveillon), então o valor base do quarto sozinho não é suficiente
      // para a busca pública saber a regra que realmente vale aqui.
      minStayNights: minimumStay.nights > 0 ? minimumStay.nights : null,
      minStayDays: minimumStay.days > 0 ? minimumStay.days : null,
      remainingQuantity: closure || isShortStay ? 0 : remaining,
    };
  });
}

export async function getTenantReservations(tenantId: number) {
  const { Reservation, Room } = await getDb();

  const reservations = await Reservation.findAll({
    where: { tenantId },
    include: [
      {
        model: Room,
        as: "room",
        attributes: ["name", "localRoomId"],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return reservations;
}
