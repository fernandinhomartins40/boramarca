# Verificação final — definição de pronto (plano, seção 18)

> Nota: os arquivos de `docs/pendencias/` citados abaixo foram consolidados em `docs/PENDENCIAS-HUMANAS.md` e removidos.

Data: 2026-11-16. Commit verificado: `42309ea` (main). Tudo rodado num **clone limpo**
(`git clone c:\FuseDev\boramarca C:\bm-clean`), seguindo só o README (install, `.env` a partir dos
`.env.example`, migrate, seed, typecheck, lint, test, build). Máquina: Windows 11, Node 24.21.0,
pnpm 10.28.0, JDK 17, Docker com o compose project `boramarca` já de pé.

Bancos descartáveis no mesmo Postgres (com `btree_gist`): `bm_v2` (API/seed), `bm_v2_test`
(`DATABASE_URL_TEST`) e `bm_fluxo` (criado e apagado pelo roteiro do fluxo); Redis dbs 4, 5 e 7.
Nenhum volume foi apagado e nada do repositório principal foi alterado além dos arquivos listados
em "Arquivos novos". Bancos descartáveis, dbs do Redis, imagens, chave de teste, API, Next,
Gradle e emulador foram encerrados/removidos no fim. **O clone `C:\bm-clean` não pôde ser apagado**
(a remoção foi barrada pela checagem de segurança do ambiente): apagar à mão. Os `.env` dele
são cópias dos `.env.example`, sem segredo real.

**Infra:** `pnpm dev:infra` **não** foi rodado do clone de propósito: o compose monta
`./postgres/init.sql` por caminho relativo, então subir do clone recriaria o container do Postgres
do projeto `boramarca` apontando para `C:\bm-clean` (que seria apagado). Conferido de pé com
`docker compose -p boramarca ps` (postgres, redis, evolution `healthy`).

## Resultado por item

| # | Item | Resultado |
|---|---|---|
| 1 | `pnpm typecheck`, `lint`, `test`, `build` na raiz | **passou** |
| 2 | Fluxo de exemplo de ponta a ponta contra Postgres e Redis reais | **passou** |
| 3 | APK de debug, release com chave de teste, verificações de iOS | **passou** (exceto a checagem de schema do `expo-doctor`, que precisa de rede: não verificável aqui) |
| 4 | `apps/web` build de produção e as cinco páginas respondem | **passou** |
| 5 | Exclusão de conta pelo app e pela web contra a API local; dados apagados | **passou** (app: pela camada de dados, não pela tela; ver abaixo) |
| 6 | Conta de demonstração entra e navega por todas as abas sem WhatsApp pareado | **passou** (API e APK de release no emulador) |
| 7 | `apps/mobile/store/` com todos os arquivos da seção 13 | **passou** |
| 8 | `docker compose -f infra/docker-compose.prod.yml config` válido; imagens da API e do site | **passou em parte**: as duas imagens constroem e o config é válido com `--env-file infra/.env.prod.example`; o comando literal falha sem `infra/.env.prod` |
| 9 | Sem segredo no repositório nem `TODO` sem registro em `docs/PENDENCIAS-HUMANAS.md` | **falhou** (o arquivo não existe; sem segredo e sem `TODO`) |
| 10 | Itens "Só uma pessoa consegue fazer" em `docs/PENDENCIAS-HUMANAS.md` | **falhou** (o arquivo não existe) |

### 1. Portão de qualidade — passou

```
pnpm install                     # Done in 1m 35.1s
pnpm db:migrate && pnpm db:seed  # [db:migrate] Migrações aplicadas. / [db:seed] Espaço Aurora pronto para 2026-11-16
pnpm typecheck                   # 7 projetos Done, EXIT=0 (1m08s)
pnpm lint                        # 7 projetos Done, EXIT=0 (1m02s)
DATABASE_URL_TEST=…/bm_v2_test REDIS_URL_TEST=…/5 pnpm test   # EXIT=0 (2m40s)
pnpm build                       # EXIT=0 (1m16s); next build gera 18 páginas estáticas
```

