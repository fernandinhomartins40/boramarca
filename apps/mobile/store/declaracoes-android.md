# Google Play — declarações do Android

Conferido em 15/11/2026 na Central de Ajuda do Play Console ("Understanding foreground service and
full-screen intent requirements", resposta 13392821; "Health apps declaration", 14738291; política
de serviços em primeiro plano e de permissões).

## 1. Permissões do build de release

Lista tirada do `AndroidManifest.xml` **mesclado do release** (`gradlew assembleRelease`,
`app/build/intermediates/merged_manifests/release/.../AndroidManifest.xml`) em 15/11/2026. Se uma
biblioteca nova trouxer outra permissão, ela aparece aqui depois do próximo build — confira antes de
cada envio (comando no fim desta seção).

Conferido também no APK assinado com `aapt2 dump permissions` (mesmas 11 entradas). `targetSdk` 36.

| Permissão | Tipo | De onde vem | Para que o app usa |
|---|---|---|---|
| `INTERNET` | normal | React Native | Falar com a API (`https://api.boramarca.com.br`) |
| `ACCESS_NETWORK_STATE` | normal | React Native / expo-notifications | Saber se há rede (reconexão do tempo real, push) |
| `POST_NOTIFICATIONS` | **perigosa (pedida em uso)** | expo-notifications | Notificações de Decisões com Sim/Não. Pedida no card "Responder pela notificação" da aba Decisões ou no preparo do Balcão, sempre depois de explicar |
| `RECORD_AUDIO` | **perigosa (pedida em uso)** | `plugins/withBalcaoService.cjs`, expo-audio, expo-speech-recognition | Modo Balcão (palavra de ativação e reconhecimento de fala) e o botão "Ditar mensagem" das conversas (fala vira texto no aparelho). No Balcão é pedida na tela "Preparar o balcão", depois de explicar; abrir o Balcão sem ela leva a essa tela (`app/balcao/index.tsx`). No ditado, o pedido do sistema aparece quando a pessoa toca no microfone |
| `FOREGROUND_SERVICE` | normal | `withBalcaoService.cjs` | Serviço do Modo Balcão |
| `FOREGROUND_SERVICE_MICROPHONE` | normal (declaração no Play Console) | `withBalcaoService.cjs` | Tipo `microphone` do serviço (Android 14+), seção 2 |
| `WAKE_LOCK` | normal | `withBalcaoService.cjs`, expo-notifications | Manter a CPU acordada para ouvir com a tela desligada no Modo Balcão |
| `MODIFY_AUDIO_SETTINGS` | normal | expo-audio | Tocar o aviso curto e a fala na saída certa (caixa Bluetooth ou alto-falante) |
| `VIBRATE` | normal | expo-notifications / expo-haptics | Vibração da notificação e toque nos botões |
| `com.google.android.c2dm.permission.RECEIVE` | normal | Firebase Messaging (expo-notifications) | Receber push das Decisões |
| `br.com.boramarca.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | assinatura, do próprio app | AndroidX Core | Proteção interna de receptores dinâmicos (não aparece ao usuário) |

O serviço `br.com.boramarca.balcao.BalcaoService` é declarado com
`android:foregroundServiceType="microphone"` e `android:exported="false"`.

**`usesCleartextTraffic`:** o APK local verificado tem `true` porque foi gerado com a API local
`http://10.0.2.2:3333` (para as capturas). Os perfis `preview` e `production` usam `https://` e não
recebem esse atributo (`app.config.ts`, `withLocalCleartext`).

**Bloqueadas de propósito** (`app.config.ts → android.blockedPermissions`, removidas do release):
`SYSTEM_ALERT_WINDOW` (só o dev client usa; continua no manifesto de debug), `USE_BIOMETRIC` e
`USE_FINGERPRINT` (expo-secure-store; o app não usa biometria), `RECEIVE_BOOT_COMPLETED` (reagendar
notificações depois de reiniciar; o app só mostra notificações imediatas), `READ_APP_BADGE` e as
permissões de selo de ícone de launchers (ShortcutBadger, do expo-notifications; o app não usa
contador no ícone), `BIND_GET_INSTALL_REFERRER_SERVICE` (expo-application; não usado),
`READ_EXTERNAL_STORAGE` e `WRITE_EXTERNAL_STORAGE` (modelo do Expo).

**Não pedida:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (restrita pelo Google Play). Para a bateria,
o assistente do Balcão abre a tela de configurações do sistema (`app/balcao/configurar.tsx`).
`BLUETOOTH_CONNECT`, que o plano listava, também não entra: o app só descobre se a saída de áudio é
Bluetooth (`AudioManager.getDevices`, `AudioDeviceCallback`), o que não exige essa permissão, e não
procura nem conecta aparelhos.

Para conferir de novo depois de um build:

```sh
grep -o 'uses-permission[^>]*' android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml | sort -u
```

## 2. Serviço em primeiro plano do tipo `microphone`

