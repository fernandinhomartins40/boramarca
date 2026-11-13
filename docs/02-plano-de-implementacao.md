# Bora Marca — Plano de implementação

Este é o documento de referência técnica. Quem implementa deve ler antes [01-analise.md](01-analise.md) (lacunas e decisões) e depois [03-agentes.md](03-agentes.md) (quem faz o quê e em que ordem).

Fontes de produto, que continuam valendo no que este plano não contradiz:

- `Bora-Marca-pacote-completo/01-plano/Bora-Marca-plano-de-implementacao.pdf`
- `Bora-Marca-pacote-completo/02-prompts-telas-codex/*.md` — o que cada tela faz. **Ignorar** nesses arquivos: as instruções de parar e esperar aprovação, "sem backend nesta fase" e "pare se não achar a logo".
- `Bora-Marca-Kit/` — identidade visual, assets e imagens de referência. Ler `LEIA-PRIMEIRO.md` e `guia-html-css.md` do kit.

Em caso de conflito, a ordem de precedência é: este plano; depois, para aparência, o kit de marca, e para comportamento, os prompts de telas; por último o PDF. Função que aparece só em uma imagem de referência e não está neste plano não é construída.

O produto atende profissionais com hora marcada em geral (beleza, saúde, bem-estar, aulas). Os textos usam "profissional", "cliente" e "seu espaço"; não fixam "salão" nem "barbearia".

## 1. Regras que não podem ser quebradas

1. **A IA não escreve na agenda.** Ela chama ferramentas; o backend valida e executa. Nenhum código de IA acessa o banco diretamente.
2. **Ação que afeta a agenda de outra pessoa exige uma Decisão do profissional.** Sem resposta no prazo, o cliente recebe uma mensagem neutra ("Já te confirmo!") e a Decisão continua pendente. Nunca se marca por tempo esgotado.
3. **Toda mensagem de saída passa pela guarda de envio** (seção 7). Não existe outro caminho para enviar WhatsApp.
4. **Para a IA vai o mínimo:** primeiro nome do cliente, nunca o telefone.
5. **Sem cor, tamanho ou fonte soltos no app, no painel e no site:** só tokens derivados do kit de marca (seção 10). A logo é usada como está nos arquivos do kit: não redesenhar, esticar nem recolorir.
6. **Textos em português do Brasil, tom direto** ("Fulano quer horário", não "Nova solicitação recebida").
7. **Segredos só em variáveis de ambiente.** O repositório tem `.env.example`, nunca `.env`.
8. **Versões fixas** para imagens Docker e dependências do ecossistema WhatsApp. Usar apenas a imagem oficial da Evolution API.
9. **A IA não pede nem registra informação clínica.** Para contas de saúde, ela trata só de horário, serviço, preço e endereço.
10. **O app não se apresenta como WhatsApp:** não usa o ícone nem o nome do WhatsApp na marca, no ícone ou no título da loja, e descreve a conexão como ela é.

## 2. Arquitetura

```
Cliente (WhatsApp) ─► Evolution API (Docker) ─webhook─► apps/api (Fastify)
                                                          │
                     ┌────────────────┬───────────────────┼──────────────────┐
                     ▼                ▼                   ▼                  ▼
               Postgres          Redis + BullMQ      packages/ia       packages/whatsapp
            (agenda, conversas)  (prazos, lembretes) (LLM, transcrição) (gateway + guarda)
                                                          │
                     ┌────────────────────────────────────┼──────────────────┐
                     ▼                                    ▼                  ▼
               apps/mobile (Expo)                   apps/web (Next.js)   packages/alexa
           Android e iOS: agenda,                   site público +       skill + Voice Monkey
           decisões, Modo Balcão                    painel do dono
```

### Estrutura do repositório (monorepo pnpm)

```
apps/
  api/          Fastify + TypeScript. Único dono do banco e das regras.
  mobile/       Expo (dev build) + expo-router. Um app para Android e iOS.
                store/ guarda o material das lojas (seção 13).
  web/          Next.js (App Router) + Tailwind. Site público em app/(site),
                painel do dono em app/painel.
packages/
  shared/       Schemas Zod e tipos: entidades, DTOs das rotas, eventos. O contrato entre todos.
  whatsapp/     Interface do gateway, adaptador Evolution, gateway falso, guarda de envio.
  ia/           Cliente LLM com reserva, ferramentas, prompts, transcrição, redução de dados.
  alexa/        Handler da skill, modelo de interação pt-BR, cliente Voice Monkey.
infra/
  docker-compose.yml        Desenvolvimento: Postgres, Redis, Evolution API.
  docker-compose.prod.yml   Produção em uma VPS: os anteriores + api + web + proxy com TLS.
Bora-Marca-Kit/ Kit de marca: fonte da identidade visual. Somente leitura.
docs/
```

### Escolhas de stack

