# Bora Marca — Análise do plano e do repositório

Data: 12/11/2026. Fontes analisadas:

- `Bora-Marca-pacote-completo/` — o plano em PDF (13 páginas), os 12 prompts de telas e as 3 pesquisas.
- `Bora-Marca-Kit/` — kit de marca: logos, paleta, assets da landing, ícones de app, artes de loja e 18 imagens de referência (landing aprovada e pranchas das telas).

Este documento registra o que foi encontrado, as lacunas do material e as decisões tomadas para fechá-las. O plano de construção está em [02-plano-de-implementacao.md](02-plano-de-implementacao.md) e a divisão do trabalho em agentes em [03-agentes.md](03-agentes.md).

## 1. Estado do repositório

- `c:\FuseDev\boramarca` é um repositório git sem nenhum commit, com remoto `origin` em `github.com/fernandinhomartins40/boramarca`.
- Só há material de produto e de marca. Não há código nem `package.json`.
- O kit de marca tem 152 MB; a maior parte são masters em 4K que o código não usa.
- Máquina de desenvolvimento: Windows 11, Node 24.21, pnpm 10.28, Docker 29.9, JDK 17, Android SDK instalado (com emulador e `adb`), GitHub CLI. O `eas-cli` não está instalado e não há macOS.

## 2. O que o produto é

Assistente para profissionais que trabalham com hora marcada. Três peças:

1. **WhatsApp** — uma IA atende os clientes do profissional pelo número dele, conectado por QR code ou código de pareamento via Evolution API (conexão não oficial).
2. **Agenda** — o backend é o dono da agenda. A IA só entende mensagens e escreve textos; quem verifica vaga, marca e desmarca são regras fixas.
3. **Voz (Modo Balcão)** — um celular na bancada, com caixa Bluetooth, escuta "Ei, Bora Marca", responde perguntas e anuncia pedidos ("Posso marcar a Beatriz às 16h?"). No Android funciona com a tela bloqueada; no iPhone, só com o app aberto.

O princípio que organiza tudo: **a IA nunca mexe sozinha na agenda de outra pessoa**. Ela cria uma *Decisão* e o profissional responde por voz, por notificação ou na aba Decisões.

Superfícies a construir: API, app nativo para Android e iOS, painel web do dono e site público (landing e páginas legais).

## 3. O que o kit de marca define

| Item | Conteúdo |
|---|---|
| Paleta | violeta `#7138F5`, lima `#D9FC60`, grafite `#191624`, neutro de apoio `#F8F7FC` (`paleta.json`, `tokens.css`) |
| Fonte | Inter, com alternativa do sistema |
| Logo | símbolo, logotipo, assinaturas horizontal e vertical, em SVG e PNG, nas variações cor, negativo, violeta-branco e monocromáticas |
| Ícones de app | 1024 px, camadas do ícone adaptativo do Android, monocromático, favicon e ícones PWA |
| Landing | 13 artes em três tamanhos, guia de HTML/CSS e a página aprovada (`05-referencias/landing-aprovada.png`) |
| Lojas | destaque do Google Play, cabeçalho e arte de busca da App Store, três galerias conceituais |
| Telas | 11 pranchas do app (claro e escuro) e 5 do painel web |

O kit resolve a principal lacuna da primeira análise (não havia logo nem paleta). Ele também traz mudanças em relação ao PDF, tratadas na seção 5.

## 4. Avaliação do plano

O plano é coerente e pode ser implementado como está. Pontos fortes que o plano de construção preserva:

- Regras no backend e IA restrita a *function calling* com saída validada.
- Interface própria de WhatsApp (`enviarMensagem`, `aoReceberMensagem`) com a Evolution API atrás, o que permite trocar o provedor.
- Camada única de LLM compatível com a API da OpenAI, com modelo reserva.
- Entrega em fases em que a Fase 1 (sem voz) já tem valor.

## 5. Lacunas, contradições e decisões

