# Prompt 7 — Modo Balcão (tela cheia de voz)

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes. **Nesta tarefa, faça a interface e a máquina de estados com voz simulada.** A integração nativa real (palavra de ativação, serviço em segundo plano) vem no prompt 8.

## Conceito
O celular fica **de pé na bancada**, a 1–2 metros do profissional, ligado a uma caixa Bluetooth. Esta tela precisa ser lida **de longe**: pouca informação, letras enormes e muito contraste. Sempre em modo escuro, para não ofuscar e gastar menos tela.

## Layout (retrato e paisagem)
- Centro: `VoiceOrb` grande (40% da altura) mostrando o estado.
- Embaixo do orb, **uma frase** só, em `display`:
  - Parado: "Diga **Ei, Bora Marca**"
  - Ouvindo: "Ouvindo…" + legenda ao vivo do que está sendo dito
  - Pensando: "Um segundo…"
  - Falando: o texto que está sendo falado, destacando a palavra atual (estilo karaokê)
  - Esperando resposta: a pergunta + dois botões `BigChoice` **Sim / Não** gigantes (≥ 120 dp), para quem preferir tocar
- Faixa superior fina: hora atual, "Próximo: Rafael 14:30" e ícones de status (WhatsApp conectado, caixa Bluetooth, bateria).
- Canto: botão "Sair" que pede **toque longo** (para não sair sem querer).

## Máquina de estados (`src/features/balcao/machine.ts`)
`parado → ativado (palavra ouvida) → ouvindo → pensando → falando → [esperando_resposta → ouvindo] → parado`
- Proativo: uma `AiDecision` nova faz o balcão ir direto para `falando`, tocando **antes um som curto de aviso** (crie `assets/sounds/aviso.mp3` de ~400 ms, ou gere um tom), e depois para `esperando_resposta`.
- Tempo limite em `esperando_resposta`: 12 s. Repete a pergunta uma vez, mais curta; se não houver resposta, volta para `parado` e a decisão fica pendente na aba Decisões.
- A resposta ("pode", "marca daqui 15 minutos", "não") chama a mesma `handleDecisionAction` do prompt 5.

## Simulação (para testar agora)
- Painel dev escondido (3 toques no relógio): "Simular palavra de ativação", "Simular frase…" (campo de texto) e "Simular decisão da IA".
- Fala: use `expo-speech` em pt-BR de verdade, para já ouvir no celular e na caixa Bluetooth.
- Perguntas que devem funcionar no mock: "quantos clientes ainda tenho hoje?", "tem horário vago?", "quem é o próximo?", "alguém mandou mensagem?". Responda com os dados mock.

## Detalhes importantes
- Mantenha a tela acesa enquanto estiver aqui (`expo-keep-awake`).
- Respeite o volume de mídia e mostre aviso se ele estiver baixo ("Volume baixo — aumente para ouvir os avisos").
- Animações do orb suaves e lentas: nada que distraia o profissional enquanto ele trabalha.

## Ao terminar
Grave um vídeo curto no emulador mostrando o fluxo proativo completo (aviso → pergunta → "Sim" → confirmação falada) e pare.
