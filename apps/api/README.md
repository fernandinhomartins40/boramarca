# @boramarca/api

Fastify 5 + Drizzle (Postgres) + Redis. Único dono do banco e das regras (plano, seções 2–4 e 9).

## Rodar

```bash
pnpm dev:infra                 # na raiz: Postgres 5440, Redis 6390, Evolution 8085
cp apps/api/.env.example apps/api/.env
pnpm db:migrate && pnpm db:seed
pnpm --filter @boramarca/api dev   # http://localhost:3333
```

- Login da demonstração: **Marina, `+5511900000001`, código `123456`** (qualquer telefone aceita
  `123456` fora de produção). Equipe: Camila `…0002`, Júlia `…0003`, Pedro `…0004`.
- Documentação: `GET /v1/docs` (Swagger UI) e `GET /v1/openapi.json`, gerados dos schemas de
  `@boramarca/shared`.

## Módulos (`src/modules/<nome>/index.ts`, carregados pelo autoload em `/v1`)

| Módulo          | Rotas                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`, `GET/PATCH/DELETE /me`                                                                                                                              |
| `catalog`       | CRUD `/services` + `POST /services/reorder`, CRUD `/working-hours` + `PUT /working-hours`, CRUD `/time-off`                                                                                                                        |
| `clients`       | CRUD `/clients` (busca, ordem, "sumidos", cursor), `GET /clients/:id/stats`, `GET /clients/:id/appointments`                                                                                                                       |
| `agenda`        | `GET /agenda?date=`, `GET /slots`, `POST /appointments`, `GET /appointments/:id`, `POST /appointments/:id/{reschedule,cancel,confirm,arrive,done,no-show,delay-notice}`                                                            |
| `realtime`      | `WS /realtime?token=<accessToken>` (fecha com 4401 se o token for inválido)                                                                                                                                                        |
| `health`        | `GET /health`, `GET /v1/health`                                                                                                                                                                                                    |
| `whatsapp`      | `POST/DELETE /whatsapp/session`, `GET /whatsapp/{qr,pairing-code,status}`, `POST /webhooks/whatsapp/:instance`                                                                                                                     |
| `conversations` | `GET /conversations`, `GET /conversations/:id`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/handoff`                                                                                                          |
| `decisions`     | `GET /decisions`, `POST /decisions/:id/answer`, `POST /decisions/:id/take-over`                                                                                                                                                    |
| `ai`            | `POST /ai/pause`, `POST /ai/resume`, `PATCH /ai/settings`, `POST /messages/preview`                                                                                                                                                |
| `devices`       | `POST /devices`, `DELETE /devices/:id`                                                                                                                                                                                             |
| `waitlist`      | CRUD `/waitlist`, `POST /waitlist/:id/offer`, `PATCH /waitlist/rule`                                                                                                                                                               |
| `voice`         | `POST /voice/command`, `GET /voice/summary?moment=open\|close`                                                                                                                                                                     |
| `salon`         | `GET /salon/day`, `GET /salon/reports`, CRUD `/salon/team`, `GET /salon/clients` (`format=csv`, `onWaitlist`), `GET /salon/plan`, `POST /salon/decisions/:id/answer`, `POST /salon/appointments/:id/reschedule`, `POST /kit-leads` |
| `site`          | `POST /leads` (pública, limite por IP, campo-armadilha `website`)                                                                                                                                                                  |
| `alexa`         | `POST /alexa/skill` (assinatura da Amazon), `GET/POST /alexa/oauth/authorize`, `POST /alexa/oauth/token`, `GET/PATCH /alexa/settings`, `DELETE /alexa/link`                                                                        |

Peças transversais:

- `src/lib/route.ts` — `route(app, routes.x.y, handler)`: método, caminho, schemas (validação,
  serialização, OpenAPI) e autenticação saem do contrato de `@boramarca/shared`.
- `src/plugins/auth.ts` — JWT de acesso (`JWT_ACCESS_TTL`) e de renovação (`JWT_REFRESH_TTL`,
  outro segredo). `req.scope = { professionalId, salonId, role }`: **toda consulta filtra por ele**.
- `src/plugins/infra.ts` — `app.db`, `app.redis`, `app.bus` (eventos de tempo real) e `app.agenda`.
- `src/lib/errors.ts` — `AppError(status, code, mensagem pt-BR)`; toda resposta de erro segue `ApiError`.
- `src/modules/auth/otp.ts` — `OtpSender` (dev: escreve o código no log, sem o telefone; produção
  sem provedor: 503), `requestOtp`, `consumeOtp` (código guardado só como HMAC, expira em 10 min,
  reenvio após 60 s, 5 tentativas). `consumeOtp(..., 'delete_account')` serve ao `DELETE /me`.

