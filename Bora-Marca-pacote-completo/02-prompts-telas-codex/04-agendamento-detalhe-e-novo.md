# Prompt 4 — Detalhe do agendamento e novo agendamento

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## 1. Detalhe do agendamento (`app/agendamento/[id].tsx`)
- Topo: avatar com iniciais, nome do cliente, `StatusPill` e telefone (toque abre o WhatsApp).
- Bloco: serviço, horário início–fim, preço e origem ("Marcado pela IA via WhatsApp" ou "Marcado por você").
- **Histórico curto** (linha do tempo): "Pediu horário às 10:12", "IA ofereceu 15:00", "Você confirmou por voz", "Lembrete enviado às 13:00".
- Ações grandes, empilhadas:
  - "Cliente chegou" (vira "em atendimento")
  - "Remarcar" (abre o seletor de horário)
  - "Cancelar" (`danger`; pergunta o motivo em chips e oferece "Oferecer a vaga para a lista de espera" ligado por padrão)
  - "Marcar como faltou"
- Toda ação que envia mensagem ao cliente mostra uma **prévia do texto** antes de confirmar, com opção de editar.

## 2. Novo agendamento (`app/agendamento/novo.tsx`), em 3 passos numa tela só
1. **Cliente**: busca com lista dos recentes primeiro; "+ Cliente novo" (nome + telefone).
2. **Serviço**: chips grandes com nome, duração e preço; dá para escolher mais de um, e a duração soma.
3. **Horário**: chips de horários livres do dia já calculados pela duração; trocar o dia num seletor horizontal de 14 dias.
- Rodapé fixo com o resumo "Rafael · Corte + Barba · Qui 14 às 15:00 · R$ 70" e botão "Marcar e avisar no WhatsApp".
- Interruptor "Enviar confirmação no WhatsApp" (ligado por padrão), com prévia da mensagem.

## Regras de agenda (em `src/utils/agenda.ts`, com testes unitários)
- Não deixa marcar sobre outro horário nem fora do expediente ou no almoço.
- Um horário só aparece como livre se couber a **duração total** dos serviços escolhidos.
- Escreva testes com Jest para esses casos.

## Ao terminar
Rode os testes, mostre prints dos dois fluxos e pare.
