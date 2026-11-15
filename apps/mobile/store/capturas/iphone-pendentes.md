# Capturas do iPhone — pendentes (precisam de simulador ou iPhone)

Esta máquina é Windows, sem macOS: não há simulador de iPhone. As capturas abaixo ficam para quem
tiver um Mac (Xcode → Simulator) ou um iPhone com o build do TestFlight.

Tamanhos aceitos (Apple, "Screenshot specifications", conferido em 15/11/2026): é **obrigatório** pelo
menos 1 captura para "iPhone com Dynamic Island (tela média)" — **1179×2556** ou **1206×2622**
(retrato). Recomendado também o grupo grande — **1320×2868**, 1290×2796 ou 1260×2736 — senão a
Apple reduz a partir dele. De 1 a 10 por tamanho, PNG ou JPEG **sem alpha**.

Simuladores que geram esses tamanhos: iPhone 16/17 (1179×2556 ou 1206×2622) e iPhone 16/17 Pro Max
(1320×2868). No simulador: `Cmd+S` salva a captura no tamanho nativo.

## Lista (mesmas telas do Android, conta de demonstração)

| # | Tela | Como chegar | Observação |
|---|---|---|---|
| 1 | Agenda do dia | Entrar com `REVIEW_PHONE`/`REVIEW_OTP` | Aceitar a hora do simulador perto do horário dos atendimentos |
| 2 | Decisões | Aba Decisões | Com a decisão pendente da conta de revisão |
| 3 | Conversas | Aba Conversas | |
| 4 | Modo Balcão | Selo "Balcão desligado" → preparar → Ativar Modo Balcão | No iPhone, com o app aberto (não mostrar tela bloqueada) |
| 5 | Ajustes → Conta | Aba Ajustes → Conta | Mostra privacidade, termos e Excluir conta |

Salvar em `apps/mobile/store/capturas/iphone/` com nomes `01-agenda.png` … `05-conta.png`.

Regras: só telas reais do build (nada das `galeria-conceitual-*` do kit como captura), sem moldura de
outro aparelho, e nenhuma captura sugerindo que o Balcão ouve com a tela bloqueada no iPhone.
As artes do kit podem servir de **moldura** (fundo e título) em volta da captura real, desde que o
tamanho final seja um dos aceitos.
