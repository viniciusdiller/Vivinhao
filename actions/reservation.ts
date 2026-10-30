'use server';

import { Op, UniqueConstraintError } from 'sequelize';
import { getVerifiedTenantSession, hasFeatureAccess } from '@/lib/tenant-session';
import { getDb } from '@/lib/db';
import type { Reservation } from '@/types/domain';
import {
  differenceInNights,
  findBlockingClosure,
  getRoomEffectivePrice,
  getRoomMinimumStay,
  type RoomSeasonalRate,
} from '@/lib/room-policies';
import { isCouponValidForCheckIn } from '@/lib/coupon-policies';

type ManualReservationInput = {
  roomId: string;
  checkIn: string;
  checkOut: string;
  entryType: 'manual_reservation' | 'blocked';
  amount: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCpf?: string;
  notes: string;
  // Unidade física específica a reservar/fechar (1..quantity). Se omitido,
  // o sistema atribui automaticamente a primeira unidade livre — usado pelo
  // fluxo público e pela reserva manual comum, que não precisam expor isso.
  preferredUnitNumber?: number;
};

type ReservationCreationContext = ManualReservationInput & {
  tenantId: number;
  createdByUserId?: number | null;
  // Quando true, o preço enviado pelo cliente é ignorado e recalculado no
  // servidor (usado pelo fluxo público, onde o `amount` não é confiável).
  recomputePrice?: boolean;
  couponCode?: string;
  // ID do pagamento (Mercado Pago) que originou esta reserva. Usado para
  // gerar um channexReservationId determinístico (`mp_<id>`) e aproveitar o
  // índice único já existente na coluna — se o webhook do MP reenviar a
  // mesma notificação (retry legítimo, documentado por eles), a segunda
  // tentativa colide na constraint e devolve a reserva já criada em vez de
  // duplicar. Ver ensureUniqueIndexes em lib/db.ts.
  paymentReference?: string;
};

function parseStoredPolicyArray(input: unknown) {
  if (Array.isArray(input)) {
    return input;
  }

  if (typeof input !== 'string' || input.trim().length === 0) {
    return [] as unknown[];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as unknown[];
  }
}

// Sequelize devolve DataTypes.DATE como objeto Date logo após o .create(),
// não como a string original que foi passada — sem isso, `.slice(0, 10)`
// direto quebra com "created.checkIn.slice is not a function".
function formatDbDate(value: unknown): string {
  if (!value) {
    return '';
  }

  const asString = typeof value === 'string' ? value : new Date(value as string | number | Date).toISOString();
  return asString.slice(0, 10);
}

function normalizeCpf(input: string | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) {
    return null;
  }

  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length !== 11) {
    throw new Error('CPF inválido. Informe 11 dígitos.');
  }

  return digitsOnly;
}

function mapReservationToDomain(
  reservation: InstanceType<Awaited<ReturnType<typeof getDb>>['Reservation']>,
  localRoomId: string,
): Reservation {
  return {
    id: reservation.channexReservationId,
    roomId: localRoomId,
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
      cpf: (reservation.guestCpf as string | null) ?? undefined,
    },
    notes: reservation.notes,
  };
}

