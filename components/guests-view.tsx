'use client';

import { useState } from 'react';
import { ArrowLeftRight, CalendarRange, ContactRound, Hotel, Mail, Phone, ReceiptText, ShieldCheck, X } from 'lucide-react';
import type { Room } from '@/types/domain';

export type GuestRecord = {
  id: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  otaSource: 'booking' | 'expedia' | 'hotels_com' | 'manual';
  channelReference: string;
  amount: number;
  currency: string;
  customer: { name: string; email: string; phone: string };
  notes: string;
};

function formatCurrency(value: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function getReservationStatusLabel(status: 'confirmed' | 'pending' | 'cancelled') {
  if (status === 'confirmed') return 'Confirmada';
  if (status === 'pending') return 'Pendente';
  return 'Cancelada';
}

function getReservationStatusClasses(status: 'confirmed' | 'pending' | 'cancelled') {
  if (status === 'confirmed') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  if (status === 'pending') return 'border-amber-400/25 bg-amber-500/10 text-amber-200';
  return 'border-rose-400/25 bg-rose-500/10 text-rose-200';
}

function getSourceLabel(source: 'booking' | 'expedia' | 'hotels_com' | 'manual') {
  if (source === 'hotels_com') return 'Hotels.com';
  if (source === 'manual') return 'Manual';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function isInHouse(record: GuestRecord): boolean {
  const today = new Date().toISOString().substring(0, 10);
  return record.status === 'confirmed' && record.checkIn <= today && record.checkOut > today;
}

export default function GuestsView({
  guestHistory,
  rooms,
}: {
  guestHistory: GuestRecord[];
  rooms: Room[];
}) {
  const [records, setRecords] = useState<GuestRecord[]>(guestHistory);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  const totalRecords = records.length;
  const confirmedRecords = records.filter((r) => r.status === 'confirmed').length;
  const pendingRecords = records.filter((r) => r.status === 'pending').length;
  const cancelledRecords = records.filter((r) => r.status === 'cancelled').length;

  function openTransfer(record: GuestRecord) {
    const firstOther = rooms.find((r) => r.id !== record.roomId);
    setSelectedRoomId(firstOther?.id ?? '');
    setTransferTargetId(record.id);
    setTransferError('');
  }

  async function handleTransfer(record: GuestRecord) {
    if (!selectedRoomId || selectedRoomId === record.roomId) return;

    setTransferring(true);
    setTransferError('');

    try {
      const response = await fetch('/api/tenant/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation: {
            id: record.id,
            roomId: selectedRoomId,
            checkIn: record.checkIn,
            checkOut: record.checkOut,
            status: record.status,
            otaSource: record.otaSource,
            channelReference: record.channelReference,
            amount: record.amount,
            currency: record.currency,
            customer: record.customer,
            notes: record.notes,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message ?? 'Falha ao alterar quarto.');
      }

      const newRoomName = rooms.find((r) => r.id === selectedRoomId)?.name ?? selectedRoomId;
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, roomId: selectedRoomId, roomName: newRoomName } : r)),
      );
      setTransferTargetId(null);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Erro ao alterar quarto.');
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Relacionamento com hóspedes</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Histórico de hóspedes</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Consulta completa das reservas com dados do hóspede, contato, quarto, canal de venda, período de hospedagem e observações operacionais.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {totalRecords} registro{totalRecords === 1 ? '' : 's'} disponível{totalRecords === 1 ? '' : 'eis'}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[24px] border border-white/10 bg-slate-900/80 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Total no histórico</p>
          <p className="mt-3 text-3xl font-semibold text-white">{totalRecords}</p>
        </article>
        <article className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">Confirmadas</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-50">{confirmedRecords}</p>
        </article>
        <article className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-200">Pendentes</p>
          <p className="mt-3 text-3xl font-semibold text-amber-50">{pendingRecords}</p>
        </article>
        <article className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-rose-200">Canceladas</p>
          <p className="mt-3 text-3xl font-semibold text-rose-50">{cancelledRecords}</p>
        </article>
      </section>

      <section className="space-y-4">
        {records.length ? (
          records.map((reservation) => {
            const inHouse = isInHouse(reservation);
            const isTransferring = transferTargetId === reservation.id;

            return (
              <article
                key={reservation.id}
                className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300">
                        <ContactRound className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-white">{reservation.customer.name}</h3>
                        <p className="text-sm text-slate-400">Reserva {reservation.channelReference}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getReservationStatusClasses(reservation.status)}`}
                      >
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                      {inHouse && (
                        <span className="inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                          Hospedado agora
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Contato</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-200">
                          <p className="inline-flex items-center gap-2">
                            <Mail className="h-4 w-4 text-sky-300" />
                            {reservation.customer.email || 'Não informado'}
                          </p>
                          <p className="inline-flex items-center gap-2">
                            <Phone className="h-4 w-4 text-sky-300" />
                            {reservation.customer.phone || 'Não informado'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Hospedagem</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-200">
                          <p className="inline-flex items-center gap-2">
                            <Hotel className="h-4 w-4 text-sky-300" />
                            {reservation.roomName}
                          </p>
                          <p className="inline-flex items-center gap-2">
                            <CalendarRange className="h-4 w-4 text-sky-300" />
                            {formatLongDate(reservation.checkIn)} até {formatLongDate(reservation.checkOut)}
                          </p>
                          <p className="text-slate-400">
                            {reservation.nights} diária{reservation.nights === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Comercial</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-200">
                          <p className="inline-flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-sky-300" />
                            Canal: {getSourceLabel(reservation.otaSource)}
                          </p>
                          <p className="inline-flex items-center gap-2">
                            <ReceiptText className="h-4 w-4 text-sky-300" />
                            Valor: {formatCurrency(reservation.amount, reservation.currency)}
                          </p>
                          <p className="text-slate-400">ID da reserva: {reservation.id}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {inHouse && (
                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() => (isTransferring ? setTransferTargetId(null) : openTransfer(reservation))}
                        className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
                      >
                        {isTransferring ? (
                          <>
                            <X className="h-4 w-4" /> Cancelar
                          </>
                        ) : (
                          <>
                            <ArrowLeftRight className="h-4 w-4" /> Trocar quarto
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Observações</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {reservation.notes || 'Sem observações registradas para esta hospedagem.'}
                  </p>
                </div>

                {isTransferring && (
                  <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                    <p className="text-sm font-medium text-amber-200">Selecionar novo quarto</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Quarto atual: <span className="text-white">{reservation.roomName}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <select
                        value={selectedRoomId}
                        onChange={(e) => setSelectedRoomId(e.target.value)}
                        className="cursor-pointer rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none ring-sky-300 transition focus:ring"
                      >
                        {rooms
                          .filter((r) => r.id !== reservation.roomId)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={transferring || !selectedRoomId}
                        onClick={() => handleTransfer(reservation)}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 transition hover:bg-emerald-500/20"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                        {transferring ? 'Transferindo...' : 'Confirmar troca'}
                      </button>
                    </div>
                    {transferError && (
                      <p className="mt-2 text-xs text-rose-300">{transferError}</p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-10 text-center text-slate-400 shadow-2xl shadow-slate-950/20">
            Nenhum hóspede foi registrado até o momento.
          </section>
        )}
      </section>
    </div>
  );
}
