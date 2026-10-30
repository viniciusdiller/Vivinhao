'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('theme');
    const nextTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : getSystemTheme();

    root.classList.remove('light', 'dark');
    root.classList.add(nextTheme);
    root.style.colorScheme = nextTheme;

    setTheme(nextTheme);
    setMounted(true);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';

    root.classList.remove('light', 'dark');
    root.classList.add(nextTheme);
    root.style.colorScheme = nextTheme;
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        // Só ícone e circular no celular — enquanto flutua fixo no canto,
        // o texto "Modo escuro/claro" ficava tapando conteúdo ao rolar a
        // página. A partir de "lg" (onde ele para de flutuar sobre uma
        // barra de menu) volta a ser o pill completo com texto.
        'inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/90 p-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900 lg:rounded-xl lg:px-3 lg:py-2',
        className,
      )}
      aria-label="Alternar tema"
      disabled={!mounted}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden lg:inline">{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  );
}
