# Bora Marca — app (`apps/mobile`)

Expo SDK 58 + React Native + TypeScript estrito + expo-router. Android e iOS na mesma base. Roda como
**dev build** (`expo-dev-client`), não no Expo Go.

## Regras para todas as telas (prompt 00)

1. **Nenhuma cor, tamanho ou fonte solta no código: sempre tokens.** Cores, espaçamento, raios, alvos
   de toque e tipografia vêm de `packages/shared/src/theme.ts` (o kit de marca) via `useTheme()`.
   Medidas de layout extras (ícones, avatar, orb, bordas) ficam em `src/theme/tokens.ts`, montadas na
   escala base 4. Precisa de uma cor nova? Ela entra primeiro em `packages/shared/src/theme.ts`
   (com o par de contraste testado), nunca direto no app.
2. **Toda tela tem estados de carregando, vazio e erro** (`Skeleton`/`LoadingState`, `EmptyState`,
   `ErrorState`).
3. **Textos em português do Brasil, tom próximo e direto** ("Fulano quer horário", não "Nova
   solicitação de agendamento recebida"). Código em inglês.
4. **Acessibilidade:** `accessibilityLabel` em tudo que é tocável; alvo mínimo de 56 dp
   (`touchTarget`); o texto acompanha a fonte grande do sistema (não desligue `allowFontScaling`
   em texto corrido).
5. **Testar no emulador Android antes de dizer que terminou.**
6. A logo é usada como está nos arquivos do kit: não redesenhar, esticar nem recolorir (`<Logo />`).
7. Telas só falam com `src/data` (`import { data } from '@/data'`), nunca com `fetch` direto, e não
   sabem se a fonte é mock ou API.

### Tokens

| Origem                         | O quê                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/theme.ts` | `colors.light/dark` (bg, surface, surfaceAlt, text, textMuted, primary, onPrimary, primaryText, accent, onAccent, accentSoft, success, onSuccess, warning, onWarning, danger, onDanger, border), `spacing` (4–48), `radii` (8/14/24/pill), `touchTarget` (56, 64, 96, 120), `typography` (display 32 … caption 13), `fontFamily` (Plus Jakarta Sans). Tons marcados "derivado" no README do shared. |
| `src/theme/tokens.ts`          | `text` (escala com a família Plus Jakarta Sans de cada peso), `balcaoText`, `sizes`, `opacity`, `duration` e as cores de app `tabActive` (violeta no claro, lima no escuro, como na referência 04) e `scrim`.                                                                                                                                                                                       |

`useTheme()` devolve o tema atual: escopo forçado (`<ThemeScope scheme="dark">`, usado no Modo
Balcão) > preferência do usuário (`useThemePreference`, persistida; "Sistema / Claro / Escuro") >
esquema do sistema. A fonte Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`, a da landing aprovada) carrega em `app/_layout.tsx` antes
de esconder a tela de abertura.

### Logo

`<Logo kind="horizontal|simbolo" variant="auto|cor|negativo|violeta-branco" height={…} />`. Os SVG
estão copiados em `assets/brand/` (de `Bora-Marca-Kit/01-marca/svg/`). `auto` usa `cor` no claro e
`violeta-branco` no escuro (referência 04-agenda). A largura sai do `viewBox` do arquivo, então a
marca nunca é esticada.

**SVG:** `react-native-svg-transformer` (configurado em `metro.config.js`, tipos em `svg.d.ts`,
stub no Jest em `__mocks__/svg.cjs`). Escolhido em vez de `SvgXml` porque importa o arquivo do kit
como está, sem copiar o XML para dentro de código TypeScript.

## Onde fica cada coisa

```
app/                      rotas (expo-router)
src/theme/                tokens do app + useTheme + fontes
src/components/           componentes base, um por arquivo (index.ts exporta todos)
src/data/                 camada de dados: uma interface + mock por domínio; api.ts (API real); index.ts
src/data/mock/            fixtures da demonstração (Marina, fisioterapia) e utilitários do mock
src/features/<domínio>/   lógica de cada funcionalidade (auth, whatsapp, settings, account, agenda,
                          clients, waitlist, decisions, conversations, notifications, balcao)
src/utils/agenda.ts       regras de agenda (B3, com testes)
src/dev/                  flags e registro de simulações do menu de desenvolvimento
src/lib/api/              cliente HTTP (Bearer, renovação de token), registro do push (push.ts)
src/lib/realtime/         WebSocket /v1/realtime: reconexão, assinatura de eventos (useRealtime)
assets/brand/             SVG da marca (cópias do kit)
assets/images/            ícone, ícone adaptativo, splash, ícone de notificação (cópias/derivados do kit)
scripts/rasterize-icons.cjs  gera os PNG que o Expo exige a partir dos SVG do kit
scripts/roteiro-api.ts    roteiro da camada de dados contra a API real (ver "Fonte de dados")
```

