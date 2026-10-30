import { createHmac, timingSafeEqual } from 'crypto';
export type GuestSession = { tenantId: number; reservationId: string; email: string; role: 'guest'; exp: number };
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET não configurado.');
  // Domain separation prevents interchange with administrator sessions.
  return createHmac('sha256', value).update('vivamar:guest:v1').digest();
}
export function createGuestToken(input: Omit<GuestSession, 'role' | 'exp'>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...input, role: 'guest', exp: Math.floor(Date.now() / 1000) + 1800 })).toString('base64url');
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${createHmac('sha256', secret()).update(unsigned).digest('base64url')}`;
}
export function verifyGuestToken(token: string): GuestSession | null {
  try {
    if (token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT') return null;
    const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
    const value = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (value.role !== 'guest' || !Number.isSafeInteger(value.tenantId) || value.tenantId <= 0 || typeof value.reservationId !== 'string' || typeof value.email !== 'string' || !Number.isFinite(value.exp) || value.exp <= Date.now() / 1000) return null;
    return value;
  } catch { return null; }
}
export function extractGuestSession(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? verifyGuestToken(authorization.slice(7)) : null;
}
