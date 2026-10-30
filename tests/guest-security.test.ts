import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuestToken, verifyGuestToken } from '@/lib/guest-session';
import { buildBookingConfirmationEmail, sendBookingEmail } from '@/lib/email';
import { checkRateLimit, resetRateLimitStore } from '@/lib/rate-limit';
import { isValidCpf, isValidDateString } from '@/lib/validators';
const db = vi.hoisted(() => ({ Reservation: { findOne: vi.fn(), findAll: vi.fn() }, Room: { findOne: vi.fn() }, Tenant: { findOne: vi.fn() }, sequelize: { transaction: vi.fn() } }));
vi.mock('@/lib/db', () => ({ getDb: async () => db }));
import { lookupGuestReservation, getGuestReservations, mutateGuestReservation } from '@/services/guestService';
import { handleGuest } from '@/lib/guest-api';
const session = { tenantId: 1, reservationId: 'mp_98765', email: 'guest@example.com', role: 'guest' as const, exp: 9999999999 };
const reservation = { id: 1, tenantId: 1, channexReservationId: 'mp_98765', roomId: 2, guestEmail: 'guest@example.com', guestCpf: '52998224725', guestName: 'Ana', status: 'confirmed', checkIn: '2099-01-01', checkOut: '2099-01-03', amount: 200, currency: 'BRL', update: vi.fn() };
const room = { id: 2, localRoomId: 'suite', name: 'Suíte', price: 100, quantity: 1, minStayNights: 1, minStayDays: 0 };
beforeEach(() => { vi.clearAllMocks(); resetRateLimitStore(); process.env.JWT_SECRET = 'a'.repeat(48); db.Reservation.findOne.mockResolvedValue(reservation); db.Room.findOne.mockResolvedValue(room); db.Reservation.findAll.mockResolvedValue([]); db.Tenant.findOne.mockResolvedValue({ id: 1 }); db.sequelize.transaction.mockImplementation(async cb => cb({ LOCK: { UPDATE: 'UPDATE' } })); });
describe('scoped guest sessions', () => {
  it('accepts signed session and rejects tampering, wrong role and extra segments', () => {
    const token = createGuestToken(session);
    expect(verifyGuestToken(token)?.reservationId).toBe('mp_98765');
    expect(verifyGuestToken(token + '.extra')).toBeNull();
    const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...session, role: 'admin' })).toString('base64url');
    expect(verifyGuestToken(parts.join('.'))).toBeNull();
  });
  it('expires after 30 minutes', () => {
    vi.useFakeTimers(); const token = createGuestToken(session); vi.advanceTimersByTime(1801000);
    expect(verifyGuestToken(token)).toBeNull(); vi.useRealTimers();
  });
  it('looks up exact external code and returns only that reservation without a new guest table', async () => {
    const result = await lookupGuestReservation(1, 'mp_98765', '529.982.247-25');
    expect(db.Reservation.findOne).toHaveBeenCalledWith({ where: { tenantId: 1, channexReservationId: 'mp_98765' } });
    expect(result.reservations).toHaveLength(1); expect(verifyGuestToken(result.token)?.reservationId).toBe('mp_98765');
  });
  it('does not accept an incorrect CPF or email', async () => {
    await expect(lookupGuestReservation(1, 'mp_98765', 'other@example.com')).rejects.toThrow('Reserva não encontrada');
  });
  it('uses exact email equality rather than SQL LIKE', async () => {
    await getGuestReservations({ ...session, email: 'a_%@example.com' });
    expect(db.Reservation.findOne).toHaveBeenLastCalledWith({ where: { tenantId: 1, channexReservationId: session.reservationId, guestEmail: 'a_%@example.com' } });
  });
  it('rejects mutation of another reservation before accessing any record', async () => {
    await expect(mutateGuestReservation(session, 'mp_OTHER', 'cancel')).rejects.toThrow('Reserva não encontrada');
    expect(db.sequelize.transaction).not.toHaveBeenCalled();
  });
  it('rejects checked-in reservations', async () => {
    db.Reservation.findOne.mockResolvedValue({ ...reservation, checkedInAt: new Date() });
    await expect(mutateGuestReservation(session, session.reservationId, 'cancel')).rejects.toThrow('não pode ser alterada');
  });
  it('rejects extra nights without charging the difference', async () => {
    await expect(mutateGuestReservation(session, session.reservationId, 'reschedule', '2099-02-01', '2099-02-05')).rejects.toThrow('ajuste de valor');
    expect(reservation.update).not.toHaveBeenCalled();
  });
  it('cancels only the owned future reservation without touching payment/refund APIs', async () => {
    const result = await mutateGuestReservation(session, session.reservationId, 'cancel');
    expect(reservation.update).toHaveBeenCalledWith({ status: 'cancelled' }, expect.any(Object));
    expect(result.message).toContain('reembolso');
  });
  it('reschedules equal-value stays and preserves the amount', async () => {
    const result = await mutateGuestReservation(session, session.reservationId, 'reschedule', '2099-02-01', '2099-02-03');
    expect(result.ok).toBe(true);
    expect(reservation.update.mock.calls[0][0]).toMatchObject({ checkIn: '2099-02-01T00:00:00.000Z', unitNumber: 1 });
    expect(reservation.update.mock.calls[0][0]).not.toHaveProperty('amount');
  });
  it('rejects dates with full occupancy under the room lock', async () => {
    db.Reservation.findAll.mockResolvedValue([{ unitNumber: 1 }]);
    await expect(mutateGuestReservation(session, session.reservationId, 'reschedule', '2099-02-01', '2099-02-03')).rejects.toThrow('disponibilidade');
    expect(reservation.update).not.toHaveBeenCalled();
  });
  it('rejects closure periods', async () => {
    db.Room.findOne.mockResolvedValue({ ...room, closurePeriods: JSON.stringify([{ startDate: '2099-02-01', endDate: '2099-02-10' }]) });
    await expect(mutateGuestReservation(session, session.reservationId, 'reschedule', '2099-02-01', '2099-02-03')).rejects.toThrow('fechamento');
  });
  it('requires authentication for list and mutations', async () => {
    expect((await handleGuest(new Request('https://admin.test/api'), 'list')).status).toBe(401);
    expect((await handleGuest(new Request('https://admin.test/api'), 'cancel')).status).toBe(401);
  });
  it('rejects injected fields and malformed JSON', async () => {
    const req = (body: string) => new Request('https://admin.test/api', { method: 'POST', body });
    expect((await handleGuest(req('{bad'), 'lookup')).status).toBe(400);
    expect((await handleGuest(req(JSON.stringify({ code: 'mp_1', identifier: 'a@b.com', tenantId: 2 })), 'lookup')).status).toBe(400);
  });
});
describe('email, validation and rate limiting', () => {
  it('escapes untrusted HTML in the email', () => {
    const email = buildBookingConfirmationEmail({ reservationCode: 'mp_1', guestName: '<script>alert(1)</script>', guestEmail: 'a@b.com', roomName: '<img src=x>', checkIn: '2099-01-01', checkOut: '2099-01-02', amount: 100 });
    expect(email.html).not.toContain('<script>'); expect(email.html).toContain('&lt;img'); expect(email.text).toContain('VIVA MAR');
  });
  it('does not pretend to send without configuration', async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendBookingEmail({ reservationCode: 'mp_1', guestName: 'Ana', guestEmail: 'a@b.com', roomName: 'Suíte', checkIn: '2099-01-01', checkOut: '2099-01-02', amount: 100 }, 'booking/1')).toBe(false);
  });
  it('rejects invalid dates and CPF even in the test environment', () => {
    expect(isValidDateString('2027-02-30')).toBe(false); expect(isValidDateString('2027-02-28Tgarbage')).toBe(false);
    expect(isValidCpf('12345678901')).toBe(false); expect(isValidCpf('52998224725')).toBe(true);
  });
  it('limits identifiers and isolates scopes', () => {
    expect(checkRateLimit('a', 'lookup', { limit: 1, windowMs: 60000 }).allowed).toBe(true);
    expect(checkRateLimit('a', 'lookup', { limit: 1, windowMs: 60000 }).allowed).toBe(false);
    expect(checkRateLimit('a', 'login', { limit: 1, windowMs: 60000 }).allowed).toBe(true);
  });
});
