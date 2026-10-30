import { CalendarDays, ConciergeBell, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/login-form';

const highlights = [
  {
    icon: CalendarDays,
    title: 'Calendário centralizado',
    description: 'Visualize em um só lugar as entradas, saídas e períodos indisponíveis da sua hospedagem.',
  },
  {
    icon: ShieldCheck,
    title: 'Mais segurança na operação',
    description: 'Acompanhe a ocupação com clareza e reduza conflitos entre reservas e bloqueios.',
  },
  {
    icon: ConciergeBell,
    title: 'Rotina mais ágil',
    description: 'Ganhe tempo para cuidar da experiência dos hóspedes com uma gestão simples e elegante.',
  },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:px-10">
      <section className="max-w-xl space-y-8">
        <div className="space-y-4">
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-300">
            Gestão exclusiva para hotelaria
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Organize as reservas da sua pousada com mais clareza e tranquilidade.
          </h1>
          <p className="max-w-lg text-base leading-7 text-slate-300">
            Acompanhe disponibilidade, bloqueios e movimentações do calendário em uma experiência pensada para o dia a dia da sua operação.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map((highlight) => (
            <div key={highlight.title} className="glass-panel rounded-[24px] p-4">
              <highlight.icon className="h-5 w-5 text-sky-300" />
              <h2 className="mt-4 text-sm font-semibold text-white">{highlight.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{highlight.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-1 justify-center lg:justify-end">
        <LoginForm />
      </section>
    </main>
  );
}
