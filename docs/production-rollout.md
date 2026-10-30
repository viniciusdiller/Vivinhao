# Viva Mar: portal do hóspede, vouchers e segurança

Este projeto já está em produção. Este PR foi preparado contra a cópia `viniciusdiller/Vivinhao`, commit base `c5bfd291f4542d8c0ee6ba1d5648e5d42d59996b`. O backend originalmente informado foi `vallevinicius/Admin-VivaMar`, ao qual a integração não tem acesso. Revisar diferenças posteriores à cópia antes de transportar os commits para o repositório original.

## Compatibilidade do banco e contratos

Nenhum model, coluna, enum, índice ou migração foi alterado. Não executar seed, `sync({ alter: true })`, recriação de banco ou migrações para habilitar esta feature. Em produção, manter `NODE_ENV=production` e `DB_AUTO_SYNC=false`. O bootstrap incremental já existente em `lib/db.ts` não foi modificado. Fazer o backup operacional habitual antes de qualquer deploy.

A rota existente `GET/POST /api/public/viva-mar` foi preservada; `/api/public/reservations` é um alias. IDs `mp_<paymentId>` e reservas manuais antigas são mantidos; novos IDs manuais usam UUID para evitar colisões de milissegundos. O índice único existente continua responsável pela deduplicação persistente de pagamentos; a repetição também é reconhecida antes de verificar ocupação/cupons, inclusive quando a primeira chamada ocupou a última unidade. Preços, cupons por data de check-in, estadia mínima sazonal e fechamentos do Viva Mar são preservados.

A confirmação POST agora exige `Authorization: Bearer <RESERVATION_API_SECRET>` e uma referência numérica de pagamento. Não expor a chave ao navegador. O serviço de criação pública saiu de um arquivo `use server`, evitando que seja chamado como Server Action sem passar pela autenticação da rota. A action de reserva manual mantém a checagem de sessão/RBAC.

## Configuração e ordem de implantação

| Local | Variável | Uso |
| --- | --- | --- |
| Ambos, somente servidor | `RESERVATION_API_SECRET` | Mesmo segredo aleatório, pelo menos 32 caracteres; gerar por exemplo com `openssl rand -hex 32`. |
| Admin | `RESEND_API_KEY` | Chave do Resend para enviar vouchers. |
| Admin | `EMAIL_FROM` | Nome/endereço de um domínio verificado no Resend. Não usar endereço Gmail como remetente de domínio não verificado. |
| Admin | `GUEST_PORTAL_URL` | URL HTTPS real da landing page Viva Mar para o link do e-mail. |
| Admin | `JWT_SECRET` | Manter o segredo atual, com pelo menos 32 caracteres; não rotacionar durante este deploy sem necessidade. |
| Admin | `PUBLIC_ROOMS_TENANT_ID` | ID real do tenant ativo, recomendado para tornar explícita a pousada atendida. |
| Admin | `ADMIN_TENANT_ID` | ID real para login administrativo por ambiente, especialmente se houver mais de um tenant. |
| Landing | Variáveis já existentes de API, site e Mercado Pago | Manter URLs/credenciais reais. A URL de API deve continuar apontando para o backend de produção, não para o endereço do repositório copiado. |

1. Configurar o mesmo segredo no servidor da landing e no admin. Configurar Resend e URL do portal no admin. Não publicar nem versionar valores reais.
2. Publicar **primeiro a landing** com o segredo configurado. Ela envia o header adicional; o admin antigo o ignora. O portal só responderá após a atualização do backend.
3. Publicar **depois o admin**. Sem segredo de pelo menos 32 caracteres, o POST de confirmação retorna 503; com segredo incorreto, retorna 401. Não publicar este admin antes da landing atualizada/configurada, pois isso interromperia confirmações de pagamento.
4. Em homologação com cópia do banco, validar login de admin e colaborador, disponibilidade, cupom sazonal, reserva manual e um pagamento de sandbox aprovado com webhook real. Verificar voucher no endereço de teste e consulta do código enviado, remarcação, cancelamento e reenvio.
5. Após deploy, acompanhar erros do webhook, e-mails e reservas pendentes. Notificações que falham na comunicação com o admin retornam 503 para permitir novas tentativas; conferir pagamentos legados pendentes e reconciliar manualmente quaisquer dados antigos inválidos (por exemplo CPF sem dígitos verificadores válidos).

