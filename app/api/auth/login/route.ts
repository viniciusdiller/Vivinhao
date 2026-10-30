import { randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { createSessionToken, authConfig, shouldUseSecureCookies } from '@/lib/auth';
import { resolveDashboardPermissionsForRole, sanitizeDashboardPermissions } from '@/lib/dashboard-access';
import { getDb } from '@/lib/db';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { resolveDefaultTenantId } from '@/lib/public-tenant';

const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);

function parseDashboardPermissions(raw: string | null | undefined) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return sanitizeDashboardPermissions(parsed);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  // Limita por IP (contra scanners/bots) e por e-mail (contra um atacante
  // que distribua tentativas entre vários IPs mirando uma única conta).
  const ipLimit = checkRateLimit(getClientIp(request), 'login-ip', {
    limit: 15,
    windowMs: 300_000,
  });
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 160 || body.password.length > 256) {
    return NextResponse.json({ message: 'Informe e-mail e senha válidos.' }, { status: 400 });
  }
  const secureCookie = shouldUseSecureCookies(request);

  if (!body.email || !body.password) {
    return NextResponse.json({ message: 'Informe e-mail e senha.' }, { status: 400 });
  }

  const emailLimit = checkRateLimit(body.email.trim().toLowerCase(), 'login-email', {
    limit: 5,
    windowMs: 300_000,
  });
  if (!emailLimit.allowed) {
    return rateLimitResponse(emailLimit);
  }


  // Login de administrador fixo, definido inteiramente por variáveis de
  // ambiente (sem registro na tabela users) — permite acessar o painel sem
  // depender de um Tenant/User já cadastrado no banco. Se ADMIN_EMAIL ou
  // ADMIN_PASSWORD não estiverem configurados, este bloco nunca casa.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && body.email.trim().toLowerCase() === adminEmail.trim().toLowerCase()) {
    let isMasterPasswordValid = false;

    if (adminPassword.startsWith("$2a$") || adminPassword.startsWith("$2b$")) {
      isMasterPasswordValid = await bcrypt.compare(body.password, adminPassword);
    } else {
      await bcrypt.compare(body.password, DUMMY_HASH);
      const expectedBuf = Buffer.from(adminPassword);
      const providedBuf = Buffer.from(body.password);
      isMasterPasswordValid = expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
    }

    if (!isMasterPasswordValid) {
      return NextResponse.json({ message: 'Credenciais inválidas.' }, { status: 401 });
    }

    // ADMIN_TENANT_ID é opcional: sem ele, resolve automaticamente o tenant
    // ativo da pousada em vez de cair num id fixo — evita apontar para
    // um id inexistente se a base tiver outro id inicial.
    const envTenantId = Number(process.env.ADMIN_TENANT_ID);
    const tenantId = Number.isInteger(envTenantId) && envTenantId > 0
      ? envTenantId
      : await resolveDefaultTenantId();

    if (!tenantId) {
      return NextResponse.json(
        { message: 'Nenhum tenant encontrado para o login de administrador.' },
        { status: 500 },
      );
    }

    const { Tenant } = await getDb();
    const tenant = await Tenant.findOne({ where: { id: tenantId, status: 'active' } });
    if (!tenant) return NextResponse.json({ message: 'Credenciais inválidas.' }, { status: 401 });

    const token = await createSessionToken({
      // Sessão de administrador definida por env, sem registro na tabela
      // users — id negativo pra nunca colidir com um colaborador real.
      userId: -1,
      tenantId,
      plan: tenant?.plan ?? 'premium',
      tenantName: tenant?.name ?? process.env.ADMIN_TENANT_NAME ?? 'Administração',
      role: 'admin',
      permissions: [],
      active: true,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(authConfig.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: authConfig.tokenTtlSeconds,
    });

    return response;
  }

  const { User, Tenant } = await getDb();

  const user = await User.findOne({
    where: { email: body.email },
    include: [{ model: Tenant, as: 'tenant' }],
  });

  if (!user) {
    await bcrypt.compare(body.password, DUMMY_HASH);
    return NextResponse.json({ message: 'Credenciais inválidas.' }, { status: 401 });
  }

  const tenant = user.get('tenant') as InstanceType<typeof Tenant> | undefined;

  // Não vazar se a conta ou colaborador está inativo — resposta e timing idênticos
  if (!tenant || tenant.status !== 'active' || user.employmentStatus === 'inactive') {
    await bcrypt.compare(body.password, user.passwordHash || DUMMY_HASH);
    return NextResponse.json({ message: 'Credenciais inválidas.' }, { status: 401 });
  }

  const isValid = await bcrypt.compare(body.password, user.passwordHash);

  if (!isValid) {
    return NextResponse.json({ message: 'Credenciais inválidas.' }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    tenantId: tenant.id,
    plan: tenant.plan,
    tenantName: tenant.name,
    role: user.role,
    permissions: resolveDashboardPermissionsForRole(user.role, parseDashboardPermissions(user.dashboardPermissions)),
    active: user.employmentStatus === 'active',
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authConfig.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: authConfig.tokenTtlSeconds,
  });

  return response;
}
