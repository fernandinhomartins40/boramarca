# Prompt 2 — Conectar o WhatsApp (QR code)

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## Contexto técnico (para a tela fazer sentido)
O backend usa a **Evolution API**. O profissional conecta o próprio número como "aparelho conectado", lendo um QR code, igual ao WhatsApp Web. Nesta tarefa **simule** tudo em `src/data/whatsapp.ts`, com as funções `createSession()`, `getQrCode()` (retorna uma string para virar QR), `getStatus()` (`aguardando_qr` → `conectando` → `conectado` | `erro`) e `disconnect()`.

**Atenção a um detalhe importante:** o QR aparece **no celular do Bora Marca** (o do balcão), mas tem que ser lido **pelo WhatsApp do profissional**, que muitas vezes está no mesmo aparelho. Então ofereça duas opções:
1. **Código de pareamento** (recomendado quando é o mesmo celular): mostra um código de 8 caracteres e ensina o caminho WhatsApp → Aparelhos conectados → Conectar com número de telefone.
2. **QR code** (quando o WhatsApp está em outro celular).

## Telas

### 1. Antes de conectar (explicação honesta, uma tela)
- Título: "Conecte o WhatsApp que seus clientes já usam"
- 3 itens com ícone:
  - "O Bora Marca só responde quem te mandou mensagem."
  - "Nunca mandamos mensagem em massa."
  - "Você pode pausar a IA quando quiser."
- Caixa de aviso discreta (cor `warning`, sem alarmismo): "Essa conexão não é a API oficial do WhatsApp. Usamos regras para proteger seu número, mas existe um risco pequeno de bloqueio. [Saiba mais]". O "Saiba mais" abre um `BottomSheet` com a explicação simples.
- Checkbox: "Entendi e quero conectar". Botão "Conectar" só fica ativo com o checkbox marcado.

### 2. Escolher o jeito de conectar
- Dois cards grandes: "WhatsApp está neste celular" (código) e "WhatsApp está em outro celular" (QR).

### 3a. Código de pareamento
- Código grande e espaçado (fonte mono), botão "Copiar" e passo a passo numerado com ícones.
- Botão "Abrir WhatsApp" (deep link `whatsapp://`).

### 3b. QR code
- Use `react-native-qrcode-svg`. QR grande, com contagem regressiva ("O código renova em 0:45") que gera um novo automaticamente.
- Passo a passo ao lado/abaixo.

### 4. Estados
- Conectando: `VoiceOrb` em "pensando" + "Conectando ao seu WhatsApp…"
- Sucesso: "Pronto! Seu WhatsApp está conectado.", mostrando o número e a foto (mock), e botão "Continuar"
- Erro: mensagem clara + "Tentar de novo"
- Desconectado depois (ex.: o celular ficou sem internet): banner fixo e vermelho em todas as telas, "WhatsApp desconectado — toque para reconectar". Crie esse banner como componente global, controlado pelo status.

## Ao terminar
Simule as quatro situações (sucesso, erro, código expirado e desconexão depois), mostre como testar cada uma e pare.