**Play Console → Política → Conteúdo do app → Permissões de serviço em primeiro plano** (obrigatório
porque o app tem `targetSdk` ≥ 34 e declara `FOREGROUND_SERVICE_MICROPHONE`).

| Campo | Resposta |
|---|---|
| Tipo | **Microfone** (`FOREGROUND_SERVICE_TYPE_MICROPHONE`) |
| Caso de uso | **Acesso a áudio em segundo plano** ("Background Audio Access": comandos de voz para assistente, sem gravar) |
| Descrição do recurso | No Modo Balcão, o profissional atende clientes com as mãos ocupadas. O app escuta a palavra "Ei, Bora Marca" e respostas como "sim" ou "não" para confirmar horários, também com a tela bloqueada. O serviço só começa quando a pessoa abre o Modo Balcão com o app na tela, mostra a notificação fixa "Bora Marca está ouvindo" com o botão "Pausar" e para ao sair do Modo Balcão ou ao tocar em "Pausar". O áudio não é gravado nem enviado: a palavra de ativação é reconhecida no aparelho e só o texto reconhecido vai para o servidor. |
| Impacto se o sistema adiar ou interromper | Com a tela bloqueada o sistema corta o microfone. O profissional deixa de ouvir os pedidos de encaixe e de responder por voz no meio do atendimento; os pedidos ficam esperando na aba Decisões e o cliente fica sem resposta até ele pegar o celular. |
| Vídeo | Link do YouTube (não listado), roteiro abaixo |

**Roteiro do vídeo (30 a 60 s, num Android físico, gravação de tela + câmera opcional):**

1. App aberto na agenda. Tocar no selo **"Balcão desligado"** no topo (a pessoa inicia o recurso).
2. Na primeira vez: tela "Preparar o balcão" → **Permitir** o microfone (mostra o pedido do sistema
   depois da explicação) → **Ativar** as notificações → **Ativar Modo Balcão**. Sem a permissão de
   notificação, o Android 13+ não mostra a notificação fixa na gaveta (só no gerenciador de tarefas
   da barra rápida) — visto no emulador em 15/11/2026; o serviço rodou do mesmo jeito
   (`dumpsys`: `isForeground=true types=0x80`, microfone).
3. Puxar a barra de notificações: aparece **"Bora Marca está ouvindo"** com **Pausar**.
4. Bloquear a tela. Dizer "Ei, Bora Marca, quem é o próximo?" e mostrar a resposta falada (ou, sem a
   chave da Picovoice, mostrar uma decisão chegando e responder "sim" por voz).
5. Desbloquear, puxar a notificação e tocar **Pausar**: a notificação some e o microfone é solto.
6. Mostrar o texto do vídeo: "O áudio não é gravado nem enviado. Só o texto reconhecido vai para o
   servidor."

## 3. Classificação do conteúdo (questionário IARC)

Categoria: **Utilitário, produtividade, comunicação ou outro**. Respostas:

| Pergunta | Resposta |
|---|---|
| Violência, medo, sexualidade, linguagem imprópria, drogas, álcool, tabaco | Não |
| Jogos de azar ou apostas simuladas | Não |
| Os usuários podem interagir ou trocar conteúdo (mensagens)? | **Sim** — o profissional troca mensagens com os próprios clientes (pelo WhatsApp conectado) |
| O app compartilha a localização do usuário com outros? | Não |
| Compras digitais | Não |
| Conteúdo gerado por usuário visível a outros usuários do app | Não (cada conta só vê os próprios dados) |

Resultado esperado: classificação livre / 3+ com o aviso "Interação entre usuários". Para a Apple,
as mesmas respostas: nenhum conteúdo sensível; "mensagens/chat" = sim.

## 4. Outras declarações do Conteúdo do app

| Declaração | Resposta |
|---|---|
| Público-alvo e conteúdo | 18 anos ou mais. Não é voltado a crianças; não participa do programa Família. |
| Anúncios | Não contém anúncios. |
| Acesso ao app | Restrito por login: usar `notas-para-revisao.md`. |
| ID de publicidade (Android 13+) | O app **não** usa ID de publicidade. |
| Apps de saúde | O app atende também profissionais de saúde (fisioterapia, psicologia, odontologia) e marca consultas. Recomendação: marcar **"Serviços e gestão de saúde"** (agendamento e lembretes) e nenhum outro recurso de saúde; não há dados clínicos. Confirmar com a revisão jurídica. |
| Recursos financeiros | Nenhum. |
| App governamental | Não. |
| Notícias | Não. |
| Exclusão de conta | URL `https://boramarca.com.br/excluir-conta` (formulário de Segurança dos dados). |
| Uso de marca de terceiros | O app não usa o nome nem o ícone do WhatsApp como identidade; a ficha cita o WhatsApp só para descrever a conexão e diz que não é oficial nem afiliada. Se o Google pedir comprovação de autorização de marca, responder nesse sentido (não há uso da marca como identidade). |