| Camada | Escolha | Observação |
|---|---|---|
| Linguagem | TypeScript estrito em tudo | |
| API | Fastify, validação com Zod | Módulos em `apps/api/src/modules/<nome>/`, cada um um plugin carregado por `@fastify/autoload` |
| Banco | PostgreSQL + Drizzle ORM, migrações SQL versionadas | Em produção pode ser o Postgres do Supabase |
| Filas | Redis + BullMQ | |
| Tempo real | WebSocket na própria API (`@fastify/websocket`) | |
| Autenticação | Código de 6 dígitos por telefone + JWT (acesso curto e renovação) | Envio do código atrás da interface `OtpSender` |
| IA | SDK `openai` com `baseURL` configurável | Modelo principal e reserva por variável de ambiente |
| App | Expo SDK estável mais recente, expo-router, zustand, date-fns, lucide-react-native, reanimated | Conforme `00-fundacao-e-design-system.md` |
| Site e painel | Next.js + Tailwind com os tokens do kit | Um só projeto e um só domínio: `boramarca.com.br` (site) e `boramarca.com.br/painel`; API em `api.boramarca.com.br` |
| Builds do app | EAS Build (perfis `development`, `preview`, `production`) | Android também compila localmente; iOS só no EAS |
| Testes | Vitest (api e pacotes), Jest com `jest-expo` (app) | |
| Lint e formato | ESLint + Prettier, configuração única na raiz | |

Comandos da raiz que precisam existir e passar: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Juntos formam o **portão de qualidade**, citado no documento de agentes.

Convenções: identificadores de código e nomes de tabelas em inglês; nomes das ferramentas da IA, textos de interface e mensagens em pt-BR. Datas gravadas em UTC; cada salão tem um fuso (padrão `America/Sao_Paulo`). Dinheiro em centavos, inteiro. Telefones em E.164.

## 3. Modelo de dados

Todas as tabelas têm `id` (uuid), `created_at` e `updated_at`. Toda consulta é filtrada pelo profissional ou salão do usuário autenticado; deve existir teste provando que um profissional não lê dados de outro.

| Tabela | Campos principais |
|---|---|
| `salons` | name, plan (`essencial`, `maos_livres`, `salao`, `premium`), timezone |
| `professionals` | salon_id, role (`owner`, `professional`), name, phone (único), professions[], address, ai_enabled, ai_paused_until, ai_tone (`descontraido`, `simpatico`, `formal`), autonomy (json, seção 6), reminder_lead_minutes, welcome_message, quiet_hours, waitlist_rule (json), skip_message_preview, voice_rate |
| `otp_codes` | phone, code_hash, expires_at, attempts |
| `devices` | professional_id, push_token, platform |
| `services` | professional_id, name, duration_min, price_cents, position, active |
| `working_hours` | professional_id, weekday, start, end, lunch_start, lunch_end |
| `time_off` | professional_id, starts_at, ends_at, reason |
| `clients` | professional_id, name, phone, preferences (json), origin (`whatsapp`, `manual`), first_contact_at |
| `appointments` | professional_id, client_id, starts_at, ends_at, status (`scheduled`, `confirmed`, `in_service`, `done`, `cancelled`, `no_show`), origin (`ai`, `professional`), is_fit_in, price_cents, cancel_reason |
| `appointment_services` | appointment_id, service_id, name, duration_min, price_cents (cópia no momento da marcação) |
| `appointment_events` | appointment_id, type, description, actor — alimenta o "histórico curto" da tela de detalhe |
| `whatsapp_sessions` | professional_id, instance_name, provider (`baileys`, `cloud`), status, phone |
| `conversations` | professional_id, client_id, handler (`ai`, `human`), unread_count, last_message_at |
| `messages` | conversation_id, direction (`in`, `out`), author (`client`, `ai`, `professional`), kind (`text`, `audio`), text, transcription, ai_note, provider_message_id (único) |
| `ai_decisions` | professional_id, conversation_id, client_id, type (`encaixe`, `novo_horario`, `remarcar`, `atraso`, `duvida`), question, context (json), options (json, 1 a 3), proposed_action (json), status (`pending`, `resolved`, `expired`), deadline_at, timeout_notified_at, resolved_via (`voice`, `notification`, `app`, `alexa`, `timeout`), resolved_option, resolved_text |
| `waitlist_entries` | professional_id, client_id, service_id, preference (json), opted_in_at, source_message_id, status |
| `waitlist_offers` | entry_id, slot_starts_at, expires_at, status (`sent`, `accepted`, `declined`, `expired`) |
| `audit_log` | professional_id, actor (`ai`, `professional`, `client`, `system`), action, payload (json) |
| `kit_leads` | professional_id, note |
| `leads` | name, phone, profession, message, source — contatos vindos do site |
| `account_deletions` | phone_hash, requested_at, completed_at, origin (`app`, `web`) — registro mínimo de que o pedido foi atendido |

`professionals.professions` aceita: barbeiro, cabeleireiro, manicure, esteticista, fisioterapeuta, psicólogo, dentista, professor ou instrutor, outro. Cada profissão tem uma lista de serviços sugeridos para o cadastro.

**Garantia contra horário duplicado:** restrição de exclusão no Postgres (`btree_gist`, intervalo `[starts_at, ends_at)` por `professional_id`) valendo para os status ativos. O motor de agenda verifica antes, e o banco impede a corrida entre duas marcações simultâneas.