| # | Achado | Consequência | Decisão |
|---|---|---|---|
| 1 | **O público mudou.** O PDF fala em barbeiros, cabeleireiros e manicures. A landing aprovada diz "para profissionais que vivem de hora marcada" e cita psicologia, fisioterapia, odontologia, beleza e aulas. | Textos, profissões do cadastro e dados de exemplo precisam seguir um dos dois. Atender saúde também muda o peso da LGPD (item 2). | Vale o kit, que é mais recente e está marcado como aprovado. Os textos falam em "profissional" e "cliente", sem "salão" ou "barbearia" fixos. O cadastro oferece profissões de beleza, saúde, bem-estar e aulas, cada uma com serviços sugeridos. |
| 2 | Com profissionais de saúde, o fato de alguém ter consulta com um psicólogo ou dentista é **dado pessoal sensível** pela LGPD, e o plano envia conversas a provedores de IA hospedados na China. | Risco jurídico maior do que o do PDF original. | A IA não pede nem registra informação clínica; para a IA vai só o primeiro nome. O provedor de IA é configurável e a documentação recomenda um provedor fora da China quando a conta for de saúde. A política de privacidade trata o assunto e fica marcada para revisão jurídica. **Esta decisão precisa de confirmação de um advogado antes do lançamento para a área de saúde.** |
| 3 | Os prompts de telas foram escritos para o Codex, uma tela por vez, com dados mock e parada para aprovação a cada passo. | Não serve como está para uma execução com vários agentes. | Os prompts viram **especificação de comportamento**. As instruções "pare e espere aprovação" são ignoradas, e os mocks ficam atrás de uma interface depois ligada à API real. |
| 4 | Há duas fontes para as telas: os prompts (texto) e as pranchas do kit (imagem), com diferenças entre si. As pranchas do painel web também divergem uma da outra (o menu lateral muda entre elas). | Agentes copiariam detalhes contraditórios. | As pranchas definem a **linguagem visual** (cores, formas, hierarquia, densidade). Os prompts e o plano definem **o que cada tela faz**. Funções que só aparecem em uma prancha e não estão no plano não são construídas (item 5). |
| 5 | As pranchas mostram funções que não existem no plano: IA atendendo ligações telefônicas ("Também no balcão"), histórico de cobranças com recibos e botão "Gerenciar plano". | Construir isso seria inventar produto. | Ficam de fora. A tela de plano mostra o plano atual, o uso e o interesse no Kit Balcão. |
| 6 | O PDF deixava o iPhone para uma fase futura; agora o pedido é entregar Android e iOS. | O iOS não permite escuta contínua em segundo plano. | O app é um só, para as duas plataformas. No iOS o Modo Balcão funciona com o app aberto e a tela acesa; com o app fechado, as decisões chegam por notificação com botões Sim e Não. O serviço de microfone em segundo plano é exclusivo do Android. O build do iOS roda na nuvem pelo EAS Build, sem precisar de Mac. |
| 7 | As lojas exigem itens que o plano não previa: política de privacidade em URL pública, exclusão de conta dentro do app e por uma página web, textos de permissão, declarações de dados e uma conta de teste para o revisor. | Sem isso o app é recusado. | Entram no escopo: páginas `/privacidade`, `/termos`, `/excluir-conta` e `/contato`; exclusão de conta no app e na API; pasta com todo o material de loja; conta de demonstração que funciona sem parear WhatsApp. |
| 8 | As galerias do kit são peças conceituais, não capturas do app. O próprio kit avisa que as lojas exigem capturas reais e que só se pode anunciar o que o build faz. | Publicar com elas pode gerar recusa. | As capturas reais são tiradas do app pronto. As artes do kit servem de moldura. |
| 9 | O plano escolhe Supabase (auth, banco e tempo real), mas também exige que todas as regras fiquem no backend, e o login pede código por SMS. | Regras divididas entre Supabase e backend ficam difíceis de testar; SMS exige contratar um provedor. | Postgres comum acessado só pelo backend (o Supabase pode hospedar esse Postgres em produção). Autenticação por código e tempo real ficam no backend. O envio do código fica atrás de uma interface; o provedor de SMS é escolha do dono do produto. |
| 10 | Não há modelo de dados nem contrato de API. | Agentes paralelos produziriam peças que não encaixam. | O plano define o modelo de dados, as rotas e os eventos. Os tipos ficam em um pacote compartilhado, criado antes de qualquer trabalho paralelo. |
| 11 | Os limites da proteção contra banimento não têm números no PDF. | Cada agente escolheria um valor. | O plano fixa valores padrão configuráveis. São escolhas de projeto, não dados medidos. |
| 12 | Cobrança: há planos e faixa de preço, mas não o meio de pagamento. | Não há o que implementar. | O plano contratado é um campo no cadastro. Integração de pagamento fica fora do escopo. |
| 13 | A palavra de ativação personalizada exige chave do Picovoice e um arquivo gerado no console deles, um por plataforma. | Nenhum agente consegue gerar esses arquivos. | A detecção fica atrás de uma interface. Sem chave, o Modo Balcão funciona com um botão "Falar" na tela. |
| 14 | Nomes e preços de modelos de IA têm fontes divergentes no próprio PDF. | Um identificador errado quebra a chamada. | Identificadores e URLs ficam em variáveis de ambiente, e o agente responsável confere a documentação oficial. |
| 15 | O PDF usa nomes em português para as ferramentas da IA e os prompts usam tipos em inglês. | Inconsistência de nomes. | Código e banco em inglês; nomes das ferramentas da IA, textos de interface e mensagens em português do Brasil. |

## 6. O que "implementar 100%" significa aqui

Todo o software é construído e testado de forma automatizada. Algumas partes dependem de contas, aparelhos e aprovações que só uma pessoa consegue obter. Elas ficam prontas no código e listadas em `docs/PENDENCIAS-HUMANAS.md`, que a implementação gera ao final.