### Mapa de rotas

| Rota                       | Arquivo                                | Tela                                     | Prompt | Dono  |
| -------------------------- | -------------------------------------- | ---------------------------------------- | ------ | ----- |
| `/`                        | `app/(tabs)/index.tsx`                 | Agenda do dia (aba)                      | 03     | B3    |
| `/decisoes`                | `app/(tabs)/decisoes.tsx`              | Decisões (aba, com contador)             | 05     | C2    |
| `/conversas`               | `app/(tabs)/conversas.tsx`             | Conversas (aba)                          | 06     | C2    |
| `/clientes`                | `app/(tabs)/clientes.tsx`              | Clientes (aba)                           | 09     | B3    |
| `/ajustes`                 | `app/(tabs)/ajustes/index.tsx`         | Ajustes (aba)                            | 10     | B2    |
| `/ajustes/negocio`         | `app/(tabs)/ajustes/negocio.tsx`       | Meu negócio (serviços, horários, folgas) | 10     | B2    |
| `/ajustes/ia`              | `app/(tabs)/ajustes/ia.tsx`            | IA (tom, autonomia, pausa)               | 10     | B2    |
| `/ajustes/voz`             | `app/(tabs)/ajustes/voz.tsx`           | Voz e Modo Balcão                        | 10     | B2    |
| `/ajustes/whatsapp`        | `app/(tabs)/ajustes/whatsapp.tsx`      | WhatsApp conectado                       | 10     | B2    |
| `/ajustes/conta`           | `app/(tabs)/ajustes/conta.tsx`         | Conta, privacidade, termos               | 10     | B2    |
| `/ajustes/excluir-conta`   | `app/(tabs)/ajustes/excluir-conta.tsx` | Excluir conta (`DELETE /me`)             | 10     | B2    |
| `/boas-vindas`             | `app/(auth)/boas-vindas.tsx`           | Boas-vindas                              | 01     | B2    |
| `/login`                   | `app/(auth)/login.tsx`                 | Entrar com celular                       | 01     | B2    |
| `/codigo`                  | `app/(auth)/codigo.tsx`                | Código de 6 dígitos                      | 01     | B2    |
| `/cadastro`                | `app/(onboarding)/cadastro.tsx`        | Cadastro rápido                          | 01     | B2    |
| `/whatsapp`                | `app/(onboarding)/whatsapp.tsx`        | Conectar o WhatsApp                      | 02     | B2    |
| `/agendamento/[id]`        | `app/agendamento/[id].tsx`             | Detalhe do agendamento                   | 04     | B3    |
| `/agendamento/novo`        | `app/agendamento/novo.tsx`             | Novo agendamento                         | 04     | B3    |
| `/conversa/[id]`           | `app/conversa/[id].tsx`                | Conversa                                 | 06     | C2    |
| `/cliente/[id]`            | `app/cliente/[id].tsx`                 | Perfil do cliente                        | 09     | B3    |
| `/cliente/lista-de-espera` | `app/cliente/lista-de-espera.tsx`      | Lista de espera                          | 09     | B3    |
| `/balcao`                  | `app/balcao/index.tsx`                 | Modo Balcão (sempre escuro)              | 07     | C3    |
| `/balcao/configurar`       | `app/balcao/configurar.tsx`            | Preparar o balcão                        | 08     | D2    |
| `/dev`                     | `app/dev/index.tsx`                    | Menu de desenvolvimento                  | —      | todos |
| `/dev/vitrine`             | `app/dev/vitrine.tsx`                  | Vitrine de componentes                   | —      | todos |

