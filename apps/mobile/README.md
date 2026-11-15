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
| `packages/shared/src/theme.ts` | `colors.light/dark` (bg, surface, surfaceAlt, text, textMuted, primary, onPrimary, primaryText, accent, onAccent, accentSoft, success, onSuccess, warning, onWarning, danger, onDanger, border), `spacing` (4–48), `radii` (8/14/24/pill), `touchTarget` (56, 64, 96, 120), `typography` (display 32 … caption 13), `fontFamily` (Inter). Tons marcados "derivado" no README do shared. |
| `src/theme/tokens.ts`          | `text` (escala com a família Inter de cada peso), `balcaoText`, `sizes`, `opacity`, `duration` e as cores de app `tabActive` (violeta no claro, lima no escuro, como na referência 04) e `scrim`.                                                                                                                                                                                       |

`useTheme()` devolve o tema atual: escopo forçado (`<ThemeScope scheme="dark">`, usado no Modo
Balcão) > preferência do usuário (`useThemePreference`, persistida; "Sistema / Claro / Escuro") >
esquema do sistema. A fonte Inter (`@expo-google-fonts/inter`) carrega em `app/_layout.tsx` antes
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
src/data/                 camada de dados: uma interface + mock por domínio; api.ts (stub); index.ts
src/data/mock/            fixtures da demonstração (Marina, fisioterapia) e utilitários do mock
src/features/<domínio>/   lógica de cada funcionalidade (auth, whatsapp, settings, account, agenda,
                          clients, waitlist, decisions, conversations, notifications, balcao)
src/utils/agenda.ts       regras de agenda (B3, com testes)
src/dev/                  flags e registro de simulações do menu de desenvolvimento
assets/brand/             SVG da marca (cópias do kit)
assets/images/            ícone, ícone adaptativo, splash, ícone de notificação (cópias/derivados do kit)
scripts/rasterize-icons.cjs  gera os PNG que o Expo exige a partir dos SVG do kit
```

### Mapa de rotas

| Rota                       | Arquivo                           | Tela                         | Prompt | Dono  |
| -------------------------- | --------------------------------- | ---------------------------- | ------ | ----- |
| `/`                        | `app/(tabs)/index.tsx`            | Agenda do dia (aba)          | 03     | B3    |
| `/decisoes`                | `app/(tabs)/decisoes.tsx`         | Decisões (aba, com contador) | 05     | C2    |
| `/conversas`               | `app/(tabs)/conversas.tsx`        | Conversas (aba)              | 06     | C2    |
| `/clientes`                | `app/(tabs)/clientes.tsx`         | Clientes (aba)               | 09     | B3    |
| `/ajustes`                 | `app/(tabs)/ajustes.tsx`          | Ajustes (aba)                | 10     | B2    |
| `/boas-vindas`             | `app/(auth)/boas-vindas.tsx`      | Boas-vindas                  | 01     | B2    |
| `/login`                   | `app/(auth)/login.tsx`            | Entrar com celular           | 01     | B2    |
| `/codigo`                  | `app/(auth)/codigo.tsx`           | Código de 6 dígitos          | 01     | B2    |
| `/cadastro`                | `app/(onboarding)/cadastro.tsx`   | Cadastro rápido              | 01     | B2    |
| `/whatsapp`                | `app/(onboarding)/whatsapp.tsx`   | Conectar o WhatsApp          | 02     | B2    |
| `/agendamento/[id]`        | `app/agendamento/[id].tsx`        | Detalhe do agendamento       | 04     | B3    |
| `/agendamento/novo`        | `app/agendamento/novo.tsx`        | Novo agendamento             | 04     | B3    |
| `/conversa/[id]`           | `app/conversa/[id].tsx`           | Conversa                     | 06     | C2    |
| `/cliente/[id]`            | `app/cliente/[id].tsx`            | Perfil do cliente            | 09     | B3    |
| `/cliente/lista-de-espera` | `app/cliente/lista-de-espera.tsx` | Lista de espera              | 09     | B3    |
| `/balcao`                  | `app/balcao/index.tsx`            | Modo Balcão (sempre escuro)  | 07     | C3    |
| `/balcao/configurar`       | `app/balcao/configurar.tsx`       | Preparar o balcão            | 08     | D2    |
| `/dev`                     | `app/dev/index.tsx`               | Menu de desenvolvimento      | —      | todos |
| `/dev/vitrine`             | `app/dev/vitrine.tsx`             | Vitrine de componentes       | —      | todos |

As rotas ainda não construídas mostram `PlaceholderScreen` com o título; quem constrói a tela
substitui o arquivo inteiro. Os grupos `(auth)` e `(onboarding)` ainda não têm `_layout` (herdam a
pilha raiz); B2 pode criar o seu. O redirecionamento de quem não está logado também é de B2.

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
`ListItem`, `Header`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `BottomSheet`, `Toast`
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
- `api`: `src/data/api.ts` — stub; toda chamada rejeita com "não implementado" até o agente D1.

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

Os tipos vêm de `@boramarca/shared` (nenhum tipo de entidade é redefinido no app). Erros chegam
como `DataError` (`statusCode`, `code`, `message` em pt-BR). Para ver o estado de erro no mock:
menu de desenvolvimento → "Próxima chamada de dados falha".

## Menu de desenvolvimento e vitrine

- Abrir: aba **Ajustes → Menu de desenvolvimento**, ou `boramarca://dev` / `boramarca://dev/vitrine`.
- **Vitrine** (`app/dev/vitrine.tsx`): todos os componentes e estados, com chave Claro/Escuro, e uma
  composição da referência 04-agenda para comparação.
- **Simulações** (`src/dev/simulations.ts`): "Simular decisão nova", "Simular queda do WhatsApp",
  "Próximo pareamento falha", "Simular palavra de ativação", "Próxima chamada de dados falha".
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
falha com "Filename longer than 260 characters". **Contorno usado:** ninja 1.12 (que respeita
caminhos longos) via CMake 4.1.2 do SDK.

1. Windows com caminhos longos ligados (`LongPathsEnabled = 1` em
   `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`; já está nesta máquina).
2. Instale o CMake 4.1.2 pelo SDK Manager (Android Studio → SDK Tools → CMake).
3. Depois de cada `expo prebuild --clean`, crie `android/local.properties`:

   ```properties
   sdk.dir=C\:\\Users\\<você>\\AppData\\Local\\Android\\Sdk
   cmake.dir=C\:\\Users\\<você>\\AppData\\Local\\Android\\Sdk\\cmake\\4.1.2
   ```

`android/` é gerada e fora do git, por isso o passo 3 é manual (D2/E1 podem levá-lo para um config
plugin). Builds no EAS (Linux) não têm esse limite.

## Ícone e tela de abertura

`app.config.ts` usa cópias em `assets/images/`: `icon.png` (`03-icones/icone-1024.png`),
`icon-ios.png` (`04-lojas/app-store/icone-1024-sem-alpha.png`), `adaptive-foreground.png` e
`adaptive-background.png` (`03-icones`), `adaptive-monochrome.png` e `notification-icon.png`
(rasterizados de `03-icones/android-monochrome.svg`) e `splash-icon.png` (símbolo
`01-marca/svg/simbolo-cor.svg` sobre grafite). Para regenerar os PNG derivados:
`node scripts/rasterize-icons.cjs`.
