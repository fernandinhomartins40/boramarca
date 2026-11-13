# Bora Marca — Agentes de implementação

Este documento é para a sessão que vai orquestrar a implementação (Opus 5.5). Ele define o papel do orquestrador, as ondas de trabalho e o que cada agente recebe e entrega. A especificação técnica está em [02-plano-de-implementacao.md](02-plano-de-implementacao.md); as decisões e o escopo, em [01-analise.md](01-analise.md).

## 1. Papel do orquestrador

Você coordena e verifica. A implementação é feita pelos agentes; você escreve código apenas para pequenos ajustes de integração entre ondas.

1. Leia os três documentos de `docs/` por inteiro e o `LEIA-PRIMEIRO.md` de `Bora-Marca-Kit/` antes de lançar qualquer agente. Abra também `Bora-Marca-Kit/05-referencias/landing-aprovada.png` e duas ou três pranchas de telas, para conseguir julgar o resultado visual.
2. Execute as ondas na ordem. Dentro de uma onda, lance todos os agentes **na mesma mensagem**, para rodarem em paralelo.
3. Use agentes do tipo de uso geral. Cada um começa sem contexto: o briefing precisa conter tudo o que ele precisa, conforme o modelo da seção 3.
4. Ao fim de cada onda, rode você mesmo o portão de qualidade (`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`) e as verificações da onda. Não aceite o relatório de um agente sem repetir a verificação.
5. Se o portão falhar, lance um agente de correção com a saída do erro e a lista de arquivos envolvidos, ou corrija você mesmo se for pequeno. Não avance de onda com o portão vermelho.
6. Faça um commit por onda aprovada, na branch `main`, com mensagem descritiva. Não faça `push` sem pedido do usuário.
7. Mudanças nos contratos de `packages/shared` pedidas pelos agentes nos relatórios são aplicadas por você entre as ondas.
8. Não pare para pedir aprovação entre ondas. Pare apenas se um bloqueio exigir algo que só o usuário tem e não houver alternativa prevista no plano. Chaves e contas ausentes não são bloqueio: o plano prevê implementações falsas para todos os serviços externos, e o que depende de conta de loja vira pendência humana documentada.
9. Ao final, entregue ao usuário: o que foi construído, o resultado de cada item da definição de pronto, o que não pôde ser verificado e o caminho de `docs/PENDENCIAS-HUMANAS.md`.

## 2. Regras para todos os agentes

Inclua estas regras em todos os briefings:

- **Posse de arquivos:** edite só as pastas listadas como suas. Se precisar de algo fora delas, não edite: descreva o pedido no relatório final. `Bora-Marca-Kit/` e `Bora-Marca-pacote-completo/` são somente leitura para todos.
- **Contratos:** os tipos vêm de `packages/shared`. Você pode **acrescentar** schemas no arquivo do seu domínio; não altere nem remova o que já existe. Liste no relatório o que acrescentou.
- **Identidade visual:** só os tokens de `packages/shared/src/theme.ts` e os arquivos do kit. Nenhuma cor, fonte ou logo inventada. Quem faz tela abre a imagem de referência correspondente antes de começar e compara o resultado com ela antes de terminar.
- **Dependências:** as previstas já estão instaladas. Se faltar uma, use `pnpm add --filter <seu pacote>`; se a instalação falhar porque outro agente está instalando, espere um minuto e tente de novo uma vez. Liste as dependências novas no relatório.
- **Documentação atual:** para bibliotecas, serviços externos e regras de plataforma (Expo, EAS, Evolution API, Picovoice, ASK SDK, provedores de IA, Android, iOS, políticas do Google Play e da App Store), consulte a documentação oficial atual antes de codificar. Não confie na memória para versões, nomes de rotas, identificadores de modelos e exigências de loja.
- **Sem serviço real nos testes:** os testes usam as implementações falsas. Nenhum teste depende de chave, de internet ou de aparelho.
- **Sem segredo no repositório.** Variáveis novas entram no `.env.example` do pacote, com comentário.
- **Pendências humanas:** tudo o que depender de conta, chave, aparelho físico ou aprovação externa vai para `docs/pendencias/<id-do-agente>.md`, com passo a passo.
- **Pronto significa executado:** antes de terminar, rode `pnpm --filter <seu pacote> typecheck`, `lint` e `test`, além das verificações do seu briefing.
- **Relatório final** com: o que foi entregue; os comandos de verificação executados e o resultado de cada um; o que não foi feito ou não pôde ser verificado, e por quê; pedidos para fora das suas pastas; dependências e contratos acrescentados.

