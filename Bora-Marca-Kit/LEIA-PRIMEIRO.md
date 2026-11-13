# Bora Marca — kit de assets

Identidade aprovada: violeta `#7138F5`, lima `#D9FC60`, grafite `#191624`. O tom `#F8F7FC` é neutro de apoio para fundos claros.

## Pastas

- `01-marca/svg/`: símbolo, nome, assinaturas horizontal/vertical e ícones em vetor, com textos convertidos em contornos. Não dependem de fonte instalada.
- `01-marca/png-4k/`: as mesmas versões em PNG transparente, com 3840 px no maior lado.
- `02-landing/png-4k/`: assets individuais e conjuntos da landing, com canal alpha e 3840 px no maior lado.
- `02-landing/nativos/`: arquivos originais das novas gerações, sem redimensionamento.
- `02-landing/web/`: PNGs menores para carregamento mais leve.
- `03-icones/`: favicons, Apple touch icon, ícones PWA e camadas para Android.
- `04-lojas/`: artes para Google Play e App Store, em dimensões específicas; masters em 4K.
- `05-referencias/`: landing aprovada, marca de origem e 16 pranchas das telas produzidas.
- `06-icones-interface/`: ícones de apoio em SVG e PNG transparente 4K.
- `catalogo.html`: catálogo visual local; abra depois de extrair o ZIP.
- `manifesto.csv`: dimensões e formatos de todos os arquivos visuais.
- `relatorio-de-exportacao.json`: tamanho nativo e tamanho exportado de cada arte gerada.

## O que significa 4K neste pacote

Os PNGs de entrega têm **3840 pixels no maior lado**, preservando a proporção original. A resolução nativa das imagens geradas é menor e está registrada no relatório: os masters raster 4K são exportações ampliadas proporcionalmente, não gerações nativas 4K. Os originais também estão incluídos. As logos partem de contornos vetoriais reconstruídos a partir da marca aprovada e podem ser renderizadas em qualquer resolução.

Os recortes foram gerados individualmente usando a landing como referência; não são pedaços recortados da captura da página. Como são novas renderizações, detalhes finos do material e do texto das telas podem variar em relação à prancha aprovada. Para uma reprodução pixel a pixel da interface final, componha capturas reais do app dentro dos mockups após implementar o produto.

## Mapa da landing

| Seção | Arquivo recomendado | Alternativa em camadas |
|---|---|---|
| Hero | `01-hero-completo.png` | `16-palco-violeta.png` + `02-celular-agenda.png` + `03-placa-fluxo-transparente.png` + `04-balao-confirmacao.png` |
| WhatsApp | `09-fluxo-whatsapp.png` | Recriar as bolhas com HTML para texto pesquisável |
| Próximo atendimento | `17-card-proximo-atendimento.png` | HTML/CSS com o ícone de calendário |
| Encaixe | `04-balao-confirmacao.png` | HTML/CSS com botões reais quando interativo |
| Conversas | `18-card-conversas.png` | SVG `conversa.svg` + texto HTML |
| Modo Balcão | `05-kit-voz-completo.png` | `06-celular-modo-voz.png` + `07-caixa-bluetooth.png` + `08-onda-de-voz.png` |
| Permissões da IA | `10-permissoes-ia.png` | Linhas e switches em HTML/CSS |

Os títulos, parágrafos, botões, FAQ e menus da landing devem ser texto e componentes HTML, não uma imagem da página. Os PNGs com interface são ilustrações estáticas: botões desenhados neles não são clicáveis.

## Logos

`cor`: símbolo violeta + nome grafite; `negativo`: símbolo lima + nome claro; `violeta-branco`: símbolo violeta + nome branco. Também há versões monocromáticas em preto, branco, violeta e lima.

A assinatura horizontal preserva a composição da marca aprovada. A vertical e o símbolo quadrado são adaptações de composição, usando os mesmos contornos. Use SVG no site sempre que possível. Mantenha espaço livre ao redor de pelo menos a altura do “a” minúsculo do nome no tamanho aplicado. Não estique, incline ou acrescente contornos à marca.

## Aplicação responsiva

Consulte `guia-html-css.md` e `tokens.css`. Evite definir largura e altura independentes para a mesma imagem. Use `height:auto` e `object-fit:contain`. No mobile, empilhe texto e arte; reduza o conjunto inteiro, sem achatar o celular. Nunca use `object-fit:cover` para estes recortes.

Para ícone iOS use `04-lojas/app-store/icone-1024-sem-alpha.png`; não acrescente cantos arredondados ao arquivo, pois o sistema aplica sua máscara. Para Google Play use o ícone 512 px. Para launcher Android adaptativo, componha foreground e background fornecidos, respeitando as áreas seguras da plataforma. O SVG monocromático deve ser centralizado e enquadrado pela ferramenta do projeto.

## Lojas e publicação

- Google Play: destaque `1024×500`, PNG RGB opaco; ícone `512×512`.
- App Store: cabeçalho criativo `3840×1646`, JPEG opaco; arte de busca `3840×2560`.
- Galerias conceituais: três peças, fornecidas para Android `1080×2340` e iPhone `1179×2556` / `1320×2868`, sem alpha.

**As galerias são propostas promocionais baseadas nas telas desenhadas, não capturas de um aplicativo implementado.** Antes de submissão, substitua a interface por capturas reais da plataforma e anuncie apenas funções disponíveis no build. A arte não comprova suporte funcional de voz em segundo plano no iOS. O ícone PNG é uma exportação gráfica; a integração no projeto Xcode/Android/Expo e a avaliação da loja são etapas posteriores.

Especificações consultadas em 10/11/2026:
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

## Integridade

`SHA256SUMS.txt` permite conferir o conteúdo do pacote. Os arquivos PNG com alpha devem ser abertos em visualizador que mostre transparência; fundo preto ou branco do visualizador não significa que a imagem tenha fundo opaco.