As rotas ainda não construídas mostram `PlaceholderScreen` com o título; quem constrói a tela
substitui o arquivo inteiro. Os grupos `(auth)`, `(onboarding)` e `(tabs)/ajustes` têm `_layout`
próprio (pilhas). O redirecionamento por estado da sessão é `useAuthGuard` (`src/features/auth`),
montado em `app/_layout.tsx`: sem sessão vai para `/boas-vindas`, conta nova para `/cadastro`.

### Componentes (`src/components/`)

`Screen`, `Text`, `Button` (primary violeta, secondary contorno, accent lima, neutral, danger, ghost;
`md` 56 / `lg` 64; ícone; carregando; desabilitado), `IconButton`, `BigChoice` (Sim/Não ≥ 96 dp;
`compact`; `balcao` ≥ 120 dp com Sim lima), `Card` (default, primary violeta, accentSoft lima claro,
alt), `NowCard` (card "Agora"), `NextCard` (próximo + "Avisar atraso"), `FitInCard` (pedido de
encaixe), `StatusPill` (confirmado lima/grafite, agendado, pendente, cancelado, encaixe, faltou, em
atendimento, concluído; `pillForAppointment`), `Badge`, `TimeSlot` (ocupado, livre tracejado,
recém-vagou pulsando, almoço hachurado, passado), `NowIndicator`, `SummaryStrip`, `BalcaoStatus`,
`VoiceOrb` (parado, ouvindo, pensando, falando — Reanimated), `Banner` (info, success, warning,
danger), `TextField`, `Chip`, `Checkbox`, `Switch`, `SegmentedControl`, `ProgressSteps`, `Avatar`,
`ListItem`, `Header`, `DayStrip` (faixa de dias para escolher a data da agenda), `MessagePreview`
("Mensagem que será enviada", com "Editar"), `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `BottomSheet`, `Toast`
(`showToast()` + `ToastHost` no layout raiz), `Fab`, `Logo`, `PlaceholderScreen`.

Componente novo: arquivo próprio em `src/components/`, exportado em `index.ts` e mostrado na vitrine.

## Fonte de dados (mock ou API)

`src/data/index.ts` exporta `data` (`data.agenda.getDay(date)`, `data.decisions.list('pending')`…),
escolhido por `EXPO_PUBLIC_DATA_SOURCE`:

- `mock` (padrão): dados da demonstração das referências — Marina Costa, fisioterapeuta; hoje:
  Ana Paula 14:00–14:50 em atendimento ("Agora"), Rafael 15:00, 16:00 livre, Carlos cancelou as
  17:00 há 3 min, Diego 18:00; 8 atendimentos, 2 vagas, R$ 1.200; Beatriz pede encaixe às 16h;
  12 clientes; 8 conversas; decisões dos cinco tipos + histórico; lista de espera (3). Atraso falso
  de 300–600 ms (desligado no Jest). Código do login e da exclusão de conta: `123456`.
- `api`: `src/data/api.ts` (`createApiData(client)`) — API real (seção abaixo).

**Build de produção usa sempre a API:** `resolveDataSource` só aceita `mock` quando
`DEV_TOOLS_ENABLED` (`__DEV__` ou `EXPO_PUBLIC_DEV_TOOLS=true`); num release sem essa variável,
`EXPO_PUBLIC_DATA_SOURCE` é ignorada e a fonte é `api`.

Para trocar: `apps/mobile/.env` com `EXPO_PUBLIC_DATA_SOURCE=api` e reinicie o Metro com
`npx expo start --dev-client --clear` (variáveis `EXPO_PUBLIC_*` entram no bundle na hora do build).

| Domínio         | Arquivo                     | Interface                                                 | Dono |
| --------------- | --------------------------- | --------------------------------------------------------- | ---- |
| auth            | `src/data/auth.ts`          | `AuthData`                                                | B2   |
| perfil/ajustes  | `src/data/profile.ts`       | `ProfileData` (me, IA, pausa, serviços, horários, prévia) | B2   |
| whatsapp        | `src/data/whatsapp.ts`      | `WhatsAppData`                                            | B2   |
| conta           | `src/data/account.ts`       | `AccountData` (`DELETE /me`)                              | B2   |
| agenda          | `src/data/agenda.ts`        | `AgendaData` (dia, vagas, agendamentos)                   | B3   |
| clientes        | `src/data/clients.ts`       | `ClientsData`                                             | B3   |
| lista de espera | `src/data/waitlist.ts`      | `WaitlistData`                                            | B3   |
| decisões        | `src/data/decisions.ts`     | `DecisionsData`                                           | C2   |
| conversas       | `src/data/conversations.ts` | `ConversationsData`                                       | C2   |
| voz             | `src/data/voice.ts`         | `VoiceData`                                               | C3   |
| aparelhos       | `src/data/devices.ts`       | `DevicesData` (`POST /devices`, `DELETE /devices/:id`)    | D1   |

### Camada de API (D1)

- **Cliente HTTP** (`src/lib/api/client.ts`): `api.call(routes.x.y, { params, query, body })` — método,
  caminho e schema de resposta vêm de `routes` (`packages/shared`); nada de URL escrita à mão. Base:
  `EXPO_PUBLIC_API_URL` (sem `/v1`; emulador Android: `http://10.0.2.2:3333`). Toda resposta é
  validada com o schema do contrato (falha = `DataError` `INVALID_RESPONSE`); erro da API vira
  `DataError` com o `code` e a mensagem dela; sem rede = `NETWORK`; tempo limite de 30 s.
