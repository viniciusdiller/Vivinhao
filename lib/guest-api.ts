import { NextResponse } from 'next/server';
import { extractGuestSession } from '@/lib/guest-session';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { resolvePublicTenantId } from '@/lib/public-tenant';
import { getGuestReservations, lookupGuestReservation, mutateGuestReservation, resendGuestVoucher, GuestError } from '@/services/guestService';
export const guestCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Cache-Control': 'no-store' };
export function guestOptions() { return NextResponse.json({}, { headers: guestCors }); }
export async function handleGuest(request: Request, action: 'lookup' | 'list' | 'cancel' | 'reschedule' | 'voucher') {
  const respond = (body: unknown, status = 200, extra = {}) => NextResponse.json(body, { status, headers: { ...guestCors, ...extra } });
  const ipLimit = checkRateLimit(getClientIp(request), `guest-${action}`, { limit: action === 'lookup' ? 10 : 20, windowMs: 60_000 });
  if (!ipLimit.allowed) return respond({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429, { 'Retry-After': String(ipLimit.retryAfterSeconds) });
  try {
    const session = action === 'lookup' ? null : extractGuestSession(request);
    if (action !== 'lookup' && !session) return respond({ error: 'Sessão expirada. Consulte sua reserva novamente.' }, 401);
    if (session) {
      const limit = checkRateLimit(`${session.tenantId}:${session.reservationId}`, `guest-session-${action}`, { limit: action === 'voucher' ? 2 : 10, windowMs: 300_000 });
      if (!limit.allowed) return respond({ error: 'Muitas tentativas para esta reserva.' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
    }
    if (action === 'list') return respond(await getGuestReservations(session!));
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'Envie um objeto JSON válido.' }, 400);
    const allowed = action === 'lookup' ? ['code', 'identifier'] : action === 'reschedule' ? ['reservationId', 'newCheckIn', 'newCheckOut'] : action === 'cancel' ? ['reservationId'] : [];
    if (Object.keys(body).some(key => !allowed.includes(key))) return respond({ error: 'Campos inválidos.' }, 400);
    if (action === 'lookup') {
      if (typeof body.code !== 'string' || typeof body.identifier !== 'string' || body.code.length > 100 || body.identifier.length > 160) return respond({ error: 'Informe o código e o CPF ou e-mail.' }, 400);
      const code = body.code.trim(), identifier = body.identifier.trim();
      // Per code, not code+identifier: rotating guessed emails cannot bypass it.
      const limit = checkRateLimit(code.toLowerCase(), 'guest-code', { limit: 5, windowMs: 300_000 });
      if (!limit.allowed) return respond({ error: 'Muitas consultas para este código.' }, 429, { 'Retry-After': String(limit.retryAfterSeconds) });
      const tenantId = await resolvePublicTenantId(request);
      if (!tenantId) return respond({ error: 'Propriedade não encontrada.' }, 404);
      return respond(await lookupGuestReservation(tenantId, code, identifier));
    }
    if (action === 'voucher') return respond(await resendGuestVoucher(session!));
    if (typeof body.reservationId !== 'string' || body.reservationId.length > 100) return respond({ error: 'Código inválido.' }, 400);
    return respond(await mutateGuestReservation(session!, body.reservationId, action, body.newCheckIn, body.newCheckOut));
  } catch (error) {
    if (error instanceof GuestError) return respond({ error: error.message }, 400);
    console.error('Falha no portal do hóspede.');
    return respond({ error: 'Não foi possível concluir a solicitação. Tente novamente.' }, 500);
  }
}
