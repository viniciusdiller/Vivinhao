import { cookies } from 'next/headers';
import type { TenantPlan } from '@/models/Tenant';
import type { DashboardFeatureKey, UserAccessRole } from '@/lib/dashboard-access';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const authConfig = {
  cookieName: 'sancho_session',
  tokenTtlSeconds: 60 * 60 * 8,
};

export function shouldUseSecureCookies(request: Request) {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  return new URL(request.url).protocol === 'https:';
}

export type SessionPayload = {
  userId: number;
  tenantId: number;
  plan: TenantPlan;
  tenantName: string;
  role: UserAccessRole;
  permissions: DashboardFeatureKey[];
  active: boolean;
  exp: number;
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não foi configurado.');
  }
  // ⚠️ CRÍTICO: JWT_SECRET deve ter mínimo 32 caracteres para HMAC-SHA256
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET deve ter mínimo 32 caracteres. Atualize em .env ou variáveis de ambiente.'
    );
  }
  return secret;
}

function base64UrlEncodeBytes(buffer: Uint8Array) {
  return Buffer.from(buffer).toString('base64url');
}

function base64UrlEncodeText(input: string) {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64UrlDecodeText(input: string) {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

function base64UrlDecodeBytes(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64url'));
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(value: string, secret: string) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

// Usa crypto.subtle.verify (constant-time) em vez de recalcular a
// assinatura esperada e comparar strings com `!==`, que é vulnerável a
// timing attack.
async function verifySignature(value: string, secret: string, signature: string) {
  try {
    const key = await importHmacKey(secret);
    const signatureBytes = base64UrlDecodeBytes(signature);
    return await crypto.subtle.verify('HMAC', key, signatureBytes as unknown as ArrayBuffer, encoder.encode(value));
  } catch {
    return false;
  }
}

export async function createSessionToken(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + authConfig.tokenTtlSeconds;
  const header = base64UrlEncodeText(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncodeText(JSON.stringify({ ...payload, exp } satisfies SessionPayload));
  const unsigned = `${header}.${body}`;
  const signature = await sign(unsigned, getSecret());
  return `${unsigned}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) {
      return null;
    }

    const unsigned = `${header}.${body}`;
    const isValid = await verifySignature(unsigned, getSecret(), signature);

    if (!isValid) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecodeText(body)) as Partial<SessionPayload>;

    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!payload.userId || !payload.tenantId || !payload.plan || !payload.tenantName) {
      return null;
    }

    // Fail-closed: um token assinado sem `role` (ex.: token antigo emitido
    // antes desse campo existir, ou uma regressão futura na assinatura) não
    // deve ser tratado como admin por padrão — isso promoveria silenciosamente
    // qualquer sessão incompleta ao nível de acesso mais alto.
    if (!payload.role) {
      return null;
    }

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      plan: payload.plan,
      tenantName: payload.tenantName,
      role: payload.role,
      permissions: payload.permissions ?? [],
      active: payload.active ?? true,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getAuthenticatedSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(authConfig.cookieName)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
