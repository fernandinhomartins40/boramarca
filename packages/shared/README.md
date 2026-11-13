# @boramarca/shared

O contrato entre todos os pacotes: schemas Zod, tipos, contratos de rota, eventos de tempo real,
ferramentas da IA e tokens visuais. Exporta tudo por `src/index.ts` (e `./theme` isolado).

O pacote é consumido como **TypeScript fonte** (`exports` aponta para `src/index.ts`), sem etapa de
build: a API usa `tsx`, os testes usam Vitest, o site usa `transpilePackages` do Next e o app usa
Metro.

## Arquivos

| Arquivo            | Conteúdo                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.ts`        | `Id`, `IsoDateTime`, `DateOnly`, `TimeOfDay`, `Cents`, `PhoneE164`, `EntityBase`, `ApiError`, `paginated`, `HealthResponse`                     |
| `audit.ts`         | `Actor`, `AuditLogEntry`                                                                                                                        |
| `ai.ts`            | `AiTone`, `Autonomy` (com `change_other_client` travado em `false`), `DEFAULT_AUTONOMY`, `AutonomyPatch`, DTOs de `/ai/*` e `/messages/preview` |
| `salon.ts`         | `Salon`, `Professional`, `Plan`, `ProfessionalRole`, `PROFESSIONS`/`Profession`, `PROFESSION_LABELS`, `QuietHours`, `WaitlistRule`              |
| `auth.ts`          | `OtpCode`, DTOs de `/auth/*` e `/me`                                                                                                            |
| `account.ts`       | `AccountDeletion`, `DeleteMeBody` (código novo + dono com equipe)                                                                               |
| `services.ts`      | `Service`, CRUD, `SUGGESTED_SERVICES` por profissão                                                                                             |
| `schedule.ts`      | `WorkingHours`, `TimeOff` e CRUD                                                                                                                |
| `clients.ts`       | `Client`, `ClientSummary`, CRUD, `ClientStats`                                                                                                  |
| `appointments.ts`  | `Appointment`, `AppointmentServiceItem`, `AppointmentEvent`, `AppointmentView`, agenda, vagas, ações                                            |
| `whatsapp.ts`      | `WhatsAppSession`, status, QR, código de pareamento, webhook, `SEND_GUARD_DEFAULTS`                                                             |
| `conversations.ts` | `Conversation`, `Message`, listas, envio, handoff                                                                                               |
| `ai-tools.ts`      | parâmetros das 10 ferramentas (`marcar`, `buscar_vagas`...), `AiToolCall`, `AgendaActionCall`, `AiTurnResult`                                   |
| `decisions.ts`     | `AiDecision`, opções, `DecisionAnswerBody` (opção ou texto livre + `via`), take-over                                                            |
| `waitlist.ts`      | `WaitlistEntry`, `WaitlistOffer`, `WaitlistPreference`, CRUD, oferta, regra                                                                     |
| `voice.ts`         | `/voice/command`, `/voice/summary`                                                                                                              |
| `devices.ts`       | `Device`, registro de push, ids do canal/categoria de notificação                                                                               |
| `salon-panel.ts`   | `/salon/day`, `/salon/reports`, `/salon/team`, `/salon/clients`, `/salon/plan`                                                                  |
| `leads.ts`         | `Lead` (com campo-armadilha `website`), `KitLead`                                                                                               |
| `alexa.ts`         | envelope da requisição/resposta da skill, `AlexaSettings`                                                                                       |
| `realtime.ts`      | `RealtimeEvent` (união discriminada por `type`), `RealtimeQuery`                                                                                |
| `routes.ts`        | `routes`: cada rota da seção 9 com método, caminho, auth e schemas; `listRoutes()`                                                              |
| `theme.ts`         | tokens visuais (abaixo) e utilitários de contraste WCAG                                                                                         |

Formato no fio: datas em ISO-8601 UTC, datas de calendário `YYYY-MM-DD` no fuso do salão, horas
`HH:mm`, dinheiro em centavos, telefone E.164. Código em inglês; nomes das ferramentas da IA, enums
de produto (`encaixe`, `maos_livres`) e textos em pt-BR.

## OpenAPI

Zod 4 gera JSON Schema nativamente (`z.toJSONSchema`). A API usa `fastify-type-provider-zod` (v7,
compatível com Zod 4) + `@fastify/swagger` para publicar a especificação a partir de `routes`.
O teste `contracts.test.ts` garante que todo schema de rota converte para JSON Schema.

## Tokens visuais (`theme.ts`)

Base do kit (`Bora-Marca-Kit/paleta.json`): violeta `#7138F5`, lima `#D9FC60`, grafite `#191624`,
neutro `#F8F7FC`, mais branco `#FFFFFF`. Fonte Inter.

| Token                   | Claro                 | Escuro                | Origem                                                              |
| ----------------------- | --------------------- | --------------------- | ------------------------------------------------------------------- |
| `bg`                    | `#F8F7FC`             | `#191624`             | kit (neutro / grafite)                                              |
| `surface`               | `#FFFFFF`             | `#231F30`             | branco / **derivado** (grafite clareado)                            |
| `surfaceAlt`            | `#EFECF8`             | `#2E2940`             | **derivado**                                                        |
| `text`                  | `#191624`             | `#F8F7FC`             | kit                                                                 |
| `textMuted`             | `#5F5A70`             | `#B4AFC4`             | **derivado**                                                        |
| `primary` / `onPrimary` | `#7138F5` / `#FFFFFF` | `#7138F5` / `#FFFFFF` | kit                                                                 |
| `primaryText`           | `#7138F5`             | `#A98BFA`             | kit / **derivado** (violeta como texto sobre grafite não atinge AA) |
| `accent` / `onAccent`   | `#D9FC60` / `#191624` | igual                 | kit                                                                 |
| `accentSoft`            | `#F1FDD0`             | `#2F3518`             | **derivado** (card de encaixe em lima claro)                        |
| `success` / `onSuccess` | `#D9FC60` / `#191624` | igual                 | kit (selo "Confirmado")                                             |
| `warning` / `onWarning` | `#F5A524` / `#191624` | igual                 | **derivado**                                                        |
| `danger` / `onDanger`   | `#C8283F` / `#FFFFFF` | `#FF8A9B` / `#191624` | **derivado**                                                        |
| `border`                | `#E2DEEE`             | `#3A3548`             | **derivado**                                                        |

Escalas: espaçamento 4/8/12/16/24/32/48 (`xs`..`xxxl`); raios 8/14/24 + `pill`; tipografia
`display 32`, `title 24`, `heading 20`, `body 17`, `bodySmall 15`, `caption 13`; alvo de toque
mínimo 56. `contrastPairs` lista os pares texto/fundo permitidos; `theme.test.ts` confere AA (4,5:1)
em cada um, nos dois temas. Para usar um par novo, acrescente-o à lista e rode o teste.

O site gera `apps/web/app/theme.css` (Tailwind 4 `@theme`) a partir deste arquivo; o app monta
`apps/mobile/src/theme` a partir dele.

## Regras para quem acrescenta

Acrescente schemas no arquivo do seu domínio; não altere nem remova o que existe. Rotas novas entram
em `routes.ts`. Rode `pnpm --filter @boramarca/shared test`.