## Motor de agenda (`src/modules/agenda`)

- `engine.ts` — regras puras (sem banco nem relógio): `checkSlot`, `computeFreeSlots`,
  `countFittingSlots`, `freeIntervals`. Problemas: `OUTSIDE_WORKING_HOURS`, `DOES_NOT_FIT`,
  `DURING_LUNCH`, `TIME_OFF`, `CONFLICT` (todos 409). Encaixe (`isFitIn`) pode sair do expediente e
  do almoço, nunca cair sobre folga ou outro atendimento.
- `service.ts` — `createAgenda({ db, bus })`: `findFreeSlots`, `servicesDuration`, `getDay`,
  `getAppointment`, `book`, `reschedule`, `cancel`, `confirm`, `markArrived`, `markDone`,
  `markNoShow`. Cada escrita roda numa transação, grava `appointment_events` + `audit_log` e publica
  `appointment.changed`.
- A garantia final contra horário duplicado é a restrição `appointments_no_overlap`
  (`drizzle/0001_appointments_no_overlap.sql`, btree_gist sobre `tstzrange(starts_at, ends_at, '[)')`
  por profissional, só para `scheduled/confirmed/in_service`). Corrida perdida vira 409 `CONFLICT`.

### Como outros módulos/workers usam o motor

```ts
// dentro da API (rotas, B1, C1): app.agenda já existe
const ctx = { professionalId, actor: 'ai' as const }; // 'ai' | 'professional' | 'client' | 'system'
const slots = await app.agenda.findFreeSlots(professionalId, '2026-11-12', 50, { period: 'tarde' });
const appt = await app.agenda.book(ctx, { clientId, serviceIds, startsAt, isFitIn: false });
await app.agenda.confirm({ professionalId, actor: 'client' }, appt.id); // lembrete respondido "1"

// fora do Fastify (worker em outro processo):
import { createAgenda } from './modules/agenda/service';
import { createRedisEventBus } from './lib/event-bus';
const agenda = createAgenda({ db, bus: createRedisEventBus(REDIS_URL) });

// ganchos (rodam depois do commit; erro no gancho só é registrado no log)
app.agenda.onSlotFreed((e) => {
  /* C1: lista de espera. e.startsAt/endsAt, e.offerToWaitlist */
});
app.agenda.onAppointmentChanged((e) => {
  /* B1/C1: mensagem ao cliente (e.notice), jobs de lembrete */
});
```

`onSlotFreed` dispara em `cancel` e `reschedule` (o horário antigo), só se a vaga ainda não passou.
`e.notice = { notifyClient, messageText }` vem do app; **a agenda nunca envia WhatsApp** — quem
liga o gancho manda pela guarda de envio.

### Tempo real

`EventBus` (`src/lib/event-bus.ts`): `publish(professionalId, event)` / `subscribe`. A implementação
padrão usa Redis pub/sub (canal `boramarca:rt:<professionalId>`), então eventos publicados por um
worker chegam aos WebSockets da API. `createMemoryEventBus()` serve para testes.
`realtimeEvent('decision.created', { decision })` monta o evento com `at`.

## Mensagens, IA e Decisões (B1)

Ligação em `src/plugins/messaging.ts` (`app.messaging`): gateway, LLM, transcrição, push, filas
BullMQ (`src/lib/queues.ts`) e workers, que rodam no próprio processo da API.

1. **Webhook** (`modules/whatsapp/index.ts`): header `x-boramarca-webhook-secret` comparado em tempo
   constante (401 se não bater; 503 sem `WHATSAPP_WEBHOOK_SECRET`). Resposta 200 imediata.
2. `modules/whatsapp/inbound.ts`: grava cliente (cria se novo), conversa e mensagem;
   `provider_message_id` único deduplica (`whatsapp.duplicate_ignored` no audit). Job `inbound`.
3. Worker `inbound` (um por conversa por vez, trava no Redis): transcreve áudio, para se a IA está
   desligada/pausada, sem LLM ou com a conversa em `human` (só notifica o app); senão `buildContext` →
   `interpretClientMessage` → `ai_note` → motor de regras.
