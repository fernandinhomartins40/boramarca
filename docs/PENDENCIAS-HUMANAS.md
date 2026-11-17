# Pendências humanas

O que só uma pessoa consegue fazer: criar conta, pagar, gerar chave, usar aparelho físico, aprovar
em loja, revisar texto jurídico, contratar servidor e apontar DNS. O código está pronto e testado
sem esses serviços (`docs/verificacao-final.md`); este arquivo junta as pendências que antes ficavam
em `docs/pendencias/`, na revisão de segurança (`docs/revisao-seguranca.md`), na verificação final
e em `apps/mobile/store/PUBLICAR.md`.

A ordem é a do que destrava mais coisa primeiro. Comandos de servidor (subir, atualizar, cópia de
segurança, logs) estão em [`OPERACAO.md`](OPERACAO.md).

Regras para todos os itens:

- Chave e senha só no servidor (`infra/.env.prod`) ou nas variáveis do EAS. Nunca no git.
- Número de WhatsApp de teste é um chip secundário, nunca o de um cliente.
- Não rode `pnpm db:seed` no banco de produção (ele grava dados de demonstração).

## Resumo

| #   | Pendência                                             | Tipo           | Depende de     | Destrava                         |
| --- | ----------------------------------------------------- | -------------- | -------------- | -------------------------------- |
| 1   | VPS, DNS e primeiro deploy                            | Servidor e DNS | —              | quase tudo                       |
| 2   | Chaves da IA e da transcrição; `pnpm eval`            | Chave          | —              | IA respondendo; testes reais     |
| 3   | SMS do login: SHA da Play no Firebase (após publicar) | Loja           | 15             | SMS no app da loja |
| 4   | Contas Expo, Google Play e Apple Developer            | Conta          | —              | 5, 12, 13, 15                    |
| 5   | EAS, `projectId` e push (Firebase e APNs)             | Conta e chave  | 4              | notificações reais, 11, 12, 15   |
| 6   | Conta de revisão das lojas (`REVIEW_PHONE`)           | Servidor       | 1              | 13, 15, 16                       |
| 7   | Cópias de segurança e logs de 30 dias                 | Servidor       | 1              | cumprir a política de privacidade|
| 8   | WhatsApp real: parear e testar de ponta a ponta       | Aparelho       | 2 (1 e 3 em parte) | confiança no produto          |
| 9   | Revisão jurídica, encarregado e e-mail de suporte     | Jurídico       | —              | 15, lançamento para saúde        |
| 10  | Picovoice e a palavra "Ei, Bora Marca"                | Chave          | —              | 11, 14                           |
| 11  | Testes num Android físico                             | Aparelho       | 5, 10          | 13, 14, 15                       |
| 12  | Testes num iPhone (TestFlight)                        | Aparelho       | 4, 5           | 13, 15                           |
| 13  | Capturas de loja (Android de novo e iPhone)           | Loja           | 6, 11, 12      | 15                               |
| 14  | Vídeo do serviço de microfone (Google Play)           | Loja           | 10, 11         | 15                               |
| 15  | Builds de loja, envio e formulários                   | Loja           | 1, 4, 5, 6, 9  | publicação                       |
| 16  | Skill da Alexa e Voice Monkey                         | Conta e aparelho | 1, 6         | voz pela Alexa                   |
| 17  | Repositório no GitHub e CI                            | Local          | —              | portão de qualidade automático   |
| 18  | Apagar `C:\bm-clean`                                  | Local          | —              | —                                |
| 19  | Cobrança: chave e webhook do Asaas                    | Chave e conta  | 1              | assinaturas pagas                |

Cobertura da lista "Só uma pessoa consegue fazer" (`docs/01-analise.md`): contas → 4; builds de
loja e envio → 15; formulários e vídeo → 14 e 15; capturas do iPhone → 13; WhatsApp real → 8;
chaves de IA, transcrição, Picovoice, Voice Monkey, Firebase e Apple → 2, 5, 10 e 16; Modo Balcão
em Android e iPhone → 11 e 12; skill na Amazon → 16; VPS e DNS → 1; revisão jurídica → 9.

---

## 1. VPS, DNS e primeiro deploy — feito (17/11/2026)

O Bora Marca roda na VPS compartilhada 72.60.10.108, atrás do nginx do host, com certificado do
certbot (renovação automática). O DNS de `boramarca.com.br`, `www` e `api` aponta para a VPS. O
deploy é automático a cada push na `main` (`.github/workflows/deploy.yml`); detalhes em
[`OPERACAO.md`](OPERACAO.md), "Produção na VPS".

O que ainda é seu:

1. Guarde uma cópia de `/opt/boramarca/infra/.env.prod` (na VPS) num cofre de senhas. Os segredos
   foram gerados lá e não existem em nenhum outro lugar.
