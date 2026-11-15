# Google Play — Segurança dos dados (Data safety)

**Play Console → Política → Conteúdo do app → Segurança dos dados.** Definições conferidas em
15/11/2026 na Central de Ajuda (resposta 10787469): *coletado* = sai do aparelho (inclusive por
bibliotecas); *compartilhado* = vai para terceiros, **exceto** prestadores de serviço que tratam em
nosso nome (provedores de IA, transcrição, SMS, hospedagem e o push: **Expo** Push Service, que
repassa as notificações, e Google FCM / Apple APNs, que as entregam), obrigação legal e ação
iniciada pelo usuário. Dado processado só no aparelho não é coletado.

Fontes conferidas: código do app (`src/data/api.ts`, `src/lib/api/push.ts`,
`src/features/balcao/native/`), contrato da API (`packages/shared`) e a página
`/privacidade` (`apps/web/app/(site)/privacidade/page.tsx`, versão de 14/11/2026).

## Visão geral (primeira página do formulário)

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha algum dos tipos de dados exigidos? | **Sim** |
| Todos os dados coletados são criptografados em trânsito? | **Sim** — os builds `preview` e `production` só falam com `https://` (`eas.json`); no Android o tráfego sem criptografia só é liberado quando a API configurada é `http://` local (`app.config.ts`, `withLocalCleartext`), o que nunca acontece em build de loja. Push vai pelo FCM/APNs (TLS). |
| Vocês oferecem uma forma de os usuários pedirem a exclusão dos dados? | **Sim** |
| URL para excluir a conta | **https://boramarca.com.br/excluir-conta** (funciona sem o app: telefone → código → confirmação) |
| Exclusão de alguns dados sem excluir a conta | Opcional. Se o console pedir URL, use a mesma página; no app o profissional apaga clientes e tira pessoas da lista de espera um a um (agendamentos são cancelados, não apagados). |

## Tipos de dados

Todos: **coletados = sim**, **compartilhados = não** (só prestadores de serviço, ver acima),
**processados de forma temporária = não**, **coleta obrigatória** (exceto onde indicado),
finalidade **Funcionalidade do app** e, para o telefone, também **Gerenciamento da conta**.

| Categoria → tipo | O que é no Bora Marca | Obrigatório? | Finalidades |
|---|---|---|---|
| Informações pessoais → **Nome** | Nome do profissional e dos clientes dele | Sim | Funcionalidade do app; Gerenciamento da conta |
| Informações pessoais → **Número de telefone** | Celular do profissional (login por código) e telefones dos clientes | Sim | Funcionalidade do app; Gerenciamento da conta; Prevenção de fraudes e segurança |
| Informações pessoais → **Endereço** | Endereço do espaço (a IA informa aos clientes) | Não (opcional no cadastro) | Funcionalidade do app |
| Informações pessoais → **IDs de usuário** | Identificador interno da conta | Sim | Funcionalidade do app; Gerenciamento da conta |
| Mensagens → **Outras mensagens no app** | Mensagens das conversas com clientes (lidas e enviadas pelo app) | Sim | Funcionalidade do app |
| Agenda → **Eventos da agenda** | Agendamentos, horários, folgas | Sim | Funcionalidade do app |
| Contatos → **Contatos** | A lista de clientes do profissional (nome, telefone, histórico). O app **não lê** a agenda de contatos do celular. | Sim | Funcionalidade do app |
| Atividade no app → **Outro conteúdo gerado pelo usuário** | Serviços e preços, notas, ajustes da IA, recado do Kit Balcão e o **texto** dos comandos de voz do Modo Balcão e das mensagens ditadas | Sim | Funcionalidade do app |
| IDs de dispositivo ou outros → **IDs de dispositivo ou outros** | Token de notificação (Expo Push Service → FCM) e se é Android ou iPhone (`POST /devices`) | Não (só com a notificação permitida) | Funcionalidade do app |

### O que NÃO declarar (e por quê)

| Tipo | Motivo |
|---|---|
| Arquivos de áudio → Gravações de voz | O app não envia áudio do microfone. A palavra de ativação roda no aparelho (Porcupine) e o reconhecimento de fala é o serviço do sistema (`SpeechRecognizer` do Android); só o texto vai para a API. Os áudios que os **clientes** mandam pelo WhatsApp chegam ao servidor pelo WhatsApp, não pelo app. |
| Local, Fotos e vídeos, Arquivos, Informações financeiras, Histórico de navegação, Apps instalados | Não existem no app. |
| Saúde e condicionamento físico | O app não pede nem registra informação clínica (plano, seção 1, item 9). Ver "Revisão jurídica" abaixo. |
| Registros de falhas / Diagnóstico | Não há SDK de falhas ou analytics no app. |
| Identificador de publicidade | Não usado. |

## Pontos para a pessoa confirmar antes de enviar

1. **Chave da Picovoice:** quando `EXPO_PUBLIC_PICOVOICE_ACCESS_KEY` for ligada, o SDK do Porcupine
   valida a chave pela internet (sem áudio). Conferir na documentação da Picovoice o que é enviado e,
   se houver identificador do aparelho ou dados de uso, acrescentar **Informações e desempenho do
   app → Outros dados de desempenho** (finalidade Funcionalidade do app).
2. **Revisão jurídica** (já pendente em `docs/PENDENCIAS-HUMANAS.md`): em contas de saúde, o fato de
   alguém ter consulta pode ser dado sensível. Se o advogado entender que a agenda de um consultório é
   "informação de saúde", acrescentar **Saúde e condicionamento físico → Informações de saúde** e
   ajustar a `/privacidade` junto.
3. Se um dia entrar SDK de falhas (Sentry etc.), acrescentar **Registros de falhas** e **Diagnóstico**.

## Coerência com a página /privacidade

| Página | Formulário | Situação |
|---|---|---|
| Seção 2: telefone, nome, espaço/endereço, serviços, ajustes, token do aparelho | Nome, Telefone, Endereço, Conteúdo do usuário, IDs de dispositivo | Bate |
| Seção 2: clientes (nome, telefone, mensagens, agendamentos) | Nome, Telefone, Mensagens, Eventos da agenda, Contatos | Bate |
| Seção 5: áudio do microfone não sai do aparelho; só o texto | Áudio não declarado | Bate |
| Seção 7: prestadores (IA, transcrição, SMS, **Expo** + FCM/APNs para push, hospedagem) | "Compartilhado = não" (exceção de prestador de serviço); token e texto da notificação passam pela Expo | Bate |
| Seção 10: "no app (Ajustes → Excluir conta)" | No app o caminho é **Ajustes → Conta → Excluir conta** | **Divergência de texto** — pedido ao dono de `apps/web` (relatório do E1) |
| Seção 12: HTTPS | Criptografia em trânsito = sim | Bate |