## 4. Motor de agenda (`apps/api/src/modules/agenda`)

Funções puras, sem IA, com testes unitários:

- `findFreeSlots(professional, date, durationMin)` — respeita expediente, almoço, folgas, agendamentos ativos e a duração total dos serviços.
- `book`, `reschedule`, `cancel`, `markArrived`, `markDone`, `markNoShow` — cada uma valida conflito, grava `appointment_events` e `audit_log`, e publica um evento de tempo real.
- Cancelar libera a vaga e dispara a regra da lista de espera (seção 8).

Casos de teste obrigatórios: sobreposição parcial, fora do expediente, dentro do almoço, serviço que não cabe antes do fechamento, duas marcações simultâneas para o mesmo horário (só uma vence), virada de dia no fuso do salão.

## 5. Fluxo de uma mensagem recebida

1. **Webhook** da Evolution chega em `POST /v1/webhooks/whatsapp/:instance`. O segredo do webhook é validado. O `provider_message_id` evita processar a mesma mensagem duas vezes. Mensagens de grupo, de status e enviadas pelo próprio número são ignoradas.
2. A mensagem é gravada e um job entra na fila `inbound`. A resposta ao webhook é imediata.
3. O worker identifica o cliente pelo telefone (cria se for novo) e a conversa.
4. Se for áudio, transcreve (`packages/ia`, interface `Transcriber`) e grava a transcrição.
5. Se `ai_enabled` for falso, a IA estiver pausada ou a conversa estiver com `handler = human`, para aqui: só notifica o app.
6. `packages/ia` recebe o contexto reduzido (primeiro nome, agenda do dia resumida, serviços, últimas mensagens) e devolve chamadas de ferramenta validadas por Zod, além de uma nota curta ("Entendi como: pedido de horário para sábado de manhã") gravada em `messages.ai_note`.
7. O backend executa cada ferramenta pelo motor de regras:
   - Ação permitida pela autonomia (seção 6): executa e responde ao cliente.
   - Ação que exige o profissional: cria `ai_decisions`, agenda o job de prazo, publica `decision.created` (o app anuncia por voz no Modo Balcão ou notifica) e chama o Voice Monkey se a Alexa estiver ligada.
8. Toda resposta ao cliente passa pela guarda de envio.

**Resposta do profissional** — um único ponto de entrada, `POST /v1/decisions/:id/answer`, com `{ optionId }` ou `{ text }` e `via`. Texto livre ("pode, mas marca daqui 15 minutos") vai à IA, que o converte em ação; o motor valida conflito. A resposta traz a frase de confirmação a ser falada ("Marquei o Fulano às 14h20") e a prévia da mensagem ao cliente, quando a prévia estiver ligada. Voz, notificação, aba Decisões e Alexa usam todos essa rota.

**Prazo esgotado** — o job envia a mensagem neutra ao cliente, grava `timeout_notified_at`, notifica o profissional e mantém a Decisão `pending`, ainda respondível na aba. Ela só passa a `expired` (com `resolved_via = timeout`) quando o horário proposto passa ou deixa de estar livre; nesse caso o cliente é avisado e a Decisão aparece em "Resolvidas" como "Expirou — IA avisou o cliente".

**Ferramentas da IA** (nomes em pt-BR, parâmetros com schema Zod em `packages/shared`): `listar_agenda`, `buscar_vagas`, `marcar`, `remarcar`, `cancelar`, `enviar_whatsapp`, `entrar_lista_de_espera`, `confirmar_presenca`, `perguntar_ao_profissional`, `responder_cliente`.

**Teste de aceitação principal:** o "fluxo do seu exemplo" do PDF (página 8), do passo 1 ao 7, rodando com gateway e LLM falsos: Carlos cancela às 14:02, Fulano pede horário às 14:05, a Decisão é criada, o profissional responde "pode, mas marca daqui 15 minutos", o agendamento sai às 14:20 e as mensagens certas são enviadas. O passo 7 (sem resposta) também tem teste.

## 6. Autonomia da IA

Campo `professionals.autonomy`, editado na tela de Ajustes:

| Chave | Padrão | Efeito |
|---|---|---|
| `answer_price_address` | ligado | Responde preço e endereço sem perguntar |
| `confirm_reminders` | ligado | Aceita a confirmação de presença do lembrete |
| `book_free_slot_known_client` | desligado | Marca em horário livre para cliente que já tem atendimento anterior |
| `cancel_on_request` | ligado | Cancela quando o cliente pede e sempre avisa o profissional |
| `change_other_client` | **travado: sempre pergunta** | Não é configurável; a API rejeita tentativa de alterar |

Com `book_free_slot_known_client` desligado, todo pedido de horário vira Decisão.

## 7. WhatsApp (`packages/whatsapp`)

Interface `WhatsAppGateway`: `createSession`, `getQrCode`, `getPairingCode`, `getStatus`, `disconnect`, `sendText`, `sendPresence` (digitando) e `parseWebhook`. Implementações: `EvolutionGateway` e `FakeGateway` (usado nos testes e no modo de demonstração).

