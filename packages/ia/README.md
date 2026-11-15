# @boramarca/ia

Entende mensagens e escreve textos. **Nunca toca no banco**: a saída é sempre uma chamada de
ferramenta validada (schemas de `packages/shared/src/ai-tools.ts`) que a API executa pelo motor de
regras (plano, seções 1, 5, 6 e 15).

## API pública

| Função                                                                             | Para quê                                                                                                                          | Rede?     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `createLlmClientFromEnv(env?)`                                                     | `LlmClient` com principal + reserva, limite de tempo, 1 nova tentativa por modelo e troca automática. `null` sem `LLM_PRIMARY_*`. | sim       |
| `ResilientLlmClient`, `OpenAiCompatibleClient`                                     | Peças do cliente acima, para montar à mão.                                                                                        | sim       |
| `FakeLlm`, `toolReply`                                                             | LLM determinístico por regras (regex na última mensagem ou predicado). Guarda `requests` e `sentText()`.                          | não       |
| `buildContext(input)`                                                              | **Único** lugar que monta o que vai para a IA. Aplica a redução de dados.                                                         | não       |
| `interpretClientMessage(ctx, llm)`                                                 | Mensagem do cliente → `AiTurnResult` (`note` + `calls` validadas).                                                                | sim       |
| `interpretProfessionalAnswer(decision, text, { now, timezone, llm? })`             | Texto livre do profissional → `ProfessionalAnswer`. Regras pt-BR antes; LLM só se não entender.                                   | só no LLM |
| `interpretVoiceCommand(text, daySummary, { llm? })`                                | Comando de voz → `{ intent, speech }`. As 4 perguntas do plano são determinísticas.                                               | só no LLM |
| `renderMessage(kind, tone, params)`                                                | Mensagens padrão por tom (`descontraido`, `simpatico`, `formal`).                                                                 | não       |
| `createTranscriberFromEnv(env?)`, `OpenAiCompatibleTranscriber`, `FakeTranscriber` | Áudio → texto (`/audio/transcriptions`).                                                                                          | sim       |
| `maskPii`, `hasClinicalInfo`, `SYSTEM_PROMPT`, `AI_TOOLS`                          | Utilitários expostos para testes e auditoria.                                                                                     | não       |

### Mensagem do cliente (API, worker de entrada)

```ts
import { buildContext, interpretClientMessage, createLlmClientFromEnv } from '@boramarca/ia';

const llm = createLlmClientFromEnv(); // uma vez, no boot; null = IA desligada
const ctx = buildContext({
  now: message.receivedAt, // ISO
  timezone: salon.timezone,
  professional: { professions, tone: pro.aiTone, autonomy: pro.autonomy, spaceName, address },
  client: {
    id,
    name /* nome completo: só o primeiro vai */,
    isKnown,
    upcoming: [{ id, startsAt, serviceNames }],
  },
  services: [{ id, name, durationMinutes, priceCents }],
  day: {
    date: 'YYYY-MM-DD',
    appointments: [{ id, clientId, clientName, startsAt, endsAt, serviceNames, status }],
    freeSlots: [iso],
  },
  history: lastMessages.map((m) => ({ author: m.author, text: m.text, at: m.createdAt })), // ~10, mais antigas primeiro
  message: { text, transcribedFromAudio },
});
const turn = await interpretClientMessage(ctx, llm); // nunca lança
// turn.note → messages.ai_note; turn.calls → motor de regras (autonomia decide executar ou criar Decisão)
```

Garantias: chamadas validadas com `AiToolCall`; resposta inválida → 1 nova tentativa com os erros →
`perguntar_ao_profissional` (`type: 'duvida'`, opção "Eu respondo"). Modelo fora do ar → o mesmo.
Informação clínica é retirada de `note`, `perguntar_ao_profissional.question`, `cancelar.reason` e
`entrar_lista_de_espera.preference.note` (filtro por palavras, além da proibição no prompt). A API
ainda deve conferir que os ids existem e pertencem ao profissional.

### Resposta do profissional (`POST /decisions/:id/answer` com `{ text }`)

```ts
const answer = await interpretProfessionalAnswer(decision, body.text, { now, timezone, llm });
// { kind: 'accept', optionId, action }  → rodar action (já com o horário ajustado) pelo motor; ele checa conflito
// { kind: 'decline', optionId, action } → rodar action se houver; senão responder ao cliente (renderMessage('decision_answer'))
// { kind: 'take_over' }                 → mesmo efeito de POST /decisions/:id/take-over
// { kind: 'unknown' }                   → pedir para repetir
```

Padrões determinísticos: "sim", "pode", "ok", "1" → aceita a ação proposta; "não", "agora não" →
recusa; "deixa que eu respondo", "eu respondo" → assume; "daqui 15 minutos", "daqui meia hora" →
agora + N; "empurra 20 min", "15 minutos depois" → horário proposto + N; "pode às 16h30", "marca
17:00", "às 16" → esse horário no dia proposto (fuso do espaço). "não, marca às 16h" vai para o LLM.

### Voz (`POST /voice/command`)

```ts
const { intent, speech } = await interpretVoiceCommand(
  text,
  {
    now,
    timezone,
    appointments: [{ startsAt, clientFirstName, serviceNames, status }],
    freeSlots: [iso],
    unreadMessages: [{ clientFirstName, count }],
  },
  { llm },
);
```