4. **Motor de regras** (`modules/ai/tools.ts`): confere que **todo id** (agendamento, serviço,
   cliente, inclusive dentro das opções de uma Decisão) é do profissional; se algum não for, nada
   roda (`ai.tool_rejected`) e vira Decisão "Eu respondo". Autonomia: `marcar`/`remarcar` só com
   `book_free_slot_known_client` e cliente já atendido (encaixe sempre pergunta); `cancelar` com
   `cancel_on_request` (e avisa o profissional); `confirmar_presenca` com `confirm_reminders`.
   **Mexer no agendamento ou mandar mensagem para outro cliente sempre vira Decisão**
   (`change_other_client` não é lido). Ação que não rodou como a IA pode ter prometido → a resposta
   da IA não é enviada. Ações rodam por `modules/ai/actions.ts` → `app.agenda` (createAgenda).
5. **Decisões** (`modules/decisions/service.ts`): prazo `DECISION_DEADLINE_MINUTES` (padrão 10) em
   job `decisions` (`timeout-<id>`): envia "Já te confirmo!", grava `timeout_notified_at`, notifica e
   **continua pendente**. Expira (`expire-<id>` no horário proposto, ou quando outro agendamento ocupa
   o horário) com aviso ao cliente. `POST /decisions/:id/answer` aceita `optionId` ou `text`
   (`interpretProfessionalAnswer`); "deixa que eu respondo" = take-over. `onCreated(fn)` é o ponto de
   extensão para o anúncio da Alexa/Voice Monkey.
6. **Envio** (`modules/whatsapp/send.ts`, o módulo de envio): `outbox.enqueue` grava a mensagem e
   enfileira em `outbound`; o worker usa só `createSender` (guarda), uma mensagem por instância por
   vez (trava no Redis), segura com sessão caída e descarta após 30 min. `recipientFacts` vem do
   banco; `waitlistSlotHasOtherActiveOffer` é sempre passado (false salvo outra oferta ativa para a
   mesma vaga). Regra ESLint em `eslint.config.mjs` proíbe `.sendText(`/`.sendPresence(` fora de
   `send.ts` e `gateway.ts`.
7. **Lembretes** (`modules/agenda/reminders.ts`, fila `reminders`): job `reminder-<id>` em
   `starts_at - reminder_lead_minutes`, criado/recolocado em `created`/`rescheduled` e removido em
   qualquer outro estado. Sai com `purpose: 'reminder'` ("Responda 1 para confirmar"); o "1" volta
   pelo fluxo normal (IA → `confirmar_presenca`, com `confirm_reminders`). A guarda só deixa sair
   para quem já escreveu ou tem atendimento anterior.
8. **Lista de espera** (`modules/waitlist/service.ts`, fila `waitlist`): `onSlotFreed` →
   `offerNext`: entrada `waiting` mais antiga cuja preferência (dias/períodos no fuso) e serviço cabem
   na vaga e que ainda não recebeu essa vaga; trava `pg_advisory_xact_lock` por vaga (uma oferta
   ativa por vez). Envio com `purpose: 'waitlist_offer'` + `waitlistSlotStartsAt` (send.ts passa
   `waitlistSlotHasOtherActiveOffer` calculado de `waitlist_offers`). Expira em
   `waitlist_rule.waitMinutes` (job `wl-expire-<offerId>`) e passa para a próxima. No `inbound`,
   "sim"/"não" claros para uma oferta aberta são tratados antes da IA: "sim" marca pelo motor de
   agenda (conflito revalidado), "não" passa a vaga adiante.
9. **Exclusão de conta** (`modules/auth/account.ts`): valida (dono com equipe → 409
   `OWNER_HAS_TEAM`, ou `transferOwnershipTo` / `deleteWholeSalon`), só então consome o código
   `delete_account`; desconecta e apaga a instância (falha do provedor = 502, nada apagado), remove
   jobs com dados pessoais do Redis, apaga o profissional (cascata: clientes, agenda, conversas,
   decisões, lista de espera, auditoria), `otp_codes` e `leads` do telefone, o espaço se ficar vazio,
   e grava `account_deletions` com HMAC do telefone. Remover alguém da equipe usa o mesmo apagamento.
10. **Limite por IP** (`@fastify/rate-limit`, contadores no Redis): `POST /leads`
    (`RATE_LIMIT_LEADS_MAX`/10 min) e cada rota `/auth/otp/*` (`RATE_LIMIT_OTP_MAX`/10 min). Atrás do
    Caddy, `TRUST_PROXY=true`.

