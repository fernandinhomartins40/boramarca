# Publicar o Bora Marca nas lojas — passo a passo humano

Tudo o que o código consegue fazer já está pronto (configuração nativa no `app.config.ts`, perfis
no `eas.json`, textos e respostas nesta pasta). O que falta depende de conta, pagamento, chave,
aparelho ou aprovação, e está aqui na ordem em que deve ser feito. Conferido nas páginas oficiais em
15/11/2026; as lojas mudam regras com frequência, então confira de novo cada link ao chegar no passo.

| Arquivo desta pasta | Para quê |
|---|---|
| `textos-google-play.md` | Ficha do Google Play (nome, descrições, ícone, recurso gráfico) |
| `textos-app-store.md` | Ficha da App Store (nome, subtítulo, promo, descrição, palavras-chave, URLs) |
| `seguranca-de-dados-google.md` | Formulário "Segurança dos dados" e URL de exclusão de conta |
| `privacidade-app-apple.md` | "Privacidade do app" da Apple (igual ao `PrivacyInfo.xcprivacy`) |
| `declaracoes-android.md` | Permissões, serviço em primeiro plano `microphone` (+ roteiro do vídeo), classificação etária, outras declarações |
| `notas-para-revisao.md` | Conta de demonstração e instruções para o revisor (pt-BR e inglês) |
| `capturas/android/` | Capturas reais do Android (1080×1920) |
| `capturas/iphone-pendentes.md` | Capturas que faltam para o iPhone e como tirá-las |

Artes do kit (somente leitura, não copiar para o git de novo):
`Bora-Marca-Kit/04-lojas/google-play/icone-512.png`, `.../google-play/destaque-1024x500.png`,
`.../app-store/icone-1024-sem-alpha.png` (já é o ícone do iOS no build),
`.../app-store/cabecalho-3840x1646.jpg`, `.../app-store/busca-3840x2560.jpg`. As
`galeria-conceitual-*` **não** servem como capturas (não são telas reais; as do Android ainda têm
proporção 2,17:1, acima do limite 2:1 do Google Play).

---

## 0. Antes de tudo (fora das lojas)

1. **Site no ar** com `https://boramarca.com.br/privacidade`, `/termos`, `/excluir-conta` e
   `/contato` (`docs/PENDENCIAS-HUMANAS.md`, item 1). As lojas abrem essas URLs na revisão.
2. **API de produção no ar** em `https://api.boramarca.com.br` (e, se for usar o perfil `preview`,
   uma homologação em `https://api-homolog.boramarca.com.br`; se o endereço for outro, troque no
   `eas.json`).
3. **Conta de revisão:** escolha um número que não seja de nenhum profissional real e um código de 6
   dígitos; ponha em `REVIEW_PHONE` e `REVIEW_OTP` no `infra/.env.prod` e reinicie a API. Entre no app
   com eles uma vez para conferir. Preencha os dois em `notas-para-revisao.md` (só na cópia que você
   cola no console; não precisa versionar o código).
4. **Revisão jurídica** da política de privacidade e dos termos (`docs/PENDENCIAS-HUMANAS.md`).

## 1. Criar as contas

1. **Expo:** https://expo.dev/signup. Crie uma organização "boramarca" se for trabalhar em equipe.
2. **Google Play Console:** https://play.google.com/console/signup — taxa única de US$ 25.
   - Prefira conta de **organização** (pede D-U-N-S e site). Conta **pessoal** nova precisa de um
     **teste fechado com pelo menos 12 testadores inscritos por 14 dias seguidos** antes de liberar a
     produção (Central de Ajuda, resposta 14151465).
   - Verificação de identidade e de telefone do desenvolvedor.
3. **Apple Developer Program:** https://developer.apple.com/programs/enroll/ — US$ 99 por ano.
   Organização pede número D-U-N-S. Leva de 1 a alguns dias.

## 2. Configurar o EAS (no Windows, sem Mac)

```sh
npm i -g eas-cli          # ou: npx eas-cli@latest <comando>
eas login
cd apps/mobile
eas init                  # cria o projeto no Expo e mostra o projectId
```

1. Copie o `projectId` (um UUID) para a constante `EAS_PROJECT_ID` no `apps/mobile/app.config.ts`
   (o arquivo é dinâmico, então o `eas init` não consegue gravar sozinho). Não é segredo.
