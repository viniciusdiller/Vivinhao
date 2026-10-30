"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BedDouble,
  CalendarDays,
  CalendarClock,
  CalendarPlus2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  LogOut,
  Mail,
  MoonStar,
  Phone,
  Receipt,
  ScrollText,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createManualReservationAction } from "@/actions/reservation";
import { CalendarSkeleton } from "@/components/calendar-skeleton";
import { useToast } from "@/components/toast-provider";
import {
  addDays,
  cn,
  differenceInDays,
  formatCurrencyInput,
  formatDateLabel,
  parseCurrencyInput,
} from "@/lib/utils";
import type {
  OtaSource,
  Reservation,
  ReservationStatus,
  Room,
} from "@/types/domain";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarMetrics } from "@/components/calendar/CalendarMetrics";
import { CalendarControls } from "@/components/calendar/CalendarControls";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";

const OTA_STYLES: Record<OtaSource, string> = {
  booking: "bg-booking text-white",
  expedia: "bg-expedia text-slate-950",
  hotels_com: "bg-hotels text-white",
  manual: "bg-violet-600 text-white",
};

const OTA_LABELS: Record<OtaSource, string> = {
  booking: "Booking.com",
  expedia: "Expedia",
  hotels_com: "Hotels.com",
  manual: "Manual",
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: "Confirmada",
  pending: "Pendente",
  cancelled: "Cancelada",
  blocked: "Bloqueada",
};

const STATUS_STYLES: Record<ReservationStatus, string> = {
  confirmed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  pending: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  cancelled: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  blocked: "border-violet-400/20 bg-violet-400/10 text-violet-200",
};

const DAY_RANGE_OPTIONS = [7, 14, 21, 30] as const;
const DEFAULT_DAYS_VISIBLE = 14;

type ManualEntryForm = {
  roomId: string;
  checkIn: string;
  checkOut: string;
  entryType: "manual_reservation" | "blocked";
  amount: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCpf: string;
  notes: string;
};

type ReservationDraft = {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  otaSource: OtaSource;
  channelReference: string;
  amount: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCpf: string;
  notes: string;
};

function buildInitialManualForm(): ManualEntryForm {
  const today = new Date();
  const checkInDate = new Date(today);
  checkInDate.setHours(14, 0, 0, 0);
  const checkOutDate = addDays(checkInDate, 1);
  checkOutDate.setHours(12, 0, 0, 0);

  const toLocalInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  return {
    roomId: "",
    checkIn: toLocalInputValue(checkInDate),
    checkOut: toLocalInputValue(checkOutDate),
    entryType: "blocked",
    amount: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCpf: "",
    notes: "",
  };
}

function localInputValueToIso(value: string) {
  // "datetime-local" retorna a data/hora exatamente como o usuário digitou,
  // sem fuso. Usar `new Date(value).toISOString()` reinterpreta esse valor
  // como horário local do navegador e o converte para UTC, o que pode
  // empurrar o dia para o seguinte (ex.: 22h em UTC-3 vira 01h UTC do dia
  // seguinte). Anexar "Z" preserva o dia/hora exatos que o usuário escolheu.
  return `${value}:00.000Z`;
}

