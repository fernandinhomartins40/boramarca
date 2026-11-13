# Caixinhas de IA XiaoZhi (ESP32) — onde comprar para testar

Pesquisa de novembro de 2026. Os preços não incluem impostos de importação nem frete.

## Por que essas caixinhas
- Usam o firmware open source **XiaoZhi** (licença MIT, que permite uso comercial e venda com a marca Bora Marca).
- Têm palavra de ativação offline personalizável (dá para usar "Ei, Bora Marca").
- Conversam por voz em tempo real. Os modelos com o hardware certo têm cancelamento de eco.
- Podem ser apontadas para um **servidor próprio**, que usaria DeepSeek/Qwen e chamaria as funções da agenda via MCP.

Atenção: caixinhas "fechadas" (app Smart Life/Tuya ou app chinês genérico) **não servem**. Na ficha técnica, procure **ESP32**, **XiaoZhi**, **小智**, **MCP** ou "IA DeepSeek".

## No Brasil (entrega rápida, pouca oferta)
| Produto | Preço | Situação | Link |
|---|---|---|---|
| Caixinha XiaoZhi ESP32-S3 com tela LCD 1.28" | R$ 250 | Esgotada | https://testandotecnologias.lojavirtualnuvem.com.br/produtos/xiaozhi-inteligencia-artificial-chat-bot-box-esp32-s3 |
| Módulo XiaoZhi ESP32-S3 (mic INMP441 + amplificador MAX98357), sem caixa | Consultar | — | https://makerx.com.br/microcontroladores/esp32-esp8266/modulo-de-conversa-esp32-s3-com-ia-deepseek-xiaozhi-p |
| Kit XiaoZhi ESP32-S3 N16R8 (Mercado Livre) | — | Indisponível | https://www.mercadolivre.com.br/for-xiaozhi-ai-voice-chatbot-kit-esp32-s3-n16r8-dev/p/MLB2041651074 |
| Shopee | — | Nenhum anúncio encontrado. Busque no app por "xiaozhi", "ESP32-S3 IA voz" ou "DeepSeek robô voz" | — |

## No AliExpress (mais opções, mais barato)
Os links abrem na versão americana do site, mas funcionam no app brasileiro.

| # | Produto | Para quê | Preço | Link |
|---|---|---|---|---|
| 1 | Placa ESP32-S3 AI Smart Speaker, 2 microfones, redução de ruído e cancelamento de eco (sem caixa) | Testar o microfone no barulho do salão | US$ 17,99 | https://www.aliexpress.us/item/3256809715228605.html |
| 2 | Caixinha XiaoZhi DeepSeek ESP32-S3 com tela redonda 1.28" (4.8 estrelas, 111 vendidos) | Demonstrar a ideia para barbeiros | US$ 25,04 | https://www.aliexpress.us/item/3256808827356403.html |
| 3 | Waveshare ESP32-S3 com tela redonda 1.85" | Alternativa de marca conhecida | ver anúncio | https://www.aliexpress.us/item/3256808684313755.html |
| 4 | Módulo XiaoZhi ESP32-S3 com microfone e amplificador | Testes baratos | US$ 12,57 | https://www.aliexpress.us/item/3256808523369222.html |

**Sugestão de compra:** 1 unidade da opção 1 + 1 unidade da opção 2 (cerca de US$ 45 no total).

## Cuidados
- **Alto-falante fraco:** muitas têm alto-falante de 1 a 2 W, pouco para um salão com secador ligado.
- **Servidor chinês por padrão:** vêm ligadas ao xiaozhi.me. Desligue a atualização automática (OTA) e grave um firmware próprio apontando para o servidor do Bora Marca.
- **Segurança:** o servidor da comunidade avisa que ainda não passou por avaliação de segurança e não deve ir para produção sem reforço.
- **Aviso proativo:** falta confirmar se a caixinha fala por iniciativa própria ("Fulano quer marcar..."). É o primeiro teste a fazer (ver o roteiro de teste).

## Projetos de referência
- Firmware oficial: https://github.com/78/xiaozhi-esp32
- Servidor próprio (Python): https://github.com/xinnan-tech/xiaozhi-esp32-server
- Documentação: https://xiaozhi.dev/en/docs/
