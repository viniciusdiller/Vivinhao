'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock3, Plus, ShieldCheck } from 'lucide-react';
import type { DashboardFeatureKey } from '@/lib/dashboard-access';
import { DEFAULT_STAFF_FEATURES } from '@/lib/dashboard-access';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import {
  TEAM_PERMISSION_OPTIONS,
  TEAM_ROLE_OPTIONS,
  TEAM_SHIFT_OPTIONS,
  type TeamEmploymentStatus,
  type TeamShift,
  type TeamShiftStatus,
} from '@/lib/team';

type TeamRole = (typeof TEAM_ROLE_OPTIONS)[number];

type TeamMember = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: TeamRole;
  shift: TeamShift;
  employmentStatus: TeamEmploymentStatus;
  shiftStatus: TeamShiftStatus;
  lastPunch: string | null;
  permissions: DashboardFeatureKey[];
  isCurrentUser: boolean;
  accountRole: 'admin' | 'staff';
};

type TeamResponse = {
  canManage: boolean;
  members: TeamMember[];
};


const PAGE_SIZE = 6;

function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null);
  const [savingPermissionsFor, setSavingPermissionsFor] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'Todos' | TeamRole>('Todos');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'Recepcao' as TeamRole,
    shift: 'Manha' as TeamMember['shift'],
    permissions: [...DEFAULT_STAFF_FEATURES] as DashboardFeatureKey[],
  });
  const [permissionDraft, setPermissionDraft] = useState<Record<number, DashboardFeatureKey[]>>({});
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);

  async function loadTeam() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tenant/team', { cache: 'no-store' });
      const payload = (await response.json()) as TeamResponse & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? 'Nao foi possivel carregar a equipe.');
      }

      setTeam(payload.members);
      setCanManage(payload.canManage);
      setPermissionDraft(
        payload.members.reduce<Record<number, DashboardFeatureKey[]>>((acc, member) => {
          acc[member.id] = member.permissions;
          return acc;
        }, {}),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro inesperado ao carregar equipe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  const filteredTeam = useMemo(() => {
    return team.filter((member) => {
      const matchesRole = roleFilter === 'Todos' ? true : member.role === roleFilter;
      const term = search.trim().toLowerCase();
      const matchesSearch =
        term.length === 0 ||
        member.name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term) ||
        member.phone.toLowerCase().includes(term);

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, search, team]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filteredTeam.length / PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  const paginatedTeam = useMemo(
    () => filteredTeam.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTeam, page],
  );

  const summary = useMemo(() => {
    return {
      active: team.filter((member) => member.employmentStatus === 'ativo').length,
      onShift: team.filter((member) => member.shiftStatus === 'em_turno').length,
    };
  }, [team]);

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name || !form.email || !form.password || isAddingMember) {
      return;
    }

    setError(null);
    setIsAddingMember(true);

    try {
      const response = await fetch('/api/tenant/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          role: form.role,
          shift: form.shift,
          permissions: form.permissions,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? 'Nao foi possivel criar colaborador.');
        return;
      }

      setForm({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'Recepcao',
        shift: 'Manha',
        permissions: [...DEFAULT_STAFF_FEATURES],
      });
      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro de conexao ao criar colaborador.');
    } finally {
      setIsAddingMember(false);
    }
  }

  function togglePermission(permissions: DashboardFeatureKey[], key: DashboardFeatureKey) {
    if (permissions.includes(key)) {
      return permissions.filter((permission) => permission !== key);
    }

    return [...permissions, key];
  }

  async function runMemberAction(memberId: number, action: 'toggle-employment' | 'toggle-shift') {
    setBusyMemberId(memberId);
    setError(null);

    try {
      const response = await fetch(`/api/tenant/team/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? 'Falha ao atualizar colaborador.');
        return;
      }

      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro de conexao ao atualizar colaborador.');
    } finally {
      setBusyMemberId(null);
    }
  }

  async function savePermissions(memberId: number) {
    setSavingPermissionsFor(memberId);
    setError(null);

    try {
      const response = await fetch(`/api/tenant/team/${memberId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set-permissions',
          permissions: permissionDraft[memberId] ?? [],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? 'Nao foi possivel salvar permissoes.');
        return;
      }

      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro de conexao ao salvar permissoes.');
    } finally {
      setSavingPermissionsFor(null);
    }
  }

  async function deleteMember(member: TeamMember) {
    if (!canManage) {
      return;
    }

    setMemberToDelete(member);
  }

  async function confirmDeleteMember() {
    if (!memberToDelete) {
      return;
    }

    setBusyMemberId(memberToDelete.id);
    setError(null);

    try {
      const response = await fetch(`/api/tenant/team/${memberToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setError(payload.message ?? 'Nao foi possivel excluir colaborador.');
        return;
      }

      setMemberToDelete(null);
      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro de conexao ao excluir colaborador.');
    } finally {
      setBusyMemberId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Operacao interna</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">Gerenciamento de Equipe</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Controle real da equipe com cadastro de login interno (e-mail/senha), ativacao/inativacao, abertura e encerramento de turno, e permissoes por pagina do sistema.
        </p>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Colaboradores ativos</p>
          <p className="mt-2 text-3xl font-semibold">{summary.active}</p>
        </article>
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Em turno agora</p>
          <p className="mt-2 text-3xl font-semibold">{summary.onShift}</p>
        </article>
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Permissoes configuraveis</p>
          <p className="mt-2 text-3xl font-semibold">{TEAM_PERMISSION_OPTIONS.length}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <article className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-300 transition focus:ring"
            />
            <div className="flex flex-wrap gap-2">
              {(['Todos', ...TEAM_ROLE_OPTIONS] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={[
                    'whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition',
                    roleFilter === role
                      ? 'border-sky-300/40 bg-sky-500/10 text-sky-200'
                      : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20',
                  ].join(' ')}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {loading ? <p className="text-sm text-slate-400">Carregando equipe...</p> : null}
            {paginatedTeam.map((member) => (
              <div key={member.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-white">{member.name}</p>
                    <p className="text-sm text-slate-400">
                      {member.role} · Turno {member.shift}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{member.email}</p>
                    <p className="text-xs text-slate-500">{member.phone}</p>
                    <p className="text-xs text-slate-500">Conta: {member.accountRole === 'admin' ? 'Gestor' : 'Colaborador'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span
                      className={[
                        'rounded-full border px-2.5 py-1',
                        member.employmentStatus === 'ativo'
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-500/40 bg-slate-700/30 text-slate-300',
                      ].join(' ')}
                    >
                      {member.employmentStatus === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                    <span
                      className={[
                        'rounded-full border px-2.5 py-1',
                        member.shiftStatus === 'em_turno'
                          ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
                          : 'border-slate-500/40 bg-slate-700/30 text-slate-300',
                      ].join(' ')}
                    >
                      {member.shiftStatus === 'em_turno' ? 'Em turno' : 'Fora de turno'}
                    </span>
                    {member.isCurrentUser ? (
                      <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-2.5 py-1 text-sky-200">Voce</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
                    Ultima batida: {formatDateTime(member.lastPunch ?? undefined)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void runMemberAction(member.id, 'toggle-shift')}
                    disabled={!canManage || member.employmentStatus !== 'ativo' || busyMemberId === member.id}
                    className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {member.shiftStatus === 'fora' ? 'Iniciar turno' : 'Encerrar turno'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runMemberAction(member.id, 'toggle-employment')}
                    disabled={!canManage || member.isCurrentUser || busyMemberId === member.id}
                    className="rounded-xl border border-white/15 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {member.employmentStatus === 'ativo' ? 'Inativar colaborador' : 'Reativar colaborador'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMember(member)}
                    disabled={!canManage || member.isCurrentUser || member.accountRole === 'admin' || busyMemberId === member.id}
                    className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Excluir colaborador
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/40 p-3">
                  <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                    <ShieldCheck className="h-3.5 w-3.5" /> Permissoes no painel
                  </p>

                  <div className="grid gap-2 md:grid-cols-2">
                    {TEAM_PERMISSION_OPTIONS.map((option) => {
                      const checked = (permissionDraft[member.id] ?? []).includes(option.key);

                      return (
                        <label key={option.key} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canManage || member.accountRole === 'admin'}
                            onChange={() =>
                              setPermissionDraft((prev) => ({
                                ...prev,
                                [member.id]: togglePermission(prev[member.id] ?? [], option.key),
                              }))
                            }
                            className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950"
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {member.accountRole !== 'admin' ? (
                    <button
                      type="button"
                      onClick={() => void savePermissions(member.id)}
                      disabled={!canManage || savingPermissionsFor === member.id}
                      className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {savingPermissionsFor === member.id ? 'Salvando...' : 'Salvar permissoes'}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Gestor sempre enxerga todas as opcoes do sistema.</p>
                  )}
                </div>
              </div>
            ))}

            {!loading && filteredTeam.length === 0 ? <p className="text-sm text-slate-400">Nenhum colaborador encontrado.</p> : null}
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            totalItems={filteredTeam.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="-mx-6 mt-2 px-6"
          />
        </article>

        <article className="space-y-6">
          <form
            onSubmit={addMember}
            className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
          >
            <h3 className="text-xl font-semibold text-white">Novo colaborador</h3>
            <p className="mt-1 text-sm text-slate-400">Crie login interno com e-mail e senha para o colaborador acessar o sistema.</p>

            <div className="mt-4 grid gap-3">
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
                placeholder="Nome completo"
                className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
              />
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                placeholder="E-mail"
                className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
              />
              <input
                type="password"
                minLength={6}
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
                placeholder="Senha de acesso"
                className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
              />
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Telefone"
                className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as TeamRole }))}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
                >
                  <option value="Recepcao">Recepcao</option>
                  <option value="Limpeza">Limpeza</option>
                  <option value="Manutencao">Manutencao</option>
                  <option value="Gestao">Gestao</option>
                </select>
                <select
                  value={form.shift}
                  onChange={(event) => setForm((prev) => ({ ...prev, shift: event.target.value as TeamMember['shift'] }))}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-sky-300 transition focus:ring"
                >
                  {TEAM_SHIFT_OPTIONS.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Permissoes de acesso</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {TEAM_PERMISSION_OPTIONS.map((option) => {
                    const checked = form.permissions.includes(option.key);

                    return (
                      <label key={option.key} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              permissions: togglePermission(prev.permissions, option.key),
                            }))
                          }
                          className="h-3.5 w-3.5 rounded border-white/20 bg-slate-950"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canManage || isAddingMember}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-900/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> {isAddingMember ? 'Adicionando...' : 'Adicionar colaborador'}
            </button>

            {!canManage ? (
              <p className="mt-3 text-xs text-slate-500">Somente gestores podem criar colaboradores e editar permissoes.</p>
            ) : null}
          </form>
        </article>
      </section>

      <ConfirmDialog
        open={Boolean(memberToDelete)}
        title="Excluir colaborador"
        description={
          memberToDelete
            ? `Tem certeza que deseja excluir ${memberToDelete.name}? Esta acao nao pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir colaborador"
        cancelLabel="Manter colaborador"
        loading={memberToDelete ? busyMemberId === memberToDelete.id : false}
        onCancel={() => setMemberToDelete(null)}
        onConfirm={() => void confirmDeleteMember()}
      />
    </div>
  );
}