## 3. Modelo de briefing

```
Você vai implementar uma parte do Bora Marca, um assistente de agenda por
WhatsApp e voz para profissionais que trabalham com hora marcada.

Repositório: c:\FuseDev\boramarca (monorepo pnpm, Windows).

Leia primeiro, nesta ordem:
- docs/02-plano-de-implementacao.md — seção 1 sempre; seções <N, N, N> por inteiro
- docs/01-analise.md — seção 5 (decisões) e seção 6 (escopo)
- <prompts de tela, imagens de referência e código específicos>

Sua missão: <uma frase com o resultado esperado e para que ele serve>

Suas pastas (só você edita): <lista>
Pode ler, sem editar: todo o resto.

O que entregar:
<lista do agente, da seção 4>

Como verificar antes de terminar:
<comandos e resultado esperado>

Regras gerais:
<colar a seção 2 deste documento>
```

Os prompts de tela ficam em `Bora-Marca-pacote-completo/02-prompts-telas-codex/` e as imagens em `Bora-Marca-Kit/05-referencias/`. Abaixo eles aparecem só pelo número ou nome.

## 4. Ondas e agentes

Visão geral: 7 ondas e 21 agentes.

| Onda | Agentes | Em paralelo |
|---|---|---|
| 0 — Fundação | F0 | não |
| 1 — Bases | A1, A2, A3, A4 | sim |
| 2 — Núcleo do produto | B1, B2, B3 | sim |
| 3 — Voz, espera, site e Alexa | C1, C2, C3, C4, C5 | sim |
| 4 — Integração | D1, D2, D3, D4 | sim |
| 5 — Lojas | E1 | não |
| 6 — Fechamento | V1 e V2 em paralelo; depois V3 | parcial |

### Onda 0 — Fundação

**F0 — Fundação do monorepo**

- Lê: plano, seções 1, 2, 3, 9, 10 e 16; `LEIA-PRIMEIRO.md`, `paleta.json` e `tokens.css` do kit.
- Pastas: raiz, `packages/shared`, `infra/`, `.github/`, e os esqueletos de `apps/*` e `packages/*`.
- Entrega:
  - Workspace pnpm com `apps/api`, `apps/mobile`, `apps/web`, `packages/shared`, `packages/whatsapp`, `packages/ia` e `packages/alexa`, cada um com `package.json`, `tsconfig` e um teste trivial passando.
  - Scripts da raiz: `typecheck`, `lint`, `test`, `build`, `dev:infra`, `db:migrate`, `db:seed`, `eval`.
  - ESLint, Prettier e TypeScript estrito compartilhados; `.editorconfig`; `.gitignore` com as exclusões do kit listadas na seção 10 do plano.
  - `packages/shared`: schemas Zod de todas as entidades da seção 3, DTOs de entrada e saída de todas as rotas da seção 9, eventos do WebSocket, parâmetros das ferramentas da IA e `theme.ts` com os tokens da seção 10 (claro e escuro), com um teste que confere o contraste AA dos pares texto e fundo.
  - `apps/api`: Fastify com carregamento automático de módulos, configuração por variáveis de ambiente validada com Zod, rota `/health`, conexão Drizzle e Redis, pasta `src/modules/` vazia com um README explicando a convenção.
  - `apps/mobile`: projeto Expo criado com o SDK estável atual, expo-router, configurado para dev build, com todas as dependências previstas nos prompts 00 a 10 instaladas.
  - `apps/web`: Next.js com Tailwind lendo os tokens de `packages/shared`, fonte Inter e as áreas `app/(site)` e `app/painel` criadas com uma página provisória cada.
  - `infra/docker-compose.yml` com Postgres, Redis e Evolution API em versões fixas.
  - GitHub Actions com o portão de qualidade.
  - `README.md` na raiz: como instalar, subir a infraestrutura e rodar cada app.
- Verificação: portão de qualidade na raiz; `pnpm dev:infra` sobe os três contêineres saudáveis; `/health` responde.

