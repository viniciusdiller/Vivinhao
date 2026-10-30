import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarControlsProps {
  days: Date[];
  gridStart: Date;
  daysVisible: number;
  DAY_RANGE_OPTIONS: readonly number[];
  onShiftTimeline: (direction: "previous" | "next") => void;
  onSetGridStart: (date: Date) => void;
  onSetDaysVisible: (days: number) => void;
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function CalendarControls({
  days,
  gridStart,
  daysVisible,
  DAY_RANGE_OPTIONS,
  onShiftTimeline,
  onSetGridStart,
  onSetDaysVisible,
}: CalendarControlsProps) {
  return (
    <>
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-3 py-2 text-xs font-medium uppercase tracking-[0.28em] text-slate-300">
            <Sparkles className="h-4 w-4 text-sky-300" />
            Grade unificada
          </div>
          <h3 className="mt-4 text-2xl font-semibold text-white">
            Calendário por acomodação
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Clique em uma reserva para editar. Clique em um espaço vazio para
            criar um lançamento manual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-2">
            {days.length} dias visíveis
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-2">
            Reservas canceladas ficam ocultas na grade
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-white/10 bg-slate-950/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
            <CalendarDays className="h-4 w-4 shrink-0 text-sky-300" />
            <span className="truncate">
              {formatLongDate(days[0].toISOString().slice(0, 10))} até{" "}
              {formatLongDate(days[days.length - 1].toISOString().slice(0, 10))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onShiftTimeline("previous")}
              className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-slate-200 transition hover:border-white/20"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={gridStart.toISOString().slice(0, 10)}
              onChange={(e) => {
                const newDate = new Date(e.target.value + "T00:00:00");
                if (!isNaN(newDate.getTime())) onSetGridStart(newDate);
              }}
              className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-3 text-sm font-medium text-slate-200 focus:outline-none focus:border-sky-500 transition sm:px-4"
              style={{ colorScheme: "dark" }}
            />
            <button
              onClick={() => onSetGridStart(getToday())}
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20"
            >
              Hoje
            </button>
            <button
              onClick={() => onShiftTimeline("next")}
              className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-slate-200 transition hover:border-white/20"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {DAY_RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => onSetDaysVisible(option)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-medium transition",
                daysVisible === option
                  ? "border-sky-400/40 bg-sky-500/10 text-sky-200"
                  : "border-white/10 bg-slate-900/80 text-slate-300 hover:border-white/20",
              )}
            >
              {option} dias
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