Gateway: Evolution com `EVOLUTION_BASE_URL`+`EVOLUTION_API_KEY`; sem elas, `FakeGateway` fora de
produção (em produção, as chamadas falham com 502). A conta de revisão (`REVIEW_PHONE`) usa sempre o
WhatsApp simulado (instância `demo-…`, conecta sozinho em 5 s). LLM/transcrição sem chave: simulados
fora de produção, desligados em produção. Push: `PUSH_PROVIDER` (`expo` em produção, `fake` fora).

## Testes

```bash
pnpm --filter @boramarca/api test
```

Usam a infraestrutura do Docker: banco `boramarca_test` (recriado do zero a cada execução por
`src/test/global-setup.ts`) e Redis db 1. Sobrescreva com `DATABASE_URL_TEST` / `REDIS_URL_TEST`.

- `agenda/engine.test.ts` — regras puras e todos os casos da seção 4 (inclui virada de dia).
- `agenda/service.test.ts` — o motor contra o Postgres: marcações simultâneas (só uma vence),
  restrição de exclusão sem o motor, cancelar/remarcar com ganchos, fluxo de status.
- `auth/auth.test.ts` — request/verify/refresh, tentativas, expiração, `123456` recusado em produção.
- `isolation.test.ts` — um profissional não lê nem altera nada de outro (404 em todas as rotas).
- `api.test.ts` — cadastro, clientes e estatísticas por HTTP, WebSocket e OpenAPI.
- `growth.test.ts` — lembretes (agendar/remarcar/cancelar/enviar/"1" confirma), lista de espera
  (ordem, preferência, só quem pediu, expiração, recusa, aceite, regra desligada, oferta manual),
  as quatro perguntas de voz e os resumos, confirmar, aviso de atraso, histórico do cliente.
- `account.test.ts` — `DELETE /me`: nenhuma linha de nenhuma tabela contém telefone, nome ou id do
  profissional e dos clientes; instância removida; dono com equipe (transferir / espaço inteiro).
- `salon.test.ts` — relatórios com o seed (`seedDemo(db, now)`, `src/db/seed-demo.ts`), dia,
  equipe, plano, CSV, acesso só do dono. `rate-limit.test.ts` — limites por IP.
- `routes.test.ts` — falha se alguma rota do contrato não tiver handler.
- `alexa.test.ts` — requisição assinada (CA de teste gerada no teste, verificador injetado),
  vínculo de conta ponta a ponta (authorize → code → token → refresh → a skill reconhece o
  profissional e responde decisão com `via: 'alexa'`), PKCE errado/código reusado, anúncio do
  Voice Monkey com HTTP simulado e token cifrado.
- `review.test.ts` — conta de revisão com a Evolution configurada: entra, agenda, decisão
  simulada pelo WhatsApp de demonstração, responde, exclui e recria; `EvolutionGateway` nunca
  chamado; telefone de conta real recusado; dados em sábado e domingo.
- `salon-owner.test.ts` — dono responde decisão e remarca atendimento de alguém da equipe (motor
  de agenda, `audit_log` com `ownerId`), 404 para outro espaço, 403 para quem não é dono; filtro
  `onWaitlist`.
- `gaps.test.ts` — `GET /conversations/:id` e o `verify` depois de um código `delete_account`.
- `logger.test.ts` — telefone, texto, código e tokens censurados; URL sem query string.
- `messaging.test.ts` — ponta a ponta com `FakeGateway`/`FakeLlm`/`FakePush`, filas reais: fluxo do
  PDF (passos 1–7, incluindo o prazo esgotado e a expiração), mensagem duplicada, segredo errado, IA
  pausada, `change_other_client` travado, ids de outro profissional recusados, assumir/devolver
  conversa, áudio, guarda bloqueando destinatário desconhecido, prévia e dispositivos.

## Alexa (`src/modules/alexa`, plano seção 14)

- `POST /v1/alexa/skill`: escopo próprio com parser de JSON que entrega o **corpo cru** (`Buffer`)
  para `createAlexaRequestHandler` (assinatura `Signature-256`, cadeia até CA confiável, carimbo
  ± 150 s). Portas: `professionalIdFromToken` (tabela `alexa_tokens`), `voiceCommand` (o mesmo
  `createVoice().command` de `POST /voice/command`, com o `AbortSignal` repassado à chamada da IA),
  `decisions.list` e `decisions.answer` com `via: 'alexa'`. Sem `ALEXA_SKILL_ID`: 503.
