import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ room: vi.fn(), find: vi.fn(), findAll: vi.fn(), create: vi.fn(), coupon: vi.fn(), send: vi.fn(), tenant: vi.fn(), tenants: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendBookingEmail: mocks.send }));
vi.mock('@/lib/db', () => ({ getDb: async () => ({ Room: { findOne: mocks.room }, Reservation: { findOne: mocks.find, findAll: mocks.findAll, create: mocks.create }, Coupon: { findOne: mocks.coupon }, Tenant: { findOne: mocks.tenant, findAll: mocks.tenants }, sequelize: { transaction: async (fn: any) => fn({ LOCK: { UPDATE: 'UPDATE' } }) } }) }));
import { createPublicReservation } from '@/services/reservationService';
import { POST } from '@/app/api/public/viva-mar/route';
import { resolvePublicTenantId, resolveDefaultTenantId } from '@/lib/public-tenant';
const input = { tenantId: 1, roomId: 'suite', checkIn: '2099-01-01', checkOut: '2099-01-03', guestName: 'Ana Silva', guestEmail: 'ana@example.com', guestPhone: '22999999999', guestCpf: '52998224725', paymentReference: '123', notes: '', entryType: 'manual_reservation' as const };
beforeEach(() => {
  vi.clearAllMocks(); mocks.send.mockResolvedValue(true); mocks.find.mockResolvedValue(null); mocks.findAll.mockResolvedValue([]);
  mocks.room.mockResolvedValue({ id: 2, localRoomId: 'suite', name: 'Suíte', price: 100, quantity: 1, minStayNights: 1, minStayDays: 0 });
  mocks.create.mockImplementation(async (data: any) => ({ id: 1, ...data }));
  mocks.tenant.mockResolvedValue({ id: 1 }); mocks.tenants.mockResolvedValue([{ id: 1 }]); delete process.env.PUBLIC_ROOMS_TENANT_ID;
});
it('recalculates amount, stores first, sends voucher after transaction and ignores injected status', async () => {
  const result = await createPublicReservation({ ...input, status: 'cancelled', amount: 1 } as any);
  expect(result.amount).toBe(200); expect(result.status).toBe('confirmed');
  expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.send.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.create.mock.invocationCallOrder[0]);
});
it('recognizes a retry before availability/coupon checks and does not send another email', async () => {
  mocks.find.mockResolvedValue({ ...input, channexReservationId: 'mp_123', checkIn: '2099-01-01', checkOut: '2099-01-03', amount: 200 });
  const result = await createPublicReservation(input);
  expect(result.id).toBe('mp_123'); expect(mocks.findAll).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it('does not send a voucher when the transaction cannot create a reservation', async () => {
  mocks.findAll.mockResolvedValue([{ unitNumber: 1 }]);
  await expect(createPublicReservation(input)).rejects.toThrow('disponíveis'); expect(mocks.send).not.toHaveBeenCalled();
});
it('keeps a confirmed reservation when the email provider is unavailable', async () => {
  mocks.send.mockResolvedValue(false); expect((await createPublicReservation(input)).status).toBe('confirmed');
});
it('preserves coupon validity against check-in date', async () => {
  mocks.coupon.mockResolvedValue({ status: 'active', usageLimit: null, usedCount: 0, validFrom: '2099-02-01', validUntil: '2099-02-28', discountPercentage: 10 });
  await expect(createPublicReservation({ ...input, couponCode: 'FEB' })).rejects.toThrow('não é válido');
  expect(mocks.create).not.toHaveBeenCalled();
});
it('fails closed for confirmations without the shared key', async () => {
  delete process.env.RESERVATION_API_SECRET;
  expect((await POST(new Request('https://admin.test/api', { method: 'POST', body: '{}' }))).status).toBe(503);
  process.env.RESERVATION_API_SECRET = 'x'.repeat(48);
  expect((await POST(new Request('https://admin.test/api', { method: 'POST', body: '{}' }))).status).toBe(401);
});
it('validates an explicit tenant and never falls back after an invalid selection', async () => {
  mocks.tenant.mockResolvedValue(null);
  expect(await resolvePublicTenantId(new Request('https://admin.test/?tenantId=99'))).toBeNull(); expect(mocks.tenants).not.toHaveBeenCalled();
});
it('does not pick the first tenant when more than one is active', async () => {
  mocks.tenants.mockResolvedValue([{ id: 1 }, { id: 2 }]); expect(await resolveDefaultTenantId()).toBeNull();
});