- **Tokens:** lidos e gravados por `useSession.getState().tokens` / `setTokens` (expo-secure-store).
  Um 401 dispara um único `POST /auth/refresh` compartilhado por todas as chamadas daquele momento,
  que depois repetem uma vez. Refresh recusado = `useSession.clear()` e o guard leva a
  `/boas-vindas`. Sem rede no refresh, a sessão fica.
- **"Sair":** `data.auth.signOut()` remove o aparelho registrado (`DELETE /devices/:id`); a API não
  tem rota de logout (JWT sem estado).
- **Tempo real** (`src/lib/realtime`): `WS /v1/realtime?token=` aberto enquanto há sessão (só no modo
  `api`), com reconexão (1 s, 2 s, 4 s… até 30 s), renovação do token no fechamento 4401 e
  reconexão imediata ao voltar para o primeiro plano. Já alimenta: `whatsapp.status` →
  `useWhatsAppStore`, `ai.status` → `useAiStore`, `decision.*` → `emitDecisionsChanged()` (aba,
  contador e tela de Decisões). Em cada (re)conexão recarrega decisões e status do WhatsApp. Para uma
  tela assinar: `useRealtime(['appointment.changed'], () => reload(true))`. Mantenha o
  recarregamento por foco/polling como reserva (no mock nenhum evento chega).
- **Push:** `usePushRegistration()` (`src/lib/api/push.ts`), montado em `app/_layout.tsx`: depois do
  login, se a permissão de notificação **já** foi dada, pega o token Expo e faz `POST /devices`. Não
  pede permissão. Sem `extra.eas.projectId` não registra nada (pendência em
  `docs/PENDENCIAS-HUMANAS.md`, item 5).
- **Roteiro contra a API local:** com a API e o seed rodando,
  `EXPO_PUBLIC_API_URL=http://localhost:3333 npx tsx scripts/roteiro-api.ts` (login da Marina,
  agenda, renovação de token, decisão com o evento pelo WebSocket, aparelho, e exclusão de uma conta
  de teste nova criada pelo próprio roteiro).
- **Testes:** `src/lib/api/client.test.ts` (servidor falso: renovação com chamadas simultâneas,
  erros, schemas) e `src/lib/realtime/socket.test.ts` (socket falso: eventos, reconexão, 4401).

Os tipos vêm de `@boramarca/shared` (nenhum tipo de entidade é redefinido no app). Erros chegam
como `DataError` (`statusCode`, `code`, `message` em pt-BR). Para ver o estado de erro no mock:
menu de desenvolvimento → "Próxima chamada de dados falha".

## Menu de desenvolvimento e vitrine

- Abrir: aba **Ajustes → Menu de desenvolvimento**, ou `boramarca://dev` / `boramarca://dev/vitrine`.
- **Vitrine** (`app/dev/vitrine.tsx`): todos os componentes e estados, com chave Claro/Escuro, e uma
  composição da referência 04-agenda para comparação.
