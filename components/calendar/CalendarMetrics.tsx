import { BedDouble, MoonStar, Receipt } from "lucide-react";

interface CalendarMetricsProps {
  activeRoomsCount: number;
  manualEntriesCount: number;
  confirmedRevenue: number;
  occupancy: number;
  daysCount: number;
}

function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function CalendarMetrics({
  activeRoomsCount,
  manualEntriesCount,
  confirmedRevenue,
  occupancy,
  daysCount,
}: CalendarMetricsProps) {
  const cards = [
    {
      label: "Quartos ativos",
      value: activeRoomsCount,
      icon: BedDouble,
      tone: "text-sky-300 bg-sky-400/10 border-sky-400/20",
      description: `${occupancy}% de ocupação visível na janela de ${daysCount} dias.`,
    },
    {
      label: "Lançamentos manuais",
      value: manualEntriesCount,
      icon: MoonStar,
      tone: "text-violet-200 bg-violet-400/10 border-violet-400/20",
      description: "Bloqueios e reservas criados diretamente pela equipe.",
    },
    {
      label: "Receita em reservas",
      value: formatCurrency(confirmedRevenue),
      icon: Receipt,
      tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
      description:
        "Inclui todas as reservas monetizadas presentes no período carregado.",
    },
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {card.value}
                </p>
              </div>
              <div className={`rounded-2xl border p-3 ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-400">{card.description}</p>
          </div>
        );
      })}
    </section>
  );
}