Testes: shared 52, web 29, ia 41, alexa 85, whatsapp 69, mobile 143 (17 suítes), api 133
(19 arquivos) — **552 testes, 0 falhas**.

Observação: `apps/api/package.json` lê `.env` em `dev`/`start`/`db:*`, mas o Vitest não; sem
`DATABASE_URL_TEST` exportado a suíte usa `boramarca_test` (compartilhado com o repositório de
trabalho) mesmo que o `.env` aponte outro banco.

### 2. Fluxo de exemplo do PDF (passos 1–7) — passou

Dois níveis de evidência:

- `apps/api/src/messaging.test.ts` (dentro do `pnpm test` acima): FakeGateway/FakeLlm/FakePush e
  filas BullMQ reais contra o Postgres e o Redis do Docker.
- **Roteiro novo `scripts/verificar-fluxo.mjs`**, com a API num processo separado e tudo por
  HTTP: confere a infra, cria `bm_fluxo` com `btree_gist`, roda `db:migrate` e `db:seed`, sobe
  `apps/api/scripts/api-fluxo.ts` (a `buildApp` real, FakeGateway porque não há Evolution
  configurada, FakeLlm roteirizado que lê `appointmentId`/`serviceId` do contexto como um modelo
  faria, relógio ajustável, `DECISION_DEADLINE_MINUTES=1`, segredos JWT e do webhook aleatórios),
  cadastra uma profissional pelo login (`123456`), conecta o WhatsApp simulado, manda as mensagens
  pelo webhook com `x-boramarca-webhook-secret` no formato `messages.upsert` da Evolution e confere
  pela API. No fim encerra a API (`taskkill /T`), apaga `bm_fluxo` e limpa o Redis db 7.

```
node scripts/verificar-fluxo.mjs
OK    infra: postgres/redis/evolution saudável
OK    API de pé em http://127.0.0.1:3355
OK    login com código de desenvolvimento cria conta nova
OK    WhatsApp simulado conectado (bm-db68b99c-…)
OK    webhook com segredo errado -> 401
OK    passo 1: webhook de Carlos aceito (200)
OK    passo 2: resposta a Carlos enviada -> "Tranquilo, Carlos! Cancelei seu horário de hoje às 15h. Quer remarcar?"
OK    passo 2: horário das 15h de Carlos cancelado -> "cancelled"
OK    passo 2: nota "Entendi como" gravada -> "Entendi como: cancelamento do horário de hoje às 15h"
OK    passo 3: webhook de Fulano aceito (200)
  [fluxo-llm] contexto do passo 3 mostra a vaga das 15h: true
  [fluxo-llm] contexto do passo 3 sem telefone: true
OK    passo 4: Decisão criada (novo_horario) -> "Fulano quer horário hoje à tarde. O Carlos das 15h desmarcou. Posso marcar o Fulano às 15h?"
OK    passo 4: nada marcado nem prometido a Fulano antes da resposta
OK    passo 5: resposta do profissional aceita -> 200
OK    passo 5: confirmação falada -> "Marquei Fulano hoje às 14h20."
OK    passo 5: agendamento às 14h20 -> "2030-03-09T17:20:00.000Z"
OK    passo 5: Decisão resolvida por voz -> "resolved"
OK    passo 6: confirmação enviada a Fulano pela guarda -> "Prontinho, Fulano! Seu horário está marcado para hoje às 14h20 (Sessão). Até lá!"
OK    passo 6: agenda do dia mostra 14h20
OK    passo 7: Decisão criada para Beltrano -> "Beltrano quer horário hoje às 16h. Posso marcar?"
OK    passo 7: mensagem neutra no prazo esgotado -> "Já te confirmo!"
OK    passo 7: Decisão continua pendente
OK    passo 7: nada marcado às 16h por tempo esgotado
OK    passo 7: Decisão expira quando o horário é ocupado e o cliente é avisado -> "Desculpa a demora, Beltrano! O horário de hoje às 16h não está mais disponível. Posso ver outro para você?"
OK    passo 7: responder depois de expirada -> 409
TUDO OK em 275 s
```

