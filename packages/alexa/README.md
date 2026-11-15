# @boramarca/alexa

Skill da Alexa do Bora Marca (plano, seção 14). Sem acesso a banco e sem importar `apps/api`: a API
injeta as mesmas funções de voz e de decisão que já usa nas rotas `/voice/command` e `/decisions`.

## O que o pacote exporta

| Export                                                                             | Para quê                                                                                                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createAlexaSkill({ skillId, ports, timeoutMs? })`                                 | Skill do ASK SDK (`ask-sdk-core`) com todos os intents. Rejeita pedido de outra skill.                                                           |
| `AlexaPorts` (interface)                                                           | As funções que a API injeta (abaixo).                                                                                                            |
| `createRequestVerifier({ fetchText?, now?, trustedRoots? })`                       | Validação exigida pela Amazon: URL do certificado, cadeia até uma CA confiável, SAN `echo-api.amazon.com`, `Signature-256` e carimbo de ± 150 s. |
| `createAlexaRequestHandler({ skill, verify, log? })`                               | O que a rota chama: `handle(rawBody, headers)` → `{ status: 200 \| 400, body }`. Nunca lança.                                                    |
| `createVoiceMonkeyClient({ token })`, `createDecisionAnnouncer(...)`               | Anúncio proativo pelo Voice Monkey v3 (`POST https://api-v3.voicemonkey.io/announce`).                                                           |
| `parseAuthorizeRequest`, `authorizeRedirectUrl`, `verifyPkce`, `parseTokenRequest` | Vínculo de conta (OAuth 2.0, código de autorização + PKCE): validação do que a Amazon envia.                                                     |
| `readAlexaConfig()`                                                                | Lê as variáveis de `.env.example` com Zod.                                                                                                       |
| `skill/interaction-model.pt-BR.json`, `skill/skill.json`                           | Modelo de interação pt-BR e manifesto, para colar no console (ver `docs/pendencias/C4.md`).                                                      |

## Intents

| O profissional diz                                                                                     | Intent                                                                                           | O handler faz                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| "Alexa, abra o Bora Marca"                                                                             | `LaunchRequest`                                                                                  | Lê a decisão pendente mais urgente (e guarda o id na sessão) ou dá as opções.                                   |
| "…quantos clientes ainda tenho hoje", "tem horário vago", "quem é o próximo", "alguém mandou mensagem" | `ClientesRestantesIntent`, `HorariosVagosIntent`, `ProximoClienteIntent`, `NovasMensagensIntent` | `voiceCommand(pid, { text: VOICE_SAMPLE_QUESTIONS[i] })` e fala `speech`.                                       |
| "sim" / "não" (com a sessão aberta)                                                                    | `AMAZON.YesIntent` / `AMAZON.NoIntent`                                                           | Responde a decisão lida na sessão (ou a mais urgente) com o `optionId` cujo rótulo começa com Sim/Não — sem IA. |
| "Alexa, diga ao Bora Marca que sim, para daqui 15 minutos"                                             | `ResponderSimIntent`                                                                             | `answerDecision(pid, id, { text: 'sim, para daqui 15 minutos', via: 'alexa' })`.                                |
| "Alexa, diga ao Bora Marca que pode, mas marca daqui 15 minutos"                                       | `ResponderDecisaoIntent`                                                                         | Idem, com o texto livre (a API passa pela IA).                                                                  |
| ajuda, parar, cancelar, início, fora do modelo                                                         | `AMAZON.*`                                                                                       | Respostas fixas.                                                                                                |

Sem token de vínculo (ou token que a API não reconhece), toda resposta é "vincule sua conta" com o
cartão `LinkAccount`.

**Contingência dos 8 segundos.** Cada pedido tem um prazo único (`timeoutMs`, padrão 6 s, deixando
2 s para rede e verificação dentro de `ALEXA_RESPONSE_BUDGET_MS`). Estourou: agenda → "A agenda está
demorando…"; resposta de decisão → "Recebi sua resposta e ainda estou processando. Confira no app"
(a chamada continua na API, então a frase é verdadeira). `voiceCommand` recebe um `AbortSignal` que
dispara no estouro, para a API cortar a chamada à IA.

## Como a API (onda 4) monta a rota