Depois de F0, o orquestrador revisa `packages/shared` contra as seções 3, 9 e 10 do plano, pois todos os agentes seguintes dependem desse pacote.

### Onda 1 — Bases (4 em paralelo)

**A1 — Núcleo da API**

- Lê: plano, seções 1, 3, 4, 9; análise, item 9 da seção 5.
- Pastas: `apps/api` inteiro.
- Entrega: schema Drizzle e migrações de todas as tabelas, com a restrição de exclusão de horários; autenticação por código e JWT com a interface `OtpSender` (implementação de desenvolvimento que registra o código no log e aceita `123456` só fora de produção); módulos de cadastro (com as profissões e os serviços sugeridos por profissão), clientes e agenda com o motor da seção 4; WebSocket `/realtime` com os eventos; isolamento por profissional; seed de demonstração com os dados das referências; especificação OpenAPI.
- Verificação: testes do motor de agenda com todos os casos da seção 4, incluindo a marcação simultânea contra o Postgres do Docker; teste de isolamento entre profissionais; `pnpm db:migrate && pnpm db:seed` em banco limpo.

**A2 — WhatsApp**

- Lê: plano, seções 1, 5 (passo 1), 7; PDF, páginas 2 a 4.
- Pastas: `packages/whatsapp`.
- Entrega: interface `WhatsAppGateway`; `EvolutionGateway` conforme a documentação da versão fixada no compose; `FakeGateway` com controle de tempo para testes e para a conta de demonstração; `parseWebhook` com amostras gravadas dos formatos reais (texto, áudio, grupo, status, mensagem própria); guarda de envio como função pura com as regras e os padrões da seção 7.
- Verificação: testes de cada regra da guarda (inclusive que não existe caminho para enviar a um número que nunca escreveu) e do parser com as amostras.

**A3 — IA**

- Lê: plano, seções 1, 5, 6, 15; PDF, páginas 7 e 8; análise, itens 1 e 2 da seção 5.
- Pastas: `packages/ia`.
- Entrega: `llmClient` com reserva; `FakeLlm`; prompt de sistema válido para qualquer profissão, com a proibição de informação clínica; `buildContext` com redução de dados; interpretação de mensagem do cliente em chamadas de ferramenta validadas; interpretação de resposta livre do profissional em ação ("pode, mas marca daqui 15 minutos"); interpretação de comando de voz; gerador de textos por tom (`descontraido`, `simpatico`, `formal`); `Transcriber` real e falso; conjunto de avaliação com 40 ou mais casos; `.env.example` com identificadores conferidos na documentação oficial.
- Verificação: testes com `FakeLlm` cobrindo resposta inválida, queda do modelo principal e troca para a reserva; teste que garante a ausência de telefone no contexto enviado.

**A4 — Fundação do app**

- Lê: plano, seções 1, 10 e 11; prompt `00`; todas as imagens `01` a `11` de referência; análise, itens 3 e 4 da seção 5.
- Pastas: `apps/mobile`.
- Entrega: o que o prompt 00 pede, na linguagem visual do kit: `src/theme` a partir de `packages/shared/src/theme.ts`, claro e escuro; fonte Inter; componente `Logo` com os SVG do kit; todos os componentes base (botões, `BigChoice`, cards, selos, `TimeSlot`, `VoiceOrb` e os demais); vitrine; navegação por abas como na referência `04-agenda`; ícone do app, ícone adaptativo e tela de abertura a partir de `03-icones`; camada `src/data/` com interface por domínio e implementação mock com os dados das referências e os tipos de `packages/shared`; **rotas vazias para todas as telas dos prompts 01 a 10**, para que os agentes seguintes só preencham arquivos existentes; README do app com as regras do prompt 00.
- Verificação: Jest passa; `expo prebuild --platform android` e `gradlew assembleDebug` concluem; se houver emulador, a vitrine abre e uma captura dela é comparada com as referências.

### Onda 2 — Núcleo do produto (3 em paralelo)

**B1 — Orquestração de mensagens e Decisões**

