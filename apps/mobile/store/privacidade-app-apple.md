# App Store — Privacidade do app (App Privacy)

**App Store Connect → Apps → Bora Marca → Privacidade do app → Começar.** Definições conferidas em
15/11/2026 em developer.apple.com/app-store/app-privacy-details: *coletar* = transmitir para fora do
aparelho de forma que nós ou parceiros possamos acessar além do tempo de atender a requisição. Dado
de parceiros (provedores de IA, transcrição, SMS, hospedagem e o push: **Expo** Push Service, que
repassa as notificações à Apple APNs) conta como coletado por nós.

Estas respostas são as mesmas do `PrivacyInfo.xcprivacy` gerado a partir de
`app.config.ts → ios.privacyManifests` (conferir com `npx expo config --type introspect`). Se mudar
um, mude o outro.

## Respostas

| Pergunta | Resposta |
|---|---|
| Vocês ou seus parceiros coletam dados deste app? | **Sim, coletamos dados** |
| Algum dado é usado para rastrear (tracking)? | **Não** (`NSPrivacyTracking = false`, sem domínios de rastreamento, sem IDFA, sem App Tracking Transparency) |

Para **cada** tipo abaixo: finalidade **Funcionalidade do app** (só ela); **vinculado à identidade
do usuário = sim**; **usado para rastreamento = não**.

| Categoria | Tipo | Chave no PrivacyInfo | O que é |
|---|---|---|---|
| Informações de contato | **Nome** | `NSPrivacyCollectedDataTypeName` | Nome do profissional e dos clientes |
| Informações de contato | **Número de telefone** | `NSPrivacyCollectedDataTypePhoneNumber` | Login por código; telefone dos clientes |
| Informações de contato | **Endereço físico** | `NSPrivacyCollectedDataTypePhysicalAddress` | Endereço do espaço (opcional) |
| Contatos | **Contatos** | `NSPrivacyCollectedDataTypeContacts` | A lista de clientes do profissional (o app **não** lê os Contatos do iPhone) |
| Conteúdo do usuário | **E-mails ou mensagens de texto** | `NSPrivacyCollectedDataTypeEmailsOrTextMessages` | Mensagens das conversas com clientes, lidas e enviadas pelo app |
| Conteúdo do usuário | **Outro conteúdo do usuário** | `NSPrivacyCollectedDataTypeOtherUserContent` | Agenda, serviços, notas, ajustes da IA e o texto dos comandos de voz |
| Identificadores | **ID do usuário** | `NSPrivacyCollectedDataTypeUserID` | ID interno da conta |
| Identificadores | **ID do dispositivo** | `NSPrivacyCollectedDataTypeDeviceID` | Token de notificação (Expo Push Service → Apple APNs) |

### Não declarar

| Tipo | Motivo |
|---|---|
| Conteúdo do usuário → Dados de áudio | O app não envia áudio. A palavra de ativação roda no aparelho e o reconhecimento de fala é o do sistema (Apple `SFSpeechRecognizer`, que a Apple trata pela política dela); só o texto vai para a API. |
| Saúde | O app não pede nem registra informação clínica. Mesma ressalva jurídica de `seguranca-de-dados-google.md` (item 2). |
| Localização, Financeiro, Histórico de navegação/pesquisa, Compras, Dados de uso, Diagnóstico | Não existem no app (sem analytics nem SDK de falhas). |

## APIs de uso declarado (já no PrivacyInfo.xcprivacy, nada a preencher no console)

União dos motivos declarados pelo React Native e pelos módulos Expo instalados (conferido nos
`PrivacyInfo.xcprivacy` de `node_modules` em 15/11/2026):

| API | Motivos |
|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` |

Depois do primeiro build no EAS, se a Apple mandar o e-mail "ITMS-91053: Missing API declaration",
acrescentar a API e o motivo citados em `app.config.ts → ios.privacyManifests` e gerar outro build.

## Outros campos de conformidade

| Campo | Resposta |
|---|---|
| Criptografia de exportação | Já respondido no build: `ITSAppUsesNonExemptEncryption = false` (só HTTPS do sistema). |
| Exclusão de conta (diretriz 5.1.1(v)) | Dentro do app: aba Ajustes → (rolar) Conta → (rolar) Excluir conta: 3 toques a partir da agenda para chegar; mais "Enviar código", o código e "Excluir minha conta" para concluir (5 toques e o código). Conferido no emulador com o build de release em 15/11/2026. Também em https://boramarca.com.br/excluir-conta. |
| URL da política de privacidade | https://boramarca.com.br/privacidade |
| Classificação etária | Ver `declaracoes-android.md`, seção "Classificação etária" — as respostas valem também para o questionário da Apple (sem conteúdo sensível; sem compras; sem anúncios; o app manda mensagens a clientes, então responder **Sim** a "mensagens/comunicação entre usuários" se o questionário perguntar). |