Quando o corpo traz `decisionId`, a API deve usar `interpretProfessionalAnswer` (intent `answer_decision`).

### Textos

`renderMessage(kind, tone, { now, timezone, clientFirstName?, startsAt?, previousStartsAt?, serviceName?, delayMinutes?, expiresInMinutes?, spaceName? })`.
`kind`: todos os `MessagePreviewKind` (`booking_confirmation`, `reschedule`, `cancellation`,
`delay_notice`, `reminder`, `waitlist_offer`, `welcome`, `decision_answer` = recusa, `tone_sample`)
mais `hold` ("Já te confirmo!", igual em todos os tons) e `decision_expired`.

### Testes de ponta a ponta na API

```ts
import { FakeLlm, toolReply } from '@boramarca/ia';
const llm = new FakeLlm([
  { when: /tem horário hoje à tarde/, reply: toolReply({ name: 'perguntar_ao_profissional', arguments: { ... } }, 'Entendi como: pedido de horário') },
]);
```

A regra casa com a **última** mensagem enviada ao modelo, que é a mensagem nova do cliente (já mascarada).

## Prompt e redução de dados

- Mensagens enviadas: `[system: SYSTEM_PROMPT fixo] [user: CONTEXTO variável] [user: mensagem nova]`.
  O prefixo fixo aproveita o cache de entrada dos provedores. Tom e autonomia ficam no contexto.
- Vai para a IA: primeiro nome do cliente e dos outros clientes do dia, ids, serviços com preço,
  agenda do dia resumida, vagas, endereço do espaço, últimas mensagens. Nome completo vira primeiro
  nome dentro dos textos; telefones, e-mails e números com 6+ dígitos viram `[telefone]`, `[email]`,
  `[número]`. Nunca vai telefone.

## Provedores

Tudo é formato OpenAI: trocar de provedor é trocar `LLM_*_BASE_URL`, `LLM_*_API_KEY` e `LLM_*_MODEL`.
Valores padrão em [.env.example](.env.example), conferidos em 2026-11-12:

| Provedor                          | Base URL                                                                                                                                                                       | Modelos                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| DeepSeek                          | `https://api.deepseek.com`                                                                                                                                                     | `deepseek-flash`, `deepseek-v4-pro`          |
| Qwen (Model Studio, Singapura)    | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` (recomendado) ou `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (legado, ainda funciona) | `qwen3.8-flash`, `qwen3.7-plus`              |
| Qwen (Model Studio, EUA/Virgínia) | `https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1` ou `https://dashscope-us.aliyuncs.com/compatible-mode/v1`                                               | conferir disponibilidade na região           |
| Groq (transcrição)                | `https://api.groq.com/openai/v1`                                                                                                                                               | `whisper-large-v3-turbo`, `whisper-large-v3` |

### Contas de saúde: provedor hospedado fora da China (recomendado)

Saber que alguém se consulta com psicólogo ou dentista é dado sensível (LGPD). Para essas contas,
aponte o principal e a reserva para provedores fora da China. Exemplos:

```sh
# OpenAI (EUA)
LLM_PRIMARY_BASE_URL=https://api.openai.com/v1
LLM_PRIMARY_MODEL=gpt-6-luna          # mais barato da lista atual com suporte a funções
# OpenRouter (EUA; roteamento na UE em https://eu.openrouter.ai/api/v1 nos planos Business/Enterprise)
LLM_FALLBACK_BASE_URL=https://openrouter.ai/api/v1
LLM_FALLBACK_MODEL=<id do modelo no catálogo do OpenRouter, ex.: um DeepSeek ou Qwen de pesos abertos servido por provedor dos EUA/UE>
```

Confira na página do provedor onde os dados são processados e se ele guarda as requisições. O Qwen
na região dos EUA (Virgínia) também é uma opção. Hoje a escolha é global (variáveis de ambiente);
se for preciso um provedor por conta, a API pode criar dois `LlmClient` e escolher pelo
`HEALTH_PROFESSIONS` do profissional. **A decisão final depende de revisão jurídica** (análise, seção 5, item 2).

## Avaliação

`pnpm eval` (na raiz) roda os 45 casos de [evals/cases.ts](evals/cases.ts) contra a IA real. Sem
`LLM_PRIMARY_*` ele pula com mensagem e sai com código 0. Com chaves, sai com código 1 se acertar
menos de 80%. Não faz parte do portão de qualidade.

```sh
cd packages/ia
LLM_PRIMARY_BASE_URL=... LLM_PRIMARY_API_KEY=... LLM_PRIMARY_MODEL=... pnpm eval
```

## Fontes consultadas (2026-11-12)

- DeepSeek, primeiros passos e modelos: https://api-docs.deepseek.com/
- Alibaba Cloud Model Studio, compatibilidade OpenAI: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope
- Model Studio, base URLs por região: https://www.alibabacloud.com/help/en/model-studio/base-url
- Model Studio, lista de modelos: https://www.alibabacloud.com/help/en/model-studio/models
- Groq, speech-to-text: https://console.groq.com/docs/speech-to-text
- OpenAI, modelos: https://developers.openai.com/api/docs/models
- OpenRouter, quickstart: https://openrouter.ai/docs/quickstart