- Lê: plano, seções 1, 5, 6, 7, 9; código de `packages/whatsapp` e `packages/ia`.
- Pastas: `apps/api`.
- Entrega: sessão do WhatsApp por profissional (criar, QR, código de pareamento, status, desconectar); webhook com segredo e proteção contra duplicidade; filas BullMQ; worker de entrada com o fluxo completo da seção 5; execução das ferramentas pelo motor de regras e pela autonomia; Decisões com prazo, resposta por opção ou texto livre e "deixa que eu respondo"; pausa da IA; conversas e mensagens (enviar como profissional, assumir e devolver); prévia de mensagem; registro de dispositivo e envio de notificação com ações; `audit_log` em todas as ações.
- Verificação: **teste de ponta a ponta do fluxo de exemplo do PDF**, passos 1 a 7, com `FakeGateway` e `FakeLlm` contra Postgres e Redis do Docker; teste de mensagem duplicada; teste de IA pausada; teste de `change_other_client` travado.

**B2 — App: entrada e ajustes**

- Lê: plano, seções 1, 10 e 11; prompts `01`, `02` e `10`; referências `01-boas-vindas`, `02-cadastro`, `03-whatsapp` e `11-ajustes`; README do app.
- Pastas: `apps/mobile/app/(auth)`, `app/(onboarding)`, `app/(tabs)/ajustes*`, `src/features/auth`, `src/features/whatsapp`, `src/features/settings`, `src/features/account`, e os arquivos de `src/data` desses domínios. Componentes novos em `src/components/` são permitidos, cada um em arquivo próprio.
- Não instala dependências (o agente B3 é o único que pode nesta onda).
- Entrega: boas-vindas, login por código, cadastro rápido com as profissões do plano, conexão do WhatsApp por código de pareamento e por QR com todos os estados, banner global de desconexão, tela de Ajustes completa com o interruptor "IA atendendo" e o banner de IA pausada, e em Conta: **excluir conta** (explicação, confirmação por código, `DELETE /me`), política de privacidade e termos.
- Verificação: Jest; cada tela com os estados de carregando, vazio e erro; simulações das quatro situações do prompt 02 acessíveis pelo menu de desenvolvimento; teste do fluxo de exclusão de conta.

**B3 — App: agenda e clientes**

- Lê: plano, seções 1, 4, 10 e 11; prompts `03`, `04` e `09`; referências `04-agenda`, `05-agendamentos` e `10-clientes`; README do app.
- Pastas: `apps/mobile/app/(tabs)/index*` (agenda), `app/agendamento`, `app/(tabs)/clientes*`, `app/cliente`, `src/features/agenda`, `src/features/clients`, `src/features/waitlist`, `src/utils/agenda.ts`, e os arquivos de `src/data` desses domínios.
- Entrega: agenda do dia com o card Agora/Próximo, faixa de decisões, resumo e linha do tempo; detalhe e novo agendamento com prévia de mensagem; lista de clientes, perfil e lista de espera com a regra em frase editável.
- Verificação: Jest, incluindo os testes de `src/utils/agenda.ts` pedidos no prompt 04; telas com agenda cheia e com dia vazio.

### Onda 3 — Voz, espera, site e Alexa (5 em paralelo)

**C1 — API: lembretes, lista de espera, relatórios, voz, contatos e exclusão de conta**

- Lê: plano, seções 1, 8, 9.
- Pastas: `apps/api`.
- Entrega: lembretes com confirmação; lista de espera automática, uma pessoa por vez e com expiração; `POST /voice/command` e `GET /voice/summary`; rotas do painel (`/salon/*`) com relatórios e exportação CSV; `kit-leads`; aviso de atraso; `POST /leads` com limite de requisições; `DELETE /me` conforme a seção 9, incluindo o caso do dono com equipe.
- Verificação: testes de lembrete (agendar, remarcar, cancelar), da lista de espera (ordem, preferência, expiração, só quem pediu), das quatro perguntas de voz, dos números dos relatórios com o seed, e da exclusão de conta (nenhum dado pessoal do profissional nem dos clientes dele sobra no banco; a instância do WhatsApp é removida).

**C2 — App: Decisões e Conversas**

