# @boramarca/whatsapp

A única porta de entrada e saída do WhatsApp (plano, seção 7). Sem acesso a banco: a API passa
_ports_ (callbacks) para contadores, fatos do destinatário e auditoria.

## O que o pacote exporta

| Export                                       | Para quê                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WhatsAppGateway` (interface)                | `createSession`, `getQrCode`, `getPairingCode`, `getStatus`, `disconnect`, `deleteInstance`, `sendText`, `sendPresence`, `parseWebhook`. Não existe envio em massa.                        |
| `EvolutionGateway`                           | Adaptador da Evolution API oficial **v2.3.7** (rotas conferidas no código-fonte dessa imagem). `fetch`, `sleep` e `now` injetáveis.                                                        |
| `FakeGateway`, `FakeClock`                   | Testes e conta de demonstração das lojas: QR, pareamento, conexão (manual ou automática com `autoConnectMs`), queda de sessão, mensagens recebidas injetadas no formato real da Evolution. |
| `parseEvolutionWebhook`                      | Corpo bruto do webhook → `WebhookEvent` (`message` / `connection` / `qr` / `ignored`). Nunca lança.                                                                                        |
| `evaluateSend`                               | **Guarda de envio**, função pura.                                                                                                                                                          |
| `createSender`                               | Guarda + gateway: o **único caminho de saída**.                                                                                                                                            |
| `decideOutbox`, `partitionOutbox`            | Regra da fila de saída: segurar com sessão caída, descartar com mais de 30 min.                                                                                                            |
| `readSendGuardConfig`, `readEvolutionConfig` | Leitura de variáveis de ambiente com Zod.                                                                                                                                                  |

## Como a API (B1) usa

### Sessão

```ts
const gateway = isDemo
  ? new FakeGateway({ autoConnectMs: 5000, clock: { now: () => new Date(), sleep: realSleep } })
  : new EvolutionGateway({ baseUrl: cfg.EVOLUTION_BASE_URL, apiKey: cfg.EVOLUTION_API_KEY });

await gateway.createSession(instance, {
  webhookUrl: `${cfg.PUBLIC_API_URL}/v1/webhooks/whatsapp/${instance}`,
  webhookSecret: cfg.WHATSAPP_WEBHOOK_SECRET,
}); // idempotente: se a instância existe, só atualiza o webhook
await gateway.getQrCode(instance); // GET /whatsapp/qr
await gateway.getPairingCode(instance, phone); // GET /whatsapp/pairing-code (E.164)
await gateway.disconnect(instance); // DELETE /whatsapp/session
await gateway.deleteInstance(instance); // exclusão de conta (C1)
```

Para pareamento por código, peça o código **antes** de pedir QR: com um QR já em andamento a
Evolution ignora o número e o gateway lança `pairing_unavailable` (desconecte e tente de novo).

### Webhook (`POST /v1/webhooks/whatsapp/:instance`)

1. Compare o header `x-boramarca-webhook-secret` (`WHATSAPP_WEBHOOK_SECRET_HEADER`) com o segredo
   em tempo constante; 401 se não bater.
2. `const event = gateway.parseWebhook(body)` e responda 200 na hora.
3. `event.type === 'message'`: se `ignored` (motivos `group`, `status`, `fromMe`, `unsupported`,
   `unknown_sender`), não processe. Senão, deduplique por `providerMessageId`, grave e enfileire
   em `inbound`. Áudio vem decifrado em `audio.base64` (o webhook é criado com `base64: true`).
4. `event.type === 'connection'`: atualize `whatsapp_sessions.status/phone` e publique
   `whatsapp.status` (banner vermelho quando `disconnected`/`error`). Ao voltar a `connected`,
   drene a fila de saída (abaixo).
5. `event.type === 'qr'`: novo QR (o app pode buscar de novo em `/whatsapp/qr`); `qr: null` = limite
   de QR atingido, peça para reconectar.

### Envio: só pelo `sender`

```ts
const sender = createSender({
  gateway,
  config: readSendGuardConfig(),
  ports: {
    recipientFacts: (intent) => db.recipientFacts(intent), // do banco, nunca do chamador
    sessionConnected: (instance) => db.sessionIsConnected(instance),
    getCounters: (instance, now) => redis.counters(instance, now), // minuto e dia
    incrementCounters: (instance, now) => redis.incr(instance, now),
    audit: (entry) => db.auditLog.insert({ actor: 'system', professionalId, ...entry }),
  },
});

