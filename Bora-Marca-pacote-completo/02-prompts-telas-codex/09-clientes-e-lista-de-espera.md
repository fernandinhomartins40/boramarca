# Prompt 9 — Clientes e lista de espera

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## 1. Lista de clientes (aba "Clientes")
- Segmentado no topo: "Clientes" | "Lista de espera (3)".
- Busca, ordenação ("Recentes", "A–Z", "Mais frequentes") e uma letra de índice lateral.
- Item: avatar com iniciais, nome, "Última vez: há 18 dias · Corte" e uma pequena etiqueta quando for o caso ("Sumido há 45 dias", "Falta muito").

## 2. Perfil do cliente
- Cabeçalho com nome, telefone e botões "WhatsApp" e "Marcar".
- Números: total de visitas, ticket médio, faltas e frequência média ("vem a cada 21 dias").
- Preferências anotadas pela IA (editáveis): "Prefere sábado de manhã", "Degradê navalhado", "Não gosta de esperar".
- Histórico de atendimentos.
- Interruptor "Está na lista de espera" + preferências de horário.

## 3. Lista de espera
- Explicação no topo (uma vez, fechável): "Quem está aqui **pediu** para ser avisado quando vagar um horário. É só para essas pessoas que o Bora Marca oferece vagas."
- Cada entrada: nome, quando entrou, preferência ("Qualquer dia à tarde", "Só sábado") e serviço desejado.
- Ação "Oferecer vaga agora": escolhe um horário livre → prévia da mensagem → enviar.
- Configuração da regra automática: quando um horário vagar, a IA oferece primeiro para quem combina com a preferência, **uma pessoa por vez**, e espera X minutos (padrão 10) antes de passar para a próxima. Mostre essa regra como uma frase editável, sem formulário técnico: "Quando vagar um horário, ofereço para **1 pessoa** da lista e espero **10 minutos** pela resposta."
- Botão "+ Adicionar à lista" (de um cliente existente ou novo). Mostre um aviso se a pessoa não pediu: "Só adicione quem pediu para ser avisado. Isso protege seu WhatsApp."

## Ao terminar
Mostre prints das 3 telas e pare.