- Lê: plano, seções 1, 5, 10 e 11; prompts `05` e `06`; referências `06-decisoes` e `07-conversas`.
- Pastas: `apps/mobile/app/(tabs)/decisoes*`, `app/(tabs)/conversas*`, `app/conversa`, `src/features/decisions`, `src/features/conversations`, `src/features/notifications`, e os arquivos de `src/data` desses domínios.
- Não instala dependências (o agente C3 é o único que pode nesta onda).
- Entrega: aba Decisões com os cinco tipos, prazo, prévia, deslizar para assumir, histórico; `handleDecisionAction` centralizada; notificações com as ações Sim e Não respondendo sem abrir o app, no Android (canal "Decisões") e no iOS (categoria); lista e tela de conversa com selo de IA, transcrição, notas da IA, interruptor "IA respondendo" e respostas rápidas.
- Verificação: Jest de `handleDecisionAction` e do tratamento das ações da notificação; simulação de decisão nova pelo menu de desenvolvimento.

**C3 — App: Modo Balcão (interface e máquina de estados)**

- Lê: plano, seções 1, 10 e 11; prompt `07`; referência `08-voz`.
- Pastas: `apps/mobile/app/balcao`, `src/features/balcao`, `assets/sounds`.
- Entrega: tela cheia em grafite, retrato e paisagem, como na referência (círculo "Diga Ei, Bora Marca", onda de voz, pergunta com Sim em lima e Não); máquina de estados com fluxo proativo, som de aviso, prazo de 12 segundos e repetição única; interfaces `WakeWordEngine`, `SpeechToText` e `TextToSpeech` com implementações simuladas e fala real por `expo-speech`; painel de desenvolvimento escondido; tela sempre acesa; aviso de volume baixo. Funciona igual nas duas plataformas.
- Verificação: testes unitários de todas as transições da máquina; fluxo proativo completo acionável pelo painel de desenvolvimento.

**C4 — Alexa**

- Lê: plano, seções 1 e 14; PDF, páginas 4 e 5.
- Pastas: `packages/alexa`.
- Entrega: tudo o que a seção 14 lista, com o handler recebendo as funções da API por injeção.
- Verificação: testes com requisições gravadas para cada intent, para a contingência dos 8 segundos e para a validação de assinatura; testes do cliente Voice Monkey com HTTP simulado.

**C5 — Site público**

- Lê: plano, seções 1, 9 (rotas de site, exclusão de conta), 10 e 12; `LEIA-PRIMEIRO.md`, `guia-html-css.md` e `manifesto.csv` do kit; referência `landing-aprovada.png`; análise, itens 1, 2, 6 e 7 da seção 5.
- Pastas: `apps/web`, exceto `app/painel`.
- Entrega: a landing com as dez seções da seção 12, fiel à referência; `/contato` com o formulário; `/privacidade` e `/termos` com rascunhos completos e específicos deste produto; `/excluir-conta` funcional; cabeçalho e rodapé compartilhados; metadados, `sitemap.xml`, `robots.txt`, favicon e ícones; componentes de interface do site em `components/site/`.
- Verificação: `next build`; capturas da landing em 390, 768, 1024 e 1366 px comparadas com a referência, sem imagem distorcida nem rolagem horizontal; navegação por teclado na sanfona de dúvidas e nos formulários; com a API local, o formulário de contato grava um lead e a página de exclusão apaga uma conta de teste.

### Onda 4 — Integração (4 em paralelo)

**D1 — App ligado à API real**

- Lê: plano, seções 9 e 11; código de `apps/mobile/src/data` e de `packages/shared`.
- Pastas: `apps/mobile/src/data`, `src/lib/api`, `src/lib/realtime`.
- Não instala dependências (o agente D2 é o único que pode nesta onda).
- Entrega: implementação de API para todas as interfaces de dados; cliente HTTP com renovação de token; WebSocket atualizando agenda, decisões, conversas e status; registro do dispositivo para notificações; seleção por `EXPO_PUBLIC_DATA_SOURCE`.
- Verificação: testes do cliente com servidor simulado; com a API e o seed rodando localmente, um roteiro em script que faz login, lista a agenda, responde a uma decisão e exclui uma conta de teste usando a camada de dados do app.

**D2 — App: voz nativa e serviço em segundo plano**