function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function createDraft(reservation: Reservation): ReservationDraft {
  return {
    id: reservation.id,
    roomId: reservation.roomId,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    status: reservation.status,
    otaSource: reservation.otaSource,
    channelReference: reservation.channelReference,
    amount: formatCurrencyInput(
      String(Math.round(reservation.amount * 100)),
      reservation.currency,
    ),
    currency: reservation.currency,
    customerName: reservation.customer.name,
    customerEmail: reservation.customer.email,
    customerPhone: reservation.customer.phone,
    customerCpf: reservation.customer.cpf ?? "",
    notes: reservation.notes,
  };
}

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
export function UnifiedCalendar({ tenantName }: { tenantName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manualForm, setManualForm] =
    useState<ManualEntryForm>(buildInitialManualForm);
  const [selectedReservationId, setSelectedReservationId] = useState<
    string | null
  >(null);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isUpdatingReservation, setIsUpdatingReservation] = useState(false);
  const [isDeletingReservation, setIsDeletingReservation] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [daysVisible, setDaysVisible] = useState<number>(DEFAULT_DAYS_VISIBLE);
  const [gridStart, setGridStart] = useState<Date>(getToday());
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const response = await fetch("/api/tenant/inventory");

        if (!response.ok) {
          throw new Error("Falha ao carregar inventário.");
        }

        const payload = (await response.json()) as {
          rooms?: Room[];
          reservations?: Reservation[];
        };

        setRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
        setReservations(
          Array.isArray(payload.reservations) ? payload.reservations : [],
        );
      } catch {
        setRooms([]);
        setReservations([]);
        showToast("Não foi possível carregar o calendário.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [showToast]);

  const visibleReservations = useMemo(
    () =>
      (Array.isArray(reservations) ? reservations : []).filter(
        (reservation) => reservation.status !== "cancelled",
      ),
    [reservations],
  );
  const days = useMemo(
    () =>
      Array.from({ length: daysVisible }, (_, index) =>
        addDays(gridStart, index),
      ),
    [daysVisible, gridStart],
  );
  const activeRooms = useMemo(
    () => rooms.filter((room) => room.status === "active"),
    [rooms],
  );
  // Reservas existem no banco pra qualquer data futura, mas a grade só
  // renderiza os dias em `days` — uma reserva cujo período não cruza a
  // janela visível simplesmente não aparece em lugar nenhum na tela, sem
  // aviso algum. Isso já causou confusão real (reserva criada com sucesso,
  // mas "sumida" do calendário só porque o check-in é além dos dias exibidos).
  const rangeEnd = useMemo(
    () => addDays(gridStart, daysVisible),
    [gridStart, daysVisible],
  );
  const outOfRangeReservations = useMemo(
    () =>
      visibleReservations.filter((reservation) => {
        const start = new Date(reservation.checkIn);
        const end = new Date(reservation.checkOut);
        return !(start < rangeEnd && end > gridStart);
      }),
    [visibleReservations, gridStart, rangeEnd],
  );
  const nextOutOfRangeReservation = useMemo(() => {
    const upcoming = outOfRangeReservations
      .filter((reservation) => new Date(reservation.checkIn) >= gridStart)
      .sort(
        (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
      );
    return upcoming[0] ?? outOfRangeReservations[0] ?? null;
  }, [outOfRangeReservations, gridStart]);
  const manualEntriesCount = useMemo(
    () =>
      visibleReservations.filter(
        (reservation) => reservation.otaSource === "manual",
      ).length,
    [visibleReservations],
  );
  const confirmedRevenue = useMemo(
    () =>
      visibleReservations
        .filter((reservation) => reservation.status !== "blocked")
        .reduce((sum, item) => sum + item.amount, 0),
    [visibleReservations],
  );
  const occupancy = useMemo(() => {
    const totalSlots = activeRooms.length * days.length;
    const rangeEnd = addDays(gridStart, days.length);
    const usedSlots = visibleReservations.reduce((sum, reservation) => {
      const start = new Date(reservation.checkIn);
      const end = new Date(reservation.checkOut);
      const visibleStart = start > gridStart ? start : gridStart;
      const visibleEnd = end < rangeEnd ? end : rangeEnd;

      if (visibleEnd <= visibleStart) {
        return sum;
      }

      return sum + differenceInDays(visibleStart, visibleEnd);
    }, 0);

    return totalSlots
      ? Math.min(100, Math.round((usedSlots / totalSlots) * 100))
      : 0;
  }, [activeRooms.length, days.length, gridStart, visibleReservations]);

  const selectedReservation = useMemo(
    () =>
      reservations.find(
        (reservation) => reservation.id === selectedReservationId,
      ) ?? null,
    [reservations, selectedReservationId],
  );

  useEffect(() => {
    if (!manualForm.roomId && activeRooms[0]) {
      setManualForm((current) => ({
        ...current,
        roomId: activeRooms[0].id,
      }));
    }
  }, [activeRooms, manualForm.roomId]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  function openManualEntryModal(roomId?: string, date?: Date) {
    const selectedRoomId = activeRooms.some((room) => room.id === roomId)
      ? (roomId ?? "")
      : (activeRooms[0]?.id ?? "");
    const defaults = buildInitialManualForm();
    const checkIn = date
      ? `${date.toISOString().slice(0, 10)}T14:00`
      : defaults.checkIn;
    const checkOut = date
      ? `${addDays(date, 1).toISOString().slice(0, 10)}T12:00`
      : defaults.checkOut;

    setManualForm({
      roomId: selectedRoomId,
      checkIn,
      checkOut,
      entryType: "blocked",
      amount: "",
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      guestCpf: "",
      notes: "",
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeManualEntryModal() {
    setIsModalOpen(false);
    setFormError(null);
  }

  function openReservationDrawer(reservation: Reservation) {
    setSelectedReservationId(reservation.id);
    setDraft(createDraft(reservation));
    setDrawerError(null);
  }

  function closeReservationDrawer() {
    setSelectedReservationId(null);
    setDraft(null);
    setDrawerError(null);
    setIsDeleteConfirmOpen(false);
  }

  async function handleManualEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (manualForm.entryType === "blocked") {
      if (!manualForm.roomId || !manualForm.checkIn || !manualForm.checkOut) {
        setFormError("Preencha quarto e período para continuar.");
        return;
      }
    } else {
      if (
        !manualForm.roomId ||
        !manualForm.checkIn ||
        !manualForm.checkOut ||
        !manualForm.guestName ||
        !manualForm.guestEmail ||
        !manualForm.guestPhone ||
        !manualForm.guestCpf ||
        !manualForm.amount ||
        !manualForm.notes
      ) {
        setFormError("Na reserva manual, todos os campos são obrigatórios.");
        return;
      }
    }

    if (manualForm.checkOut <= manualForm.checkIn) {
      setFormError("A data de check-out precisa ser posterior ao check-in.");
      return;
    }

    setIsSaving(true);

    try {
      const amount = parseCurrencyInput(manualForm.amount || "0");
      if (manualForm.entryType === "manual_reservation" && amount <= 0) {
        setFormError("Informe um valor total maior que zero.");
        return;
      }

      const createdReservation = await createManualReservationAction({
        roomId: manualForm.roomId,
        checkIn: localInputValueToIso(manualForm.checkIn),
        checkOut: localInputValueToIso(manualForm.checkOut),
        entryType: manualForm.entryType,
        amount,
        guestName: manualForm.guestName,
        guestEmail: manualForm.guestEmail,
        guestPhone: manualForm.guestPhone,
        guestCpf: manualForm.guestCpf,
        notes: manualForm.notes,
      });
      setReservations((current) => [...current, createdReservation]);
      setIsModalOpen(false);
      showToast("Lançamento manual criado com sucesso.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o lançamento.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReservationUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft) {
      return;
    }

    if (
      !draft.customerName ||
      !draft.checkIn ||
      !draft.checkOut ||
      !draft.currency
    ) {
      setDrawerError("Preencha os campos obrigatórios do formulário.");
      return;
    }

    if (draft.checkOut <= draft.checkIn) {
      setDrawerError("A data de check-out precisa ser posterior ao check-in.");
      return;
    }

    const amount = parseCurrencyInput(draft.amount);

    if (Number.isNaN(amount) || amount < 0) {
      setDrawerError("Informe um valor numérico válido para a reserva.");
      return;
    }

    setDrawerError(null);
    setIsUpdatingReservation(true);

    try {
      const updatedReservation: Reservation = {
        id: draft.id,
        roomId: draft.roomId,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        status: draft.status,
        otaSource: draft.otaSource,
        channelReference: draft.channelReference,
        amount,
        currency: draft.currency,
        customer: {
          name: draft.customerName,
          email: draft.customerEmail,
          phone: draft.customerPhone,
          cpf: draft.customerCpf || undefined,
        },
        notes: draft.notes,
      };

      const saveResponse = await fetch("/api/tenant/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation: updatedReservation }),
      });

      if (!saveResponse.ok) {
        throw new Error("Falha ao atualizar reserva.");
      }

      const { reservation: savedReservation } = (await saveResponse.json()) as {
        reservation: Reservation;
      };
      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === savedReservation.id
            ? savedReservation
            : reservation,
        ),
      );
      if (savedReservation.status === "cancelled") {
        closeReservationDrawer();
        showToast("Reserva cancelada e removida da grade do calendário.");
        return;
      }

      setDraft(createDraft(savedReservation));
      showToast("Reserva atualizada com sucesso.");
    } catch (error) {
      setDrawerError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a reserva.",
      );
    } finally {
      setIsUpdatingReservation(false);
    }
  }

  function openDeleteConfirm() {
    setIsDeleteConfirmOpen(true);
  }

  function closeDeleteConfirm() {
    if (!isDeletingReservation) {
      setIsDeleteConfirmOpen(false);
    }
  }

  async function handleReservationDelete() {
    if (!selectedReservation) {
      return;
    }

    setDrawerError(null);
    setIsDeletingReservation(true);

    try {
      const deleteResponse = await fetch("/api/tenant/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: selectedReservation.id }),
      });

      if (!deleteResponse.ok) {
        const payload = (await deleteResponse.json()) as { message?: string };
        throw new Error(payload.message || "Falha ao excluir reserva.");
      }

      setReservations((current) =>
        current.filter((reservation) => reservation.id !== selectedReservation.id),
      );
      setIsDeleteConfirmOpen(false);
      closeReservationDrawer();
      showToast("Reserva excluída com sucesso.");
    } catch (error) {
      setDrawerError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a reserva.",
      );
    } finally {
      setIsDeletingReservation(false);
    }
  }

  function shiftTimeline(direction: "previous" | "next") {
    setGridStart((current) => addDays(current, direction === "next" ? 7 : -7));
  }

  if (loading) {
    return <CalendarSkeleton />;
  }

  return (
    <>
      <div className="space-y-6">
        <CalendarHeader
          tenantName={tenantName}
          onNewEntry={() => openManualEntryModal()}
          onLogout={handleLogout}
        />

        <CalendarMetrics
          activeRoomsCount={activeRooms.length}
          manualEntriesCount={manualEntriesCount}
          confirmedRevenue={confirmedRevenue}
          occupancy={occupancy}
          daysCount={days.length}
        />

        <section className="rounded-[30px] border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20">
          <CalendarControls
            days={days}
            gridStart={gridStart}
            daysVisible={daysVisible}
            DAY_RANGE_OPTIONS={DAY_RANGE_OPTIONS}
            onShiftTimeline={shiftTimeline}
            onSetGridStart={setGridStart}
            onSetDaysVisible={setDaysVisible}
          />

          {outOfRangeReservations.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              <span>
                {outOfRangeReservations.length}{" "}
                {outOfRangeReservations.length === 1
                  ? "reserva não aparece"
                  : "reservas não aparecem"}{" "}
                na grade abaixo porque o período dela está fora dos dias
                exibidos no momento.
              </span>
              {nextOutOfRangeReservation && (
                <button
                  type="button"
                  onClick={() =>
                    setGridStart(
                      addDays(new Date(nextOutOfRangeReservation.checkIn), -2),
                    )
                  }
                  className="rounded-xl border border-amber-400/30 px-3 py-1.5 font-medium text-amber-100 transition hover:border-amber-400/50"
                >
                  Ver reserva de{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }).format(new Date(nextOutOfRangeReservation.checkIn))}
                </button>
              )}
            </div>
          )}

          <CalendarGrid
            rooms={activeRooms}
            days={days}
            visibleReservations={visibleReservations}
            gridStart={gridStart}
            daysVisible={daysVisible}
            onOpenManualEntry={openManualEntryModal}
            onOpenReservation={openReservationDrawer}
          />
        </section>
      </div>

      {/* Seus modais <AnimatePresence> de Formulário e Drawer de Edição continuam aqui embaixo intocados! */}
      <AnimatePresence>
        {isModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
                    Lançamento manual
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">
                    Adicionar reserva ou bloqueio
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Registre períodos ocupados, manutenção ou reservas criadas
                    diretamente pela sua equipe.
                  </p>
                </div>
                <button
                  onClick={closeManualEntryModal}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleManualEntrySubmit}
                className="mt-8 space-y-5"
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Quarto
                    </span>
                    <select
                      value={manualForm.roomId}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          roomId: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    >
                      {activeRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Tipo
                    </span>
                    <select
                      value={manualForm.entryType}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          entryType: event.target
                            .value as ManualEntryForm["entryType"],
                        }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="manual_reservation">Reserva manual</option>
                      <option value="blocked">Bloqueio operacional</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Check-in
                    </span>
                    <input
                      type="datetime-local"
                      value={manualForm.checkIn}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          checkIn: event.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Check-out
                    </span>
                    <input
                      type="datetime-local"
                      value={manualForm.checkOut}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          checkOut: event.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Nome do hóspede
                    </span>
                    <input
                      type="text"
                      value={manualForm.guestName}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          guestName: event.target.value,
                        }))
                      }
                      required={manualForm.entryType === "manual_reservation"}
                      placeholder="Ex.: Marina Carvalho"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Valor total
                    </span>
                    <input
                      type="text"
                      value={manualForm.amount}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          amount: formatCurrencyInput(event.target.value),
                        }))
                      }
                      required={manualForm.entryType === "manual_reservation"}
                      placeholder="Ex.: R$ 1.280,00"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      E-mail
                    </span>
                    <input
                      type="email"
                      value={manualForm.guestEmail}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          guestEmail: event.target.value,
                        }))
                      }
                      required={manualForm.entryType === "manual_reservation"}
                      placeholder="Ex.: marina@email.com"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Telefone
                    </span>
                    <input
                      type="text"
                      value={manualForm.guestPhone}
                      onChange={(event) =>
                        setManualForm((current) => ({
                          ...current,
                          guestPhone: event.target.value,
                        }))
                      }
                      required={manualForm.entryType === "manual_reservation"}
                      placeholder="Ex.: +55 81 99999-9999"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    CPF
                  </span>
                  <input
                    type="text"
                    value={manualForm.guestCpf}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        guestCpf: event.target.value,
                      }))
                    }
                    required={manualForm.entryType === "manual_reservation"}
                    placeholder="Ex.: 123.456.789-10"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Observações
                  </span>
                  <input
                    type="text"
                    value={manualForm.notes}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    required={manualForm.entryType === "manual_reservation"}
                    placeholder="Ex.: Chegada prevista para 15h30."
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </label>

                {formError ? (
                  <p className="text-sm text-rose-300">{formError}</p>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeManualEntryModal}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSaving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedReservation && draft ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeReservationDrawer}
              className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-slate-900 p-6 shadow-2xl shadow-slate-950/40"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
                    Moderação de reserva
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">
                    {selectedReservation.customer.name}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        STATUS_STYLES[selectedReservation.status],
                      )}
                    >
                      {STATUS_LABELS[selectedReservation.status]}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
                      {OTA_LABELS[selectedReservation.otaSource]}
                    </span>
                  </div>
                </div>
                <button
                  onClick={closeReservationDrawer}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  {
                    label: "Estadia",
                    value: `${formatLongDate(selectedReservation.checkIn)} → ${formatLongDate(selectedReservation.checkOut)}`,
                    icon: CalendarClock,
                  },
                  {
                    label: "Valor",
                    value: formatCurrency(
                      selectedReservation.amount,
                      selectedReservation.currency,
                    ),
                    icon: Receipt,
                  },
                  {
                    label: "Contato",
                    value:
                      selectedReservation.customer.email ||
                      "Sem email informado",
                    icon: Mail,
                  },
                  {
                    label: "Telefone",
                    value:
                      selectedReservation.customer.phone ||
                      "Sem telefone informado",
                    icon: Phone,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-center gap-3 text-slate-300">
                        <div className="rounded-2xl border border-white/10 bg-slate-900 p-3">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                            {item.label}
                          </p>
                          <p className="mt-2 text-sm font-medium text-white">
                            {item.value}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleReservationUpdate}
                className="mt-6 space-y-5"
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                      <UserRound className="h-4 w-4 text-sky-300" />
                      Nome do hóspede
                    </span>
                    <input
                      type="text"
                      value={draft.customerName}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, customerName: event.target.value }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                      <Mail className="h-4 w-4 text-sky-300" />
                      Email
                    </span>
                    <input
                      type="email"
                      value={draft.customerEmail}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, customerEmail: event.target.value }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                      <Phone className="h-4 w-4 text-sky-300" />
                      Telefone
                    </span>
                    <input
                      type="text"
                      value={draft.customerPhone}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, customerPhone: event.target.value }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      CPF
                    </span>
                    <input
                      type="text"
                      value={draft.customerCpf}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, customerCpf: event.target.value }
                            : current,
                        )
                      }
                      placeholder="Ex.: 123.456.789-10"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Status
                    </span>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                status: event.target.value as ReservationStatus,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Check-in
                    </span>
                    <input
                      type="date"
                      value={draft.checkIn}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, checkIn: event.target.value }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Check-out
                    </span>
                    <input
                      type="date"
                      value={draft.checkOut}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, checkOut: event.target.value }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-[1fr_160px]">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Valor
                    </span>
                    <input
                      type="text"
                      value={draft.amount}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                amount: formatCurrencyInput(
                                  event.target.value,
                                  current.currency,
                                ),
                              }
                            : current,
                        )
                      }
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      Moeda
                    </span>
                    <input
                      type="text"
                      value={draft.currency}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                currency: event.target.value.toUpperCase(),
                                amount: formatCurrencyInput(
                                  current.amount,
                                  event.target.value.toUpperCase() || "BRL",
                                ),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm uppercase text-white outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    Referência do canal
                  </span>
                  <input
                    type="text"
                    value={draft.channelReference}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, channelReference: event.target.value }
                          : current,
                      )
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                    <ScrollText className="h-4 w-4 text-sky-300" />
                    Observações
                  </span>
                  <textarea
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, notes: event.target.value }
                          : current,
                      )
                    }
                    rows={5}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  />
                </label>

                {drawerError ? (
                  <p className="text-sm text-rose-300">{drawerError}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    Moderação inline
                  </div>
                  <div className="flex w-full flex-wrap justify-end gap-3 sm:w-auto">
                    <button
                      type="button"
                      onClick={openDeleteConfirm}
                      disabled={isDeletingReservation || isUpdatingReservation}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isDeletingReservation ? "Excluindo..." : "Excluir reserva"}
                    </button>
                    <button
                      type="button"
                      onClick={closeReservationDrawer}
                      disabled={isDeletingReservation}
                      className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-100"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingReservation || isDeletingReservation}
                      className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-950/30 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isUpdatingReservation
                        ? "Salvando..."
                        : "Salvar alterações"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.aside>

            <AnimatePresence>
              {isDeleteConfirmOpen ? (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm"
                    onClick={closeDeleteConfirm}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    className="fixed inset-0 z-[61] flex items-center justify-center p-4"
                  >
                    <div className="w-full max-w-md rounded-[28px] border border-rose-400/30 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-300">
                          <CircleAlert className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-white">
                            Excluir reserva?
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            Esta ação remove a reserva de forma permanente do calendário e não pode ser desfeita.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={closeDeleteConfirm}
                          disabled={isDeletingReservation}
                          className="rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-100 disabled:opacity-60"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleReservationDelete}
                          disabled={isDeletingReservation}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/40 disabled:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" />
                          {isDeletingReservation ? "Excluindo..." : "Confirmar exclusão"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