Não coberto pelo roteiro (coberto só pelos testes): o anúncio no Modo Balcão/Alexa do passo 4
(push e `decision.created` são conferidos em `messaging.test.ts`; Voice Monkey em `alexa.test.ts`)
e o lembrete automático do passo 6 (`growth.test.ts`).

### 3. Android e iOS — passou

Android (no clone, chave de teste descartável gerada fora do repositório com `keytool
-genkeypair … -validity 30`, apagada no fim):

```
cd apps/mobile
EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_URL=http://10.0.2.2:3333 npx expo prebuild --platform android --clean   # Finished prebuild, 17 s
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64 -Pandroid.injected.signing.*=…
  BUILD SUCCESSFUL in 36m 30s — 1073 actionable tasks; app-release.apk 44 MB
./gradlew assembleDebug -PreactNativeArchitectures=x86_64
  BUILD SUCCESSFUL, 43m 26s; app-debug.apk 96,5 MB
apksigner verify --print-certs app-release.apk → V2 Signer: CN=Teste Descartavel
aapt2 dump badging → package br.com.boramarca.app, targetSdkVersion 36, native-code x86_64
```

Permissões do manifesto mesclado do release
(`app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`) e do
APK (`aapt2 dump permissions`): `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MICROPHONE`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`,
`RECORD_AUDIO`, `VIBRATE`, `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE`,
`br.com.boramarca.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — **as mesmas 11 de
`store/declaracoes-android.md`**, nenhuma a mais. `BalcaoService` com
`foregroundServiceType="microphone"` e `exported="false"`. `usesCleartextTraffic="true"` porque o
build usou a API local `http://` (como o documento explica). O APK de release foi instalado e aberto
no emulador (item 6).

iOS (seção 11, "Verificação"):

- Configuração resolvida (`EAS_BUILD_PROFILE=production npx expo config --type introspect --json`):
  `bundleIdentifier br.com.boramarca.app`; `NSMicrophoneUsageDescription` e
  `NSSpeechRecognitionUsageDescription` em pt-BR; `ITSAppUsesNonExemptEncryption false`;
  `LSApplicationQueriesSchemes ["whatsapp"]`; sem `NSFaceIDUsageDescription`, sem
  `UIBackgroundModes`, sem `NSUserTrackingUsageDescription`; `privacyManifests` com
  `NSPrivacyTracking false` e os tipos de dado (telefone, nome, …); `aps-environment production`.
- `npx expo export --platform ios` — EXIT=0, `entry-….hbc` de 8,5 MB.
- `npx expo-doctor` — 19 de 20 checagens passaram; "Check Expo config schema" falhou com
  `fetch failed` porque exige a API da Expo (sem rede liberada nesta verificação). **Não
  verificável aqui** esse único item.

### 4. Site — passou

`pnpm build` (item 1) inclui `next build` sem erro. Com `next start -p 3000` do clone:

```
/ 200 69150B · /privacidade 200 47056B · /termos 200 35014B · /excluir-conta 200 27717B · /contato 200 26267B
node apps/web/scripts/capture-landing.mjs http://localhost:3000 <scratchpad>
OK nas 4 larguras (390, 768, 1024, 1366) × 5 páginas: sem rolagem horizontal, 0 imagens distorcidas, 0 object-fit: cover
```

### 5. Exclusão de conta — passou

- **Web** (`API_URL=http://localhost:3344 node apps/web/scripts/e2e-site.mjs +5511977023454`, só
  teclado, Chrome instalado): "Não existe conta com este número" sem criar conta; conta criada
  pelo login do app; exclusão em 4 passos → "Conta excluída." Depois, no banco:
  `professionals`, `otp_codes` e `leads` desse telefone = 0, `account_deletions` = 1.
- **App** (`EXPO_PUBLIC_API_URL=http://localhost:3344 npx tsx apps/mobile/scripts/roteiro-api.ts`,
  a mesma camada `src/data` que as telas usam): conta de teste nova → `DELETE /me` → `GET /me` 404 →
  refresh recusado (sessão encerrada) → Marina intacta. **A tela** "Excluir conta" não foi tocada
  num aparelho/emulador (ver item 6).