2. **Push no Android:** crie um projeto no Firebase (https://console.firebase.google.com), adicione
   um app Android com o pacote `br.com.boramarca.app`, baixe o `google-services.json` para
   `apps/mobile/` e acrescente `googleServicesFile: './google-services.json'` em `android` no
   `app.config.ts`. Depois: `eas credentials` → Android → production → Google Service Account Key
   for FCM V1 → envie a chave da conta de serviço do Firebase.
3. **Push no iOS:** `eas credentials` → iOS → production → Push Notifications → deixe o EAS criar a
   chave APNs (ele pede login na conta Apple Developer).
4. **Variáveis secretas** (se houver): a chave da Picovoice vai como variável de ambiente do EAS
   (`eas env:create --environment production --name EXPO_PUBLIC_PICOVOICE_ACCESS_KEY --value ...
   --visibility sensitive`) e os arquivos `.ppn`/`.pv` em `assets/wakeword/`
   (`docs/PENDENCIAS-HUMANAS.md`, item 10). Sem eles o app funciona com o botão **Falar**.
5. Confira o que será publicado: `EAS_BUILD_PROFILE=production EXPO_PUBLIC_API_URL=https://api.boramarca.com.br npx expo config --type introspect`
   deve mostrar `aps-environment: production`, os textos de permissão em pt-BR e o
   `privacyManifests`, e **não** mostrar `UIBackgroundModes` nem `usesCleartextTraffic`.

## 3. Gerar os builds de produção

```sh
cd apps/mobile
eas build --platform android --profile production   # AAB; na primeira vez o EAS cria a chave de upload
eas build --platform ios --profile production       # IPA; o EAS cria certificado e perfil (login Apple)
```

- A versão de loja (`versionCode` / `buildNumber`) é controlada pelo EAS (`appVersionSource:
  remote`, `autoIncrement`). A versão visível (`0.1.0`) fica em `app.config.ts → version`; suba-a a
  cada lançamento.
- **Guarde a chave de upload do Android** (o EAS guarda; baixe uma cópia com `eas credentials` e
  guarde fora do git). Ative o **Play App Signing** no console (padrão para apps novos).
- Antes de enviar, instale um build `preview` (`eas build -p android --profile preview`) num Android
  físico e rode o roteiro do `apps/mobile/README.md` (Modo Balcão com tela bloqueada, notificação
  com Sim/Não, exclusão de conta).

## 4. Google Play

1. Play Console → **Criar app**: nome "Bora Marca: agenda e IA", idioma padrão Português (Brasil),
   App, Gratuito, aceite as declarações.
2. **Primeiro envio do AAB é manual:** Teste → Teste interno (ou fechado) → Criar versão → enviar o
   `.aab` baixado do EAS. Depois disso dá para usar `eas submit --platform android --profile
   production` (precisa de uma conta de serviço do Google Cloud com acesso ao Play Console; o
   `eas.json` manda para a faixa `internal` como rascunho).
3. **Presença na loja:** copie `textos-google-play.md`; ícone 512, recurso gráfico 1024×500 e as
   capturas de `capturas/android/` (pelo menos 2; recomendado 4 ou mais).
4. **Conteúdo do app** (Política → Conteúdo do app), um por um:
   - Política de privacidade: `https://boramarca.com.br/privacidade`.
   - Acesso ao app: instruções e conta de `notas-para-revisao.md`.
   - Anúncios: não contém anúncios.
   - Classificação do conteúdo: questionário IARC com as respostas de `declaracoes-android.md`.
   - Público-alvo: 18 anos ou mais; não é voltado a crianças.
   - Segurança dos dados: `seguranca-de-dados-google.md` (inclui a URL de exclusão de conta).
   - Permissões de serviço em primeiro plano: tipo Microfone, com a descrição e o **vídeo** de
     `declaracoes-android.md` (grave o vídeo num Android físico e suba como não listado no YouTube).
   - Apps de saúde: ver `declaracoes-android.md` (recomendação: "Serviços e gestão de saúde",
     agendamento).
   - Apps governamentais, recursos financeiros, notícias: não.
5. Conta pessoal: rode o teste fechado (12 testadores, 14 dias) e peça o acesso à produção no
   Painel. Conta de organização: crie a versão de **Produção** e envie para revisão.

## 5. App Store

1. https://appstoreconnect.apple.com → Apps → **+** → Novo app: plataforma iOS, nome "Bora Marca",
   idioma principal Português (Brasil), bundle ID `br.com.boramarca.app` (o EAS registra no primeiro
   build), SKU `boramarca-ios`.
2. Envie o build: `eas submit --platform ios --profile production` (pede login Apple e cria uma
   chave da App Store Connect API) ou pelo app Transporter num Mac.
3. **Informações do app:** categoria Negócios (secundária Produtividade), classificação etária
   (`declaracoes-android.md`, mesmas respostas), URL de privacidade.
4. **Privacidade do app:** `privacidade-app-apple.md`.
5. **Versão 0.1.0:** textos de `textos-app-store.md`; capturas do iPhone (`capturas/iphone-pendentes.md`);
   build; "Informações para a revisão" com a conta e as notas de `notas-para-revisao.md`.
6. Enviar para revisão. Teste antes pelo **TestFlight** (interno, sem revisão) num iPhone físico:
   textos de permissão, Modo Balcão com o app aberto, notificação com Sim/Não com o app fechado,
   ícone e tela de abertura.

## 6. Conferir os limites antes de colar

Rode na raiz do repositório para contar os caracteres e bytes dos campos curtos:

```sh
node -e "for (const s of ['Bora Marca: agenda e IA','A IA organiza sua agenda pelas conversas com clientes e você dá a palavra final','Agenda com IA e voz']) console.log(s.length, s)"
node -e "const k='agenda,horario,marcar,clientes,assistente,lembrete,encaixe,fisioterapia,psicologo,salao,consultorio';console.log(Buffer.byteLength(k),'bytes')"
```

## 7. Se a revisão recusar

- **Conexão com o WhatsApp** (maior risco, `docs/01-analise.md`, seção 7): responda explicando que o
  profissional conecta a própria conta como aparelho conectado, que o app não usa a marca do
  WhatsApp e que a conta de revisão não precisa de WhatsApp. Se mantiverem a recusa, as saídas são
  distribuir o Android por APK direto (perfil `preview`) ou antecipar a API oficial.
- **Serviço em primeiro plano:** refaça o vídeo mostrando claramente a pessoa tocando para abrir o
  Modo Balcão, a notificação aparecendo e a resposta por voz com a tela bloqueada.
- **ITMS-91053 (API sem motivo declarado):** acrescente em `app.config.ts → ios.privacyManifests`.