- Vínculo de conta (OAuth 2.0 código + PKCE): `GET /v1/alexa/oauth/authorize` valida o pedido
  (`parseAuthorizeRequest`; erro = página com mensagem, nunca redireciona) e mostra a página de
  login (HTML servido pela API, só tokens de `theme.ts` e o logo do kit, sem JavaScript nem
  pop-up). O formulário volta por `POST` na mesma URL: telefone → código (mesmo `OtpSender` do
  app) → código de uso único de 5 min ligado ao `code_challenge` → `303` para a Amazon.
  Só entra quem já tem conta (número desconhecido: 404, nada é criado). `POST
/v1/alexa/oauth/token` (form-urlencoded, Basic ou credenciais no corpo): troca o código
  (`verifyPkce`, mesmo `redirect_uri`) ou renova; tokens guardados só como SHA-256, access de 1 h,
  refresh girado a cada uso e válido por 90 dias sem uso; um vínculo novo apaga o anterior;
  `DELETE /v1/alexa/link` desvincula (excluir a conta apaga em cascata).
- Ajustes por profissional em `alexa_settings` (`GET/PATCH /v1/alexa/settings`): anúncio
  ligado, dispositivo e o **token do Voice Monkey da conta do próprio profissional**, cifrado com
  AES-256-GCM (`DATA_ENCRYPTION_KEY`, `src/lib/secret-box.ts`) e nunca devolvido
  (`voiceMonkeyTokenSet`). Sem token próprio, usa `VOICE_MONKEY_TOKEN` se existir.
- Anúncio: `decisions.onCreated` → lê os ajustes fora do fluxo (fire-and-forget) →
  `createDecisionAnnouncer`; falha do Voice Monkey só vai para o log.

## Conta de revisão das lojas (`REVIEW_PHONE` + `REVIEW_OTP`)

- `POST /auth/otp/request` com `REVIEW_PHONE` não envia nada (funciona sem provedor de SMS);
  `POST /auth/otp/verify` com `REVIEW_OTP` chama `ensureReviewAccount` (`src/db/seed-review.ts`):
  espaço próprio "Espaço Demonstração (revisão)", uma profissional, 5 clientes fictícios, 5
  atendimentos no dia de hoje (qualquer dia da semana: expediente de domingo a domingo) e uma
  Decisão pendente. Idempotente: recria se não existe (inclusive depois de o revisor excluir a
  conta) e renova se a agenda de hoje está vazia. `pnpm db:seed` também a cria quando as
  variáveis existem.
- WhatsApp sempre simulado: a sessão é `demo-<id>` e o `RoutingGateway` manda `demo-*` para o
  `FakeGateway` (conecta sozinho 5 s depois do QR); a Evolution nunca é chamada (teste).
- Isolamento: é uma conta comum (escopo por profissional), sem equipe; não alcança dados de
  outros. Se `REVIEW_PHONE` pertencer a uma conta que não é a de revisão, o login com o código fixo
  é recusado (403 `REVIEW_PHONE_IN_USE`).

## Exclusão de conta pelo site sem criar cadastro

`POST /auth/otp/verify` olha qual código está pendente: se só existe um código `delete_account`
(o site pediu o código já para excluir), o login funciona para conta existente e **número sem conta
responde 404 `ACCOUNT_NOT_FOUND`, sem criar nada**. O código é gasto no login; `DELETE /me` pede
outro `delete_account`. Com código `login` o comportamento do app não muda.

## Logs

`src/lib/logger.ts`: censura `phone`, `toPhone`, `fromPhone`, `text`, `code`, tokens, segredos do
OAuth e headers de autenticação (no nível de cima e um abaixo) e tira a query string das URLs
(`/realtime?token=`, `pairing-code?phone=`). O código de desenvolvimento vai na mensagem do log
(só fora de produção).

## Imagens e produção

`infra/docker/api.Dockerfile` (contexto = raiz do repositório): `pnpm deploy --prod` da API, roda
como `node` com `node --import tsx src/server.ts`; migrações no serviço `migrate` do
`infra/docker-compose.prod.yml`. Ver `docs/OPERACAO.md`.

## Variáveis

Ver `.env.example` (comentado). Obrigatórias: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` (32+ caracteres). `REVIEW_PHONE` + `REVIEW_OTP` ligam a conta de revisão das
lojas (funciona também em produção).

## Migrações

`pnpm --filter @boramarca/api db:generate` gera SQL a partir de `src/db/schema.ts`. O que o Drizzle
não expressa (EXCLUDE, CHECK) vai em migração custom: `npx drizzle-kit generate --custom --name=...`.