- **Simulações** (`src/dev/simulations.ts`): "Simular decisão nova" (C2: também mostra a
  notificação com Sim e Não), "Decisão nova a cada 20 s (liga/desliga)" (C2), "Simular queda do
  WhatsApp", "Próximo pareamento falha", "Próximo pareamento conecta" e "Próximo código de pareamento
  expira" (B2, `src/features/whatsapp/simulations.ts`), "Simular palavra de ativação", "Próxima
  chamada de dados falha". Só mudam os dados do mock.
- **Painel do Balcão** (C3): três toques no logo da tela do Modo Balcão abrem o painel escondido
  (`BalcaoDevPanel`, só com `DEV_TOOLS_ENABLED`) para disparar palavra de ativação, fala e silêncio.
  Motores trocáveis com `setBalcaoEngines({...})` (`src/features/balcao/engines.ts`); estado em
  `useBalcaoStore` (`active`, `snapshot`, `volume`; ex.: `useBalcaoStore((s) => s.active)`).
  Para estender: `registerSimulation({ id, label, description, run })` (mesmo `id` substitui o
  padrão) e, na tela que reage, `useEffect(() => onSimulation('wake-word', handler), [])`.
- **Fora da produção:** `app/dev/_layout.tsx` redireciona para `/` e a entrada em Ajustes some
  quando `DEV_TOOLS_ENABLED` é falso (`src/dev/flags.ts`: `__DEV__ ||
EXPO_PUBLIC_DEV_TOOLS === 'true'`). Em build de release `__DEV__` é falso; nunca defina
  `EXPO_PUBLIC_DEV_TOOLS` no perfil `production`. O código continua no bundle (o expo-router
  inclui todos os arquivos de `app/`), mas fica inalcançável.

## Como rodar

```sh
pnpm install                                   # na raiz do monorepo
cd apps/mobile
cp .env.example .env                           # EXPO_PUBLIC_DATA_SOURCE=mock
npx expo prebuild --platform android --clean   # gera android/ (não versionado)
cd android && gradlew.bat assembleDebug        # ou: npx expo run:android
adb install -r app/build/outputs/apk/debug/app-debug.apk
cd .. && npx expo start --dev-client           # Metro; no emulador: adb reverse tcp:8081 tcp:8081
```

Testes, tipos e lint: `pnpm --filter @boramarca/mobile test | typecheck | lint`.

### Windows e o limite de 260 caracteres

Mesmo com `nodeLinker: hoisted`, a compilação C++ (codegen do gesture-handler) gera arquivos `.o`
com mais de 300 caracteres e o `ninja` 1.10 do CMake 3.22.1 (padrão do Android Gradle Plugin)
falha com "Filename longer than 260 characters". **Contorno:** ninja 1.12 (que respeita caminhos
longos) via CMake 4.1+ do SDK, escolhido **automaticamente** pelo config plugin
`plugins/withWindowsCmake.cjs` a cada `expo prebuild` (inclusive `--clean`).

1. Windows com caminhos longos ligados (`LongPathsEnabled = 1` em
   `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`; já está nesta máquina).
2. CMake 4.1 ou mais novo instalado pelo SDK Manager (Android Studio → SDK Tools → CMake; nesta
   máquina, 4.1.2).
3. Nada a fazer depois do prebuild: o plugin grava `sdk.dir` e `cmake.dir` (o CMake ≥ 4.1 mais novo
   em `<sdk>/cmake`) em `android/local.properties`. Sem o CMake 4.1+, ele avisa no prebuild
   (`[withWindowsCmake] CMake >= 4.1 not found`) e o build falha como antes.

Fora do Windows (EAS em Linux, macOS) o plugin não faz nada; lá esse limite não existe.

## Ícone e tela de abertura

`app.config.ts` usa cópias em `assets/images/`: `icon.png` (`03-icones/icone-1024.png`),
`icon-ios.png` (`04-lojas/app-store/icone-1024-sem-alpha.png`), `adaptive-foreground.png` e
`adaptive-background.png` (`03-icones`), `adaptive-monochrome.png` e `notification-icon.png`
(rasterizados de `03-icones/android-monochrome.svg`) e `splash-icon.png` (símbolo
`01-marca/svg/simbolo-cor.svg` sobre grafite). Para regenerar os PNG derivados:
`node scripts/rasterize-icons.cjs`.

## Modo Balcão nativo e roteiro de teste em aparelho (D2)

