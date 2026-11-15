# Notas para a revisão (Google Play e App Store)

Onde colar:
- **Google Play:** Política → Conteúdo do app → **Acesso ao app** → "Todas ou algumas funcionalidades
  são restritas" → adicionar instruções (nome: "Conta de demonstração", telefone no campo de usuário,
  código no campo de senha, texto em inglês abaixo em "outras informações").
- **App Store:** versão → **Informações para a revisão do app** → "Login necessário" com usuário =
  telefone, senha = código, e o texto em inglês abaixo em **Notas**.

**Antes de colar**, troque `<REVIEW_PHONE>` e `<REVIEW_OTP>` pelos valores de `REVIEW_PHONE` e
`REVIEW_OTP` do `infra/.env.prod` (escolhidos pelo dono, ver `docs/pendencias/D4.md` item 2). O
número **não pode** ser de nenhum profissional real: a API recusa o código fixo se o número já
pertencer a uma conta comum. A conta funciona sem SMS e sem WhatsApp de verdade, e é recriada
sozinha se o revisor excluí-la.

---

## English (for the reviewer)

**What the app does.** Bora Marca is a scheduling assistant for self-employed professionals who work
by appointment (physiotherapists, psychologists, dentists, beauty professionals, teachers). An AI
answers the professional's clients, books and reschedules appointments, and asks the professional
before any action that affects someone else's appointment. The professional answers these
"Decisions" with Yes/No in the app, in the notification, or by voice in "Modo Balcão" (counter mode).

**Demo account (no SMS needed).**
1. Open the app → **Já tenho conta** (I have an account) → enter the phone number **<REVIEW_PHONE>**
   (Brazil, 11 digits after +55) → **Enviar código** (send code).
2. Enter the 6-digit code **<REVIEW_OTP>** → **Confirmar**.
3. You land on today's agenda of "Espaço Demonstração (revisão)", with 5 fictitious clients, today's
   appointments and one pending Decision. All data is fictitious.

**Things to try.**
- **Decisões** tab: answer the pending decision with **Sim** (yes) or **Não** (no).
- **Conversas** tab: the conversations the AI handled.
- **WhatsApp connection**: the demo account uses a simulated connection. Tap the red "WhatsApp
  desconectado" banner (or **Ajustes → WhatsApp → Conectar/Reconectar**), check **Entendi e quero
  conectar**, tap **Conectar**, pick a method and wait about 5 seconds: it connects by itself. No real WhatsApp message is ever sent from
  the demo account.
- **Modo Balcão** (counter mode, voice): on the agenda header, tap the **Balcão desligado** (counter off) pill. The first time,
  a setup screen explains and asks for the microphone (and, on iPhone, speech recognition) and
  notifications. Then tap **Falar** (Speak) and say "sim" or "quem é o próximo?" in Portuguese, or
  just tap the on-screen **Sim / Não** buttons. On iPhone, counter mode works only with the app open
  and the screen on (the screen is kept awake); with the app closed, decisions arrive as
  notifications with Yes/No actions. On Android, counter mode keeps listening with the screen locked
  through a microphone foreground service that always shows the notification "Bora Marca está
  ouvindo" with a **Pausar** (pause) action; it starts only after the user opens counter mode.
- **Account deletion:** **Ajustes → Conta → Excluir conta** → **Enviar código** → code
  **<REVIEW_OTP>** → **Excluir minha conta**. It is also available on the web at
  https://boramarca.com.br/excluir-conta. (The demo account is recreated on the next login.)
- Privacy policy and terms: **Ajustes → Conta → Política de privacidade / Termos de uso**.

**About the WhatsApp connection.** Bora Marca is not affiliated with WhatsApp or Meta and does not
use WhatsApp's name or logo as its identity. It links the professional's own number as a "linked
device" (the same mechanism as WhatsApp Web), through Bora Marca's server. This is **not** the
official WhatsApp Business API, and the app says so on the connection screen, in the store listing
and in the terms. To protect the number, the system only replies to people who wrote first (or
existing clients), limits the message rate and never sends bulk messages. The professional connects
their own account, by their own choice, on the pairing screen. The demo account uses a simulated
connection, so the review does not require a WhatsApp account.

**Permissions.** Microphone and speech recognition: for counter mode (requested on the setup screen
after an explanation) and for the "Ditar mensagem" (dictate) button in a conversation (requested
when the user taps it). Speech becomes text on the device; no audio is recorded or uploaded. Notifications: requested from the Decisions tab card ("Ativar") or the
counter mode setup, after an explanation. No location, contacts, photos, tracking or advertising ID.

**Contact.** contato@boramarca.com.br — https://boramarca.com.br/contato

---

## Português (para registro e para o revisor brasileiro)

**O que o app faz.** O Bora Marca é um assistente de agenda para profissionais que trabalham com
hora marcada. A IA responde os clientes, marca e remarca, e pergunta ao profissional antes de
qualquer ação que mexa no horário de outra pessoa. O profissional responde essas "Decisões" com Sim
ou Não no app, na notificação ou por voz no Modo Balcão.

**Conta de demonstração (sem SMS).** Já tenho conta → telefone **<REVIEW_PHONE>** → Enviar código →
código **<REVIEW_OTP>** → Confirmar. Abre a agenda de hoje do "Espaço Demonstração (revisão)", com 5 clientes
fictícios e uma decisão pendente.

**Para testar.** Aba Decisões (responder Sim/Não); aba Conversas; banner vermelho "WhatsApp desconectado" (ou Ajustes → WhatsApp) → marcar
"Entendi e quero conectar" → Conectar → escolher um jeito (conexão simulada, conecta sozinha em ~5 s, nenhuma mensagem real sai); Modo Balcão pelo selo "Balcão desligado" no topo
da agenda: na primeira vez abre a tela de preparo, que explica e pede microfone, reconhecimento de fala
(iPhone) e notificações; depois "Falar" e dizer "sim" ou "quem é o próximo?", ou tocar Sim/Não. No
iPhone o Balcão funciona só com o app aberto e a tela acesa; no Android continua com a tela
bloqueada, sempre com a notificação "Bora Marca está ouvindo" e o botão "Pausar".
Excluir conta: Ajustes → Conta → Excluir conta → Enviar código → **<REVIEW_OTP>** → Excluir minha
conta (também em https://boramarca.com.br/excluir-conta).

**Conexão com o WhatsApp.** O Bora Marca não é afiliado ao WhatsApp nem à Meta e não usa a marca
deles como identidade. Ele conecta o número do próprio profissional como aparelho conectado (igual
ao WhatsApp Web), por um servidor da Bora Marca. Não é a API oficial do WhatsApp Business, e o app
diz isso na tela de conexão, na ficha da loja e nos termos. Só responde a quem escreveu primeiro,
limita a quantidade de mensagens e não faz envio em massa. A conta de demonstração usa conexão
simulada.

**Permissões.** Microfone e reconhecimento de fala no Modo Balcão (pedidos na tela de preparo
depois de explicar) e no botão "Ditar mensagem" das conversas (pedido ao tocar nele). A fala vira
texto no aparelho; nenhum áudio é gravado ou enviado. Notificações pedidas pelo card "Ativar" da aba Decisões ou no preparo do
Balcão, depois de explicar. Sem localização, contatos, fotos, rastreamento ou ID de publicidade.

## Alexa (certificação da skill)

A mesma conta serve para a certificação da skill na Amazon (`docs/pendencias/C4.md`): vincular a
conta pela página de login da skill com o telefone **<REVIEW_PHONE>** e o código **<REVIEW_OTP>**.