- "Nenhum dado pessoal sobra": `apps/api/src/account.test.ts` (no `pnpm test`) varre todas as
  tabelas atrás de telefone, nome e ids.

### 6. Conta de demonstração — passou

API com `REVIEW_PHONE=+5511999990000 REVIEW_OTP=246810` (número fictício, como o README manda),
login pelo código fixo e as rotas de cada aba, sem WhatsApp pareado:

```
verify 200 · /me "Espaço Demonstração (revisão)" · /agenda?date=2026-11-16 5 itens · /decisions?status=pending 1
/conversations 1 · /clients 5 · /services 2 · /working-hours 7 · /waitlist 0
/whatsapp/status {"status":"disconnected",…}
```

**No app (APK de release do clone, emulador `boramarca_api35` iniciado com `-read-only`, Android
15/API 35, fuso ajustado para `America/Sao_Paulo`):** "Já tenho conta" → `(11) 99999-0000` →
código `246810` → Agenda (4 atendimentos, R$ 480, linha do tempo e almoço), Decisões
("Pendentes (1)"), Conversas, Clientes (Beatriz Lima…) e Ajustes ("Ana Demonstração ·
Esteticista") abrem sem erro; em todas aparece a faixa vermelha "WhatsApp desconectado — toque
para reconectar" (esperado sem pareamento, mas é a primeira coisa que o revisor da loja vê).

Observação: com o emulador no fuso padrão (GMT) a agenda abriu no dia seguinte e vazia, com o
indicador "agora" às 00:27 — `src/utils/agenda.ts` trabalha no fuso do aparelho, não no do
espaço. Um revisor fora do Brasil vê horários deslocados.

### 7. Pasta `store/` — passou

`textos-google-play.md`, `textos-app-store.md`, `seguranca-de-dados-google.md`,
`privacidade-app-apple.md`, `declaracoes-android.md` (com classificação etária, seção 3),
`notas-para-revisao.md`, `PUBLICAR.md`, `capturas/android/` (10 PNG 1080×1920) e
`capturas/iphone-pendentes.md`.

### 8. Produção em Docker — passou em parte

- `docker compose -f infra/docker-compose.prod.yml config` **literal** sai com erro: as variáveis
  obrigatórias (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `EVOLUTION_API_KEY`, `ACME_EMAIL`,
  `API_DOMAIN`, `SITE_DOMAIN`) são `${VAR:?}` e não há `infra/.env.prod`. É o comportamento
  desejado (não sobe produção sem segredo), mas o comando da seção 18 como está escrito não passa.
- `docker compose --env-file infra/.env.prod.example -f infra/docker-compose.prod.yml config --quiet`
  → EXIT=0.

- `docker build -f infra/docker/api.Dockerfile -t bm-verif-api:tmp .` → EXIT=0 (2m35s), 495 MB;
  `docker run --rm --entrypoint sh bm-verif-api:tmp -c "id -un"` → `node`; sem `.env*` nem
  `src/test` em `/app`.
- `docker build -f infra/docker/web.Dockerfile -t bm-verif-web:tmp .` → EXIT=0 (10m18s), 1,13 GB
  (sem `output: 'standalone'`; a D4 já registra essa melhoria).
- A primeira tentativa das duas caiu com `rpc error: code = Unavailable … EOF` / "frontend grpc
  server closed unexpectedly": o daemon do Docker travou por falta de memória enquanto o emulador
  e o Gradle rodavam juntos. Repetidas sozinhas, passaram. A infra `boramarca` não foi afetada.
- Imagens removidas no fim (`docker rmi bm-verif-api:tmp bm-verif-web:tmp`).

### 9 e 10. `docs/PENDENCIAS-HUMANAS.md` — falhou

`git ls-files | grep -i PENDENCIAS-HUMANAS` não acha nada; também não existe `docs/OPERACAO.md`
(aceite da fase "Fechamento", seção 17). As pendências estão espalhadas em `docs/pendencias/*.md`
(A1…F0), por agente, sem o arquivo único que os itens 9 e 10 pedem.

- Segredos: `git grep` por padrões de chave (sk-, gsk_, AKIA, AIza, ghp_, chave privada, JWT) e
  `git log --all -p` = 0 ocorrências; nenhum `.env`, `.jks`, `.keystore`, `.p8`, `.p12` ou
  `google-services` versionado.
- `git grep -E "\bTODO\b|FIXME"` = só a frase do próprio plano.

## Conferência visual

**Landing** (`landing-1366.png` e `landing-390.png` do build do clone × `05-referencias/landing-aprovada.png`):
mesma estrutura, ordem de seções, textos, cores e ilustrações. Diferenças: a tipografia dos títulos
é a Inter do kit (a referência usa uma display mais arredondada/pesada); o herói é mais baixo e o
celular menor que na referência; no card "Cancelou? Aproveite a vaga" a referência mostra o card
lima "1 pedido de encaixe" e o site usa o card violeta flutuante "Beatriz pode vir às 16h?"; os
interruptores do bloco "A IA facilita" têm bolinha escura (referência: branca); há a nota extra
Android/iPhone no bloco do Modo Balcão e o link "Excluir conta" no rodapé (exigências do plano).
Nada distorcido nem rolagem horizontal nas 4 larguras.

**App** (capturas reais `apps/mobile/store/capturas/android/` × `Bora-Marca-Kit/05-referencias/`):

- `01-agenda` × `04-agenda`: tokens, logo, card "Agora", pílula "Balcão", faixa de resumo e abas
  conferem. A captura foi tirada às 20:15: mostra "Livre pelo resto do dia" no lugar de "Agora ·
  Ana Paula" e nenhuma linha do tempo visível; a data aparece truncada ("Hoje, domingo, 15 de
  nove…"); **o botão + cobre o valor "R$" da faixa de resumo**. Fraca como captura de loja.
- `02-decisoes` × `06-decisoes`: card "Responder pela notificação" empurra a Decisão para baixo e
  os botões Sim/Não ficam fora da tela; sem sino/perfil no cabeçalho; ícone de conversa em vez do
  do WhatsApp (correto pela regra 10).
- `03-conversas` × `07-conversas`: mesmo layout e filtros (o último chip cortado, rola na
  horizontal); só **uma** conversa na captura (a referência mostra a lista cheia); sem
  sino/perfil.
- `06-modo-balcao` × `08-voz`: orb, "Diga Ei, Bora Marca", "Sair" e "Assistente ativo" conferem;
  sem a pílula "Próximo: …" (não havia próximo às 20:22), deixando o divisor solto; botão "Falar"
  porque não há chave da Picovoice (esperado).
- `08-ajustes` × `11-ajustes`: captura rolada (sem logo/título "Ajustes"); "WhatsApp conectado"
  com check violeta contornado (referência: lima preenchido); seção "Aparência" a mais. **Não há
  entrada de Alexa** em lugar nenhum.

## Lista do que falhou

1. **`docs/PENDENCIAS-HUMANAS.md` não existe** (itens 9 e 10; também `docs/OPERACAO.md`, aceite
   do fechamento). Reproduzir: `git ls-files docs | grep -iE "PENDENCIAS-HUMANAS|OPERACAO"` → vazio.
2. **Comando literal do item 8 falha** sem `infra/.env.prod`: `docker compose -f
   infra/docker-compose.prod.yml config` → "required variable POSTGRES_PASSWORD is missing a
   value" (e outras 5). Passa com `--env-file infra/.env.prod.example`. Ajustar o plano ou
   documentar o comando com `--env-file`.
3. **Assistente do Balcão não exige a notificação** — `apps/mobile/app/balcao/configurar.tsx:413`
   ("Continuar" sem condição) e `:452` (`activate()` inicia o serviço sem conferir
   `getNotificationPermission()`); nem o microfone é exigido para "Continuar" (só
   `app/balcao/index.tsx` redireciona sem microfone). **Reproduzido nesta verificação** (APK de
   release, emulador API 35): `adb shell pm grant br.com.boramarca.app
   android.permission.RECORD_AUDIO` (só o microfone) → `adb shell am start -a
   android.intent.action.VIEW -d boramarca://balcao/configurar` → "Continuar" → "Ativar Modo
   Balcão". `dumpsys activity services` mostra `BalcaoService isForeground=true types=0x00000080`
   (microfone ligado), `dumpsys package` mostra `POST_NOTIFICATIONS: granted=false` e
   `dumpsys notification` não lista nenhuma notificação do app: o microfone fica aberto sem a
   notificação fixa "Bora Marca está ouvindo"/"Pausar" na gaveta.
4. **O app não tem tela de Alexa** (vincular/desvincular, anúncio, token do Voice Monkey).
   `grep -rli alexa apps/mobile/app apps/mobile/src` → nada; a API tem `GET/PATCH
   /v1/alexa/settings` e `DELETE /v1/alexa/link` sem cliente no app. Reproduzir: Ajustes → não
   há entrada de Alexa.
5. **Capturas de loja fracas** (não bloqueia a seção 18, mas a seção 13 pede "dados de
   demonstração"): `store/capturas/android/01-agenda.png` (dia vazio, "+" sobre o "R$"),
   `03-conversas.png` (uma conversa), `08-ajustes.png` (rolada). Refazer com o relógio do emulador
   no meio do expediente da conta de revisão.
6. Limites ainda abertos de `docs/revisao-seguranca.md`: B5 em parte (rotação dos logs do Docker
   por idade fica para a operação), B8 sem aviso imediato no WebSocket ao excluir a conta (fecha
   em até 15 min), e a seção "Não verificado" (Evolution `DELETE /instance` apagando tudo do banco
   `evolution`/Redis db 6; texto jurídico).
7. **A agenda do app usa o fuso do aparelho**, não o do espaço (`apps/mobile/src/utils/agenda.ts:14`,
   decisão documentada). Reproduzir: emulador em GMT, entrar com a conta de revisão às 21h de
   Brasília → "Hoje, terça, 17" vazio, "agora" às 00:27; com `adb shell cmd alarm set-timezone
   America/Sao_Paulo` aparece o dia certo. Risco para o revisor da loja fora do Brasil.

Observação (não é falha): `docs/revisao-seguranca.md` diz "Não rodei testes"; esta verificação
rodou a suíte inteira (552 testes), que inclui os testes citados para cada correção (M1–M11,
B1–B10), e todos passaram.

## Só com conta, chave ou aparelho físico

- Build de loja no EAS (assinatura Android, certificados e build do iOS), envio e formulários das
  lojas; vídeo do serviço de microfone.
- Capturas do iPhone (Mac/simulador).
- WhatsApp real pareado pela Evolution e mensagens de verdade; `DELETE /instance` da Evolution.
- IA, transcrição, Picovoice (palavra "Ei, Bora Marca"), Voice Monkey, Firebase/APNs (push real).
- Modo Balcão em Android físico com caixa Bluetooth, tela bloqueada 30 min, economia de bateria;
  iPhone com o app aberto.
- Skill da Alexa publicada (certificação Amazon) e vínculo de conta real.
- VPS, DNS, TLS do Caddy; revisão jurídica.
- `expo-doctor` completo (checagem de schema precisa da API da Expo).

## Arquivos novos desta verificação

- `scripts/verificar-fluxo.mjs` — roteiro do fluxo do PDF (item 2).
- `apps/api/scripts/api-fluxo.ts` — lançador da API com FakeLlm roteirizado e relógio ajustável,
  usado só pelo roteiro (recusa `NODE_ENV=production`; a rota `/__fluxo/relogio` existe só nele).
  Atenção: `infra/docker/api.Dockerfile` copia `apps/api/scripts/` para a imagem; se este arquivo
  for versionado, ele vai junto (inofensivo: só roda com `tsx` explícito e recusa produção).
- `docs/verificacao-final.md` — este relatório.