**Guarda de envio** — função única por onde passa toda saída. Valores padrão, configuráveis por variável de ambiente:

| Regra | Padrão |
|---|---|
| Só envia a quem escreveu primeiro, ou a cliente com atendimento anterior, ou a quem está na lista de espera com `opted_in_at` | sempre |
| Limite por instância | 8 mensagens por minuto, 200 por dia |
| Atraso antes de responder | "digitando" por 2 a 8 segundos, proporcional ao tamanho do texto, com variação aleatória |
| Tamanho | até 500 caracteres; textos maiores são divididos em no máximo 2 mensagens |
| Links | bloqueia encurtadores (bit.ly, tinyurl e similares) |
| Lista de espera | uma pessoa por vez por vaga (seção 8) |
| Envio em massa | não existe rota nem função para isso |

Bloqueios da guarda são gravados em `audit_log`. Queda de sessão publica `whatsapp.status`, aciona o banner vermelho do app e segura a fila de saída até a reconexão, descartando mensagens com mais de 30 minutos.

Antes de escrever o adaptador, conferir na documentação oficial da Evolution API a versão estável atual, o formato dos webhooks e as rotas de pareamento. Fixar a versão da imagem no compose.

## 8. Lembretes, lista de espera e relatórios

- **Lembrete:** job agendado para `starts_at - reminder_lead_minutes` (padrão 120), com "responda 1 para confirmar". A resposta confirma o agendamento se `confirm_reminders` estiver ligado. Reagendar ou cancelar remove o job.
- **Lista de espera:** quando uma vaga abre, o sistema escolhe a entrada mais antiga cuja preferência combina, envia a oferta e espera `waitlist_rule.wait_minutes` (padrão 10). Sem resposta ou com recusa, passa para a próxima. Uma oferta ativa por vaga. Só entra na lista quem pediu; a origem (`source_message_id` ou inclusão manual) fica registrada.
- **Resumo do dia:** texto para ser falado ao abrir e ao fechar o salão.
- **Relatórios do painel:** encaixes recuperados no mês e o valor correspondente, taxa de faltas, ocupação por profissional, mapa de calor dia × hora.

## 9. API

Prefixo `/v1`. JWT em todas as rotas, exceto autenticação, webhooks e Alexa (que valida a assinatura da Amazon). Os schemas de entrada e saída ficam em `packages/shared`, e a API publica a especificação OpenAPI gerada a partir deles.

| Grupo | Rotas |
|---|---|
| Autenticação | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `GET /me`, `PATCH /me`, `DELETE /me` |
| Site | `POST /leads` (pública, com limite de requisições e campo-armadilha contra robôs) |
| Cadastro | CRUD de `/services`, `/working-hours`, `/time-off` |
| Clientes | CRUD de `/clients`, `GET /clients/:id/stats` |
| Agenda | `GET /agenda?date=`, `GET /slots?date=&serviceIds=`, `POST /appointments`, `GET /appointments/:id`, `POST /appointments/:id/{reschedule,cancel,arrive,done,no-show}`, `POST /appointments/:id/delay-notice` |
| WhatsApp | `POST /whatsapp/session`, `GET /whatsapp/qr`, `GET /whatsapp/pairing-code`, `GET /whatsapp/status`, `DELETE /whatsapp/session`, `POST /webhooks/whatsapp/:instance` |
| Conversas | `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `POST /conversations/:id/handoff` |
| Decisões | `GET /decisions?status=`, `POST /decisions/:id/answer`, `POST /decisions/:id/take-over` |
| Lista de espera | CRUD de `/waitlist`, `POST /waitlist/:id/offer`, `PATCH /waitlist/rule` |
| IA | `POST /ai/pause`, `POST /ai/resume`, `PATCH /ai/settings`, `POST /messages/preview` |
| Voz | `POST /voice/command`, `GET /voice/summary?moment=open|close` |
| Dispositivos | `POST /devices`, `DELETE /devices/:id` |
| Painel | `GET /salon/day`, `GET /salon/reports`, CRUD de `/salon/team`, `GET /salon/clients` (com exportação CSV), `GET /salon/plan`, `POST /kit-leads` |
| Alexa | `POST /alexa/skill` |
| Sistema | `GET /health`, `WS /realtime` |

Eventos do WebSocket: `decision.created`, `decision.resolved`, `appointment.changed`, `message.created`, `conversation.updated`, `whatsapp.status`, `ai.status`.

**Exclusão de conta (`DELETE /me`)** — exige um código novo enviado ao telefone. Desconecta e apaga a instância do WhatsApp, cancela os jobs, apaga os dados pessoais do profissional e dos clientes dele (conversas, mensagens, agenda, lista de espera) e grava só o registro mínimo em `account_deletions`. Se quem pede é o dono de um espaço com outros profissionais, a API exige que ele transfira a posse ou confirme a exclusão do espaço inteiro. A mesma rota atende o app e a página `/excluir-conta`. Há teste que confirma que nenhum dado pessoal sobra no banco.

**Conta de demonstração para as lojas** — um telefone e um código fixos, definidos por variável de ambiente (`REVIEW_PHONE`, `REVIEW_OTP`), entram em uma conta com dados de exemplo e WhatsApp simulado (`FakeGateway`), para o revisor navegar sem parear um número. Desligada quando as variáveis não existem.

`POST /voice/command` recebe o texto reconhecido no aparelho e devolve a frase a ser falada, usando as mesmas ferramentas da IA. Perguntas que precisam funcionar: "quantos clientes ainda tenho hoje?", "tem horário vago?", "quem é o próximo?", "alguém mandou mensagem?". A meta de tempo de resposta é de 3 segundos, usando a agenda do dia já resumida.

## 10. Identidade visual

A fonte é `Bora-Marca-Kit/`. Ninguém edita essa pasta; cada app copia para si os arquivos que usa.

**Cores base:** violeta `#7138F5`, lima `#D9FC60`, grafite `#191624`, neutro `#F8F7FC`. **Fonte:** Inter.

