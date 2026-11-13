# Prompt 10 — Ajustes

---

Leia o `README.md` e `src/theme` antes de começar. Use só tokens e componentes existentes.

## Estrutura (aba "Ajustes"), em grupos com cabeçalho
### Meu negócio
- Perfil (nome, profissão, foto, endereço para mandar aos clientes)
- Serviços (lista editável: nome, duração, preço; arrastar para reordenar)
- Horário de atendimento (dias, horários, almoço, folgas e feriados)

### A IA do Bora Marca
- **Interruptor geral grande: "IA atendendo"**, com estado bem claro. Quando desligado, aparece um banner em todo o app: "IA pausada — você está respondendo tudo."
- Pausa rápida: "Pausar por 1h / até amanhã / até eu voltar"
- Jeito de falar: chips "Descontraído", "Simpático", "Mais formal", com prévia de uma mensagem de exemplo que muda conforme a escolha
- O que a IA pode fazer **sem me perguntar** (cada item com interruptor e explicação curta):
  - Responder perguntas sobre preço e endereço (ligado)
  - Confirmar presença em lembretes (ligado)
  - Marcar em horário livre para cliente que já é da casa (desligado por padrão)
  - Cancelar quando o cliente pedir (ligado, mas sempre te avisa)
  - Mexer no horário de outro cliente (**sempre pergunta**, travado, com cadeado e a explicação "Por segurança, isso sempre passa por você")
- Lembretes automáticos: quanto tempo antes (chips 1h / 2h / 1 dia) + prévia da mensagem
- Mensagem de boas-vindas para cliente novo (editável)

### Voz e Balcão
- Configurar o Balcão (abre o prompt 8)
- Voz: velocidade da fala e "Testar voz"
- Horário de silêncio (o balcão não fala fora do expediente)

### WhatsApp
- Status da conexão, número, "Reconectar" e "Desconectar"
- Limites de segurança (somente leitura, para dar confiança): "Respondemos só quem te mandou mensagem · Máx. X mensagens por minuto · Nenhum envio em massa"

### Conta
- Plano atual e "Ver planos"
- Kit Balcão: "Quero o kit com celular + caixa" (abre um formulário de interesse)
- Ajuda (WhatsApp do suporte), Termos, Privacidade e Sair

## Ao terminar
Garanta que os interruptores salvam no `zustand` com persistência e que o "IA atendendo" desligado aparece nas outras abas. Mostre prints e pare.
