# Bora Marca — prompts de telas para o Codex

O projeto **já tem a logo e a paleta de cores**. Estes prompts não definem cores, fontes nem logo: eles mandam o Codex usar o que já existe.

Use **um arquivo por vez**, na ordem. Espere o Codex terminar, revise e corrija. Só depois passe para o próximo.

0. `00-fundacao-e-design-system.md` — **obrigatório primeiro.** O Codex encontra sua logo e sua paleta, monta os tokens e os componentes, e **espera sua aprovação** da tabela de cores antes de continuar.
1. `01-boas-vindas-e-login.md`
2. `02-conectar-whatsapp.md`
3. `03-agenda-do-dia.md` (tela inicial)
4. `04-agendamento-detalhe-e-novo.md`
5. `05-central-de-decisoes-da-ia.md` (o coração do produto)
6. `06-conversas.md`
7. `07-modo-balcao.md` (tela cheia de voz)
8. `08-configurar-balcao.md` (Bluetooth, bateria, permissões)
9. `09-clientes-e-lista-de-espera.md`
10. `10-configuracoes.md`
11. `11-painel-web-do-dono.md` (opcional, fase 3)

## Dicas
- Ao abrir uma tarefa nova no Codex, comece com: *"Leia o README.md e a pasta src/theme antes de começar."*
- Se ele inventar cores ou mexer na logo, responda: *"Use apenas a paleta e a logo que já estão no projeto, pelos tokens de src/theme."*
- Rode no emulador Android depois de cada tela.
