# Pousada Viva Mar - ADMIN

SaaS de gestão para a Pousada Viva Mar: reservas, quartos, calendário, financeiro, equipe e hóspedes.

## Estrutura

```text
app/
  api/
    auth/            login/logout
    public/           rotas consumidas pela landing page externa (sem sessão)
    tenant/           rotas autenticadas do painel (reservas, quartos, cupons, equipe, despesas)
    webhooks/         provisionamento de novos tenants
  dashboard/          páginas do painel (calendário, financeiro, equipe, hóspedes, quartos...)
  page.tsx            página de login
actions/              server actions (reservas, despesas)
components/            componentes de UI, incluindo components/calendar/
lib/
  auth.ts             sessão JWT (HMAC-SHA256, cookie httpOnly)
  tenant-session.ts   sessão revalidada no banco a cada request de API
  db.ts               conexão Sequelize + migrações incrementais
  dashboard-access.ts  controle de acesso por feature/role
  room-policies.ts    tarifas sazonais, estadia mínima, fechamentos
models/               modelos Sequelize (MySQL)
services/
  tenantService.ts    acesso a dados por tenant
  demoData.ts          dados de demonstração (tenant/usuário fixos)
types/
  domain.ts           tipos de domínio (Room, Reservation, Expense...)
middleware.ts          protege /dashboard/* (redirecionamento); não cobre /api/*
```

## Autenticação e autorização

- Sessão é um JWT customizado (HMAC-SHA256 via WebCrypto) guardado em cookie httpOnly (`lib/auth.ts`).
- `middleware.ts` só protege `/dashboard/*` para fins de navegação; rotas de API se autenticam sozinhas.
- Rotas em `app/api/tenant/**` usam `lib/tenant-session.ts` (`getVerifiedTenantSession`), que reconsulta usuário/tenant no banco a cada chamada — desativar um colaborador ou mudar suas permissões tem efeito imediato nas rotas de API, mesmo com o token do cookie ainda válido.
- Controle de acesso por feature (`calendar`, `reservations`, `finance`, `team`, etc.) fica em `lib/dashboard-access.ts`.
- Existe um login de demonstração hardcoded (`mocks/demoData.ts`) usado só para apresentações — não é um usuário real do banco.

## Banco de dados

- Sequelize + MySQL. `lib/db.ts` sincroniza o schema automaticamente fora de produção (`DB_AUTO_SYNC` ou `NODE_ENV !== 'production'`) e aplica migrações incrementais (novas colunas) uma única vez no cold start.

## Rotas públicas

- `app/api/public/**` não exigem sessão e são consumidas pela landing page pública da pousada. CORS liberado apenas para esse prefixo em `next.config.ts`.
- O preço da reserva pública é sempre recalculado no servidor a partir do quarto/datas/cupom — nunca confia no valor enviado pelo cliente.