Os tokens ficam em `packages/shared/src/theme.ts` e alimentam `apps/mobile/src/theme` e o `tailwind.config` de `apps/web`. Mapeamento de partida, a ajustar pelo contraste (mínimo WCAG AA em cada par texto e fundo):

| Token | Tema claro | Tema escuro |
|---|---|---|
| `bg` | neutro | grafite |
| `surface` | branco | grafite clareado |
| `text` | grafite | neutro |
| `primary` / `onPrimary` | violeta / branco | violeta / branco |
| `accent` / `onAccent` | lima / grafite | lima / grafite |
| `success` | lima com texto grafite (selo "Confirmado") | o mesmo |
| `warning`, `danger`, `border`, `textMuted`, `surfaceAlt` | tons derivados da paleta, marcados como "derivado" no README | o mesmo |

Usos que as referências fixam: violeta para a ação principal e para o card "Agora"; lima para confirmações, para o botão "Sim" no Modo Balcão e para o destaque de títulos sobre fundo escuro; card de pedido de encaixe em lima claro; Modo Balcão sempre em grafite. Texto lima sobre violeta só em títulos grandes.

**Logo:** componente `Logo` que carrega os SVG de `01-marca/svg/` (`cor` em fundo claro, `negativo` em fundo escuro, `violeta-branco` sobre grafite ou violeta).

**Imagens de referência** em `Bora-Marca-Kit/05-referencias/`: definem cores, formas, hierarquia e densidade. O conteúdo de cada tela vem dos prompts e deste plano. Os dados de exemplo das referências (Marina, fisioterapia, Ana Paula, Rafael, Beatriz) são os dados de demonstração do projeto.

| Referência | Tela |
|---|---|
| `01-boas-vindas`, `02-cadastro`, `03-whatsapp` | prompts 01 e 02 |
| `04-agenda`, `05-agendamentos` | prompts 03 e 04 |
| `06-decisoes`, `07-conversas` | prompts 05 e 06 |
| `08-voz`, `09-configurar-balcao` | prompts 07 e 08 |
| `10-clientes`, `11-ajustes` | prompts 09 e 10 |
| `12-web-agenda` a `16-web-cobranca` | painel web |
| `landing-aprovada.png` | site público |

**Git:** entram no repositório `01-marca/svg`, `02-landing/web`, `03-icones`, `04-lojas/app-store`, `04-lojas/google-play`, `05-referencias`, `06-icones-interface/*.svg` e os arquivos da raiz do kit. Ficam no `.gitignore`: `**/png-4k/`, `02-landing/nativos/`, `04-lojas/masters-4k/` e `06-icones-interface/*-4k.png`.

## 11. App (`apps/mobile`)

Um projeto Expo para Android e iOS. Segue os prompts 00 a 10 no comportamento e as referências do kit na aparência, com estas definições:

- **Camada de dados:** `src/data/` expõe uma interface por domínio com duas implementações: mock (os dados de demonstração das referências) e API real. A variável `EXPO_PUBLIC_DATA_SOURCE=mock|api` escolhe. As telas não sabem qual está em uso.
- **Tipos:** vêm de `packages/shared`, sem redefinição no app.
- **Decisões:** `handleDecisionAction(decisionId, answer, via)` é o único caminho; a notificação, a aba e a voz chamam essa função, que chama `POST /decisions/:id/answer`.
- **Notificações:** ações Sim e Não na própria notificação, nas duas plataformas (canal "Decisões" no Android, categoria de notificação no iOS).
- **Modo Balcão:** máquina de estados em `src/features/balcao/machine.ts`, conforme o prompt 07, com testes das transições, do prazo de 12 segundos e da repetição única.
- **Voz:** interfaces `WakeWordEngine`, `SpeechToText` e `TextToSpeech`. Porcupine implementa a primeira quando houver `EXPO_PUBLIC_PICOVOICE_KEY` e o arquivo da palavra para a plataforma; sem eles, o botão "Falar" na tela substitui a palavra de ativação.
- **Excluir conta:** em Ajustes → Conta, com explicação do que é apagado, confirmação por código e chamada a `DELETE /me`. No mesmo lugar ficam os links para a política de privacidade e os termos.
- **Desenvolvimento:** rota `app/dev/vitrine.tsx` com todos os componentes e um menu para simular decisão nova, queda do WhatsApp e palavra de ativação. Ambos ficam fora do build de produção.