**O que é nativo.** `src/features/balcao/native/` (importado por `app/_layout.tsx`) liga os motores
reais com `setBalcaoEngines`: palavra de ativação Porcupine (`wakeWord.ts`), reconhecimento de fala
pt-BR do sistema via `expo-speech-recognition` (`speechToText.ts`), fala `expo-speech` (já existia) e
volume de mídia (Android). Sem `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY` (este é o nome lido pelo código em
`src/features/balcao/native/index.ts` e usado no `.env.example`; o plano, seção 11, chama de
`EXPO_PUBLIC_PICOVOICE_KEY`, nome antigo que não funciona) ou sem os arquivos de
`assets/wakeword/` (gerados no console da Picovoice, ver `docs/PENDENCIAS-HUMANAS.md`, item 10), a palavra de
ativação continua simulada e a tela mostra **Falar**. Se o Porcupine falhar ao iniciar, ele também
cai para o botão.

**Serviço em primeiro plano (só Android).** Módulo local `modules/balcao-service` (Kotlin) +
config plugin `plugins/withBalcaoService.cjs` (serviço do tipo `microphone`, permissões
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `RECORD_AUDIO`, `WAKE_LOCK`). Escolhido em vez
de `react-native-background-actions` porque o Android 14+ exige o tipo declarado no `<service>` e
passado em `startForeground`, e porque aqui o serviço também cuida da notificação com "Pausar", do
wake lock, do som inaudível que mantém a caixa acordada e do aviso de troca de saída de áudio — tudo
em ~200 linhas. O serviço segue a tela: abrir o Modo Balcão (ou "Ativar Modo Balcão" no assistente)
o inicia com o app aberto, como o Android exige; sair do Modo Balcão ("Encerrar") o para e fala o
resumo (`GET /voice/summary`). "Pausar" na notificação para o serviço e solta o microfone até o app
voltar para a frente. `useBalcaoStore.active` acompanha o serviço. O Android não reinicia o serviço
sozinho (proibido para `microphone` a partir do boot).

**iOS.** Sem serviço: o Balcão funciona com o app aberto e a tela acesa. Textos de microfone e de
reconhecimento de fala em pt-BR no `app.config.ts` (plugins `expo-audio` e
`expo-speech-recognition`).

**Outros plugins.** `plugins/withWindowsCmake.cjs`: ver "Windows e o limite de 260 caracteres".
`plugins/withWakeWord.cjs`
copia os arquivos `.ppn`/`.pv` para o Android (`assets`) e o iOS (recursos do bundle).

### Roteiro de teste manual — Android físico

Pré-requisitos: dev build instalado (`assembleDebug`), `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY` e arquivos
da palavra (para testar a palavra real), caixa Bluetooth pareada, celular no carregador.

1. **Assistente:** Ajustes → Voz e Balcão → Configurar o Balcão. Conceder microfone (o medidor mexe
   ao falar em "Testar"), notificações, bateria ("Configurar" abre a lista do sistema; voltar e ver
   "Ok"; conferir o passo a passo da marca do aparelho), "Testar som" sai na caixa, interruptor
   "Manter caixa acordada". Continuar → dizer "Ei, Bora Marca" → "Reconheci sua voz" e a fala
   "Tudo certo! Estou pronta para trabalhar." Dizer "bora marcar pra semana que vem?" não pode ativar.
2. **Iniciar:** "Ativar Modo Balcão" → resumo do dia falado; notificação fixa "Bora Marca está
   ouvindo" com "Pausar".
3. **Tela bloqueada por 30 min:** simular/gerar uma decisão → o aviso toca, a pergunta é falada e
   "sim" responde. Repetir "Ei, Bora Marca, quem é o próximo?".
4. **Caixa:** desligar a caixa → aviso na tela e fala pelo celular; religar → volta a sair pela caixa.
   Deixar 15 min em silêncio com "Manter caixa acordada" ligado → a caixa não desliga.
5. **Pausar** na notificação → o serviço some; abrir o app → volta a ouvir.
6. **Bateria em modo economia** e **reiniciar o celular:** o serviço não volta sozinho; abrir o app e
   o Modo Balcão de novo.
7. **Encerrar:** sair do Modo Balcão (segurar "Sair") → resumo de encerramento falado e a
   notificação some.
