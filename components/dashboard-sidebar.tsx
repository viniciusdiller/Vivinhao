"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  BedDouble,
  CalendarRange,
  CalendarCog,
  CalendarPlus2,
  ClipboardCheck,
  History,
  Landmark,
  Menu,
  PanelLeft,
  PanelLeftClose,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: Route;
  label: string;
  description: string;
};

const ICONS: Record<string, LucideIcon> = {
  "/dashboard/calendar": CalendarRange,
  "/dashboard/calendar-management": CalendarCog,
  "/dashboard/promotions": BadgePercent,
  "/dashboard/reservations": CalendarPlus2,
  "/dashboard/check": ClipboardCheck,
  "/dashboard/rooms": BedDouble,
  "/dashboard/team": UsersRound,
  "/dashboard/finance": Landmark,
  "/dashboard/guests": History,
};

const COLLAPSED_STORAGE_KEY = "dashboard-sidebar-collapsed";

export function DashboardSidebar({
  tenantName,
  navItems,
}: {
  tenantName: string;
  navItems: NavItem[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  const header = (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-white/10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-600 dark:text-sky-300">
          Pousada Sancho
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">
          {tenantName}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Painel operacional para disponibilidade, moderação de reservas e
          controle financeiro.
        </p>
      </div>
    </div>
  );

  const navLinks = (
    <nav className="mt-5 space-y-3">
      {navItems.map((item) => {
        // Nunca usar apenas startsWith aqui: "/dashboard/calendar-management"
        // começa com "/dashboard/calendar", o que marcava os dois itens como
        // ativos ao mesmo tempo. Só conta como ativo se for o caminho exato
        // ou uma subrota dele (com "/" na sequência).
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.href] ?? CalendarRange;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            title={item.label}
            className={cn(
              "block rounded-[24px] border px-4 py-4 transition-all",
              isActive
                ? "border-sky-300/70 bg-sky-50 shadow-lg shadow-sky-200/70 dark:border-sky-400/40 dark:bg-sky-500/10 dark:shadow-sky-950/20"
                : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/40 dark:hover:border-white/15 dark:hover:bg-slate-800/80",
            )}
          >
            <div className={cn("flex items-center gap-3", collapsed && "lg:justify-center lg:gap-0")}>
              <div
                className={cn(
                  "rounded-2xl p-3",
                  isActive
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-300",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className={cn(collapsed && "lg:hidden")}>
                <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Barra com hambúrguer — somente mobile/tablet */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/85 lg:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600 dark:text-sky-300">
            Pousada Sancho
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{tenantName}</p>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-600 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer — somente mobile/tablet */}
      {mobileOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-80 overflow-y-auto rounded-r-[28px] border-r border-slate-200/80 bg-white/95 p-5 shadow-2xl shadow-slate-900/20 backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:shadow-slate-950/50">
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {header}
            {navLinks}
          </aside>
        </div>
      )}

      {/* Sidebar fixa — somente desktop */}
      <aside
        className={cn(
          "sticky top-8 hidden h-[calc(100vh-4rem)] shrink-0 overflow-y-auto rounded-[28px] border border-slate-200/80 bg-white/85 p-5 shadow-lg backdrop-blur transition-all dark:border-white/10 dark:bg-slate-900/85 lg:block",
          collapsed ? "lg:w-24" : "lg:w-80",
        )}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "mb-4 rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-600 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-700/70",
            collapsed ? "mx-auto flex" : "ml-auto flex",
          )}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>

        {!collapsed && header}
        {navLinks}
      </aside>
    </>
  );
}
