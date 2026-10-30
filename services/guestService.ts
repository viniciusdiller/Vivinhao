import { createHash, timingSafeEqual } from 'crypto';
import { Op } from 'sequelize';
import { getDb } from '@/lib/db';
import { createGuestToken, type GuestSession } from '@/lib/guest-session';
import { sendBookingEmail } from '@/lib/email';
import { differenceInNights, findBlockingClosure, getRoomEffectivePrice, getRoomMinimumStay, type RoomSeasonalRate } from '@/lib/room-policies';
import { isValidDateString, isValidReservationCode } from '@/lib/validators';

export class GuestError extends Error {}

type Db = Awaited<ReturnType<typeof getDb>>;
type Reservation = InstanceType<Db['Reservation']>;
type Room = InstanceType<Db['Room']>;
const NOT_FOUND = 'Reserva não encontrada. Confira o código e o CPF ou e-mail.';
function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function date(value: unknown) { return new Date(value as string).toISOString().slice(0, 10); }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function policy(room: Room) {
  const array = (raw: string | null) => { try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  return { minStayNights: room.minStayNights, minStayDays: room.minStayDays, seasonalRates: array(room.seasonalRates), minimumStayPeriods: array(room.minimumStayPeriods), closurePeriods: array(room.closurePeriods) };
}
function present(res: Reservation, room: Room) {
  return { reservationId: res.channexReservationId, roomId: room.localRoomId, roomName: room.name,
    checkIn: date(res.checkIn), checkOut: date(res.checkOut), status: res.status, amount: Number(res.amount), currency: res.currency,
    guestName: res.guestName, guestEmail: res.guestEmail, minStayNights: Math.max(room.minStayNights || 0, room.minStayDays || 0),
    canModify: res.status === 'confirmed' && !res.checkedInAt && !res.checkedOutAt && date(res.checkIn) >= today(),
  };
}
function emailInput(res: Reservation, room: Room) {
  return { reservationCode: res.channexReservationId, guestName: res.guestName, guestEmail: res.guestEmail, roomName: room.name,
    checkIn: date(res.checkIn), checkOut: date(res.checkOut), amount: Number(res.amount) };
}
function ownedWhere(session: GuestSession, requestedId = session.reservationId) {
  if (requestedId !== session.reservationId) throw new GuestError(NOT_FOUND);
  // Equality, never LIKE: email addresses can legally contain % or _.
  return { tenantId: session.tenantId, channexReservationId: session.reservationId, guestEmail: session.email };
}
export async function lookupGuestReservation(tenantId: number, code: string, identifier: string) {
  if (!isValidReservationCode(code) || !identifier || identifier.length > 160) throw new GuestError(NOT_FOUND);
  const { Reservation, Room } = await getDb();
  // Exact external code only; never infer a database ID from a fragment of the code.
  const res = await Reservation.findOne({ where: { tenantId, channexReservationId: code } });
  const normalized = identifier.includes('@') ? identifier.trim().toLowerCase() : identifier.replace(/\D/g, '');
  const actual = identifier.includes('@') ? (res?.guestEmail || '').trim().toLowerCase() : (res?.guestCpf || '').replace(/\D/g, '');
  const matches = equal(normalized, actual || 'missing');
  if (!res || !normalized || !matches || res.status === 'blocked') throw new GuestError(NOT_FOUND);
  const room = await Room.findOne({ where: { id: res.roomId, tenantId } });
  if (!room) throw new GuestError(NOT_FOUND);
  const token = createGuestToken({ tenantId, reservationId: res.channexReservationId, email: res.guestEmail });
  return { ok: true, token, reservations: [present(res, room)] };
}
export async function getGuestReservations(session: GuestSession) {
  const { Reservation, Room, Tenant } = await getDb();
  if (!await Tenant.findOne({ where: { id: session.tenantId, status: 'active' } })) throw new GuestError(NOT_FOUND);
  const res = await Reservation.findOne({ where: ownedWhere(session) });
  if (!res || res.status === 'blocked') throw new GuestError(NOT_FOUND);
  const room = await Room.findOne({ where: { id: res.roomId, tenantId: session.tenantId } });
  if (!room) throw new GuestError(NOT_FOUND);
  return [present(res, room)];
}
export async function mutateGuestReservation(session: GuestSession, requestedId: string, action: 'cancel' | 'reschedule', newCheckIn?: string, newCheckOut?: string) {
  const { sequelize, Room, Reservation, Tenant } = await getDb();
  const where = ownedWhere(session, requestedId);
  const result = await sequelize.transaction(async transaction => {
    if (!await Tenant.findOne({ where: { id: session.tenantId, status: 'active' }, transaction })) throw new GuestError(NOT_FOUND);
    const initial = await Reservation.findOne({ where, transaction });
    if (!initial) throw new GuestError(NOT_FOUND);
    // All reservation writers lock room first, then reservation, avoiding overbooking/deadlocks.
    const room = await Room.findOne({ where: { id: initial.roomId, tenantId: session.tenantId }, transaction, lock: transaction.LOCK.UPDATE });
    const res = await Reservation.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    if (!room || !res || res.roomId !== room.id) throw new GuestError(NOT_FOUND);
    if (res.status !== 'confirmed' || res.checkedInAt || res.checkedOutAt || date(res.checkIn) < today()) throw new GuestError('Esta reserva não pode ser alterada pelo portal. Entre em contato com a recepção.');
    if (action === 'cancel') {
      await res.update({ status: 'cancelled' }, { transaction });
    } else {
      if (!isValidDateString(newCheckIn) || !isValidDateString(newCheckOut) || !newCheckIn || !newCheckOut || newCheckIn < today() || newCheckOut <= newCheckIn) throw new GuestError('Período inválido.');
      const start = new Date(`${newCheckIn}T00:00:00.000Z`), end = new Date(`${newCheckOut}T00:00:00.000Z`);
      const nights = differenceInNights(start, end), rules = policy(room), minimum = getRoomMinimumStay(rules, start);
      if (nights < Math.max(minimum.nights, minimum.days) || findBlockingClosure(rules, start, end)) throw new GuestError('As datas não atendem às regras de estadia ou fechamento do quarto.');
      const total = getRoomEffectivePrice({ price: Number(room.price), seasonalRates: rules.seasonalRates as RoomSeasonalRate[] }, start) * nights;
      // No extra nights or tariff changes without collecting/refunding the difference.
      if (nights !== differenceInNights(new Date(res.checkIn), new Date(res.checkOut)) || Math.abs(total - Number(res.amount)) > 0.01) throw new GuestError('Esta alteração exige ajuste de valor. Solicite a remarcação à recepção.');
      const overlaps = await Reservation.findAll({ where: { tenantId: session.tenantId, roomId: room.id, id: { [Op.ne]: res.id }, status: { [Op.ne]: 'cancelled' }, checkIn: { [Op.lt]: end }, checkOut: { [Op.gt]: start } }, transaction });
      if (overlaps.length >= room.quantity) throw new GuestError('Sem disponibilidade para o período.');
      const taken = new Set(overlaps.map(item => item.unitNumber ?? 1));
      let unit = res.unitNumber ?? 1;
      if (taken.has(unit)) { unit = 1; while (taken.has(unit)) unit++; }
      if (unit > room.quantity) throw new GuestError('Sem disponibilidade para o período.');
      await res.update({ checkIn: start.toISOString(), checkOut: end.toISOString(), unitNumber: unit }, { transaction });
    }
    return { res, room };
  });
  if (action === 'reschedule') await sendBookingEmail(emailInput(result.res, result.room), `reschedule/${session.tenantId}/${result.res.channexReservationId}/${date(result.res.checkIn)}/${date(result.res.checkOut)}`);
  return { ok: true, message: action === 'cancel' ? 'Reserva cancelada. Para reembolso, entre em contato com a recepção.' : 'Reserva remarcada.', reservations: [present(result.res, result.room)] };
}
export async function resendGuestVoucher(session: GuestSession) {
  await getGuestReservations(session);
  const { Reservation, Room } = await getDb();
  const res = await Reservation.findOne({ where: ownedWhere(session) });
  if (!res || res.status !== 'confirmed') throw new GuestError('Apenas reservas confirmadas possuem voucher.');
  const room = await Room.findOne({ where: { id: res.roomId, tenantId: session.tenantId } });
  if (!room) throw new GuestError(NOT_FOUND);
  // Per-minute key makes network retries idempotent without storing a delivery column.
  const sent = await sendBookingEmail(emailInput(res, room), `voucher/${session.tenantId}/${res.channexReservationId}/${Math.floor(Date.now() / 60000)}`);
  if (!sent) throw new GuestError('Não foi possível enviar o voucher. Tente novamente ou contate a recepção.');
  return { ok: true, message: 'Voucher enviado para o e-mail cadastrado.' };
}
