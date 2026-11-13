# Wechaty — análise para o Bora Marca

**Conclusão: não recomendado.** A Evolution API continua sendo a escolha.

## O que é
Kit para criar chatbots em vários mensageiros, focado no WeChat (o app chinês). Cada mensageiro é ligado por um "puppet" (conector). O conector de WhatsApp (`wechaty-puppet-whatsapp`) é construído em cima do whatsapp-web.js.

## Por que não serve
- **Mesmo risco de banimento** das outras alternativas não oficiais, com mais uma camada para quebrar.
- **Conector de WhatsApp abandonado:** a documentação diz que ele está em estágio alfa. No GitHub, o último envio foi em 07/01/2024, com 24 estrelas e 49 issues abertas.
- **Projeto principal parado:** a versão estável no npm (1.20.2) é de cerca de 3 anos atrás, e um indexador mostra nenhum mantenedor ativo.
- **O WhatsApp Web muda o tempo todo:** uma biblioteca sem manutenção quebra e pode deixar todos os clientes sem atendimento.
- Existe um fork da Juzibot (`@juzi/wechaty-puppet-whatsapp`), mas ele é pouco conhecido e não resolve os outros problemas.

## Comparação
| | Wechaty | Evolution API |
|---|---|---|
| Manutenção | Parada | Ativa |
| Vários profissionais num servidor | Você monta | Pronto (uma instância por número) |
| API REST + webhooks | Não (é SDK em código) | Sim |
| Migrar para a API oficial depois | Não | Sim, só mudando a configuração |
| Comunidade no Brasil | Quase nenhuma | Grande |

## Como não ficar preso a nenhuma biblioteca
Crie no backend do Bora Marca uma interface própria, por exemplo `enviarMensagem()` e `aoReceberMensagem()`, e plugue a Evolution API (ou o WAHA) por trás. Se um dia precisar trocar, só essa camada muda.

## Fontes
- https://wechaty.js.org/docs/puppet-providers/whatsapp/
- https://awesome.ecosyste.ms/projects/github.com%2Fwechaty%2Fpuppet-whatsapp
- https://cdn.jsdelivr.net/gh/evolutionapi/evolution-api@main/README.md