Rollback: reverter primeiro o admin e depois a landing; manter os segredos. Não há rollback de schema, pois não há mudanças de schema. Não combinar o admin novo com uma versão da landing que não envia o segredo.

## Portal e diferenças deliberadas em relação ao Pratagy

- Consulta exata por código externo já existente (`mp_...` ou `manual_...`) mais CPF ou e-mail do titular; o código enviado no e-mail é o mesmo código aceito pelo portal. Não há inferência de ID interno a partir de dígitos arbitrários.
- JWT de hóspede separado criptograficamente da sessão administrativa, válido por 30 minutos e restrito à reserva consultada. Não cria `GuestUser` nem depende de tabela nova. Reconsultar outro código exige nova consulta. Queries usam igualdade de e-mail, nunca `LIKE`, evitando curingas `%` e `_`.
- Listagem e mutações revalidam tenant ativo e vínculo da reserva. Sessão enviada por bearer, em memória no frontend; fechar modal/recarregar encerra o acesso local. Respostas pessoais usam `Cache-Control: no-store`.
- Cancelamento apenas de reserva confirmada, futura e sem check-in/out. **Não há reembolso automático no Mercado Pago**; o modal informa o atendimento pela recepção. A reserva deixa de ocupar o quarto.
- Remarcação usa transação e locks de quarto/reserva, verifica disponibilidade, regras sazonais e fechamentos. Mantém a duração e só permite tarifa calculada igual ao valor de hospedagem registrado; alterações que exigem cobrança/reembolso, inclusive alguns cupons, vão para recepção. Não permite alongar estadia gratuitamente, diferentemente da cópia literal do fluxo de referência. Usa o modelo de tarifa por data de check-in já adotado no projeto.
- E-mail enviado após commit, sem desfazer a reserva se o Resend estiver indisponível. Não inclui CPF, endereço, telefone ou notas internas. HTML escapa dados externos. Configuração ausente não é tratada como envio bem-sucedido e não imprime dados pessoais nos logs. Reenvio autenticado disponível para reservas confirmadas.
- Idempotência de envio usa o header do provedor. **Não existe outbox/fila persistente**: a entrega não é garantida numa queda do processo após commit. Resend e envio real precisam ser verificados em homologação; o código não altera o banco para registrar entrega.

## Segurança portada/adaptada

Login com dummy bcrypt e respostas genéricas para contas inexistentes/inativas; comparação constante e compatibilidade com senha administrativa atual em texto ou bcrypt. Sessões administrativas por ambiente revalidam status do tenant, e sessões de colaboradores revalidam também tenant original. Rotas públicas validam tenant ativo; fallback sem seletor só funciona com exatamente um tenant ativo. Se há vários tenants, configurar explicitamente os IDs antes do deploy.

Rate limits de login, endpoints públicos, upload, webhooks e portal; buckets têm capacidade limitada. Limites são **por processo**, não distribuídos; múltiplas instâncias precisam de proteção central no proxy/WAF ou Redis para um teto global. O proxy deve sobrescrever headers de IP recebidos de clientes. Novos uploads de quartos usam diretório do tenant e limpeza de galeria não remove arquivos de outros tenants; URLs antigas continuam servidas. Magic bytes e recompressão Sharp já existentes foram preservados. Não houve troca de framework/SDK de pagamento ou revisão ampla de dependências de produção; Vitest foi adicionado para testes.

## Referências revisadas

Admin-Pratagy: `3ac4ac9` (login/tenant), `3755f56` (rate limits), `3b42297` (uploads/webhooks), `b1f895f` (dummy hash), `583f2a3` (validação), `b97985d` (consulta e voucher), `2238ade` (regras/e-mail de remarcação). Landing-Page-Pratagy: `b2c226e` (modal), `5fe8309` (serviço), `46bbe5c` (consulta/aviso), `96b77fe` (checkout), `47c75a0` (card testing), `ca5d317` (replay e headers). As diferenças de stack, UI e regras do Viva Mar impedem cherry-pick cego; por isso a implementação foi adaptada.

## Validação

Testes automatizados de autenticação, isolamento, tokens, validação, regras de remarcação, deduplicação, envio e rate limits, mais typecheck e build. Não foram usados banco/credenciais de produção, nem enviados e-mails ou pagamentos reais. Revisão visual em navegador e teste integrado com MySQL/Resend/Mercado Pago reais permanecem para homologação; download de Chromium não estava disponível neste ambiente.
