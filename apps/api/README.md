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

| Módulo          | Rotas                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `GET/PATCH/DELETE /me`                                                                                   |
| `catalog`       | CRUD `/services` + `POST /services/reorder`, CRUD `/working-hours` + `PUT /working-hours`, CRUD `/time-off`                                                             |
| `clients`       | CRUD `/clients` (busca, ordem, "sumidos", cursor), `GET /clients/:id/stats`, `GET /clients/:id/appointments`                                                            |
| `agenda`        | `GET /agenda?date=`, `GET /slots`, `POST /appointments`, `GET /appointments/:id`, `POST /appointments/:id/{reschedule,cancel,confirm,arrive,done,no-show,delay-notice}` |
| `realtime`      | `WS /realtime?token=<accessToken>` (fecha com 4401 se o token for inválido)                                                                                             |
| `health`        | `GET /health`, `GET /v1/health`                                                                                                                                         |
| `whatsapp`      | `POST/DELETE /whatsapp/session`, `GET /whatsapp/{qr,pairing-code,status}`, `POST /webhooks/whatsapp/:instance`                                                          |
| `conversations` | `GET /conversations`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/handoff`                                                                         |
| `decisions`     | `GET /decisions`, `POST /decisions/:id/answer`, `POST /decisions/:id/take-over`                                                                                         |
| `ai`            | `POST /ai/pause`, `POST /ai/resume`, `PATCH /ai/settings`, `POST /messages/preview`                                                                                     |
| `devices`       | `POST /devices`, `DELETE /devices/:id`                                                                                                                                  |
| `waitlist`      | CRUD `/waitlist`, `POST /waitlist/:id/offer`, `PATCH /waitlist/rule`                                                                                                    |
| `voice`         | `POST /voice/command`, `GET /voice/summary?moment=open\|close`                                                                                                          |
| `salon`         | `GET /salon/day`, `GET /salon/reports`, CRUD `/salon/team`, `GET /salon/clients` (`format=csv`), `GET /salon/plan`, `POST /kit-leads`                                   |
| `site`          | `POST /leads` (pública, limite por IP, campo-armadilha `website`)                                                                                                       |

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
- `routes.test.ts` — falha se alguma rota do contrato (exceto Alexa) não tiver handler.
- `messaging.test.ts` — ponta a ponta com `FakeGateway`/`FakeLlm`/`FakePush`, filas reais: fluxo do
  PDF (passos 1–7, incluindo o prazo esgotado e a expiração), mensagem duplicada, segredo errado, IA
  pausada, `change_other_client` travado, ids de outro profissional recusados, assumir/devolver
  conversa, áudio, guarda bloqueando destinatário desconhecido, prévia e dispositivos.

## Variáveis

Ver `.env.example` (comentado). Obrigatórias: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` (32+ caracteres). `REVIEW_PHONE` + `REVIEW_OTP` ligam a conta de revisão das
lojas (funciona também em produção).

## Migrações

`pnpm --filter @boramarca/api db:generate` gera SQL a partir de `src/db/schema.ts`. O que o Drizzle
não expressa (EXCLUDE, CHECK) vai em migração custom: `npx drizzle-kit generate --custom --name=...`.
