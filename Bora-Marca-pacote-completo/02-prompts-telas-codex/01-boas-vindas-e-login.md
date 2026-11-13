# Prompt 1 — Boas-vindas, login e primeiro cadastro

---

Leia o `README.md` e `src/theme` antes de começar. Use **só** os tokens e componentes existentes. Se faltar um componente, crie-o em `src/components/` seguindo o mesmo padrão e adicione-o à vitrine.

## Objetivo
O profissional baixou o app. Em **menos de 2 minutos** ele precisa entender o valor e cadastrar o básico: quem ele é, o que faz e quando trabalha.

## Telas (rotas em `app/(auth)/` e `app/(onboarding)/`)

### 1. Boas-vindas (3 cards deslizáveis + botão fixo)
- Card 1: "Cadeira cheia, mãos livres." / "O Bora Marca atende seu WhatsApp enquanto você trabalha."
- Card 2: "Alguém desmarcou? A gente encaixa outro cliente." / "E te pergunta antes, por voz."
- Card 3: "Responda falando ou com um toque." / "Sem largar a tesoura."
- Use ilustrações simples feitas com formas e com o `VoiceOrb`, sem imagens de banco.
- Botão principal: "Começar". Link: "Já tenho conta".

### 2. Entrar com celular
- Campo de telefone com máscara brasileira `(11) 91234-5678` e teclado numérico.
- Código de 6 dígitos (tela seguinte) com preenchimento automático de SMS no Android (`textContentType`/`autoComplete="sms-otp"`).
- Por enquanto, simule o envio e aceite qualquer código `123456`.

### 3. Cadastro rápido (uma pergunta por tela, barra de progresso no topo)
1. "Como seus clientes te chamam?" (nome)
2. "O que você faz?": chips de múltipla escolha (Barbeiro, Cabeleireiro(a), Manicure, Esteticista, Outro)
3. "Seus serviços": lista pré-preenchida conforme a profissão escolhida, com nome, duração e preço editáveis, e botão "+ Adicionar serviço"
4. "Quando você atende?": dias da semana (chips) + horário de início/fim + intervalo de almoço
5. Tela final: "Tudo pronto. Agora vamos conectar seu WhatsApp." → leva ao prompt 2 (por enquanto, para um placeholder `app/(onboarding)/whatsapp.tsx`)

## Detalhes
- Botão "Voltar" em todas as etapas; os dados ficam salvos no `zustand` com persistência (`AsyncStorage`).
- Validação gentil e em linha ("Coloque pelo menos um serviço"), nunca em alerta modal.
- Botão principal sempre fixo no rodapé, acima do teclado.

## Ao terminar
Grave um passo a passo das telas no emulador Android (ou descreva cada uma com print) e pare.