async function createReservationWithRules(input: ReservationCreationContext): Promise<Reservation> {
  const { sequelize, Room, Reservation, Coupon } = await getDb();
  const normalizedCpf = normalizeCpf(input.guestCpf);
  const channexReservationId = input.paymentReference
    ? `mp_${input.paymentReference}`
    : `manual_${Date.now()}`;

  try {
    return await sequelize.transaction(async (transaction) => {
    // Trava a linha do quarto para serializar tentativas concorrentes de reserva
    // do mesmo quarto e evitar overbooking em requisições simultâneas.
    const room = await Room.findOne({
      where: { tenantId: input.tenantId, localRoomId: input.roomId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!room) {
      throw new Error('Quarto não encontrado para o tenant.');
    }

    const checkIn = new Date(input.checkIn);
    const checkOut = new Date(input.checkOut);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      throw new Error('Período inválido para a reserva.');
    }

    const roomPolicy = {
      minStayNights: room.minStayNights,
      minStayDays: room.minStayDays,
      seasonalRates: parseStoredPolicyArray(room.seasonalRates),
      minimumStayPeriods: parseStoredPolicyArray(room.minimumStayPeriods),
      closurePeriods: parseStoredPolicyArray(room.closurePeriods),
    };

    const stayLength = differenceInNights(checkIn, checkOut);

    // Estadia mínima é uma regra comercial para reservas de hóspede — um
    // fechamento operacional (bloqueio) não "hospeda" ninguém e não deve
    // ficar preso à mesma exigência de noites/dias mínimos do quarto.
    if (input.entryType !== 'blocked') {
      const minimumStay = getRoomMinimumStay(roomPolicy, checkIn);

      if (minimumStay.nights > 0 && stayLength < minimumStay.nights) {
        throw new Error(`Este quarto exige pelo menos ${minimumStay.nights} noites.`);
      }

      if (minimumStay.days > 0 && stayLength < minimumStay.days) {
        throw new Error(`Este quarto exige pelo menos ${minimumStay.days} dias.`);
      }

      const blockingClosure = findBlockingClosure(roomPolicy, checkIn, checkOut);
      if (blockingClosure) {
        throw new Error('Este quarto está fechado ou bloqueado para o período informado.');
      }
    }

    const overlappingReservations = await Reservation.findAll({
      where: {
        tenantId: input.tenantId,
        roomId: room.id,
        status: { [Op.ne]: 'cancelled' },
        checkIn: { [Op.lt]: checkOut },
        checkOut: { [Op.gt]: checkIn },
      },
      attributes: ['unitNumber'],
      transaction,
    });

    if (overlappingReservations.length >= room.quantity) {
      throw new Error('Não há unidades disponíveis deste quarto para este período.');
    }

    const takenUnits = new Set(overlappingReservations.map((reservation) => reservation.unitNumber ?? 1));

    let assignedUnit: number;
    if (input.preferredUnitNumber !== undefined) {
      if (
        !Number.isInteger(input.preferredUnitNumber) ||
        input.preferredUnitNumber < 1 ||
        input.preferredUnitNumber > room.quantity
      ) {
        throw new Error(`Unidade inválida. Este quarto tem ${room.quantity} unidade(s).`);
      }

      if (takenUnits.has(input.preferredUnitNumber)) {
        throw new Error(`A unidade ${input.preferredUnitNumber} já está ocupada nesse período.`);
      }

      assignedUnit = input.preferredUnitNumber;
    } else {
      assignedUnit = 1;
      while (takenUnits.has(assignedUnit) && assignedUnit <= room.quantity) {
        assignedUnit += 1;
      }
    }

    let amount = input.amount;

    if (input.recomputePrice) {
      const pricePerNight = getRoomEffectivePrice(
        { price: Number(room.price), seasonalRates: roomPolicy.seasonalRates as RoomSeasonalRate[] },
        checkIn,
      );
      let computedAmount = pricePerNight * stayLength;

      if (input.couponCode) {
        const coupon = await Coupon.findOne({
          where: { tenantId: input.tenantId, code: input.couponCode.toUpperCase() },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!coupon || coupon.status !== 'active') {
          throw new Error('Cupom inválido ou inativo.');
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
          throw new Error('Este cupom já atingiu o limite de uso.');
        }

        // Ponto de aplicação final e não contornável: mesmo que a validação
        // no checkout tenha passado (ou tenha sido pulada), a reserva só é
        // criada com desconto se o check-in cair dentro do período do
        // cupom — um cupom de setembro nunca desconta uma reserva de
        // Réveillon, independente do que o cliente mandou no checkout.
        if (!isCouponValidForCheckIn(coupon, checkIn)) {
          throw new Error('Este cupom não é válido para as datas desta reserva.');
        }

        computedAmount = computedAmount * (1 - Number(coupon.discountPercentage) / 100);
        await coupon.increment('usedCount', { by: 1, transaction });
      }

      amount = Math.max(0, Math.round(computedAmount * 100) / 100);
    }

    const created = await Reservation.create(
      {
        roomId: room.id,
        tenantId: input.tenantId,
        channexReservationId,
        otaSource: 'manual',
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        status: input.entryType === 'manual_reservation' ? 'confirmed' : 'blocked',
        channelReference: input.entryType === 'manual_reservation' ? 'MANUAL-RES' : 'MANUAL-BLOCK',
        amount: input.entryType === 'manual_reservation' ? amount : 0,
        currency: 'BRL',
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestPhone: input.guestPhone,
        guestCpf: normalizedCpf,
        notes: input.notes,
        createdByUserId: input.createdByUserId ?? null,
        unitNumber: assignedUnit,
      },
      { transaction },
    );

      return mapReservationToDomain(created, room.localRoomId);
    });
  } catch (error) {
    // Reenvio legítimo do webhook do Mercado Pago pra um pagamento já
    // confirmado: a segunda tentativa colide no índice único de
    // channexReservationId (mp_<paymentId>) — devolve a reserva já criada
    // em vez de propagar erro (senão o MP ficaria reenviando indefinidamente
    // e o chamador interpretaria como falha).
    if (error instanceof UniqueConstraintError && input.paymentReference) {
      const { Room, Reservation } = await getDb();
      const existing = await Reservation.findOne({
        where: { tenantId: input.tenantId, channexReservationId },
      });

      if (existing) {
        const room = await Room.findByPk(existing.roomId);
        return mapReservationToDomain(existing, room?.localRoomId ?? input.roomId);
      }
    }

    throw error;
  }
}

export async function createManualReservationAction(input: ManualReservationInput): Promise<Reservation> {
  const session = await getVerifiedTenantSession();

  if (!session) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  if (!hasFeatureAccess(session, 'reservations')) {
    throw new Error('Sem permissão para esta ação.');
  }

  if (input.entryType === 'manual_reservation') {
    if (
      !input.roomId ||
      !input.checkIn ||
      !input.checkOut ||
      !input.guestName ||
      !input.guestEmail ||
      !input.guestPhone ||
      !input.guestCpf ||
      input.amount <= 0 ||
      !input.notes
    ) {
      throw new Error('Na reserva manual, todos os campos são obrigatórios.');
    }
  }

  return createReservationWithRules({
    ...input,
    tenantId: session.tenantId,
    // A sessão de administrador por env tem userId negativo (-1) só para não
    // colidir com colaboradores reais — mas created_by_user_id é UNSIGNED no
    // banco, então gravar -1 direto quebra o INSERT ("Out of range value").
    createdByUserId: session.userId > 0 ? session.userId : null,
  });
}

export async function createPublicReservation(
  input: Omit<ReservationCreationContext, 'tenantId' | 'amount' | 'recomputePrice'> & { tenantId: number },
) {
  if (
    !input.roomId ||
    !input.checkIn ||
    !input.checkOut ||
    !input.guestName ||
    !input.guestEmail ||
    !input.guestPhone ||
    !input.guestCpf
  ) {
    throw new Error('Todos os campos são obrigatórios para concluir a reserva.');
  }

  // O preço nunca vem do cliente: é sempre recalculado a partir do quarto,
  // das datas e (se houver) de um cupom válido, dentro da mesma transação.
  return createReservationWithRules({
    ...input,
    amount: 0,
    recomputePrice: true,
  });
}
