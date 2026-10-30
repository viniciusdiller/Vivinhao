"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Lock, LockOpen, RefreshCw, Tag, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { addDays, cn, formatCurrencyInput, parseCurrencyInput } from "@/lib/utils";
import { getRoomEffectivePrice } from "@/lib/room-policies";
import type { Reservation, Room, RoomMinimumStayPeriod, RoomSeasonalRate } from "@/types/domain";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toMonthDay(dateInput: string) {
  if (typeof dateInput !== "string" || dateInput.length < 10) {
    return "";
  }

  return dateInput.slice(5, 10);
}

function overlapsRange(
  checkIn: string,
  checkOut: string,
  startDate: string,
  endDate: string,
) {
  const start = parseDateOnly(startDate);
  const endExclusive = addDays(parseDateOnly(endDate), 1);
  const reservationStart = new Date(checkIn);
  const reservationEnd = new Date(checkOut);

  return reservationStart < endExclusive && reservationEnd > start;
}

// checkOut é NOT NULL no banco, então "sem data de término" não existe como
// null — usamos uma data-sentinela bem distante para representar um
// fechamento indefinido, que o "Reabrir quarto" depois remove por completo.
const INDEFINITE_CLOSURE_DATE = "2099-12-31";

const WEEK_PRESETS = [
  { label: "Natal", startMonthDay: "12-23", endMonthDay: "12-29", endNextYear: false },
  { label: "Réveillon", startMonthDay: "12-30", endMonthDay: "01-05", endNextYear: true },
  { label: "Tiradentes", startMonthDay: "04-19", endMonthDay: "04-25", endNextYear: false },
  { label: "Festa Junina", startMonthDay: "06-19", endMonthDay: "06-25", endNextYear: false },
  { label: "N. Sra. Aparecida", startMonthDay: "10-10", endMonthDay: "10-16", endNextYear: false },
  { label: "Finados", startMonthDay: "11-01", endMonthDay: "11-07", endNextYear: false },
] as const;

function getNextYearOccurrence(monthDay: string, fromDate: Date): string {
  const year = fromDate.getFullYear();
  const candidate = `${year}-${monthDay}`;
  if (parseDateOnly(candidate) >= fromDate) {
    return candidate;
  }
  return `${year + 1}-${monthDay}`;
}

function getDayState(day: Date, dayReservations: Reservation[]) {
  const start = new Date(day);
  const end = addDays(start, 1);

  const active = dayReservations.filter((reservation) => {
    const reservationStart = new Date(reservation.checkIn);
    const reservationEnd = new Date(reservation.checkOut);
    return reservationStart < end && reservationEnd > start;
  });

  if (active.some((reservation) => reservation.status === "blocked")) {
    return "blocked" as const;
  }

  if (active.some((reservation) => reservation.status !== "cancelled")) {
    return "occupied" as const;
  }

  return "free" as const;
}

