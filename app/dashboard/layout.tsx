import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { getVisibleDashboardNavItems } from "@/lib/dashboard-access";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect('/');
  }

  const navItems = getVisibleDashboardNavItems(
    session.plan,
    session.role,
    session.permissions,
  );

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      {/* "items-start" só faz sentido em lg:flex-row (evita que a sidebar e
          o conteúdo sejam esticados pra mesma altura). No mobile (flex-col),
          "items-start" vira o eixo cruzado — ele deixa cada item largo
          conforme o próprio conteúdo em vez de esticar pra 100% da tela, e
          conteúdo internamente largo (a grade do calendário, por exemplo)
          passa a ditar a largura da página inteira em vez de rolar dentro
          da própria caixa. Sem essa classe no mobile, o padrão volta a ser
          "stretch", que é o que realmente contém a largura em telas estreitas. */}
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-start">
        <DashboardSidebar tenantName={session.tenantName} navItems={navItems} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-end">
            <LogoutButton />
          </div>
          <section className="min-w-0 space-y-4">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