### Diferenças entre as plataformas

| | Android | iOS |
|---|---|---|
| Modo Balcão com o app aberto | sim | sim, com a tela mantida acesa |
| Voz com a tela bloqueada | sim: serviço em primeiro plano do tipo `microphone`, notificação fixa "Bora Marca está ouvindo" com ação "Pausar", iniciado pelo botão "Iniciar o balcão" | não; o sistema não permite. As decisões chegam por notificação com Sim e Não |
| Assistente de configuração (prompt 08) | seis passos, com instruções de bateria por marca | versão curta: microfone, reconhecimento de fala, notificações, teste de som e teste final |
| Abrir o WhatsApp no pareamento | link `whatsapp://` | o mesmo, com o esquema declarado no `Info.plist` |

Nenhum módulo exclusivo de uma plataforma é importado sem verificação de plataforma. Antes de escolher entre módulo próprio em Kotlin com config plugin e uma biblioteca pronta para o serviço em primeiro plano, consultar a documentação atual do Android e do Expo e registrar o motivo no README.

### Configuração nativa

Tudo em `app.config.ts` e em config plugins; as pastas `android/` e `ios/` são geradas e não entram no git.

- Nome "Bora Marca"; identificador `br.com.boramarca.app` nas duas plataformas; esquema de link `boramarca`.
- Ícone: `03-icones/icone-1024.png`; Android adaptativo com `android-adaptive-foreground.png`, `android-adaptive-background.png` e `android-monochrome.svg`; iOS com `04-lojas/app-store/icone-1024-sem-alpha.png`. Tela de abertura com o símbolo sobre grafite. Ícone de notificação monocromático.
- **Android — permissões:** `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `BLUETOOTH_CONNECT`, `WAKE_LOCK`. Para a bateria, abrir a tela de configurações do sistema em vez de pedir a permissão de ignorar a otimização, que o Google Play restringe; conferir a política vigente. Nenhuma permissão além das usadas.
- **iOS — textos de permissão** em pt-BR, dizendo para que serve cada uma: microfone (`NSMicrophoneUsageDescription`) e reconhecimento de fala (`NSSpeechRecognitionUsageDescription`). Manifesto de privacidade (`PrivacyInfo.xcprivacy`) com os dados coletados e as APIs de uso declarado. Sem rastreamento e sem identificador de publicidade.
- `eas.json` com os perfis `development` (dev build), `preview` (APK e build interno do iOS) e `production` (AAB e IPA), com incremento automático de versão.
- Variáveis `EXPO_PUBLIC_*` por perfil, apontando para a API local, de homologação e de produção.

### Verificação

- Android: `expo prebuild` e `gradlew assembleDebug` passam na máquina; `gradlew assembleRelease` passa com uma chave de teste descartável, para provar que o build otimizado compila. Se houver emulador, instalar e abrir o app.
- iOS: `expo-doctor` sem erros; a configuração resolvida para o iOS contém o identificador, os textos de permissão e o manifesto de privacidade; `expo export --platform ios` gera o pacote. O build no EAS é pendência humana.

## 12. Site público e painel (`apps/web`)

Um projeto Next.js com duas áreas. Os tokens vêm de `packages/shared`; a fonte é Inter.

### Site público — `app/(site)`

**Landing (`/`)** — reproduz `05-referencias/landing-aprovada.png`, seção por seção, usando os assets de `02-landing/web` conforme o "Mapa da landing" do `LEIA-PRIMEIRO.md` do kit e as regras do `guia-html-css.md`:

1. Cabeçalho: logo, âncoras (Como funciona, Recursos, Modo Balcão, Dúvidas), "Entrar" (leva a `/painel`) e "Conhecer".
2. Hero em grafite: "Você atende. Seu tempo volta." com a arte `01-hero-completo`.
3. Faixa de áreas atendidas, com os ícones de `06-icones-interface`.
4. "Da conversa ao atendimento": as bolhas de conversa feitas em HTML.
5. "O que muda na sua rotina": três cards.
6. Modo Balcão em violeta: "Mãos ocupadas? Responda por voz."
7. "A IA facilita. Você dá a palavra final.": as permissões.
8. "Comece com o que você já usa": três passos.
9. Dúvidas, em sanfona acessível.
10. Chamada final e rodapé com Privacidade, Termos, Contato e Excluir conta.

Títulos, parágrafos, botões e perguntas são texto HTML; as imagens são só ilustração, com texto alternativo. Imagens abaixo da primeira dobra carregam sob demanda, com largura e altura declaradas (ver `manifesto.csv`). Testar em 390, 768, 1024 e 1366 px. Respeitar `prefers-reduced-motion`. Metadados de busca e de compartilhamento, `sitemap.xml`, `robots.txt`, favicon e ícones de `03-icones`.

A landing não afirma o que o produto não faz: ao falar de voz, deixa claro que a escuta com tela bloqueada é do Android. As respostas das dúvidas dizem que a conexão com o WhatsApp não é a API oficial.

Os botões "Conhecer" levam a `/contato`. Quando as variáveis `NEXT_PUBLIC_PLAY_URL` e `NEXT_PUBLIC_APPSTORE_URL` existirem, a landing mostra também os selos das lojas.

| Página | Conteúdo |
|---|---|
| `/contato` | Formulário (nome, WhatsApp, profissão, mensagem) que grava em `POST /leads`, e o canal de suporte. Serve como URL de suporte exigida pela App Store. |
| `/privacidade` | Quais dados são coletados do profissional e dos clientes dele, para quê, com quem são compartilhados (provedores de IA e de transcrição, com transferência internacional), a conexão não oficial com o WhatsApp, o áudio do microfone (processado no aparelho para a palavra de ativação; a fala reconhecida vira texto), prazo de guarda, direitos do titular e como exercê-los, contato do encarregado. Precisa bater com o que o app faz e com as declarações das lojas. |
| `/termos` | Regras de uso, a ciência do risco de bloqueio do número, limites de responsabilidade, planos. |
| `/excluir-conta` | Explica o que é apagado e o que é mantido, e permite excluir ali mesmo: telefone, código, confirmação. Chama `DELETE /me`. É a URL que o Google Play exige; funciona sem o app instalado. |

Os textos de privacidade e de termos saem como rascunhos completos. O aviso de "revisão jurídica pendente" fica em `docs/PENDENCIAS-HUMANAS.md`, não na página.

### Painel do dono — `app/painel`

Segue o prompt 11 e as referências `12` a `16`: Hoje (agenda em colunas por profissional, visões Dia e Semana, arrastar para remarcar, lateral com decisões pendentes que podem ser respondidas ali), Resultados (com o número de horários recuperados em destaque), Equipe, Clientes (busca, filtro de sumidos e exportação CSV) e Plano (plano atual, uso e interesse no Kit Balcão). Login pelo código por telefone, restrito a `role = owner`. Não há histórico de cobranças nem card de atendimento telefônico.

## 13. Publicação nas lojas

Pasta `apps/mobile/store/`, com tudo o que o dono precisa copiar para os consoles:

| Arquivo | Conteúdo |
|---|---|
| `textos-google-play.md` | Título, descrição curta e descrição completa, em pt-BR |
| `textos-app-store.md` | Nome, subtítulo, texto promocional, descrição, palavras-chave, URLs de suporte, de marketing e de privacidade |
| `seguranca-de-dados-google.md` | Respostas do formulário de segurança de dados: cada tipo de dado coletado, finalidade, se é compartilhado, criptografia em trânsito e a URL de exclusão de conta |
| `privacidade-app-apple.md` | Respostas das etiquetas de privacidade da App Store, coerentes com o `PrivacyInfo.xcprivacy` |
| `declaracoes-android.md` | Justificativa do serviço em primeiro plano do tipo microfone e roteiro do vídeo de demonstração; justificativa de cada permissão; classificação etária |
| `notas-para-revisao.md` | Em português e inglês: o que o app faz, a conta de demonstração (telefone e código), como testar o Modo Balcão e a explicação da conexão com o WhatsApp |
| `capturas/` | Capturas reais do app com os dados de demonstração, tiradas no emulador Android nos tamanhos exigidos; lista das que faltam para o iPhone |
| `PUBLICAR.md` | Passo a passo, do zero: criar as contas, configurar o EAS, gerar os builds de produção, enviar e preencher cada formulário |

Os textos de loja só anunciam o que o build faz. O ícone e as artes de destaque vêm de `Bora-Marca-Kit/04-lojas/`. Conferir nas páginas oficiais do Google Play e da App Store os limites de caracteres, os tamanhos de captura e as exigências vigentes antes de fechar os arquivos.

## 14. Alexa (`packages/alexa`)

- Handler da skill com o ASK SDK: intents para perguntar pela agenda e para responder a uma Decisão ("diga à Agenda que sim, para daqui 15 minutos"). O handler recebe por injeção as mesmas funções de voz e de decisão da API.
- Modelo de interação em pt-BR e manifesto da skill em `packages/alexa/skill/`.
- Cliente do Voice Monkey para o anúncio proativo, ativado por profissional.
- Vínculo de conta entre a Amazon e o profissional do Bora Marca.
- A resposta precisa sair em menos de 8 segundos; usar a agenda resumida e limite de tempo na chamada à IA com resposta de contingência.
- Testes com requisições gravadas. Publicação e certificação são pendências humanas.

## 15. IA (`packages/ia`)

- `llmClient`: formato OpenAI, modelo principal e reserva por variável de ambiente (`LLM_PRIMARY_*`, `LLM_FALLBACK_*`), limite de tempo, nova tentativa e troca automática para a reserva.
- `FakeLlm` determinístico para testes.
- Prompt de sistema fixo no início (para aproveitar o cache de entrada) e contexto variável no fim. O prompt vale para qualquer profissão e proíbe pedir ou registrar informação clínica.
- `buildContext()` é o único lugar que monta o que vai para a IA e aplica a redução de dados. Teste: nenhum telefone aparece no texto enviado.
- Saída sempre por chamada de ferramenta validada com Zod; resposta inválida gera uma nova tentativa e depois cai em `perguntar_ao_profissional`.
- `Transcriber`: implementação compatível com a API da OpenAI (Groq ou similar) e uma falsa.
- Conjunto de avaliação em `packages/ia/evals/`: pelo menos 40 mensagens em pt-BR, de beleza e de saúde (cancelamento, pedido de horário, remarcação, atraso, pergunta de preço, áudio transcrito, mensagem ambígua, gíria, cliente contando um sintoma) com a intenção esperada. Roda contra a IA real só quando as chaves existem (`pnpm eval`), fora do portão de qualidade.
- Conferir na documentação oficial os identificadores e as URLs atuais de DeepSeek e Qwen antes de preencher o `.env.example`. Documentar como apontar para um provedor hospedado fora da China, recomendado para contas de saúde.

## 16. Infraestrutura e operação

- `infra/docker-compose.yml`: Postgres, Redis e Evolution API com versões fixas. `pnpm dev:infra` sobe tudo.
- `infra/docker-compose.prod.yml`: inclui api, web e proxy com TLS automático (Caddy) para `boramarca.com.br` e `api.boramarca.com.br`, dimensionado para uma VPS de 2 a 4 GB.
- `.env.example` completo e comentado em cada app.
- `pnpm db:migrate` e `pnpm db:seed` (o espaço de demonstração das referências: Marina e equipe, 12 clientes, a agenda do dia com dois cancelamentos e um pedido de encaixe).
- GitHub Actions rodando o portão de qualidade.
- Logs estruturados, sem conteúdo de mensagens nem telefones em nível `info`.
- `docs/OPERACAO.md`: como subir, fazer cópia de segurança, atualizar a Evolution, agir quando uma sessão cai e monitorar a memória por instância.

## 17. Fases e critérios de aceite

A divisão em ondas de agentes está em [03-agentes.md](03-agentes.md).

| Fase | Entrega | Aceite |
|---|---|---|
| 0 — Fundação | Monorepo, contratos, tokens do kit, infraestrutura local, portão de qualidade | `pnpm install` e o portão passam em um clone limpo; `pnpm dev:infra` sobe os três serviços |
| 1 — Núcleo | Agenda, WhatsApp, IA respondendo, Decisões por notificação e pela aba, telas 01 a 06, 09 e 10 | O teste do fluxo de exemplo do PDF passa; o app compila em debug; todas as telas funcionam em modo mock e em modo API contra o backend local |
| 2 — Modo Balcão | Telas 07 e 08, voz, serviço em primeiro plano no Android, voz com app aberto no iOS | Testes da máquina de estados passam; o manifesto do Android inclui o serviço de microfone; `POST /voice/command` responde às quatro perguntas |
| 3 — Crescimento | Lista de espera automática, lembretes, relatórios, painel web, Alexa | Testes de lista de espera e de lembrete passam; testes da skill passam |
| 4 — Site e conta | Landing, páginas legais, contato, exclusão de conta no app, na web e na API | `next build` passa; a landing confere com a referência nas quatro larguras; o teste de exclusão confirma que não sobra dado pessoal |
| 5 — Lojas | Configuração nativa das duas plataformas, perfis do EAS, material de loja, conta de demonstração | As verificações de Android e iOS da seção 11 passam; a pasta `store/` está completa |
| Fechamento | Revisão de segurança e LGPD, documentação, lista de pendências humanas | Relatório de revisão sem itens graves abertos; `docs/PENDENCIAS-HUMANAS.md` e `docs/OPERACAO.md` existem; portão passa |

## 18. Definição de pronto

O trabalho só está concluído quando tudo abaixo for verdade, verificado por execução e não por leitura de código:

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` passam na raiz.
2. O teste de ponta a ponta do fluxo de exemplo passa contra Postgres e Redis reais em Docker.
3. `apps/mobile` gera o APK de debug e o build de release com chave de teste; as verificações de iOS da seção 11 passam.
4. `apps/web` conclui o build de produção, e as páginas `/`, `/privacidade`, `/termos`, `/excluir-conta` e `/contato` respondem.
5. A exclusão de conta funciona pelo app e pela página web contra a API local, e o teste confirma que os dados pessoais foram apagados.
6. A conta de demonstração entra e navega por todas as abas sem WhatsApp pareado.
7. `apps/mobile/store/` contém todos os arquivos da seção 13.
8. `docker compose -f infra/docker-compose.prod.yml config` é válido e as imagens da API e do site são construídas.
9. Não há segredo no repositório nem `TODO` sem registro em `docs/PENDENCIAS-HUMANAS.md`.
10. Cada item da lista "Só uma pessoa consegue fazer" da análise aparece em `docs/PENDENCIAS-HUMANAS.md` com o passo a passo.