- Lê: plano, seções 1 e 11 (inclusive a tabela de diferenças entre as plataformas); prompt `08`; referência `09-configurar-balcao`; PDF, páginas 5 e 6; código de `src/features/balcao`.
- Pastas: `apps/mobile/app/balcao/configurar*`, `src/features/balcao/native`, `apps/mobile/plugins`, `apps/mobile/modules`, `app.config.*` e `package.json` do app.
- Entrega: assistente de configuração (seis passos no Android, com instruções por marca; versão curta no iOS); implementações reais de `WakeWordEngine` (Porcupine nas duas plataformas, com alternativa pelo botão "Falar" quando não há chave), `SpeechToText` e `TextToSpeech`; no Android, serviço em primeiro plano do tipo `microphone` com notificação fixa e ação "Pausar"; botões "Iniciar o balcão" e "Encerrar o balcão" com resumo falado; manter a caixa acordada; retorno ao alto-falante do aparelho quando o Bluetooth cai; no iOS, Modo Balcão com o app aberto e sem serviço em segundo plano; roteiro de teste manual em Android físico e em iPhone no README.
- Verificação: `expo prebuild` e `gradlew assembleDebug` concluem; o `AndroidManifest.xml` gerado contém o serviço e a permissão `FOREGROUND_SERVICE_MICROPHONE`; a configuração resolvida do iOS contém os textos de permissão de microfone e de reconhecimento de fala; Jest passa. Declarar no relatório, sem rodeios, o que só pode ser comprovado em aparelho físico.

**D3 — Painel web**

- Lê: plano, seções 9, 10 e 12; prompt `11`; referências `12-web-agenda` a `16-web-cobranca`; análise, itens 4 e 5 da seção 5; código de `apps/web/components/site` para reaproveitar o que couber.
- Pastas: `apps/web/app/painel`, `apps/web/components/painel`.
- Entrega: as cinco telas ligadas à API real, com as visões Dia e Semana e a lateral de decisões; login do dono; sem histórico de cobranças e sem card de atendimento telefônico.
- Verificação: `next build`; typecheck; com a API e o seed locais, as cinco telas carregam dados e uma decisão é respondida pela lateral.

**D4 — API: Alexa, conta de demonstração, lacunas e imagens de produção**

- Lê: plano, seções 9, 14 e 16; relatórios das ondas anteriores (o orquestrador cola os pedidos pendentes para a API).
- Pastas: `apps/api`, `infra/`.
- Entrega: rota `/alexa/skill` ligada a `packages/alexa`; anúncio pelo Voice Monkey ao criar uma Decisão, quando ativado; vínculo de conta; **conta de demonstração para as lojas** (`REVIEW_PHONE`, `REVIEW_OTP`, dados de exemplo e `FakeGateway`); rotas e campos pedidos pelos agentes do app, do site e do painel; `Dockerfile` da API e do site; `infra/docker-compose.prod.yml` com Caddy para os dois domínios; logs sem dados pessoais.
- Verificação: testes da rota da Alexa; teste da conta de demonstração (entra, lista agenda, recebe uma decisão simulada e responde, sem tocar na Evolution); `docker compose -f infra/docker-compose.prod.yml config`; build das imagens.

### Onda 5 — Lojas

**E1 — Apps nativos prontos para publicar**

- Lê: plano, seções 1, 11 (configuração nativa e verificação), 12 (páginas legais) e 13; `LEIA-PRIMEIRO.md` do kit, parte de ícones e lojas; `apps/web/app/(site)/privacidade`; análise, itens 6, 7 e 8 da seção 5 e o primeiro risco da seção 7. Consulta as políticas e os requisitos atuais do Google Play e da App Store.
- Pastas: `apps/mobile` (configuração, `store/`, `eas.json`, plugins) e ajustes pontuais de tela exigidos pelas lojas.
- Entrega:
  - Configuração nativa completa das duas plataformas, conforme a seção 11: identificador, nome, esquema, ícones, tela de abertura, permissões mínimas no Android, textos de permissão e `PrivacyInfo.xcprivacy` no iOS.
  - `eas.json` com os três perfis e as variáveis por ambiente.
  - Vitrine e menu de desenvolvimento fora do build de produção; modo mock indisponível em produção.
  - Revisão do app contra as exigências das lojas: exclusão de conta alcançável em poucos toques, links de privacidade e termos, pedido de permissão só no momento do uso e com explicação antes, nenhum uso da marca do WhatsApp como identidade do app.
  - Pasta `apps/mobile/store/` com todos os arquivos da seção 13. As declarações de dados precisam bater com o código e com a página `/privacidade`; divergência encontrada é corrigida ou relatada.
  - Capturas reais no emulador Android com a conta de demonstração.