**Dentro do escopo (construído e testado):**

- Backend completo: agenda, WhatsApp, IA, decisões, filas, lembretes, lista de espera, relatórios, voz, Alexa, contatos do site e exclusão de conta.
- App nativo para Android e iOS, a partir de uma base só, com as telas dos prompts 00 a 10 na linguagem visual do kit.
- Site público: landing conforme a referência aprovada, privacidade, termos, exclusão de conta e contato.
- Painel web do dono, ligado à API real.
- Skill da Alexa com Voice Monkey.
- Configuração nativa completa das duas plataformas (identificadores, ícones, tela de abertura, permissões com texto, perfis de build) e a pasta de material para as lojas.
- Ambiente local e de produção em Docker e documentação de operação.

**Fora do escopo, com justificativa:**

| Item | Motivo |
|---|---|
| Caixinha XiaoZhi (ESP32) | O próprio plano a marca como "em avaliação" e a condiciona a testes em hardware que ainda não foi comprado. |
| Cobrança, recibos e troca de plano | O plano não define o meio de pagamento (item 12). |
| IA atendendo ligações telefônicas | Aparece só em uma prancha; não há especificação (item 5). |
| Onboarding da API oficial do WhatsApp | Exige conta Meta Business verificada. A interface de WhatsApp já prevê o provedor oficial. |
| Validação com profissionais, registro no INPI, redes sociais, venda do Kit Balcão | Não são software. |

**Só uma pessoa consegue fazer (vão para `PENDENCIAS-HUMANAS.md`):**

- Criar as contas: Expo, Google Play Console e Apple Developer (paga, anual). Contas pessoais novas no Google Play costumam ter de passar por um período de teste fechado com testadores antes de publicar; conferir a regra vigente.
- Rodar os builds de loja no EAS (assinatura do Android e certificados da Apple) e enviar para revisão.
- Preencher os formulários das lojas com as respostas já redigidas: segurança de dados, privacidade do app, classificação etária e a declaração do serviço de microfone em primeiro plano, que pede um vídeo curto.
- Tirar as capturas de tela finais em aparelho ou simulador de iPhone.
- Parear um número real de WhatsApp e testar com mensagens de verdade.
- Criar as chaves: provedores de IA, transcrição de áudio, Picovoice (e gerar os arquivos de "Ei, Bora Marca" para Android e iOS), Voice Monkey, Firebase e a chave de notificações da Apple.
- Testar o Modo Balcão em Android físico com caixa Bluetooth e em um iPhone.
- Publicar a skill na Amazon.
- Contratar a VPS e apontar `boramarca.com.br`.
- Revisão jurídica dos termos e da política de privacidade.

## 7. Riscos

| Risco | Tratamento no plano |
|---|---|
| **As lojas recusarem o app por causa da conexão não oficial com o WhatsApp.** Google e Apple têm regras contra uso não autorizado de serviços de terceiros. Não é possível saber de antemão como o revisor vai tratar. | O app não usa a marca nem o ícone do WhatsApp como se fosse dele, descreve a conexão com honestidade e funciona na revisão com uma conta de demonstração. Se houver recusa, as saídas são distribuir o Android por APK direto ou antecipar a API oficial. É o maior risco de negócio que não se resolve com código. |
| Dado sensível de saúde enviado a provedores de IA no exterior | Item 2 da seção 5. Exige confirmação jurídica. |
| Agentes paralelos gerarem código incompatível | Contratos em `packages/shared` criados antes; cada agente é dono de pastas que não se sobrepõem; verificação completa ao fim de cada onda. |
| Dois agentes instalando dependências ao mesmo tempo | A fundação instala de antemão as dependências previstas; nas ondas com dois agentes no app, só um pode instalar. |
| Agente declarar "pronto" sem ter rodado nada | Todo relatório traz os comandos executados e a saída. O orquestrador roda de novo a verificação. |
| Serviço de microfone em segundo plano no Android 14+ | Agente dedicado, consulta à documentação atual e build local. O teste em aparelho físico é pendência humana. |
| O build do iOS não pode ser comprovado nesta máquina | A configuração gerada para o iOS é validada com as ferramentas do Expo que rodam no Windows, e o pacote JavaScript do iOS é exportado. O build em si roda no EAS e fica como pendência humana, descrita passo a passo. |
| A API da Evolution mudar entre versões | Imagem Docker com versão fixa e adaptador isolado, testado com requisições gravadas. |
| A IA marcar errado | A IA não escreve no banco. Toda ferramenta que altera a agenda passa pelo motor de regras, e há um teste de ponta a ponta do fluxo de exemplo do PDF. |
| Repositório pesado por causa do kit | Os masters em 4K ficam fora do git; só entram os arquivos que o código usa. |