export function CalendarManagement() {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBlock, setSavingBlock] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [savingWeekRate, setSavingWeekRate] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayDate = useMemo(() => toDateInputValue(today), [today]);

  const [rangeStart, setRangeStart] = useState(toDateInputValue(addDays(today, -7)));
  const [rangeEnd, setRangeEnd] = useState(toDateInputValue(addDays(today, 21)));
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const [blockStart, setBlockStart] = useState(toDateInputValue(addDays(today, 1)));
  const [blockEnd, setBlockEnd] = useState(toDateInputValue(addDays(today, 2)));
  const [blockNoEndDate, setBlockNoEndDate] = useState(false);
  const [blockUnit, setBlockUnit] = useState("");
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [priceSpecificDate, setPriceSpecificDate] = useState(toDateInputValue(addDays(today, 1)));
  const [weekRateStart, setWeekRateStart] = useState(toDateInputValue(addDays(today, 1)));
  const [weekRateEnd, setWeekRateEnd] = useState(toDateInputValue(addDays(today, 7)));
  const [weekRatePrice, setWeekRatePrice] = useState("");
  const [weekRateLabel, setWeekRateLabel] = useState("");
  const [rateStartDate, setRateStartDate] = useState(
    toDateInputValue(addDays(today, 1)),
  );
  const [rateEndDate, setRateEndDate] = useState(toDateInputValue(addDays(today, 1)));
  const [rateValue, setRateValue] = useState("");
  const [rateLabel, setRateLabel] = useState("");
  const [seasonalRatesDraft, setSeasonalRatesDraft] = useState<RoomSeasonalRate[]>(
    [],
  );
  const [minStayStart, setMinStayStart] = useState(toDateInputValue(addDays(today, 1)));
  const [minStayEnd, setMinStayEnd] = useState(toDateInputValue(addDays(today, 7)));
  const [minStayNightsValue, setMinStayNightsValue] = useState("");
  const [minStayLabel, setMinStayLabel] = useState("");
  const [savingMinimumStay, setSavingMinimumStay] = useState(false);
  const [minimumStayPeriodsDraft, setMinimumStayPeriodsDraft] = useState<RoomMinimumStayPeriod[]>(
    [],
  );

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/tenant/inventory", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível carregar quartos e reservas.");
      }

      const payload = (await response.json()) as {
        rooms?: Room[];
        reservations?: Reservation[];
      };

      const nextRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
      const nextReservations = Array.isArray(payload.reservations)
        ? payload.reservations
        : [];

      setRooms(nextRooms);
      setReservations(nextReservations);

      if (!selectedRoomId && nextRooms[0]) {
        setSelectedRoomId(nextRooms[0].id);
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Falha ao buscar dados do calendário.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  useEffect(() => {
    if (selectedRoom) {
      setNewPrice(formatCurrencyInput(String(Math.round(selectedRoom.price * 100))));
      setSeasonalRatesDraft(
        Array.isArray(selectedRoom.seasonalRates) ? selectedRoom.seasonalRates : [],
      );
      setMinimumStayPeriodsDraft(
        Array.isArray(selectedRoom.minimumStayPeriods) ? selectedRoom.minimumStayPeriods : [],
      );
      setBlockUnit("");
    }
  }, [selectedRoom]);

  const days = useMemo(() => {
    const start = parseDateOnly(rangeStart);
    const end = parseDateOnly(rangeEnd);

    if (end < start) {
      return [] as Date[];
    }

    const amount =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return Array.from({ length: Math.min(amount, 62) }, (_, index) =>
      addDays(start, index),
    );
  }, [rangeEnd, rangeStart]);

  const roomReservationsInWindow = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.roomId === selectedRoomId &&
          overlapsRange(reservation.checkIn, reservation.checkOut, rangeStart, rangeEnd),
      ),
    [reservations, selectedRoomId, rangeStart, rangeEnd],
  );

  const blockedInWindowCount = useMemo(
    () =>
      roomReservationsInWindow.filter((reservation) => reservation.status === "blocked")
        .length,
    [roomReservationsInWindow],
  );

  // Independente da janela do calendário (rangeStart/rangeEnd) — é a lista
  // de "o que está fechado agora neste quarto", pra reabrir logo ali onde
  // o fechamento foi criado, sem precisar rolar até a linha do tempo.
  const activeClosuresForSelectedRoom = useMemo(
    () =>
      reservations
        .filter(
          (reservation) =>
            reservation.roomId === selectedRoomId &&
            reservation.status === "blocked" &&
            reservation.checkOut.slice(0, 10) >= todayDate,
        )
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [reservations, selectedRoomId, todayDate],
  );

  // Mesmo problema do calendário principal: reservas do quarto selecionado
  // que caem fora de [rangeStart, rangeEnd] não aparecem na linha do tempo
  // abaixo, sem nenhum aviso — daí a sensação de "a reserva não foi pro
  // calendário" quando na verdade só está fora da janela padrão (-7/+21 dias).
  const roomReservationsOutOfWindow = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.roomId === selectedRoomId &&
          reservation.status !== "cancelled" &&
          !overlapsRange(reservation.checkIn, reservation.checkOut, rangeStart, rangeEnd),
      ),
    [reservations, selectedRoomId, rangeStart, rangeEnd],
  );

  const nextOutOfWindowReservation = useMemo(() => {
    const upcoming = roomReservationsOutOfWindow
      .filter((reservation) => reservation.checkIn >= todayDate)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    return upcoming[0] ?? roomReservationsOutOfWindow[0] ?? null;
  }, [roomReservationsOutOfWindow, todayDate]);

  const canBlockFuture =
    blockStart >= todayDate && (blockNoEndDate || blockEnd > blockStart);

  const seasonalRatesSorted = useMemo(
    () =>
      [...seasonalRatesDraft].sort((a, b) => {
        if (a.startMonthDay === b.startMonthDay) {
          return a.endMonthDay.localeCompare(b.endMonthDay);
        }

        return a.startMonthDay.localeCompare(b.startMonthDay);
      }),
    [seasonalRatesDraft],
  );

  function handleAddRateRule() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para configurar tarifa por período.");
      return;
    }

    if (!rateStartDate || !rateEndDate || rateEndDate < rateStartDate) {
      showToast("Período de tarifa inválido.");
      return;
    }

    const numericRate = parseCurrencyInput(rateValue);
    if (!Number.isFinite(numericRate) || numericRate < 0) {
      showToast("Informe uma tarifa válida para a regra.");
      return;
    }

    const startMonthDay = toMonthDay(rateStartDate);
    const endMonthDay = toMonthDay(rateEndDate);

    if (!startMonthDay || !endMonthDay) {
      showToast("Datas da regra inválidas.");
      return;
    }

    const nextRule: RoomSeasonalRate = {
      label: rateLabel.trim() || undefined,
      startMonthDay,
      endMonthDay,
      price: numericRate,
    };

    setSeasonalRatesDraft((current) => {
      const withoutSameRange = current.filter(
        (item) =>
          !(
            item.startMonthDay === nextRule.startMonthDay &&
            item.endMonthDay === nextRule.endMonthDay
          ),
      );
      return [...withoutSameRange, nextRule];
    });

    setRateValue("");
    setRateLabel("");
    showToast("Regra de tarifa adicionada. Clique em salvar para persistir.");
  }

  function handleRemoveRateRule(startMonthDay: string, endMonthDay: string) {
    setSeasonalRatesDraft((current) =>
      current.filter(
        (item) =>
          !(item.startMonthDay === startMonthDay && item.endMonthDay === endMonthDay),
      ),
    );
  }

  const minimumStayPeriodsSorted = useMemo(
    () =>
      [...minimumStayPeriodsDraft].sort((a, b) => {
        if (a.startMonthDay === b.startMonthDay) {
          return a.endMonthDay.localeCompare(b.endMonthDay);
        }

        return a.startMonthDay.localeCompare(b.startMonthDay);
      }),
    [minimumStayPeriodsDraft],
  );

  function handleApplyMinStayPreset(preset: (typeof WEEK_PRESETS)[number]) {
    const startDate = getNextYearOccurrence(preset.startMonthDay, today);
    const startYear = Number(startDate.slice(0, 4));
    const endYear = preset.endNextYear ? startYear + 1 : startYear;
    setMinStayStart(startDate);
    setMinStayEnd(`${endYear}-${preset.endMonthDay}`);
    setMinStayLabel(preset.label);
  }

  function handleAddMinimumStayRule() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para configurar estadia mínima.");
      return;
    }

    if (!minStayStart || !minStayEnd || minStayEnd < minStayStart) {
      showToast("Período de estadia mínima inválido.");
      return;
    }

    const nights = Number(minStayNightsValue);
    if (!Number.isInteger(nights) || nights < 1) {
      showToast("Informe um número de noites válido (mínimo 1).");
      return;
    }

    const startMonthDay = toMonthDay(minStayStart);
    const endMonthDay = toMonthDay(minStayEnd);

    if (!startMonthDay || !endMonthDay) {
      showToast("Datas da regra inválidas.");
      return;
    }

    const nextRule: RoomMinimumStayPeriod = {
      label: minStayLabel.trim() || undefined,
      startMonthDay,
      endMonthDay,
      minStayNights: nights,
    };

    setMinimumStayPeriodsDraft((current) => {
      const withoutSameRange = current.filter(
        (item) =>
          !(
            item.startMonthDay === nextRule.startMonthDay &&
            item.endMonthDay === nextRule.endMonthDay
          ),
      );
      return [...withoutSameRange, nextRule];
    });

    setMinStayNightsValue("");
    setMinStayLabel("");
    showToast("Regra de estadia mínima adicionada. Clique em salvar para persistir.");
  }

  function handleRemoveMinimumStayRule(startMonthDay: string, endMonthDay: string) {
    setMinimumStayPeriodsDraft((current) =>
      current.filter(
        (item) =>
          !(item.startMonthDay === startMonthDay && item.endMonthDay === endMonthDay),
      ),
    );
  }

  async function handleSaveMinimumStayRules() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para salvar as regras de estadia mínima.");
      return;
    }

    setSavingMinimumStay(true);
    try {
      const response = await fetch(`/api/tenant/rooms/${selectedRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minimumStayPeriods: minimumStayPeriodsDraft }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? payload.message ?? "Falha ao salvar estadia mínima por período.",
        );
      }

      showToast("Estadia mínima por período salva com sucesso.");
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Erro ao salvar regras de estadia mínima.",
      );
    } finally {
      setSavingMinimumStay(false);
    }
  }

  function handleApplyWeekPreset(preset: (typeof WEEK_PRESETS)[number]) {
    const startDate = getNextYearOccurrence(preset.startMonthDay, today);
    const startYear = Number(startDate.slice(0, 4));
    const endYear = preset.endNextYear ? startYear + 1 : startYear;
    setWeekRateStart(startDate);
    setWeekRateEnd(`${endYear}-${preset.endMonthDay}`);
    setWeekRateLabel(preset.label);
  }

  async function handleSaveWeekRate() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para alterar a tarifa.");
      return;
    }

    if (!weekRateStart || !weekRateEnd || weekRateEnd < weekRateStart) {
      showToast("Período de semana inválido.");
      return;
    }

    const numericPrice = parseCurrencyInput(weekRatePrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      showToast("Informe uma tarifa válida.");
      return;
    }

    const startMonthDay = toMonthDay(weekRateStart);
    const endMonthDay = toMonthDay(weekRateEnd);
    if (!startMonthDay || !endMonthDay) {
      showToast("Datas inválidas.");
      return;
    }

    const nextRule: RoomSeasonalRate = {
      label: weekRateLabel.trim() || undefined,
      startMonthDay,
      endMonthDay,
      price: numericPrice,
    };

    const nextDraft = [
      ...seasonalRatesDraft.filter(
        (item) =>
          !(item.startMonthDay === startMonthDay && item.endMonthDay === endMonthDay),
      ),
      nextRule,
    ];

    setSavingWeekRate(true);
    try {
      const response = await fetch(`/api/tenant/rooms/${selectedRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonalRates: nextDraft }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? payload.message ?? "Falha ao salvar tarifa da semana.",
        );
      }

      showToast("Tarifa da semana salva com sucesso.");
      setWeekRatePrice("");
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Erro ao salvar tarifa da semana.",
      );
    } finally {
      setSavingWeekRate(false);
    }
  }

  async function handleSaveRateRules() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para salvar as regras de tarifa.");
      return;
    }

    setSavingRates(true);
    try {
      const response = await fetch(`/api/tenant/rooms/${selectedRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonalRates: seasonalRatesDraft }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? payload.message ?? "Falha ao salvar tarifas por período.",
        );
      }

      showToast("Tarifas por dia/período salvas com sucesso.");
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Erro ao salvar regras de tarifa.",
      );
    } finally {
      setSavingRates(false);
    }
  }

  async function handleCloseRoomInFuture() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para fechar datas.");
      return;
    }

    if (!canBlockFuture) {
      showToast("Fechamentos só podem ser criados para datas futuras.");
      return;
    }

    setSavingBlock(true);
    try {
      const response = await fetch("/api/tenant/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoomId,
          checkIn: new Date(`${blockStart}T14:00:00`).toISOString(),
          checkOut: new Date(
            `${blockNoEndDate ? INDEFINITE_CLOSURE_DATE : blockEnd}T12:00:00`,
          ).toISOString(),
          entryType: "blocked",
          amount: 0,
          guestName: "Bloqueio Operacional",
          guestEmail: "",
          guestPhone: "",
          guestCpf: "",
          notes: "Fechamento criado no calendário de gestão",
          ...(blockUnit ? { unitNumber: Number(blockUnit) } : {}),
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Não foi possível fechar o quarto.");
      }

      showToast("Fechamento criado com sucesso.");
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Erro ao fechar datas do quarto.",
      );
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleReopenRoom(reservationId: string) {
    setReopeningId(reservationId);
    try {
      const response = await fetch("/api/tenant/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Não foi possível reabrir o quarto.");
      }

      showToast("Quarto reaberto com sucesso.");
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Erro ao reabrir o quarto.",
      );
    } finally {
      setReopeningId(null);
    }
  }

  async function handleUpdatePrice() {
    if (!selectedRoomId) {
      showToast("Selecione um quarto para alterar o preço.");
      return;
    }

    const numericPrice = parseCurrencyInput(newPrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      showToast("Informe um valor de tarifa válido.");
      return;
    }

    if (!priceSpecificDate) {
      showToast("Selecione o dia para alterar a tarifa.");
      return;
    }

    const monthDay = toMonthDay(priceSpecificDate);
    if (!monthDay) {
      showToast("Data inválida.");
      return;
    }

    const nextDraft = [
      ...seasonalRatesDraft.filter(
        (item) =>
          !(item.startMonthDay === monthDay && item.endMonthDay === monthDay),
      ),
      { startMonthDay: monthDay, endMonthDay: monthDay, price: numericPrice },
    ];

    setSavingPrice(true);
    try {
      const response = await fetch(`/api/tenant/rooms/${selectedRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonalRates: nextDraft }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Falha ao salvar tarifa.");
      }

      showToast("Tarifa do dia atualizada com sucesso.");
      await loadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Erro ao atualizar tarifa.");
    } finally {
      setSavingPrice(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600 dark:text-sky-300">
              Calendário de gestão
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Datas passadas e futuras por quarto
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Consulte histórico, planeje disponibilidade e execute ações operacionais.
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Quarto
          </span>
          <select
            value={selectedRoomId}
            onChange={(event) => setSelectedRoomId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Início da janela
          </span>
          <input
            type="date"
            value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Fim da janela
          </span>
          <input
            type="date"
            value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <div className="flex items-end gap-2">
          <button
            onClick={() => {
              setRangeStart(toDateInputValue(addDays(today, -14)));
              setRangeEnd(toDateInputValue(addDays(today, 14)));
            }}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Hoje ±14d
          </button>
          <button
            onClick={() => {
              setRangeStart(toDateInputValue(addDays(today, -30)));
              setRangeEnd(toDateInputValue(addDays(today, 30)));
            }}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Hoje ±30d
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-rose-500" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fechar quarto para datas futuras</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Início
              </span>
              <input
                type="date"
                value={blockStart}
                onChange={(event) => setBlockStart(event.target.value)}
                min={todayDate}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Fim
              </span>
              <input
                type="date"
                value={blockEnd}
                onChange={(event) => setBlockEnd(event.target.value)}
                min={blockStart || todayDate}
                disabled={blockNoEndDate}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-200 transition focus:ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={blockNoEndDate}
                onChange={(event) => setBlockNoEndDate(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400 dark:border-white/20"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Fechar por tempo indeterminado (sem data de término)
              </span>
            </label>

            {selectedRoom && selectedRoom.quantity > 1 && (
              <label className="space-y-2 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Unidade
                </span>
                <select
                  value={blockUnit}
                  onChange={(event) => setBlockUnit(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Automático (primeira disponível)</option>
                  {Array.from({ length: selectedRoom.quantity }, (_, index) => index + 1).map((unit) => (
                    <option key={unit} value={unit}>
                      Unidade {unit}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <button
            onClick={() => void handleCloseRoomInFuture()}
            disabled={!canBlockFuture || savingBlock}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
          >
            <Lock className="h-4 w-4" />
            {savingBlock ? "Salvando fechamento..." : "Fechar quarto no período"}
          </button>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            O fechamento cria um bloqueio operacional e impede novas reservas nesse intervalo.
          </p>

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10">
            <div className="mb-3 flex items-center gap-2">
              <LockOpen className="h-4 w-4 text-emerald-500" />
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Fechamentos ativos deste quarto
              </h4>
            </div>

            {activeClosuresForSelectedRoom.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nenhum fechamento ativo para este quarto no momento.
              </p>
            ) : (
              <div className="space-y-2">
                {activeClosuresForSelectedRoom.map((reservation) => {
                  const isIndefinite =
                    reservation.checkOut.slice(0, 10) === INDEFINITE_CLOSURE_DATE;

                  return (
                    <div
                      key={reservation.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 dark:border-rose-400/20 dark:bg-rose-500/10"
                    >
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        <span className="font-semibold">
                          {parseDateOnly(reservation.checkIn).toLocaleDateString("pt-BR")}
                          {" até "}
                          {isIndefinite
                            ? "sem data de término"
                            : parseDateOnly(reservation.checkOut).toLocaleDateString("pt-BR")}
                        </span>
                        {reservation.unitNumber ? ` • Unidade ${reservation.unitNumber}` : ""}
                      </p>
                      <button
                        onClick={() => void handleReopenRoom(reservation.id)}
                        disabled={reopeningId === reservation.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                      >
                        <LockOpen className="h-3.5 w-3.5" />
                        {reopeningId === reservation.id ? "Reabrindo..." : "Reabrir quarto"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Reabrir remove o bloqueio na hora e libera o quarto para novas reservas nesse período.
            </p>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
          <div className="mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4 text-sky-500" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Alterar tarifa de um dia</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Dia
              </span>
              <input
                type="date"
                value={priceSpecificDate}
                onChange={(event) => setPriceSpecificDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Nova tarifa (R$)
              </span>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={newPrice}
                onChange={(event) => setNewPrice(formatCurrencyInput(event.target.value))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>

          <button
            onClick={() => void handleUpdatePrice()}
            disabled={savingPrice || !selectedRoomId || !priceSpecificDate}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
          >
            <Tag className="h-4 w-4" />
            {savingPrice ? "Salvando tarifa..." : "Salvar tarifa do dia"}
          </button>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Define o preço somente para o dia selecionado. Use as regras abaixo para períodos recorrentes.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="mb-4 flex items-center gap-2">
          <Tag className="h-4 w-4 text-violet-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Alterar tarifa por semana</h3>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {WEEK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleApplyWeekPreset(preset)}
              className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Início
            </span>
            <input
              type="date"
              value={weekRateStart}
              onChange={(event) => setWeekRateStart(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Fim
            </span>
            <input
              type="date"
              value={weekRateEnd}
              onChange={(event) => setWeekRateEnd(event.target.value)}
              min={weekRateStart}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Tarifa (R$)
            </span>
            <input
              type="text"
              value={weekRatePrice}
              onChange={(event) => setWeekRatePrice(formatCurrencyInput(event.target.value))}
              placeholder="R$ 0,00"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Rótulo (opcional)
            </span>
            <input
              type="text"
              value={weekRateLabel}
              onChange={(event) => setWeekRateLabel(event.target.value)}
              placeholder="Ex.: Natal, Réveillon"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <button
          onClick={() => void handleSaveWeekRate()}
          disabled={savingWeekRate || !selectedRoomId || !weekRatePrice}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
        >
          <Tag className="h-4 w-4" />
          {savingWeekRate ? "Salvando..." : "Salvar tarifa da semana"}
        </button>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Use os atalhos acima para preencher semanas de feriado automaticamente. Rótulo é opcional. Para exigir um número mínimo de noites (ex.: 4 no Réveillon), use a seção "Estadia mínima por período" abaixo.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Tarifa por dia e por período
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Regras por quarto. Para tarifa de um único dia, use início e fim iguais.
            </p>
          </div>
          <button
            onClick={() => void handleSaveRateRules()}
            disabled={savingRates || !selectedRoomId}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
          >
            <Tag className="h-4 w-4" />
            {savingRates ? "Salvando regras..." : "Salvar regras de tarifa"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Início
            </span>
            <input
              type="date"
              value={rateStartDate}
              onChange={(event) => setRateStartDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Fim
            </span>
            <input
              type="date"
              value={rateEndDate}
              onChange={(event) => setRateEndDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Tarifa (R$)
            </span>
            <input
              type="text"
              placeholder="R$ 0,00"
              value={rateValue}
              onChange={(event) => setRateValue(formatCurrencyInput(event.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2 md:col-span-2 xl:col-span-1">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Rótulo (opcional)
            </span>
            <input
              type="text"
              value={rateLabel}
              onChange={(event) => setRateLabel(event.target.value)}
              placeholder="Ex.: feriado, alta estação"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-sky-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <div className="flex items-end">
            <button
              onClick={handleAddRateRule}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Adicionar regra
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {seasonalRatesSorted.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Nenhuma regra de tarifa criada para este quarto.
            </p>
          ) : (
            seasonalRatesSorted.map((rule) => {
              const isSingleDay = rule.startMonthDay === rule.endMonthDay;

              return (
                <div
                  key={`${rule.startMonthDay}-${rule.endMonthDay}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {isSingleDay
                        ? `Dia ${rule.startMonthDay}`
                        : `Período ${rule.startMonthDay} até ${rule.endMonthDay}`}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {rule.label ? `${rule.label} • ` : ""}R$ {rule.price.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      handleRemoveRateRule(rule.startMonthDay, rule.endMonthDay)
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Estadia mínima por período</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Exige um número mínimo de noites nesse período, independente da tarifa. Ex.: 4 noites no Réveillon.
            </p>
          </div>
          <button
            onClick={() => void handleSaveMinimumStayRules()}
            disabled={savingMinimumStay || !selectedRoomId}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            <Tag className="h-4 w-4" />
            {savingMinimumStay ? "Salvando..." : "Salvar estadia mínima"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {WEEK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleApplyMinStayPreset(preset)}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Início
            </span>
            <input
              type="date"
              value={minStayStart}
              onChange={(event) => setMinStayStart(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-amber-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Fim
            </span>
            <input
              type="date"
              value={minStayEnd}
              onChange={(event) => setMinStayEnd(event.target.value)}
              min={minStayStart}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-amber-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Mín. noites
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={minStayNightsValue}
              onChange={(event) => setMinStayNightsValue(event.target.value)}
              placeholder="Ex.: 4"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-amber-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="space-y-2 md:col-span-2 xl:col-span-1">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Rótulo (opcional)
            </span>
            <input
              type="text"
              value={minStayLabel}
              onChange={(event) => setMinStayLabel(event.target.value)}
              placeholder="Ex.: Réveillon"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-amber-200 transition focus:ring dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <div className="flex items-end">
            <button
              onClick={handleAddMinimumStayRule}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Adicionar regra
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {minimumStayPeriodsSorted.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Nenhuma regra de estadia mínima criada para este quarto.
            </p>
          ) : (
            minimumStayPeriodsSorted.map((rule) => {
              const isSingleDay = rule.startMonthDay === rule.endMonthDay;

              return (
                <div
                  key={`${rule.startMonthDay}-${rule.endMonthDay}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {isSingleDay
                        ? `Dia ${rule.startMonthDay}`
                        : `Período ${rule.startMonthDay} até ${rule.endMonthDay}`}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {rule.label ? `${rule.label} • ` : ""}Mínimo de {rule.minStayNights} noite(s)
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      handleRemoveMinimumStayRule(rule.startMonthDay, rule.endMonthDay)
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Linha do tempo do quarto</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {selectedRoom?.name ?? "Sem quarto selecionado"} • {days.length} dias na janela • {blockedInWindowCount} bloqueio(s)
            </p>
          </div>
          <div className="inline-flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Livre
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Ocupado
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Bloqueado
            </span>
          </div>
        </div>

        {roomReservationsOutOfWindow.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <span>
              {roomReservationsOutOfWindow.length}{" "}
              {roomReservationsOutOfWindow.length === 1
                ? "reserva deste quarto não aparece"
                : "reservas deste quarto não aparecem"}{" "}
              na linha do tempo porque o período está fora do intervalo
              selecionado acima.
            </span>
            {nextOutOfWindowReservation && (
              <button
                type="button"
                onClick={() => {
                  setRangeStart(
                    toDateInputValue(addDays(parseDateOnly(nextOutOfWindowReservation.checkIn), -2)),
                  );
                  setRangeEnd(
                    toDateInputValue(addDays(parseDateOnly(nextOutOfWindowReservation.checkOut), 2)),
                  );
                }}
                className="rounded-xl border border-amber-400/40 px-3 py-1.5 font-medium transition hover:border-amber-400/60"
              >
                Ver reserva de{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(parseDateOnly(nextOutOfWindowReservation.checkIn))}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[920px] gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(56px, 1fr))` }}>
            {days.map((day) => {
              const state = getDayState(day, roomReservationsInWindow);
              const label = day.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              });

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center",
                    state === "blocked" && "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/20 dark:text-rose-200",
                    state === "occupied" && "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-200",
                    state === "free" && "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/20 dark:text-emerald-200",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                    {day.toLocaleDateString("pt-BR", { weekday: "short" })}
                  </p>
                  <p className="mt-1 text-xs font-bold">{label}</p>
                  {selectedRoom ? (
                    <p className="mt-1 text-[10px] font-semibold opacity-90">
                      R${" "}
                      {getRoomEffectivePrice(
                        {
                          price: selectedRoom.price,
                          seasonalRates: seasonalRatesDraft,
                        },
                        day,
                      ).toFixed(0)}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300">
            Carregando dados do calendário...
          </div>
        ) : null}

        {!loading && days.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            Período inválido. Ajuste as datas para visualizar o calendário.
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-xl shadow-slate-200/40 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-slate-950/30">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Bloqueios e reservas na janela</h3>
        </div>

        <div className="mt-4 space-y-2">
          {roomReservationsInWindow.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum registro encontrado para o período selecionado.</p>
          ) : (
            roomReservationsInWindow.map((reservation) => (
              <div
                key={reservation.id}
                className={cn(
                  "rounded-2xl border px-4 py-3",
                  reservation.status === "blocked"
                    ? "border-rose-300 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-500/10"
                    : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800/50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {reservation.status === "blocked" ? "Bloqueio" : "Reserva"} • {reservation.customer.name}
                  </p>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {parseDateOnly(reservation.checkIn).toLocaleDateString("pt-BR")} ate{" "}
                    {reservation.checkOut.slice(0, 10) === INDEFINITE_CLOSURE_DATE
                      ? "sem data de término"
                      : parseDateOnly(reservation.checkOut).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{reservation.notes || "Sem observações."}</p>
                {reservation.status === "blocked" && (
                  <button
                    onClick={() => void handleReopenRoom(reservation.id)}
                    disabled={reopeningId === reservation.id}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {reopeningId === reservation.id ? "Reabrindo..." : "Reabrir quarto"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
