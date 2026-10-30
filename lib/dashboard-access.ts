import type { Route } from 'next';

export type DashboardFeatureKey =
  | 'calendar'
  | 'calendar_management'
  | 'promotions'
  | 'addons'
  | 'reservations'
  | 'check'
  | 'rooms'
  | 'gallery'
  | 'team'
  | 'finance'
  | 'guests';

export type UserAccessRole = 'admin' | 'staff' | 'customer';

export type DashboardNavItem = {
  key: DashboardFeatureKey;
  href: Route;
  label: string;
  description: string;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    key: 'calendar',
    href: '/dashboard/calendar',
    label: 'Calendario',
    description: 'Operacao e moderacao de reservas',
  },
  {
    key: 'calendar_management',
    href: '/dashboard/calendar-management',
    label: 'Calendario de gestao',
    description: 'Fechamento de quartos e ajuste de tarifa',
  },
  {
    key: 'promotions',
    href: '/dashboard/promotions',
    label: 'Promocoes',
    description: 'Gerenciamento de cupons e descontos',
  },
  {
    key: 'addons',
    href: '/dashboard/addons',
    label: 'Pacotes & Adicionais',
    description: 'Itens extras oferecidos na reserva (decoração, jantar, spa...)',
  },
  {
    key: 'reservations',
    href: '/dashboard/reservations',
    label: 'Reserva',
    description: 'Cadastro e registro de reservas',
  },
  {
    key: 'check',
    href: '/dashboard/check',
    label: 'Check-in e Check-out',
    description: 'Fluxo operacional da recepcao',
  },
  {
    key: 'rooms',
    href: '/dashboard/rooms',
    label: 'Quartos',
    description: 'Status operacional e governanca',
  },
  {
    key: 'gallery',
    href: '/dashboard/gallery',
    label: 'Galeria',
    description: 'Fotos gerais da pousada exibidas no site',
  },
  {
    key: 'team',
    href: '/dashboard/team',
    label: 'Equipe',
    description: 'Escala, turnos e gestao de pessoas',
  },
  {
    key: 'finance',
    href: '/dashboard/finance',
    label: 'Financeiro',
    description: 'KPIs, despesas e margem liquida',
  },
  {
    key: 'guests',
    href: '/dashboard/guests',
    label: 'Historico de hospedes',
    description: 'Dados cadastrais e historico de estadias',
  },
];

const FEATURE_BY_KEY = new Map(
  DASHBOARD_NAV_ITEMS.map((item) => [item.key, item]),
);

export const DEFAULT_STAFF_FEATURES: DashboardFeatureKey[] = [
  'calendar',
  'calendar_management',
  'reservations',
  'check',
  'rooms',
  'guests',
];

function asFeatureKey(value: string): DashboardFeatureKey | null {
  return FEATURE_BY_KEY.has(value as DashboardFeatureKey)
    ? (value as DashboardFeatureKey)
    : null;
}

export function parseStoredDashboardPermissions(raw: string | null | undefined): unknown {
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function sanitizeDashboardPermissions(
  permissions: unknown,
): DashboardFeatureKey[] {
  if (!Array.isArray(permissions)) {
    return [];
  }

  const unique = new Set<DashboardFeatureKey>();

  for (const permission of permissions) {
    if (typeof permission !== 'string') {
      continue;
    }

    const feature = asFeatureKey(permission);
    if (feature) {
      unique.add(feature);
    }
  }

  return [...unique];
}

export function resolveDashboardPermissionsForRole(
  role: UserAccessRole,
  permissions: unknown,
): DashboardFeatureKey[] {
  if (role === 'admin') {
    return DASHBOARD_NAV_ITEMS.map((item) => item.key);
  }

  // Um array vazio é um estado explícito e válido ("gestor revogou todo o
  // acesso"), não deve cair para os padrões de staff — caso contrário fica
  // impossível bloquear totalmente o painel de um colaborador.
  return sanitizeDashboardPermissions(permissions);
}

export function getVisibleDashboardNavItems(
  plan: 'basic' | 'pro' | 'premium',
  role: UserAccessRole,
  permissions: unknown,
): DashboardNavItem[] {
  const allowed = new Set(resolveDashboardPermissionsForRole(role, permissions));

  return DASHBOARD_NAV_ITEMS.filter((item) => allowed.has(item.key));
}

export function canAccessDashboardPath(
  pathname: string,
  plan: 'basic' | 'pro' | 'premium',
  role: UserAccessRole,
  permissions: unknown,
): boolean {
  if (pathname === '/dashboard') {
    return true;
  }

  // Nunca usar apenas startsWith aqui: "/dashboard/calendar-management"
  // começa com "/dashboard/calendar", então um colaborador com permissão
  // só para "calendar" conseguiria acessar "calendar-management" (ou
  // qualquer outra rota cujo prefixo textual coincida) mesmo sem essa
  // permissão. Só conta como acessível se for o caminho exato ou uma
  // subrota dele (com "/" na sequência).
  const visible = getVisibleDashboardNavItems(plan, role, permissions);
  return visible.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function getDefaultDashboardHref(
  plan: 'basic' | 'pro' | 'premium',
  role: UserAccessRole,
  permissions: unknown,
): Route {
  const firstAllowed = getVisibleDashboardNavItems(plan, role, permissions)[0];
  // '/dashboard' é a única rota sempre acessível (ver canAccessDashboardPath).
  // Cair para '/dashboard/calendar' aqui reabriria a brecha que este fallback
  // existe para fechar: um colaborador sem nenhuma permissão apontaria para
  // uma rota que ele também não pode acessar, e como pathname === destination
  // o middleware não redireciona de novo — deixando a página renderizar.
  return firstAllowed?.href ?? '/dashboard';
}