2. As chaves dos itens 2, 3, 10 e 16 entram nesse arquivo; depois de editar, rode na VPS
   `cd /opt/boramarca && docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml -f infra/docker-compose.vps.yml up -d`.

**Conferir:** `https://api.boramarca.com.br/health` responde `{"status":"ok",...}` e
`https://boramarca.com.br` abre a landing.

## 2. Chaves da IA e da transcrição; rodar `pnpm eval`

Sem as chaves, em produção a IA fica desligada e as mensagens só chegam ao app. Nomes e padrões em
`packages/ia/.env.example`; no servidor, vão no `infra/.env.prod`; em desenvolvimento, no
`apps/api/.env`.

1. **DeepSeek (principal):** conta em https://platform.deepseek.com, crédito pré-pago, **API keys**
   → criar. `LLM_PRIMARY_BASE_URL=https://api.deepseek.com`, `LLM_PRIMARY_MODEL=deepseek-flash`,
   `LLM_PRIMARY_API_KEY`.
2. **Qwen (reserva):** conta em https://www.alibabacloud.com, ative o **Model Studio** na região
   Singapore (ou US Virginia), anote o Workspace ID e crie a API key no mesmo workspace (só vale na
   região dela). `LLM_FALLBACK_BASE_URL=https://<WorkspaceId>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
   (ou o domínio legado `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`),
   `LLM_FALLBACK_MODEL=qwen3.8-flash`, `LLM_FALLBACK_API_KEY`.
3. **Groq (transcrição de áudio):** conta em https://console.groq.com, **API Keys** → criar.
   `TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1`, `TRANSCRIBE_MODEL=whisper-large-v3-turbo`,
   `TRANSCRIBE_API_KEY`.
4. **Avaliação:** com as variáveis `LLM_PRIMARY_*` (e `LLM_FALLBACK_*`) exportadas no terminal, rode
   `pnpm eval` na raiz. Sem chave o comando só diz "avaliação pulada" e sai com 0, então confira
   que aparecem as linhas `OK`/`FALHA` dos 45 casos. Meta: 80% ou mais. Abaixo disso, ajuste
   `packages/ia/src/prompts.ts` ou troque o modelo e rode de novo.
5. **Contas de saúde:** DeepSeek processa na China e o Qwen de Singapura fora do Brasil. Para
   psicologia, odontologia e fisioterapia a recomendação é um provedor nos EUA ou na UE (OpenAI,
   OpenRouter com provedor dos EUA/UE, ou Qwen em Virginia; `packages/ia/README.md`, "Contas de
   saúde"). A escolha final depende do item 9.

**Conferir:** `pnpm eval` com 80%+; na API, uma mensagem de teste (item 8) recebe resposta da IA e
um áudio vira texto.

**Depende dele:** item 8 com IA, lançamento.

## 3. Provedor de SMS do código de login (Firebase Authentication) — ligado (17/11/2026)

O SMS sai pelo login por telefone do Firebase, no projeto **`rapidinho-entrega`**, que reúne os
produtos do próprio dono e já tem faturamento e o provedor Telefone ligado, só para o Brasil. Os
apps Bora Marca (Android e iOS `br.com.boramarca.app` e Web) estão cadastrados lá, com o SHA-1 e o
SHA-256 da chave de upload e da chave de debug, e `boramarca.com.br`/`www` autorizados. Na VPS,
`FIREBASE_PROJECT_ID=rapidinho-entrega`. O cadastro e o login também funcionam por código no
e-mail (`docs/COBRANCA.md`). A conta de revisão continua com o código fixo. O projeto
`boramarca-app` criado antes ficou sem uso; o pedido de aumento de cota do Google não é mais
necessário para o Bora Marca.

O que ainda é seu:

1. **Depois de publicar na Google Play:** Play Console → Bora Marca → Testar e lançar →
   Configuração → Integridade do app → Assinatura de apps. Copie o **SHA-1** e o **SHA-256** do
   "Certificado da chave de assinatura de apps" e passe para registrar no app Android do Firebase.
   Sem isso, o app baixado da loja não consegue enviar o SMS (aconteceu com o Rapidinho em 11/2026).
   Na mesma página, vincule a API Play Integrity ao projeto `rapidinho-entrega`.
2. **App:** o build de loja precisa sair com `EXPO_PUBLIC_FIREBASE_AUTH=true` (já está em
   `.github/workflows/apps-nativos.yml`).

**Conferir:** `curl -s https://api.boramarca.com.br/v1/health` mostra `"firebaseAuth":true`; em
https://boramarca.com.br/painel um celular real recebe o SMS e entra.

## 4. Contas Expo, Google Play e Apple Developer

Começar cedo: há verificação de identidade e prazos.

