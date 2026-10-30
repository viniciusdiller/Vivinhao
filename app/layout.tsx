import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/components/toast-provider';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: "Pousada Viva-mar | Gestão",
  description: "Canal de Gestão Interna Viva-Mar.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

// Sem isso, o navegador do celular renderiza a página numa largura virtual
// de desktop (~980px) e espreme tudo pra caber na tela — os breakpoints
// responsivos do Tailwind (sm/md/lg) nem disparam certo nesse cenário,
// porque o CSS enxerga uma viewport bem maior que a tela real.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Precisa do mesmo nonce que o middleware colocou no header CSP — sem
  // isso, este script inline é bloqueado pela política 'strict-dynamic'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          // O navegador propositalmente devolve nonce="" quando o valor é
          // lido de volta do DOM (evita vazar o nonce pra um XSS) — isso por
          // si só causa um warning de hydration mismatch nesse atributo.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var e=document.documentElement;var t=localStorage.getItem('theme');var n=t==='dark'||t==='light'?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');e.classList.remove('light','dark');e.classList.add(n);e.style.colorScheme=n;}catch(_){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ToastProvider>
          {/* Fica embaixo à direita até "lg": a barra mobile do menu do
              painel (POUSADA SANCHO + hambúrguer) ocupa o topo até esse
              breakpoint, e o botão flutuante em cima dela ficava
              sobrepondo/colando no hambúrguer. Do "lg" pra cima a sidebar
              desktop não tem essa barra, então volta pro canto superior. */}
          <div className="fixed bottom-4 right-4 z-50 lg:bottom-auto lg:right-6 lg:top-6">
            <ThemeToggle />
          </div>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
