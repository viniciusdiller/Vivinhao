import { redirect } from 'next/navigation';
import { getAuthenticatedSession } from '@/lib/auth';
import { getVisibleDashboardNavItems } from '@/lib/dashboard-access';

export default async function DashboardIndexPage() {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect('/');
  }

  const navItems = getVisibleDashboardNavItems(session.plan, session.role, session.permissions);

  if (navItems.length > 0) {
    redirect(navItems[0].href);
  }

  return (
    <section className="glass-panel rounded-[28px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/20">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Acesso pendente</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Nenhuma área liberada para o seu usuário</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        Sua conta ainda não tem permissão para nenhuma seção do painel. Fale com o gestor da pousada para liberar o
        acesso às áreas necessárias.
      </p>
    </section>
  );
}