- Verificação: `gradlew assembleDebug` e `assembleRelease` (com chave de teste descartável) concluem; `expo-doctor` sem erros; a configuração resolvida do iOS contém identificador, textos de permissão e manifesto de privacidade; `expo export --platform ios` e `--platform android` concluem; lista conferida das permissões do `AndroidManifest.xml` final contra as declaradas em `store/declaracoes-android.md`.

### Onda 6 — Fechamento

V1 e V2 em paralelo; depois os agentes de correção que forem necessários; por último V3.

**V1 — Revisão de segurança, LGPD e proteção do WhatsApp**

- Lê: plano, seções 1, 5, 6, 7, 9 e 15; todo o código de `apps/api`, `packages/whatsapp` e `packages/ia`; as páginas legais do site.
- Não edita código. Entrega `docs/revisao-seguranca.md` com achados classificados em grave, médio e baixo, cada um com arquivo, linha e cenário concreto de falha.
- Procura especificamente: algum caminho de envio que não passe pela guarda; alguma escrita na agenda originada da IA sem passar pelo motor; rota sem filtro por profissional; telefone ou conteúdo de mensagem em log ou em contexto de IA; webhook sem validação; segredo no repositório; versão não fixada no compose; token sem expiração; dado pessoal que sobrevive à exclusão de conta; rota pública sem limite de requisições; conta de demonstração utilizável para alcançar dados reais; afirmação da política de privacidade que o código não cumpre.

**V2 — Verificação de ponta a ponta**

- Lê: plano, seções 17 e 18.
- Pode editar apenas arquivos de teste e `docs/verificacao-final.md`.
- Entrega: execução de cada item da definição de pronto (seção 18) em um clone limpo do repositório, com a saída registrada; um roteiro em script que sobe a infraestrutura, migra, popula, simula as mensagens do fluxo de exemplo pelo webhook e confere o resultado pela API; conferência visual da landing e de pelo menos quatro telas do app contra as referências; lista do que falhou.

O orquestrador lança agentes de correção para todos os achados graves e médios de V1 e para todas as falhas de V2, e repete a verificação correspondente.

**V3 — Documentação e pendências**

- Lê: todos os arquivos de `docs/pendencias/`, os relatórios de V1 e V2, `apps/mobile/store/PUBLICAR.md` e os READMEs.
- Pastas: `docs/`, `README.md`.
- Entrega: `docs/PENDENCIAS-HUMANAS.md` consolidado e ordenado pelo que destrava mais coisa primeiro, cobrindo todos os itens da lista "Só uma pessoa consegue fazer" da análise, cada um com passo a passo; `docs/OPERACAO.md`; README final com o estado real do projeto; remoção de `docs/pendencias/`.

## 5. Mapa de posse de pastas

| Pasta | Onda 0 | Onda 1 | Onda 2 | Onda 3 | Onda 4 | Onda 5 |
|---|---|---|---|---|---|---|
| raiz, `.github/` | F0 | — | — | — | — | — |
| `packages/shared` | F0 | acréscimos por domínio | acréscimos | acréscimos | acréscimos | — |
| `apps/api` | F0 | A1 | B1 | C1 | D4 | — |
| `packages/whatsapp` | F0 | A2 | — | — | — | — |
| `packages/ia` | F0 | A3 | — | — | — | — |
| `packages/alexa` | F0 | — | — | C4 | — | — |
| `apps/mobile` | F0 | A4 | B2 e B3 | C2 e C3 | D1 e D2 | E1 |
| `apps/web` (site) | F0 | — | — | C5 | — | — |
| `apps/web/app/painel` | F0 | — | — | — | D3 | — |
| `infra/` | F0 | — | — | — | D4 | — |

Quando dois agentes dividem `apps/mobile`, cada um fica nas pastas do seu briefing. Os arquivos comuns (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`, a vitrine e o índice de `src/data`) só recebem acréscimos pequenos, e cada agente declara no relatório o que mexeu neles. O orquestrador confere esses arquivos ao fim da onda. Em `apps/web`, o agente D3 não altera o layout raiz nem a configuração do Tailwind criados antes; se precisar, pede no relatório.