```ts
import {
  createAlexaSkill,
  createAlexaRequestHandler,
  createRequestVerifier,
  createVoiceMonkeyClient,
  createDecisionAnnouncer,
  readAlexaConfig,
} from '@boramarca/alexa';

const cfg = readAlexaConfig();

const skill = createAlexaSkill({
  skillId: cfg.ALEXA_SKILL_ID,
  ports: {
    // token emitido pelo próprio endpoint de token (abaixo) → professional id, ou null
    professionalIdFromToken: (token) => alexaTokens.professionalIdFor(token),
    // mesma função de POST /voice/command (agenda do dia já resumida); respeite o signal
    voiceCommand: (pid, body, signal) => voice.command(pid, body, { signal }),
    listDecisions: (pid, status, limit) => decisions.list(pid, status, limit),
    answerDecision: (pid, id, body) => decisions.answer(pid, id, body),
  },
});
const handle = createAlexaRequestHandler({
  skill,
  verify: createRequestVerifier(),
  log: (msg, err) => app.log.warn({ err }, msg),
});

// POST /v1/alexa/skill — pública (auth: 'public' no contrato), sem JWT.
// A assinatura cobre os bytes exatos: a rota precisa do corpo cru, não do JSON re-serializado.
app.register(async (scope) => {
  scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body),
  );
  scope.post('/v1/alexa/skill', async (req, reply) => {
    const r = await handle(req.body as Buffer, req.headers);
    return reply.code(r.status).send(r.body);
  });
});

// Anúncio proativo (plano, seção 5): ligado por profissional em AlexaSettings.
if (cfg.VOICE_MONKEY_TOKEN) {
  const announce = createDecisionAnnouncer({
    client: createVoiceMonkeyClient({ token: cfg.VOICE_MONKEY_TOKEN }),
    settingsFor: (pid) => alexaSettings.get(pid), // AlexaSettings | null
    log: (msg, err) => app.log.warn({ err }, msg),
  });
  decisions.onCreated(announce); // retorna na hora; falha do Voice Monkey só vai para o log
}
```

`decisions.answer` lança `AppError` com `code`; o handler entende `ANSWER_NOT_UNDERSTOOD`
(pergunta de novo), `DECISION_CLOSED` e `NOT_FOUND` ("já foi resolvida"). Qualquer outro erro vira
"Não consegui falar com a agenda agora".

### Vínculo de conta (rotas da API)

A Amazon usa OAuth 2.0 com código de autorização e PKCE. A API guarda códigos e tokens; o pacote só
valida:

1. `GET /v1/alexa/oauth/authorize` — `parseAuthorizeRequest(req.query, { clientId })`. Se falhar,
   mostre o erro na página (não redirecione). Se passar, mostre o login por código SMS (página
   própria para celular, sem pop-up), gere um código de uso único (≈ 5 min) ligado ao profissional,
   ao `code_challenge` e ao `code_challenge_method`, e redirecione para
   `authorizeRedirectUrl(q.redirect_uri, code, q.state)`.
2. `POST /v1/alexa/oauth/token` (form-urlencoded) — `parseTokenRequest(req.headers.authorization,
req.body, { clientId, clientSecret })`; `invalid_client` → 401, demais erros → 400. Para
   `authorization_code`: confira o código (uso único, mesmo `redirect_uri`) e
   `verifyPkce(code_verifier, challenge, method)`; falhou → `invalid_grant`. Responda
   `AlexaOAuthTokenResponse` com `expires_in >= ALEXA_ACCESS_TOKEN_TTL_S` e um refresh token que não
   expire (ou dure ≥ 180 dias). Responda em menos de 4,5 s. Só use `invalid_grant` para desfazer o
   vínculo de propósito: a Amazon apaga os tokens do usuário.
3. `professionalIdFromToken` consulta esses tokens.

Os schemas (`AlexaOAuthAuthorizeQuery`, `AlexaOAuthTokenRequest`, `AlexaOAuthTokenResponse`,
`AlexaOAuthError`) estão em `packages/shared/src/alexa.ts`.

## Testes

`pnpm --filter @boramarca/alexa test` — sem internet e sem chave:

- `test/fixtures/*.json`: requisições gravadas no formato atual do Alexa Skills Kit, uma por intent.
- `skill.test.ts`: cada intent, vínculo ausente, erros da API e a contingência dos 8 s com timers falsos.
- `verify.test.ts`: CA, intermediária e certificado da Alexa gerados no teste (node-forge);
  assinatura, carimbo, validade, SAN, cadeia e regras da URL do certificado.
- `voice-monkey.test.ts`: cliente com `fetch` simulado e o anunciador.
- `oauth.test.ts`: pedido de autorização, PKCE (vetor da RFC 7636) e pedido de token.
