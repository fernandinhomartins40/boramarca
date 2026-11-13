# Prompt 6 — Conversas do WhatsApp

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## Objetivo
O profissional quase não vai usar esta tela, porque a IA cuida das conversas. Ela existe para **conferir** o que a IA está dizendo e **assumir** uma conversa quando quiser.

## Lista de conversas (aba "Conversas")
- Filtros em chips: "Todas", "IA cuidando", "Com você", "Não lidas".
- Cada item: avatar, nome, última mensagem (uma linha), hora e um selo de quem está respondendo (`IA` na cor `primary` ou `Você` em `textMuted`).
- Busca por nome ou telefone.

## Tela da conversa
- Bolhas no estilo WhatsApp, mas com a identidade do Bora Marca: mensagens do cliente à esquerda e as enviadas à direita. **As da IA levam um pequeno selo "IA"**, e as suas não.
- Áudios do cliente aparecem com player e a **transcrição** embaixo, em texto menor (simule).
- "Notas da IA" entre as mensagens, centralizadas e discretas: "Entendi como: pedido de horário para sábado de manhã".
- Topo: nome, próximo horário do cliente (se houver) e interruptor **"IA respondendo"**. Desligado, aparece uma faixa "Você está respondendo esta conversa. [Devolver para a IA]".
- Campo de envio com botão de microfone (ditado) e atalhos de respostas rápidas ("Pode vir", "Estou sem horário hoje", "Te mando os horários livres").
- Botão "Marcar horário" no topo, que abre o fluxo do prompt 4 já com o cliente preenchido.

## Ao terminar
Use 6 conversas mock variadas (uma em andamento com a IA, uma com áudio, uma assumida por você, uma de cancelamento) e pare.