1. **Expo:** https://expo.dev/signup (crie a organização "boramarca" se houver equipe).
2. **Google Play Console:** https://play.google.com/console/signup, US$ 25 uma vez. Prefira conta
   de **organização** (pede D-U-N-S e site). Conta **pessoal** nova exige teste fechado com **12
   testadores inscritos por 14 dias seguidos** antes da produção.
3. **Apple Developer Program:** https://developer.apple.com/programs/enroll/, US$ 99 por ano;
   organização pede D-U-N-S. Leva de 1 a alguns dias.

**Conferir:** login nas três contas; a da Apple aparece como "Active".

**Depende dele:** 5, 12, 13 (iPhone), 15.

## 5. EAS, `projectId` e push (Firebase e APNs)

Sem `projectId` o app não registra o aparelho para push (fica silencioso) e as Decisões só aparecem
com o app aberto.

1. `npm i -g eas-cli`, `eas login` com a conta do produto, `cd apps/mobile && eas init`.
2. Copie o `projectId` (UUID, não é segredo) para a constante `EAS_PROJECT_ID` em
   `apps/mobile/app.config.ts` (o arquivo é dinâmico; o `eas init` não grava sozinho).
3. **Android:** projeto no Firebase (https://console.firebase.google.com), app Android com o pacote
   `br.com.boramarca.app`: já feito (projeto `boramarca-app`; `apps/mobile/google-services.json`
   e `googleServicesFile` no `app.config.ts`, item 3). Falta `eas credentials` → Android → production → Google Service Account Key for FCM V1.
4. **iOS:** `eas credentials` → iOS → production → Push Notifications → deixe o EAS criar a chave
   APNs (login da conta Apple).
5. Se o projeto Expo tiver "enhanced push security", gere um access token em expo.dev e ponha em
   `EXPO_ACCESS_TOKEN` no `infra/.env.prod` (`PUSH_PROVIDER=expo` já é o padrão).

**Conferir:** num build com `EXPO_PUBLIC_DATA_SOURCE=api`, permita notificações e reabra o app: a
tabela `devices` ganha uma linha `ExponentPushToken[...]` ("Sair" remove). Uma Decisão nova chega
como notificação com **Sim** e **Não** (canal `decisoes`), e responder pela notificação com o app
fechado resolve a Decisão.

**Depende dele:** 11, 12, 15.

## 6. Conta de revisão das lojas

1. Escolha um número que **não seja de nenhuma conta real** (ex.: `+5511900000099`) e um código de
   6 dígitos. Não use o telefone de uma conta existente (como a Marina do seed): a API recusa com
   `403 REVIEW_PHONE_IN_USE`.
2. Ponha em `REVIEW_PHONE` e `REVIEW_OTP` no `infra/.env.prod` e reinicie a API (`up -d api`, ver
   `OPERACAO.md`).
3. Preencha os dois só na cópia de `apps/mobile/store/notas-para-revisao.md` que vai colada nos
   consoles (Google Play, App Store e certificação da Alexa). Não versione os valores.

**Conferir:** no app de produção, entrar com o número e o código abre "Espaço Demonstração
(revisão)" com a agenda do dia e uma Decisão pendente; o WhatsApp simulado conecta sozinho 5 s
depois do QR (nada sai de verdade). Dez códigos errados em uma hora travam o número por uma hora.
A agenda da conta é criada das 9h às 17h do dia: para a revisão e as capturas, prefira o horário
comercial de Brasília.

**Depende dele:** 13, 15, 16.

## 7. Cópias de segurança e logs de 30 dias

A política de privacidade promete cópias de segurança e registros técnicos guardados por até 30
dias. O job diário da API já apaga contatos do site com mais de 12 meses e o `audit_log` com mais de
90 dias; o resto é do servidor.

1. Agende a cópia diária do Postgres com rotação de 30 dias e cópia fora da VPS
   (`OPERACAO.md`, "Cópia de segurança").
2. Configure a retenção dos logs dos contêineres em 30 dias (`OPERACAO.md`, "Logs"). Hoje o compose
   gira só por tamanho (5 × 10 MB por serviço), o que pode guardar mais de 30 dias com pouco tráfego.
3. Teste uma restauração num banco descartável pelo menos uma vez.

**Conferir:** `ls` na pasta das cópias mostra no máximo 30 arquivos; nenhum arquivo de log em
`/var/lib/docker/containers/*/` com mais de 30 dias (`find ... -mtime +30` vazio).

## 8. WhatsApp real: parear e testar de ponta a ponta

Tudo foi testado com WhatsApp simulado (`scripts/verificar-fluxo.mjs` e a suíte da API). Falta o
número real. Pode começar local (`pnpm dev:infra`) e repetir na produção.

1. **Fixtures reais:** com a Evolution local (`http://localhost:8085`, deve mostrar
   `"version":"2.3.7"`) e um receptor de webhook na porta 3999, crie uma instância de teste,
   pareie pelo `/manager` e capture `messages.upsert` de: texto, áudio de voz, mensagem em grupo,
   status e uma enviada pelo próprio número (`fromMe`). Troque telefones por números fictícios,
   zere `apikey`, encurte o `base64` e substitua os arquivos
   `packages/whatsapp/test/fixtures/messages-upsert-*.json`. `pnpm --filter @boramarca/whatsapp test`
   deve continuar passando. Apague a instância no fim (`DELETE /instance/delete/<nome>`).
2. **Código de pareamento (sem QR):** numa instância nova, `GET /instance/connect/<nome>?number=55DDDNUMERO`
   devolve `pairingCode` de 8 caracteres; digitá-lo em WhatsApp → Aparelhos conectados → Conectar
   com número de telefone conecta.
3. **Pela API:** em `apps/api/.env`, `WHATSAPP_WEBHOOK_SECRET` (16+ caracteres) e
   `PUBLIC_API_URL=http://host.docker.internal:3333`. `POST /v1/whatsapp/session`
   `{ "riskAccepted": true }`, depois `GET /v1/whatsapp/qr` (ou
   `GET /v1/whatsapp/pairing-code?phone=+55...`). No app (`EXPO_PUBLIC_DATA_SOURCE=api`), parear
   pelos dois caminhos: código no mesmo celular e QR com outro celular.
4. **Fluxo do PDF:** com expediente e um serviço cadastrados, mande "tem horário hoje à tarde?" de
   outro celular. Deve surgir uma Decisão; responda (`POST /v1/decisions/:id/answer` ou pelo app) e
   confira a confirmação no cliente com "digitando..." de 2 a 8 s antes. Uma Decisão sem resposta
   por 10 minutos manda "Já te confirmo!".
5. **Guarda de envio:** resposta longa chega em no máximo 2 mensagens; com o celular pareado
   offline por alguns minutos, o app mostra o banner vermelho e as respostas saem ao reconectar
   (as com mais de 30 min são descartadas e ficam no `audit_log`); envio para quem nunca escreveu é
   bloqueado (`recipient_not_allowed`).
6. **Lembrete:** cliente que já escreveu, horário para daqui a 2h05; em ~5 min chega "Responda 1
   para confirmar"; responder `1` deixa o agendamento "Confirmado".
7. **Lista de espera:** o cliente pede "me avisa se abrir vaga à tarde"; cancele um horário da
   tarde; a oferta chega; "sim" marca. Sem resposta, após 10 min a vaga vai para o próximo.
8. **Painel web com dados reais:** num espaço com dois ou mais profissionais, responder pelo painel
   uma Decisão de outra pessoa e arrastar um atendimento com "Avisar o cliente" marcado; conferir
   que a mensagem chega ao cliente certo.
9. **Exclusão da instância:** confira se `DELETE /instance` da Evolution v2.3.7 apaga tudo da
   instância no banco `evolution` e no Redis db 6 (a revisão de segurança não conseguiu verificar).
   Ex.: antes e depois da exclusão de uma conta de teste,
   `select count(*) from evolution_api."Instance" where name = '<instância>'` e
   `redis-cli -n 6 --scan --pattern '*<instância>*'`.

**Conferir:** cada passo acima com o resultado descrito; nenhum envio fora da guarda no
`audit_log`.

## 9. Revisão jurídica, encarregado e e-mail de suporte

Os textos de `apps/web/app/(site)/privacidade/page.tsx` e `termos/page.tsx` são rascunhos
completos. Um advogado precisa revisar antes do lançamento:

1. **Contas de saúde** (dado sensível, art. 11 da LGPD): a decisão 2 da seção 5 de
   `docs/01-analise.md` e o provedor de IA dessas contas (item 2.5).
2. **Transferência internacional** (art. 33): DeepSeek (China), Qwen/Alibaba Cloud (Singapura),
   Groq e Expo (EUA). Firmar ou aceitar as cláusulas contratuais de cada provedor.
3. **Prazos prometidos:** registros técnicos e cópias de segurança até 30 dias, contatos do site até
   12 meses, `audit_log` até 90 dias, registro de exclusão até 5 anos, resposta a titulares em 15
   dias, aviso de mudança de preço com 30 dias. Texto e operação (item 7) precisam bater.
4. **Controlador:** incluir razão social e CNPJ quando a empresa existir.
5. **Exclusão de conta:** o texto "o que fica guardado" (app e `/excluir-conta`).
6. **Google Play, "Apps de saúde":** confirmar a declaração recomendada ("Serviços e gestão de
   saúde", agendamento; `apps/mobile/store/declaracoes-android.md`).
7. **Encarregado (DPO):** nomear; se o nome precisar aparecer, acrescentar na seção 14 da política.
8. **E-mail de suporte:** criar a caixa do produto (ex.: `contato@boramarca.com.br`) e pôr em
   `SUPPORT_EMAIL` no `infra/.env.prod` (vira `NEXT_PUBLIC_SUPPORT_EMAIL` no build do site; mudar
   exige `up -d --build web`). Ela aparece como suporte e canal do encarregado.

**Conferir:** parecer por escrito; textos ajustados e site reconstruído; o e-mail recebe uma
mensagem de teste.

**Depende dele:** 15 (as lojas abrem a política) e o lançamento para a área de saúde.

## 10. Picovoice e a palavra "Ei, Bora Marca"

Sem a chave, o Modo Balcão funciona com o botão **Falar** na tela no lugar da palavra de ativação.

1. Conta em https://console.picovoice.ai; copie a **AccessKey**. Confira preço e licença comercial
   antes de lançar.
2. **Porcupine → Create Wake Word**, idioma Portuguese, frase "Ei Bora Marca"; treine e baixe para
   **Android** e para **iOS**.
3. Baixe `porcupine_params_pt.pv` do repositório oficial (github.com/Picovoice/porcupine,
   `lib/common/`), na versão do SDK (`@picovoice/porcupine-react-native` 4.0.0).
4. Copie para `apps/mobile/assets/wakeword/` com os nomes exatos `ei-bora-marca_android.ppn`,
   `ei-bora-marca_ios.ppn` e `porcupine_params_pt.pv` (o plugin `plugins/withWakeWord.cjs` só liga
   o Porcupine na plataforma que tiver os arquivos).
5. Chave: `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY` em `apps/mobile/.env` para desenvolvimento e, para o
   EAS, `eas env:create --environment production --name EXPO_PUBLIC_PICOVOICE_ACCESS_KEY --value ... --visibility sensitive`.
   A chave vai dentro do app (é assim que a Picovoice funciona), mas não no git.
6. `npx expo prebuild --clean` e novo build.
7. **Ativação falsa:** no Balcão, fale 10 vezes frases como "bora marcar pra semana que vem?",
   "bora marca então", "vamos marcar". Se ativar, baixe `WAKE_SENSITIVITY` em
   `apps/mobile/src/features/balcao/native/wakeWord.ts` (hoje 0.5); se persistir, treine outra
   palavra e troque os arquivos.
8. Confira o que o SDK envia ao validar a chave e ajuste
   `apps/mobile/store/seguranca-de-dados-google.md` (item 1) se preciso.

**Conferir:** no passo "Vamos testar?" do assistente do Balcão, dizer "Ei, Bora Marca" ativa; as
frases parecidas não ativam.

**Depende dele:** 11 (voz real), 14 (vídeo).

## 11. Testes num Android físico

Android 14 ou mais novo, de preferência Xiaomi ou Samsung, com um build `preview`
(`eas build -p android --profile preview`) ou de desenvolvimento (`apps/mobile/README.md`, "Como
rodar"). Roteiro completo em `apps/mobile/README.md`, "Roteiro de teste manual — Android físico".

1. **Telas:** com `EXPO_PUBLIC_DATA_SOURCE=mock`, compare com `Bora-Marca-Kit/05-referencias/`
   Boas-vindas, cadastro, Agenda (claro e escuro), Decisões, Conversas e a conversa da Beatriz,
   Clientes, Lista de espera, e as quatro situações do WhatsApp (Ajustes → Menu de
   desenvolvimento). O código por SMS deve se preencher sozinho (item 3).
2. **Ícone:** com Ícones temáticos ligados (Android 13+), o símbolo monocromático aparece inteiro e
   centralizado. Se não, ajuste o valor `550` em `apps/mobile/scripts/rasterize-icons.cjs` e rode
   `node scripts/rasterize-icons.cjs`.
3. **Links:** o telefone do agendamento e o botão "WhatsApp" do perfil abrem `https://wa.me/<número>`
   na conversa certa; "Abrir WhatsApp" abre o app.
4. **Modo Balcão:** o serviço `microphone` começa e a notificação fixa aparece com "Pausar"; palavra
   de ativação e reconhecimento com a **tela bloqueada por 30 minutos**; caixa Bluetooth pareada
   continua acordada (se desligar, aumentar a amplitude em `BalcaoService.kt`) e a fala volta para o
   alto-falante quando ela desliga; retrato e paisagem; a tela não apaga; voz pt-BR instalada
   (Configurações → Acessibilidade → Texto para fala); aviso de volume baixo com o volume real; as
   instruções de bateria batem com os menus do aparelho (corrigir em
   `apps/mobile/src/features/balcao/native/setup.ts` se não).
5. **Notificações:** Sim/Não na notificação com o app aberto, em segundo plano e **fechado**.
6. **API real** (`EXPO_PUBLIC_DATA_SOURCE=api`): entrar, ver a agenda, responder uma Decisão em
   outro aparelho e ver a aba Decisões atualizar sozinha; Wi-Fi desligado por 1 min e religado
   (reconexão); 15 min com o app aberto sem cair a sessão.
7. **Excluir conta pela tela** (Ajustes → Conta → Excluir conta) com uma conta de teste. A
   verificação final só testou pela camada de dados.

**Conferir:** cada ponto acima anotado (passou/falhou); falhas viram tarefa para o código.

## 12. Testes num iPhone (TestFlight)

Depois do primeiro build iOS no EAS (item 15) e com a conta Apple (item 4). Roteiro em
`apps/mobile/README.md`, "Roteiro de teste manual — iPhone".

1. Ícone na tela inicial e tela de abertura (símbolo violeta sobre grafite).
2. Textos de permissão de microfone e de reconhecimento de fala em português.
3. "Abrir WhatsApp" (`whatsapp://`) e os links `wa.me`.
4. Modo Balcão com o app aberto, inclusive com a chave de silencioso ligada (anotar se a fala sair
   muda); com a tela bloqueada o Balcão para (esperado no iOS).
5. Notificação de Decisão com Sim/Não com o app fechado.

**Conferir:** os cinco pontos anotados.

## 13. Capturas de loja

Use a conta de revisão (item 6) no meio do expediente dela (9h às 17h de Brasília) e o build atual.

1. **Android, refazer com APK atual** (`apps/mobile/store/capturas/android/`, 1080×1920):
   - `01-agenda.png`: dia cheio (atendimento "Agora" e linha do tempo visíveis) e sem o botão "+"
     cobrindo o "R$" da faixa de resumo;
   - `03-conversas.png`: com várias conversas na lista;
   - `08-ajustes.png`: rolada até o topo (logo e título "Ajustes" visíveis).
2. **iPhone:** num Mac (Simulator, `Cmd+S`) ou num iPhone com TestFlight, as 5 telas e os tamanhos
   de `apps/mobile/store/capturas/iphone-pendentes.md` (obrigatório 1179×2556 ou 1206×2622;
   recomendado 1320×2868), PNG sem alpha, em `apps/mobile/store/capturas/iphone/`.

Regras: só telas reais do build; nada das `galeria-conceitual-*` do kit como captura; nenhuma
captura sugerindo que o Balcão ouve com a tela bloqueada no iPhone.

**Conferir:** as imagens abrem nos tamanhos certos e mostram dados de demonstração vivos.

## 14. Vídeo do serviço de microfone (Google Play)

Num Android físico, com as notificações do app permitidas: abrir o Modo Balcão, a notificação "Bora
Marca está ouvindo" aparecendo, bloquear a tela, dizer "Ei, Bora Marca, quem é o próximo?", ouvir a
resposta e tocar "Pausar". Suba no YouTube como **não listado**. Descrição e roteiro em
`apps/mobile/store/declaracoes-android.md`.

**Conferir:** o link abre sem login e mostra os quatro momentos.

## 15. Builds de loja, envio e formulários

Passo a passo completo em `apps/mobile/store/PUBLICAR.md`. Resumo:

1. Antes do build: `cd apps/mobile && npx expo-doctor` com internet (a checagem de schema não pôde
   rodar sem rede na verificação) e
   `EAS_BUILD_PROFILE=production EXPO_PUBLIC_API_URL=https://api.boramarca.com.br npx expo config --type introspect`
   (deve mostrar `aps-environment: production`, textos de permissão em pt-BR, `privacyManifests`, e
   **não** mostrar `UIBackgroundModes` nem `usesCleartextTraffic`).
2. `eas build --platform android --profile production` (AAB) e
   `eas build --platform ios --profile production` (IPA). Baixe e guarde fora do git uma cópia da
   chave de upload do Android (`eas credentials`); ative o Play App Signing.
3. **Google Play:** criar o app "Bora Marca: agenda e IA"; o **primeiro AAB vai à mão** (teste
   interno ou fechado), depois `eas submit --platform android --profile production`. Ficha
   (`textos-google-play.md`, ícone 512, recurso gráfico 1024×500, capturas do item 13) e Conteúdo do
   app: política `https://boramarca.com.br/privacidade`, acesso ao app (`notas-para-revisao.md`),
   sem anúncios, classificação IARC e público 18+ (`declaracoes-android.md`), Segurança dos dados
   com a URL de exclusão `https://boramarca.com.br/excluir-conta` (`seguranca-de-dados-google.md`),
   serviço em primeiro plano Microfone com o vídeo do item 14, Apps de saúde (item 9.6). Conta
   pessoal: teste fechado de 12 testadores por 14 dias antes de pedir produção.
4. **App Store:** novo app "Bora Marca", bundle `br.com.boramarca.app`, SKU `boramarca-ios`;
   `eas submit --platform ios --profile production`; categoria Negócios (secundária
   Produtividade); privacidade `privacidade-app-apple.md`; textos `textos-app-store.md`; URL de
   privacidade `https://boramarca.com.br/privacidade` e de suporte `https://boramarca.com.br/contato`;
   capturas do item 13; nas informações para a revisão, a conta do item 6 e o caminho Ajustes →
   Conta → Excluir conta.
5. Depois de publicado: `PLAY_URL` e `APPSTORE_URL` no `infra/.env.prod` e `up -d --build web` para
   a landing mostrar os botões das lojas.
6. **Se recusarem pela conexão com o WhatsApp** (maior risco do produto): responder conforme
   `PUBLICAR.md`, passo 7; plano B é distribuir o Android por APK direto (perfil `preview`) ou
   antecipar a API oficial.

O revisor vê a faixa vermelha "WhatsApp desconectado" na conta de revisão até tocar em reconectar
(o pareamento é simulado); as notas de revisão explicam isso.

**Conferir:** os dois apps aparecem como "Pronto para venda"/"Publicado"; as URLs das lojas abrem.

## 16. Skill da Alexa e Voice Monkey

Precisa da API em `https://api.boramarca.com.br` (item 1). Rotas prontas: `/v1/alexa/skill`,
`/v1/alexa/oauth/authorize`, `/v1/alexa/oauth/token`.

1. **Criar a skill:** https://developer.amazon.com/alexa/console/ask → Create Skill "Bora Marca",
   Portuguese (BR), Custom, **Provision your own**, Start from scratch. Copie o Skill ID para
   `ALEXA_SKILL_ID` no `infra/.env.prod`.
2. **Modelo:** Build → Interaction Model → JSON Editor, cole
   `packages/alexa/skill/interaction-model.pt-BR.json`, Save e Build. Invocação `bora marca` (se
   mudar, mude `decisionAnnouncement` e `SPEECH.help` em `packages/alexa/src`).
3. **Endpoint:** HTTPS, `https://api.boramarca.com.br/v1/alexa/skill`, certificado "from a trusted
   certificate authority".
4. **Vínculo de conta:** `openssl rand -hex 32` → `ALEXA_OAUTH_CLIENT_SECRET`, e
   `ALEXA_OAUTH_CLIENT_ID=alexa-skill`; reinicie a API. Account Linking ligado (sem habilitar sem
   vínculo), Auth Code Grant, URIs de authorize e token acima, mesmo Client ID/Secret, HTTP Basic,
   scope `agenda`, Domain List com `boramarca.com.br`. As Alexa Redirect URLs devem começar com
   `https://pitangui.amazon.com/api/skill/link/`, `https://layla.amazon.com/api/skill/link/` ou
   `https://alexa.amazon.co.jp/api/skill/link/`; se aparecer outra, peça para incluir em
   `ALEXA_REDIRECT_PREFIXES`.
5. **Echo real:** Test → Development; no app Alexa, vincule a skill com o telefone de um
   profissional de teste (precisa do SMS do item 3 ou da conta de revisão). Respostas em menos de
   8 s para "abra o Bora Marca", "pergunte ao Bora Marca quantos clientes faltam" / "tem horário
   vago" / "quem é o próximo" / "alguém mandou mensagem", e "diga ao Bora Marca que sim, para daqui
   15 minutos" (confira em Intent History que caiu em `ResponderSimIntent`; se cair em
   `AMAZON.FallbackIntent`, acrescente a amostra e refaça o build). A Decisão aparece no app como
   "Você, pela Alexa".
6. **Voice Monkey:** cada profissional cria a própria conta em https://voicemonkey.io, instala a
   skill Voice Monkey, cria o Speaker do Echo e gera o **token v3**; token e Device ID são salvos
   no app, em Ajustes → Alexa (`PATCH /v1/alexa/settings`, criptografados com
   `DATA_ENCRYPTION_KEY`). `VOICE_MONKEY_TOKEN` global é opcional. Antes de escalar, confirme com a
   Voice Monkey os termos de uso comercial e o limite do plano.
7. **Certificação:** Distribution com os textos de `packages/alexa/skill/skill.json` (só Brasil,
   Calendars & Reminders); ícones 108×108 e 512×512 a partir de `Bora-Marca-Kit/03-icones/icone-512.png`;
   privacidade e termos do site; "usa informação pessoal: sim"; instruções de teste com a conta do
   item 6 e as frases do passo 5. Validation → Functional test → Submit for review.

**Conferir:** o Echo fala a pergunta de uma Decisão nova e "sim" resolve com `via: alexa`; a skill
aparece como publicada no console.

## 17. Repositório no GitHub e CI

O `main` local aponta para `origin/main`, que não existe mais no GitHub (`git status` mostra
`[gone]`). O workflow `.github/workflows/ci.yml` só roda com o código lá.

1. Crie (ou recrie) o repositório privado e publique: `git push -u origin main`.
2. Em **Actions**, confira que o job `quality-gate` passou.
3. Opcional: Settings → Branches, exigir `quality-gate` antes de mesclar em `main`.

**Conferir:** o selo verde do `quality-gate` no último commit.

## 18. Apagar `C:\bm-clean`

O clone limpo da verificação final ficou na máquina (a remoção automática foi barrada). Os `.env`
dele são cópias dos `.env.example`, sem segredo. **Não suba a infra a partir dele.**

1. Feche editores e terminais abertos nessa pasta.
2. PowerShell: `Remove-Item -Recurse -Force C:\bm-clean`.

**Conferir:** `Test-Path C:\bm-clean` devolve `False`; `docker compose -p boramarca ps` continua
com os três serviços saudáveis.

## 19. Cobrança: chave e webhook do Asaas

O código da assinatura está pronto (`docs/COBRANCA.md`): teste grátis de 14 dias, assinatura no painel, webhook e
expiração. Sem a chave, assinar responde 503 e o painel avisa que ainda não está disponível — o teste e a expiração
valem mesmo assim. A conta do Asaas é a mesma do outro produto: **não mexa nos webhooks que já existem**.

1. **Teste no sandbox primeiro** (recomendado): conta em https://sandbox.asaas.com → Integrações → Chaves de API. Rode a
   API local com `ASAAS_API_URL=https://api-sandbox.asaas.com/v3`, assine pelo painel e pague a fatura de teste
   (roteiro "Não verificado" em `docs/COBRANCA.md`).
2. **Chave de produção:** no Asaas → Integrações → Chaves de API → gerar. Na VPS, em `/opt/boramarca/infra/.env.prod`:
   ```
   ASAAS_API_KEY='$aact_prod_…'        # aspas SIMPLES (o $ some sem elas)
   ASAAS_WEBHOOK_TOKEN=<saída de: openssl rand -hex 32>
   ```
3. Reinicie a API: o `docker compose ... up -d` do item 1 (as migrações `0006_billing` e `0007_phone_verified` rodam
   sozinhas).
4. **Webhook:** Asaas → Integrações → Webhooks → **Criar Webhook** (um novo):
   - Nome `Bora Marca` · URL `https://api.boramarca.com.br/v1/webhooks/asaas` · versão da API `v3`
   - **Token de autenticação:** o mesmo `ASAAS_WEBHOOK_TOKEN`
   - Fila de sincronização ativada · envio Sequencial · ativo
   - Eventos: todos de **Cobranças** (`PAYMENT_*`) e de **Assinaturas** (`SUBSCRIPTION_*`).

**Conferir:** no painel → Plano aparece o formulário de assinatura (não mais "ainda não está disponível"); assine uma
conta de teste com o seu CPF e abra a fatura; em Asaas → Webhooks → Logs as entregas aparecem com **HTTP 200** (`401` =
token diferente dos dois lados). Eventos do outro produto também chegam e são respondidos com 200 (ignorados).

**Depende dele:** receber as assinaturas. Sem ele, quem termina o teste fica com a IA parada e sem como pagar.

---

## Limites conhecidos do código (registrados, não exigem pessoa)

Não são pendências humanas; ficam aqui para não se perderem.

- Lista de espera: com a IA ligada, uma oferta automática ainda pode sair para um cliente cuja
  conversa está com o profissional (`docs/revisao-seguranca.md`, M5).
- Equipe: não há tela de aceitar ou recusar convite; quem entra pelo número convidado cai no espaço
  do dono (M11).
- Alexa: desativar a skill no app Alexa não avisa a API (evento `SkillDisabled`); o vínculo cai em
  90 dias sem uso ou ao desvincular pelo app/API (M4).
- Modo Balcão no iPhone: sem leitura do volume de mídia (só Android).
- Conversa: o rótulo "IA respondendo" quebra no meio da palavra em telas de 1080×1920 / 420 dpi.
- Decisões: o cartão "Responder pela notificação" empurra a primeira Decisão para baixo da dobra.
- Site: `infra/docker/web.Dockerfile` não usa `output: 'standalone'` do Next (imagem de 1,1 GB;
  comentário `shortcut:` no Dockerfile).
