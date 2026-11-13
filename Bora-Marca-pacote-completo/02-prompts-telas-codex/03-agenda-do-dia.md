# Prompt 3 — Agenda do dia (tela inicial)

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## Objetivo
É a tela que o profissional vê **de relance, de longe**, entre um cliente e outro. Em 2 segundos ele precisa saber: **quem é o próximo, quanto falta e se tem algo esperando decisão dele.**

## Layout (de cima para baixo)

### 1. Cabeçalho compacto
- "Hoje, terça 12" + um seletor de dia (setas ‹ › e toque para abrir o calendário)
- À direita: indicador do Modo Balcão (bolinha verde "Ouvindo" ou cinza "Desligado"). Tocar nele abre o Modo Balcão (prompt 7; por enquanto, rota placeholder).

### 2. Card "Agora / Próximo" (o maior elemento da tela)
- Se tem cliente em atendimento: "Agora: **Carlos** — Corte + Barba", com barra de progresso do tempo do serviço.
- Abaixo: "Próximo: **Rafael** às **14:30** — em 12 min", com botão secundário "Avisar que vou atrasar" (abre um sheet com opções de 10/15/20 min e manda mensagem pronta no WhatsApp, simulada).
- Se não tem ninguém: "Livre até as 15:00".

### 3. Faixa de decisões pendentes (só aparece se houver)
- Card com cor `warning`: "**1 pedido** esperando você: Fulano quer encaixe às 15:00." Botões `BigChoice` **Sim / Não** ali mesmo e link "Ver detalhes".
- Quando o profissional decide, o card faz uma animação de saída e um `Toast` aparece: "Marcado! O Fulano já foi avisado."

### 4. Resumo do dia (linha de 3 números)
- "8 atendimentos" · "2 vagas livres" · "R$ 420 previstos"

### 5. Linha do tempo do dia
- Lista vertical de `TimeSlot` das 9h às 19h, respeitando a duração de cada serviço.
- Estados visuais: ocupado (nome + serviço + `StatusPill`), **livre** (tracejado, "Livre — toque para marcar"), **recém-vagou** (destaque pulsante sutil + "Carlos desmarcou há 3 min"), intervalo de almoço (hachurado), já passou (opacidade menor).
- Linha vermelha "agora" atravessando no horário atual, com rolagem automática até ela ao abrir.
- Tocar num horário ocupado abre o detalhe (prompt 4). Tocar num livre abre "Novo agendamento" já com o horário preenchido.

### 6. Botão flutuante
- "+" grande no canto inferior direito → novo agendamento.

## Comportamento
- Puxar para atualizar.
- Atualiza sozinha a cada 30 s (simulado); o card "Próximo" recalcula "em X min".
- Estados de carregando (skeleton da linha do tempo), dia vazio ("Nenhum cliente marcado. Que tal avisar sua lista de espera?") e erro.

## Ao terminar
Teste com a agenda mock (com cancelamentos e pedido pendente) e com um dia vazio. Mostre prints no claro e no escuro e pare.
