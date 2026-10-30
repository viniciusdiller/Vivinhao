import { CalendarPlus2, LogOut } from "lucide-react";

interface CalendarHeaderProps {
  tenantName: string;
  onNewEntry: () => void;
  onLogout: () => void;
}

export function CalendarHeader({ tenantName, onNewEntry, onLogout }: CalendarHeaderProps) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-slate-950/20">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">
            Calendário
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Painel de disponibilidade da {tenantName}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Acompanhe a ocupação da sua pousada, visualize mais períodos e
            modere reservas sem sair da grade.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onNewEntry}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-950/30 transition hover:bg-sky-400"
          >
            <CalendarPlus2 className="h-4 w-4" />
            Novo lançamento
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-900"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </section>
  );
}
