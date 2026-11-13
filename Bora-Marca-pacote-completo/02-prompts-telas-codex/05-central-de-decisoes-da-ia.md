# Prompt 5 — Central de decisões da IA (o coração do produto)

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## Conceito
A IA **nunca** mexe na agenda de outra pessoa sozinha. Quando precisa, ela cria uma **Decisão** e pergunta ao profissional: por voz no Modo Balcão, por notificação, ou aqui nesta aba. Esta tela é a fila dessas perguntas.

## Tipos de decisão (modele em `src/data/decisions.ts`)
| Tipo | Exemplo de pergunta |
|---|---|
| `encaixe` | "Fulano quer horário hoje à tarde. O Carlos das 15h desmarcou. Marco o Fulano às 15h?" |
| `novo_horario` | "Beatriz quer pé e mão amanhã. Tenho 10h ou 16h. Qual ofereço?" |
| `remarcar` | "Rafael pediu para passar das 14h para as 17h. Pode?" |
| `atraso` | "Diego disse que vai atrasar 20 min. Empurro ou remarco?" |
| `duvida` | "Uma cliente nova perguntou se você faz luzes. Faz?" (resposta livre) |

Cada decisão tem: pergunta curta, contexto (trecho da conversa), **opções sugeridas pela IA** (1 a 3), prazo ("Responder em até 10 min, senão eu digo ao cliente que já confirmo") e origem.

## Aba "Decisões"
- Lista de cards, do mais urgente para o menos. Cada card mostra:
  - Ícone do tipo, nome do cliente e há quanto tempo ("há 2 min")
  - A pergunta em fonte `heading`
  - Contexto recolhido ("Ver conversa ▸"), que expande e mostra as últimas 3 mensagens
  - Botões: para sim/não, `BigChoice`; para opções, um botão grande por opção; sempre um link "Responder outra coisa" (campo de texto + botão de **microfone** para ditar)
  - Barra fina de prazo diminuindo
- Ao decidir: prévia da mensagem que vai para o cliente, com "Enviar" e "Editar". Lembre a escolha "Não mostrar prévia de novo" nas configurações.
- Ação extra: deslizar para o lado → "Deixa que eu respondo" (a IA para nessa conversa e ela vai para Conversas marcada como "com você").
- Vazio: `VoiceOrb` parado + "Nada esperando você. Bom trabalho!"

## Notificação Android (simule a UI e deixe o código preparado)
- Use `expo-notifications` com **ações na própria notificação**: "Sim" e "Não" (e as opções, quando houver), que respondem sem abrir o app.
- Crie um canal de notificação "Decisões" com prioridade alta e som próprio curto.
- Deixe uma função `handleDecisionAction(decisionId, optionId)` centralizada. O Modo Balcão (voz) vai chamar a **mesma função** depois.

## Histórico
- No topo, segmentado: "Pendentes" | "Resolvidas". Nas resolvidas, mostre como foi decidido: "Você, por voz", "Você, na notificação", "Expirou — IA avisou o cliente".

## Ao terminar
Simule a chegada de uma decisão nova a cada 20 s (botão no menu dev), teste as ações da notificação no emulador Android e pare.