const result = await sender.send({ instance, toPhone, text, purpose: 'reply', queuedAt });
// result.status: 'sent' (providerMessageIds para gravar em messages) | 'blocked' | 'failed'
```

- Nunca chame `gateway.sendText`/`sendPresence` direto: o sender é o único caminho (regra 3 do plano).
- `recipientFacts`: `hasInboundMessage` (a pessoa já escreveu para este número),
  `hasPastAppointment` (atendimento anterior), `waitlistOptedInAt` (entrada ativa com
  `opted_in_at`) e, para `purpose: 'waitlist_offer'`, `waitlistSlotHasOtherActiveOffer` (se não
  for informado como `false`, a oferta é bloqueada — uma pessoa por vez por vaga).
- Bloqueios já são gravados via `ports.audit` (`action: 'whatsapp.send_blocked'`, com motivo,
  telefone e tamanho do texto; sem o conteúdo).
- Envie uma mensagem por instância por vez (BullMQ com concorrência 1 por instância), para os
  contadores serem exatos.

### Fila de saída (BullMQ `outbound`, no B1)

Job = `SendIntent` (com `queuedAt` = quando a mensagem foi gerada). No worker:

```ts
switch (decideOutbox(job, { now: new Date(), sessionConnected })) {
  case 'send':
    return sender.send(job); // o sender confere tudo de novo
  case 'hold': /* recoloca com atraso, ou pausa a fila da instância até o connection.update */
  case 'drop': /* grava audit 'whatsapp.send_blocked' reason 'stale_message' e encerra */
}
```

Se `sender.send` devolver `blocked` com `retryable: true` (`session_disconnected`,
`rate_limit_minute`), recoloque o job com atraso; o descarte após 30 min acontece sozinho
(`stale_message`). `partitionOutbox(itens, estado)` ajuda a drenar um lote ao reconectar.

## Regras da guarda (`evaluateSend`)

Ordem: texto vazio/longo → destinatário → idade na fila → sessão → encurtador → limite dia → limite minuto.

| Motivo                                         | Quando                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `recipient_not_allowed`                        | não escreveu, não tem atendimento anterior e não está na lista de espera |
| `waitlist_not_opted_in` / `waitlist_slot_busy` | oferta de vaga sem `opted_in_at` / com outra oferta ativa                |
| `stale_message`                                | mais de 30 min desde `queuedAt`                                          |
| `session_disconnected`                         | sessão caída (retentável)                                                |
| `link_shortener`                               | bit.ly, tinyurl, t.co, cutt.ly e similares (`LINK_SHORTENERS`)           |
| `rate_limit_day` / `rate_limit_minute`         | 200/dia, 8/min por instância (cada parte conta)                          |
| `text_too_long` / `empty_text`                 | não cabe em 2 mensagens de 500 caracteres / vazio                        |

Permitido: `parts` com até 2 textos de até 500 caracteres (corte em parágrafo, fim de frase ou
espaço) e `typingMs` de 2 a 8 s, proporcional ao tamanho, com ±1 s aleatório (`rng` injetável).

## Variáveis

Ver `.env.example`. Evolution: `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`,
`WHATSAPP_WEBHOOK_SECRET`, `PUBLIC_API_URL` (mesmos nomes de `apps/api/.env.example`). Guarda:
`WA_GUARD_PER_MINUTE`, `WA_GUARD_PER_DAY`, `WA_GUARD_TYPING_MIN_SECONDS`,
`WA_GUARD_TYPING_MAX_SECONDS`, `WA_GUARD_MAX_CHARS`, `WA_GUARD_MAX_PARTS`,
`WA_GUARD_DROP_QUEUED_AFTER_MINUTES` (vazio = `SEND_GUARD_DEFAULTS`).

## Amostras de webhook (`test/fixtures`)

| Arquivo                                                                                                                                               | Origem                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `qrcode-updated.json`, `connection-update-connecting.json`, `connection-update-close.json`, `rest-instance-create.json`, `rest-instance-connect.json` | **Capturados** da Evolution v2.3.7 local (instância descartável, já apagada). Só o PNG base64 foi encurtado e `apikey`/`hash` zerados.                                                                             |
| `messages-upsert-{text,audio,group,status,fromme,image,lid-unresolved}.json`, `connection-update-open.json`                                           | **Montados** a partir do código-fonte da v2.3.7 (`prepareMessage`, `connectionUpdate`, envelope do webhook), pois exigem número pareado. Substituir por capturas reais (ver `docs/PENDENCIAS-HUMANAS.md`, item 8). |
