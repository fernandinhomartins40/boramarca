# Cobrança e cadastro grátis

O profissional **se cadastra de graça**, usa **14 dias de teste sem cartão** (contados do cadastro) e depois **assina no
painel web** (`boramarca.com.br/painel` → Plano). A cobrança é pelo [Asaas](https://www.asaas.com) — a conta é
**compartilhada com outro produto do dono**. `docs/01-analise.md` item 12 deixava pagamento fora; o dono pediu (17/11/2026).

Sem `ASAAS_API_KEY` a cobrança fica **desligada**: assinar/trocar/cancelar respondem `503 BILLING_DISABLED`, a tela Plano
mostra "ainda não está disponível" e todo o resto funciona igual (o teste e a expiração continuam valendo).

## Decisões

| Item | Decisão |
|---|---|
| Planos | Os de `packages/shared/src/salon.ts`. Premium não é vendido ainda ("fale conosco") |
| Preço por profissional/mês | Essencial **R$ 49** · Mãos Livres **R$ 79** · Salão **R$ 99 por profissional da equipe** |
| Anual | 10 meses (pague 10, leve 12), uma cobrança por ano |
| Teste | 14 dias, sem cartão, começa no cadastro |
| Tabela | `packages/shared/src/billing.ts` (`PLAN_PRICE_CENTS`, `planValueCents`, `TRIAL_DAYS`). Dinheiro sempre em centavos; vira reais só em `apps/api/src/lib/asaas.ts` |
| Meio | Asaas, `billingType: UNDEFINED` → o pagador escolhe **Pix, boleto ou cartão** na fatura |
| Onde assina | Só no painel web. O app **só mostra a situação** e "Para assinar, acesse boramarca.com.br/painel" (regra das lojas: nada de link de pagamento dentro do app, nem no Android, por simplicidade) |
| Contas antigas | A migração `0006_billing` deixou **todas as contas existentes** (Marina/demo, conta de revisão das lojas, primeiros usuários) como `active` sem assinatura = **isentas**. Os seeds de demonstração e de revisão também nascem isentos |

## Situações da assinatura (`salons.subscription_status`)

| Situação | Quando | Automação (IA, lista de espera, lembretes) |
|---|---|---|
| `trial` | Conta nova. Assinar durante o teste não muda a situação; a 1ª cobrança vence no último dia do teste | Sim, até `trial_ends_at` (ou depois, se já assinou e a 1ª fatura está pendente) |
| `active` | Pagamento confirmado/recebido (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`) e nenhuma outra fatura vencida. Também as contas isentas | Sim |
| `past_due` | Fatura vencida (`PAYMENT_OVERDUE`) | Sim, por `BILLING_GRACE_DAYS` (padrão 7) dias após o vencimento |
| `canceled` | O dono cancelou (ou o Asaas removeu/inativou a assinatura) | Sim, até o fim do que foi pago (`next_due_date`) ou do teste |
| `expired` | Teste acabou sem assinatura; vencida além da tolerância; cancelada e o período acabou | **Não** |

- **Uma regra só:** `automationAllowed()` em `packages/shared/src/billing.ts`. É chamada onde a IA decide responder
  (`modules/whatsapp/inbound.ts`, motivo `subscription_inactive` no `audit_log`), na resposta neutra de Decisão vencida
  (`modules/decisions/service.ts`), nas ofertas automáticas da lista de espera (`modules/waitlist/service.ts`) e no envio
  do lembrete (`modules/agenda/reminders.ts`, o job termina com `paused`).
- **Expirado:** a agenda, o app e o painel continuam abrindo e funcionando; as mensagens dos clientes chegam no app como
  quando a IA está pausada. Banner no app e no painel: **"Seu teste terminou — assine para a IA voltar a atender"**.
- **Job de hora em hora** (BullMQ repetível `billing-expire` na fila `reminders`, `0 * * * *`): marca `expired` quem
  passou do teste sem assinatura, do período cancelado ou da tolerância. Também roda logo após `PAYMENT_OVERDUE` e após
  cancelar. A checagem é feita também na hora (pelo relógio), então nada depende do job ter rodado.
- Pagar depois de expirar volta para `active` (se não restar outra fatura vencida).
- Excluir a conta (o espaço inteiro) cancela a assinatura no Asaas (melhor esforço; falha vai para o log
  `cobrança: assinatura NÃO cancelada no Asaas`).

## API

| Rota | Quem | O quê |
|---|---|---|
| `GET /v1/billing` | dono | Situação, plano, ciclo, valor, dias de teste, próxima fatura (`openInvoiceUrl`), histórico (36) |
| `POST /v1/billing/subscription` | dono | `{ plan, cycle, seats, cpfCnpj, email }`. CPF/CNPJ com dígitos verificadores (CNPJ alfanumérico aceito). Cria o customer (`externalReference` = id do salão) e a subscription. Valor sempre da tabela |
| `PATCH /v1/billing/subscription` | dono | Troca plano/ciclo/profissionais (`PUT /subscriptions/{id}` com `updatePendingPayments: true`; a resposta é conferida) |
| `DELETE /v1/billing/subscription` | dono | Cancela (o Asaas remove as faturas em aberto) |
| `POST /v1/webhooks/asaas` | Asaas | Header `asaas-access-token` comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN` (errado/ausente → 401) |
| `GET /v1/me` | todos | Ganhou `billing: { status, trialEndsAt, automationPaused }` para os banners |

Uma operação de cobrança por salão de cada vez (trava no Redis): clique duplo não cria duas assinaturas.

### Webhook

- **Idempotente** pelo id do evento (`billing_events`) e pelo id da cobrança (`billing_payments.asaas_id`, único).
  Repetição → `200 { received: true, duplicate: true }` sem reprocessar.
- **Conta compartilhada:** cliente que não é nosso, cobrança avulsa (sem `subscription`) ou corpo fora do formato →
  `200 { received: true, ignored: true }`. (Erros em sequência pausam a fila do webhook no Asaas para todos os negócios.)
- Eventos tratados: todos os `PAYMENT_*` (espelham situação, valor, vencimento, fatura, data de pagamento) e
  `SUBSCRIPTION_UPDATED` / `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED`.

## Banco (migração `0006_billing`)

- `salons`: `trial_ends_at`, `subscription_status`, `billing_cycle`, `billing_seats`, `billing_value_cents`,
  `asaas_customer_id`, `asaas_subscription_id`, `billing_cpf_cnpj`, `billing_email`, `next_due_date`.
- `billing_payments` (espelho das cobranças) e `billing_events` (eventos já processados).

## Variáveis (`apps/api/.env.example`, `infra/.env.prod.example`)

| Variável | Padrão | Descrição |
|---|---|---|
| `ASAAS_API_KEY` | vazio | Chave da API. Vazia = cobrança desligada. Começa com `$aact_`: no `.env` use **aspas simples** |
| `ASAAS_API_URL` | `https://api.asaas.com/v3` | Sandbox: `https://api-sandbox.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | vazio | Mesmo token cadastrado no webhook do Asaas (32 a 255 caracteres) |
| `BILLING_GRACE_DAYS` | 7 | Tolerância após o vencimento |

## Cadastro grátis e login por código no e-mail

Em produção ainda não há SMS (o Firebase espera o aumento de cota de faturamento do Google). Para o cadastro funcionar
já, existe um caminho por **código de 6 dígitos no e-mail** (Velomail, templates do e-mail transacional):

- **Cadastro** — site `/cadastro` (CTA "Começar grátis — 14 dias" na landing e no topo) e app (Boas-vindas → "Criar conta
  grátis"): nome, nome do negócio, profissão, celular (E.164 BR) e e-mail → código no e-mail → conta criada com o
  **e-mail confirmado**, o **teste de 14 dias** e o **celular "não verificado"** (`professionals.phone_verified_at` nulo,
  migração `0007_phone_verified`; as contas antigas foram marcadas verificadas). No app, o cadastro rápido continua
  (serviços e horários) com nome, negócio e profissão já preenchidos; no site, entra direto no painel.
- **Login** — celular → "Receber o código por e-mail" (app e painel), além do SMS quando estiver disponível. A resposta
  mostra o e-mail mascarado (`m***@gmail.com`).
- **Rotas:** `POST /v1/auth/signup/request`, `/signup/verify`, `/auth/email-code/request`, `/email-code/verify`
  (`packages/shared/src/signup.ts`, `apps/api/src/modules/signup/`).
- **Proteções (as mesmas do código por SMS):** só o hash do código (HMAC) fica guardado, no Redis, por 10 minutos;
  5 tentativas por código; 10 erros por destino por hora (contador compartilhado com o SMS); 1 pedido por minuto por
  destino; limite por IP (`RATE_LIMIT_OTP_MAX`); o código funciona uma vez; `123456` só fora de produção.
- **Sem revelar se existe:** um celular ou e-mail já cadastrado recebe no e-mail um aviso "você já tem conta" no lugar do
  código (a resposta da API é igual). No login, um celular sem conta (ou sem e-mail confirmado) recebe a mesma resposta
  com um e-mail mascarado fictício e estável, e nada é enviado. O limite de 1 pedido por minuto vale antes de olhar se a
  conta existe.
- **Um cadastro por celular e por e-mail confirmado.**
- **Celular verificado** quando: entra por **SMS** (código próprio ou Firebase), ou o **WhatsApp pareado** na conta é o
  mesmo número (o número conectado vem da Evolution; o 9º dígito é ignorado na comparação). Se o celular de uma conta
  feita por e-mail é provado por SMS pela primeira vez, o e-mail volta a "aguardando confirmação" e um link novo é
  enviado — assim quem cadastrou o número de outra pessoa perde o login por e-mail.

## Testes

- `apps/api/src/billing.test.ts` — Asaas falso (fetch substituível): assinar no teste (1ª cobrança no fim do teste),
  CPF inválido, 2ª assinatura recusada, trocar, cancelar, 503 sem chave, só dono, webhook com token errado/ausente,
  cliente desconhecido, cobrança avulsa, corpo estranho, evento duplicado, vencida → `past_due` → `expired` após a
  tolerância → paga volta a `active`, teste vencido → `expired`, IA não responde e lembrete pausa.
- `apps/api/src/signup.test.ts` — cadastro, duplicados sem revelar, 5 tentativas, celular não-BR, login por e-mail,
  celular sem conta, SMS e WhatsApp verificando o celular.
- `apps/web/components/painel/subscription.test.ts`, `apps/web/components/site/signup.test.ts`,
  `apps/mobile/src/features/account/subscription.test.ts`, `apps/mobile/__tests__/signup-email.test.tsx`.

## Não verificado contra o Asaas real

Testado só com o Asaas falso. Antes de cobrar clientes reais, faça no **sandbox**: assinar, pagar a fatura (Pix de teste
ou "confirmar recebimento em dinheiro"), trocar de plano (o `PUT` aceitar `value`), cancelar e o formato real dos eventos
(`payment.dueDate`, `subscription.nextDueDate`). Passo a passo de produção: `docs/PENDENCIAS-HUMANAS.md`, item 19.

## Fora do escopo (por enquanto)

- E-mails nossos de cobrança (fatura vencida, teste acabando): o Asaas já notifica o pagador.
- Limite de profissionais pelo número de assentos do plano Salão (o número é só comercial).
- Venda do Premium, cupons, nota fiscal.
- Sessões já abertas por quem cadastrou o número de outra pessoa não são derrubadas quando o dono real prova o
  celular por SMS (só o login por e-mail é cortado); elas expiram com o refresh token.
