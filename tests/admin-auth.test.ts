import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), tenant: vi.fn(), compare: vi.fn(), token: vi.fn(), authenticated: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hashSync: () => 'dummy-hash', compare: mocks.compare } }));
vi.mock('@/lib/auth', () => ({ getAuthenticatedSession: mocks.authenticated, createSessionToken: mocks.token, authConfig: { cookieName: 'sancho_session', tokenTtlSeconds: 28800 }, shouldUseSecureCookies: () => true }));
vi.mock('@/lib/db', () => ({ getDb: async () => ({ User: { findOne: mocks.user }, Tenant: { findOne: mocks.tenant, findAll: async () => [{ id: 1 }] } }) }));
import { POST } from '@/app/api/auth/login/route';
import { getVerifiedTenantSession } from '@/lib/tenant-session';
import { resetRateLimitStore } from '@/lib/rate-limit';
function req(body: unknown) { return new Request('https://admin.test/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); resetRateLimitStore(); delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD; mocks.compare.mockResolvedValue(false); mocks.user.mockResolvedValue(null); mocks.tenant.mockResolvedValue({ id: 1, status: 'active' }); });
it('rejects malformed credentials without calling bcrypt or the database', async () => {
 expect((await POST(req({ email: {}, password: 10 }))).status).toBe(400); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
});
it('runs dummy bcrypt for missing users and gives the same response for inactive accounts', async () => {
 const missing = await POST(req({ email: 'missing@example.com', password: 'wrong' })); expect(mocks.compare).toHaveBeenCalledWith('wrong', 'dummy-hash');
 mocks.user.mockResolvedValue({ passwordHash: 'stored-hash', employmentStatus: 'inactive', get: () => ({ status: 'active' }) });
 const inactive = await POST(req({ email: 'inactive@example.com', password: 'wrong' })); expect(inactive.status).toBe(missing.status); expect(await inactive.json()).toEqual(await missing.json());
});
it('keeps the existing plaintext environment admin login but does not allow a suspended tenant', async () => {
 process.env.ADMIN_EMAIL = 'admin@example.com'; process.env.ADMIN_PASSWORD = 'existing-secret'; process.env.ADMIN_TENANT_ID = '1'; mocks.tenant.mockResolvedValue(null);
 const response = await POST(req({ email: 'admin@example.com', password: 'existing-secret' })); expect(response.status).toBe(401); expect(mocks.token).not.toHaveBeenCalled();
});
it('rechecks environment admin tenant status on every API call', async () => {
 process.env.ADMIN_EMAIL = 'admin@example.com'; process.env.ADMIN_PASSWORD = 'secret'; mocks.authenticated.mockResolvedValue({ userId: -1, tenantId: 1, role: 'admin', permissions: [] }); mocks.tenant.mockResolvedValue(null);
 expect(await getVerifiedTenantSession()).toBeNull(); expect(mocks.tenant).toHaveBeenCalledWith({ where: { id: 1, status: 'active' } });
});
it('binds a staff session to the same tenant during revalidation', async () => {
 mocks.authenticated.mockResolvedValue({ userId: 9, tenantId: 2 }); mocks.user.mockResolvedValue(null);
 expect(await getVerifiedTenantSession()).toBeNull(); expect(mocks.user.mock.calls[0][0].where).toEqual({ id: 9, tenantId: 2 });
});
