import type { NextConfig } from "next";

// Content-Security-Policy NÃO é definida aqui: o App Router do Next injeta
// scripts inline sem nonce para hidratar a página (payload de RSC, streaming
// etc.), então um CSP estático sem 'unsafe-inline' bloqueia a própria
// hidratação e deixa a tela em branco. A versão correta (com nonce por
// requisição + 'strict-dynamic') é gerada no middleware.ts, que também é o
// único lugar que pode ver o nonce antes da resposta ser montada. Duas
// políticas CSP no mesmo response se combinam pela interseção mais
// restritiva — então não duplicar o header aqui.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // CORS liberado apenas para as rotas públicas (consumidas pela
        // landing page externa). As rotas /api/tenant/* e /api/auth/* são
        // protegidas por cookie de sessão e não devem aceitar origens
        // arbitrárias.
        source: "/api/public/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date",
          },
        ],
      },
    ];
  },
  typedRoutes: true,
  serverExternalPackages: ["sequelize", "sequelize-typescript"],
};

export default nextConfig;