8. **App fechado:** deslizar o app para fora dos recentes, simular decisão pela API e tocar Sim na
   notificação → respondida (tarefa do `expo-task-manager`).

### Roteiro de teste manual — iPhone

1. Assistente: microfone, reconhecimento de fala, notificações, testar som, teste final.
2. Modo Balcão com o app aberto: a tela não apaga; "Ei, Bora Marca" (ou Falar) e uma decisão
   respondida por voz.
3. Bloquear a tela: o Balcão para de ouvir (esperado). A decisão chega por notificação com Sim/Não.
4. Abrir o WhatsApp no pareamento (`LSApplicationQueriesSchemes`).

## Perfis de build, lojas e verificação local (E1)

**`eas.json`** (versão do app no EAS: `appVersionSource: remote`; `production` com
`autoIncrement`):

| Perfil | Saída | `EXPO_PUBLIC_DATA_SOURCE` | `EXPO_PUBLIC_API_URL` | Menu dev |
|---|---|---|---|---|
| `development` | dev client, APK / iPhone interno | `mock` | `http://10.0.2.2:3333` | sim (`__DEV__`) |
| `preview` | APK / iPhone interno (ad hoc) | `api` | `https://api-homolog.boramarca.com.br` | não |
| `production` | AAB / IPA para as lojas | `api` | `https://api.boramarca.com.br` | não |

`EXPO_PUBLIC_SITE_URL` = `https://boramarca.com.br` nos três. Nunca defina `EXPO_PUBLIC_DEV_TOOLS`
em `preview` ou `production`. `extra.eas.projectId` só existe depois do `eas init` (constante
`EAS_PROJECT_ID` no `app.config.ts`; `docs/PENDENCIAS-HUMANAS.md`, item 5).

**Configuração nativa para as lojas** (`app.config.ts`):

- Android: `blockedPermissions` tira o que vem do modelo e das bibliotecas sem uso
  (`SYSTEM_ALERT_WINDOW` só fica no manifesto de debug, para o dev client; biometria do
  expo-secure-store; selos de ícone; `RECEIVE_BOOT_COMPLETED`; install referrer). A lista final do
  release está em `store/declaracoes-android.md`. `usesCleartextTraffic` só entra quando
  `EXPO_PUBLIC_API_URL` começa com `http://` (API local); os perfis de loja usam https.
- iOS: textos de permissão em pt-BR, `privacyManifests` (gera o `PrivacyInfo.xcprivacy`), ATS só
  https (com rede local liberada para desenvolvimento), `ITSAppUsesNonExemptEncryption: false`, sem
  `NSFaceIDUsageDescription` e sem `UIBackgroundModes: fetch` (o expo-task-manager acrescenta; o app
  não usa busca em segundo plano). `aps-environment` = `production` quando `EAS_BUILD_PROFILE` é
  `production`.
- O Modo Balcão (`app/balcao/index.tsx`) abre o assistente `/balcao/configurar` enquanto o microfone
  não foi permitido: a permissão só é pedida depois da explicação, e o Android 14+ recusaria o
  serviço `microphone` sem ela.

**Material das lojas:** `store/` (textos, segurança de dados, privacidade da Apple, declarações do
Android, notas para a revisão, capturas e `PUBLICAR.md` com o passo a passo).

**Build de release local** (prova que o build otimizado compila; a chave de teste fica fora do git):

```sh
keytool -genkeypair -keystore <fora-do-repo>/teste.jks -alias teste -keyalg RSA -keysize 2048 -validity 30
EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_URL=http://10.0.2.2:3333 npx expo prebuild --platform android
cd android && EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_URL=http://10.0.2.2:3333 \
  gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64 \
  -Pandroid.injected.signing.store.file=<fora-do-repo>/teste.jks \
  -Pandroid.injected.signing.store.password=<senha> -Pandroid.injected.signing.key.alias=teste \
  -Pandroid.injected.signing.key.password=<senha>
```

`-PreactNativeArchitectures=x86_64` compila só para o emulador (bem mais rápido nesta máquina); o
EAS compila todas as arquiteturas. Para a conta de revisão local: em `apps/api`,
`REVIEW_PHONE=+5511999990000 REVIEW_OTP=246810 pnpm start` (número fictício, nunca de conta real).
