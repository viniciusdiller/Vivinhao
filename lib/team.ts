import { DASHBOARD_NAV_ITEMS, type DashboardFeatureKey } from '@/lib/dashboard-access';
import type { TeamRole } from '@/models/User';

export type TeamShift = 'Manha' | 'Tarde' | 'Noite';
export type TeamEmploymentStatus = 'ativo' | 'inativo';
export type TeamShiftStatus = 'fora' | 'em_turno';

export const TEAM_ROLE_OPTIONS: TeamRole[] = [
  'Recepcao',
  'Limpeza',
  'Manutencao',
  'Gestao',
];

export const TEAM_SHIFT_OPTIONS: TeamShift[] = ['Manha', 'Tarde', 'Noite'];

export const TEAM_PERMISSION_OPTIONS: Array<{
  key: DashboardFeatureKey;
  label: string;
}> = DASHBOARD_NAV_ITEMS.map((item) => ({
  key: item.key,
  label: item.label,
}));

export function shiftLabelToDb(value: TeamShift) {
  if (value === 'Tarde') {
    return 'afternoon' as const;
  }

  if (value === 'Noite') {
    return 'night' as const;
  }

  return 'morning' as const;
}

export function shiftLabelFromDb(value: 'morning' | 'afternoon' | 'night'): TeamShift {
  if (value === 'afternoon') {
    return 'Tarde';
  }

  if (value === 'night') {
    return 'Noite';
  }

  return 'Manha';
}

export function employmentStatusFromDb(value: 'active' | 'inactive'): TeamEmploymentStatus {
  return value === 'active' ? 'ativo' : 'inativo';
}

export function shiftStatusFromDb(value: 'off' | 'on_shift'): TeamShiftStatus {
  return value === 'on_shift' ? 'em_turno' : 'fora';
}
