'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, DoorOpen, Search, UserRoundPlus } from 'lucide-react';
import { Pagination } from '@/components/pagination';

const PAGE_SIZE = 8;

type StayStatus = 'reserved' | 'checked_in' | 'checked_out';

type RoomSummary = {
  localRoomId: string;
  name: string;
};

type ReservationApiItem = {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'blocked';
  channelReference: string;
  amount: number;
  currency: string;
  notes: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  room?: RoomSummary;
};

type Stay = {
  id: string;
  guestName: string;
  document: string;
  room: string;
  peopleCount: number;
  checkInDate: string;
  checkOutDate: string;
  status: StayStatus;
  notes: string;
  checkedInAt?: string;
  checkedOutAt?: string;
};

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`));
}

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

function statusBadge(status: StayStatus) {
  if (status === 'checked_in') {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25';
  }

  if (status === 'checked_out') {
    return 'bg-slate-600/30 text-slate-200 border-slate-400/30';
  }

  return 'bg-sky-500/10 text-sky-300 border-sky-400/30';
}

function statusLabel(status: StayStatus) {
  if (status === 'checked_in') {
    return 'Hospedado';
  }

  if (status === 'checked_out') {
    return 'Checkout finalizado';
  }

  return 'Reserva confirmada';
}

function deriveStayStatus(reservation: ReservationApiItem): StayStatus {
  if (reservation.status === 'cancelled') {
    return 'checked_out';
  }

  if (reservation.checkedOutAt) {
    return 'checked_out';
  }

  if (reservation.checkedInAt) {
    return 'checked_in';
  }

  return 'reserved';
}

function mapReservationToStay(reservation: ReservationApiItem, roomNameById: Map<string, string>): Stay {
  return {
    id: reservation.id,
    guestName: reservation.customer?.name?.trim() || 'Hóspede sem nome',
    document: reservation.channelReference || reservation.customer?.phone || 'Não informado',
    room: roomNameById.get(reservation.roomId) ?? reservation.room?.name ?? reservation.roomId,
    peopleCount: 1,
    checkInDate: reservation.checkIn.slice(0, 10),
    checkOutDate: reservation.checkOut.slice(0, 10),
    status: deriveStayStatus(reservation),
    notes: reservation.notes || 'Reserva registrada no banco de dados.',
    checkedInAt: reservation.checkedInAt ?? undefined,
    checkedOutAt: reservation.checkedOutAt ?? undefined,
  };
}

export default function CheckPage() {
  const [stays, setStays] = useState<Stay[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | StayStatus>('all');
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<{ id: number; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => toLocalDateKey(new Date()));
  const [processingStayId, setProcessingStayId] = useState<string | null>(null);
  const nextLogIdRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentKey = toLocalDateKey(new Date());
      setTodayKey((prev) => (prev === currentKey ? prev : currentKey));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [reservationsResponse, roomsResponse] = await Promise.all([
          fetch('/api/tenant/reservations'),
          fetch('/api/tenant/rooms'),
        ]);

        if (!reservationsResponse.ok) {
          throw new Error('Falha ao carregar reservas do banco.');
        }

        if (!roomsResponse.ok) {
          throw new Error('Falha ao carregar quartos do banco.');
        }

        const reservations = (await reservationsResponse.json()) as ReservationApiItem[];
        const rooms = (await roomsResponse.json()) as Array<RoomSummary & { id?: string }>;
        const roomNameById = new Map(
          rooms.map((room) => [room.localRoomId ?? room.id ?? '', room.name]),
        );

        if (!cancelled) {
          setStays(reservations.map((reservation) => mapReservationToStay(reservation, roomNameById)));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as reservas.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStays = useMemo(() => {
    return stays.filter((stay) => {
      const matchesFilter = filter === 'all' ? true : stay.status === filter;
      const term = search.trim().toLowerCase();
      const matchesSearch =
        term.length === 0 ||
        stay.guestName.toLowerCase().includes(term) ||
        stay.room.toLowerCase().includes(term) ||
        stay.document.toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [filter, search, stays]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const pageCount = Math.max(1, Math.ceil(filteredStays.length / PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  const paginatedStays = useMemo(
    () => filteredStays.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredStays, page],
  );

  const totals = useMemo(() => {
    return {
      arrivals: stays.filter((stay) => stay.status === 'reserved').length,
      inHouse: stays.filter((stay) => stay.status === 'checked_in').length,
      departuresDone: stays.filter((stay) => stay.status === 'checked_out').length,
    };
  }, [stays]);

  function canCheckInToday(stay: Stay) {
    return stay.status === 'reserved' && stay.checkInDate === todayKey;
  }

  function canCheckOutToday(stay: Stay) {
    return stay.status === 'checked_in' && stay.checkOutDate === todayKey;
  }

  function pushLog(message: string) {
    const time = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());

    const id = nextLogIdRef.current++;
    setLogs((prev) => [{ id, text: `${time} - ${message}` }, ...prev].slice(0, 8));
  }

  async function handleCheckIn(stayId: string) {
    if (processingStayId) {
      return;
    }

    const current = stays.find((stay) => stay.id === stayId);
    if (!current || current.status !== 'reserved') {
      return;
    }

    if (current.checkInDate !== todayKey) {
      pushLog(`Check-in bloqueado para ${current.guestName}. Permitido somente no dia ${formatShortDate(current.checkInDate)}.`);
      return;
    }

    setProcessingStayId(stayId);
    try {
      const response = await fetch(`/api/tenant/reservations/${stayId}/check-in`, { method: 'POST' });
      const payload = (await response.json()) as { reservation?: { checkedInAt?: string }; message?: string };

      if (!response.ok) {
        throw new Error(payload.message || 'Falha ao registrar check-in.');
      }

      const checkedInAt = payload.reservation?.checkedInAt ?? new Date().toISOString();
      setStays((prev) => prev.map((stay) => (stay.id === stayId ? { ...stay, status: 'checked_in', checkedInAt } : stay)));
      pushLog(`Check-in realizado para ${current.guestName} no quarto ${current.room}.`);
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Falha ao registrar check-in.');
    } finally {
      setProcessingStayId(null);
    }
  }

  async function handleCheckOut(stayId: string) {
    if (processingStayId) {
      return;
    }

    const current = stays.find((stay) => stay.id === stayId);
    if (!current || current.status !== 'checked_in') {
      return;
    }

    if (current.checkOutDate !== todayKey) {
      pushLog(
        `Checkout bloqueado para ${current.guestName}. Permitido somente no último dia da reserva (${formatShortDate(current.checkOutDate)}).`,
      );
      return;
    }

    setProcessingStayId(stayId);
    try {
      const response = await fetch(`/api/tenant/reservations/${stayId}/check-out`, { method: 'POST' });
      const payload = (await response.json()) as { reservation?: { checkedOutAt?: string }; message?: string };

      if (!response.ok) {
        throw new Error(payload.message || 'Falha ao registrar check-out.');
      }

      const checkedOutAt = payload.reservation?.checkedOutAt ?? new Date().toISOString();
      setStays((prev) => prev.map((stay) => (stay.id === stayId ? { ...stay, status: 'checked_out', checkedOutAt } : stay)));
      pushLog(`Checkout finalizado para ${current.guestName} no quarto ${current.room}.`);
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Falha ao registrar check-out.');
    } finally {
      setProcessingStayId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Recepção</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Check-in e Check-out</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              A lista agora vem do banco de dados do tenant. A criação de novas reservas foi movida para a aba Reserva.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            Operação conectada às reservas existentes.
          </div>
        </div>
        {loadError ? (
          <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Chegadas pendentes</p>
          <p className="mt-2 text-3xl font-semibold">{totals.arrivals}</p>
        </article>
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Hóspedes na casa</p>
          <p className="mt-2 text-3xl font-semibold">{totals.inHouse}</p>
        </article>
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5 text-white">
          <p className="text-sm text-slate-400">Saídas concluídas</p>
          <p className="mt-2 text-3xl font-semibold">{totals.departuresDone}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
        <article className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-4">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por hóspede, quarto ou documento"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none ring-sky-300 transition focus:ring"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'Todos' },
                { value: 'reserved', label: 'Reservas' },
                { value: 'checked_in', label: 'Hospedados' },
                { value: 'checked_out', label: 'Finalizados' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value as 'all' | StayStatus)}
                  className={[
                    'whitespace-nowrap rounded-xl border px-3 py-2 text-sm transition',
                    filter === item.value
                      ? 'border-sky-300/40 bg-sky-500/10 text-sky-200'
                      : 'border-white/10 bg-slate-950/50 text-slate-300 hover:border-white/20',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-slate-950/60 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Hóspede</th>
                    <th className="px-4 py-3 font-medium">Período</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-slate-900/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                        Carregando reservas do banco...
                      </td>
                    </tr>
                  ) : paginatedStays.length ? (
                    paginatedStays.map((stay) => (
                      <tr key={stay.id} className="transition-colors hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{stay.guestName}</p>
                          <p className="text-xs text-slate-400">
                            {stay.room} · {stay.peopleCount} pessoa(s)
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {formatShortDate(stay.checkInDate)} - {formatShortDate(stay.checkOutDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusBadge(stay.status)}`}>
                            {statusLabel(stay.status)}
                          </span>
                          <p className="mt-1 text-xs text-slate-500">
                            In: {formatDateTime(stay.checkedInAt)} · Out: {formatDateTime(stay.checkedOutAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!canCheckInToday(stay) || processingStayId !== null}
                              onClick={() => handleCheckIn(stay.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <DoorOpen className="h-3.5 w-3.5" /> Check-in
                            </button>
                            <button
                              type="button"
                              disabled={!canCheckOutToday(stay) || processingStayId !== null}
                              onClick={() => handleCheckOut(stay.id)}
                              className="inline-flex items-center gap-1 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" /> Check-out
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {stay.status === 'reserved'
                              ? canCheckInToday(stay)
                                ? 'Check-in liberado hoje.'
                                : `Check-in somente em ${formatShortDate(stay.checkInDate)}.`
                              : stay.status === 'checked_in'
                                ? canCheckOutToday(stay)
                                  ? 'Check-out liberado hoje.'
                                  : `Checkout permitido apenas em ${formatShortDate(stay.checkOutDate)}.`
                                : 'Reserva já finalizada.'}
                          </p>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                        Nenhuma reserva encontrada com o filtro atual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageCount={pageCount}
              totalItems={filteredStays.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </article>

        <article className="space-y-6">
          <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
            <h3 className="text-xl font-semibold text-white">Nova reserva</h3>
            <p className="mt-1 text-sm text-slate-400">A criação real agora fica na aba Reserva, com gravação no banco.</p>

            <Link
              href="/dashboard/reservations"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-900/30"
            >
              <UserRoundPlus className="h-4 w-4" /> Abrir aba Reserva
            </Link>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
            <h3 className="text-xl font-semibold text-white">Log de operação</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              {logs.length ? (
                logs.map((log) => (
                  <p key={log.id} className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2">
                    {log.text}
                  </p>
                ))
              ) : (
                <p className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-slate-400">
                  Nenhuma ação executada ainda. Faça um check-in, checkout ou abra a aba Reserva.
                </p>
              )}
            </div>
          </section>
        </article>
      </section>
    </div>
  );
}