# Prompt 0 — Fundação do app e design system (faça PRIMEIRO)

---

Você é um engenheiro mobile sênior com olho de designer de produto. Vamos construir o app **Bora Marca** passo a passo. **Nesta tarefa, crie só a fundação. Não crie nenhuma tela de produto ainda.**

> **A logo e a paleta de cores do Bora Marca já existem neste projeto.** Elas são a única fonte de verdade da identidade visual. Não crie, altere ou redesenhe a logo, e não invente cores.
> Se o projeto Expo já existir, trabalhe dentro dele: não crie outro.

## O produto em 5 linhas
- App para barbeiros, cabeleireiros e manicures brasileiros, que trabalham **com as mãos ocupadas**.
- Uma IA atende os clientes no WhatsApp, cuida da agenda e **encaixa** clientes em horários que vagaram.
- A IA avisa o profissional **por voz** (celular Android + caixa Bluetooth) e ele responde falando ou com **um toque**.
- Público: pouca paciência para apps complicados, celular Android intermediário, salão barulhento e iluminado.
- **Plataforma prioritária: Android.** O iOS vem depois, da mesma base de código.

## Stack (obrigatória)
- **Expo** (SDK mais recente) + **React Native** + **TypeScript** estrito
- **expo-router** para navegação (abas + pilhas)
- Estilo: StyleSheet com tokens próprios (sem bibliotecas de UI prontas como NativeBase ou Paper)
- Ícones: `lucide-react-native`
- Fontes: as que a identidade visual do projeto já define. Se ela não define nenhuma, use `@expo-google-fonts/inter`.
- Estado: `zustand`; dados: camada `src/data/` com **mocks** (sem backend nesta fase)
- Datas: `date-fns` com locale `ptBR`
- Configure para rodar como **dev build** (vamos usar módulos nativos depois). Não dependa do Expo Go.

## Estrutura de pastas
```
app/                 # rotas expo-router
src/theme/           # tokens
src/components/      # componentes base
src/data/            # tipos + mocks + funções fake assíncronas
src/hooks/
src/utils/
README.md            # explique a estrutura e as regras abaixo
```

## Tokens (`src/theme/`)
### Passo 1 — Encontre a identidade que já existe
Localize no projeto a logo e a paleta (pastas como `brand/`, `assets/` ou `design/`, arquivos `.svg`/`.png` da logo, e arquivos de cores em `.json`, `.md`, `.ts` ou `tailwind.config`). **Se não encontrar, pare e me pergunte onde estão.** Não siga com cores inventadas.

### Passo 2 — Mapeie a paleta para papéis de uso
Crie os tokens abaixo usando **as cores da paleta existente** (tema claro e escuro, com troca automática pelo sistema):

| Token | Uso |
|---|---|
| `bg` | Fundo das telas |
| `surface` | Cards |
| `surfaceAlt` | Áreas secundárias |
| `text` | Texto principal |
| `textMuted` | Texto secundário |
| `primary` | Ação principal, cor de destaque da marca |
| `onPrimary` | Texto e ícone sobre `primary` |
| `success` | Confirmado |
| `warning` | Pendente / precisa de você |
| `danger` | Cancelado / erro |
| `border` | Linhas e divisórias |

Regras do mapeamento:
- Use a cor principal da logo como `primary`.
- Se a paleta não tiver cor para algum papel (é comum faltar `success`, `warning` ou `danger`, ou as variações do tema escuro), crie um tom que combine com a paleta e marque-o como **"derivado"** no README. Esses são os únicos tons novos permitidos.
- Confira o contraste mínimo **WCAG AA** de cada par texto/fundo.
- **Antes de escrever os componentes, me mostre a tabela final (token → HEX → de onde veio) e espere minha aprovação.**

### Passo 3 — Logo no app
- Crie um componente `Logo` que só **usa** os arquivos de logo existentes (com `react-native-svg` se for SVG), com variantes para fundo claro e escuro. Não redesenhe nada.

**Tipografia:** escala `display 32`, `title 24`, `heading 20`, `body 17`, `bodySmall 15`, `caption 13`. O corpo é 17 (maior que o comum), porque o usuário olha o celular de longe, apoiado na bancada.
**Espaçamento:** base 4 (4, 8, 12, 16, 24, 32, 48). **Raios:** 8, 14 e 24. **Alvo de toque mínimo: 56 dp**, maior que o padrão, para quem está de luva ou com a mão molhada.

## Componentes base (`src/components/`)
Crie cada um tipado, com variantes e estados (pressionado, desabilitado, carregando):
- `Screen` (área segura, fundo, rolagem opcional)
- `Text` (variantes da escala)
- `Button` (primary, secondary, ghost, danger; tamanhos `lg` 64 dp e `md` 56 dp; ícone opcional)
- `BigChoice`: par de botões gigantes **Sim / Não** para decisões rápidas (cada um ocupa metade da largura, ≥ 96 dp de altura)
- `Card`, `ListItem` (avatar com iniciais, título, subtítulo, ação à direita)
- `StatusPill`: confirmado, pendente, cancelado, encaixe, faltou
- `TimeSlot`: bloco de horário da agenda (ocupado, livre, recém-vagou com destaque animado)
- `BottomSheet`, `Toast`, `EmptyState`, `Skeleton`
- `VoiceOrb`: círculo animado para o Modo Balcão (estados: ouvindo, pensando, falando, parado). Use `react-native-reanimated`.

## Dados mock (`src/data/`)
Tipos: `Professional`, `Client`, `Service` (nome, duração, preço), `Appointment` (status), `Conversation`, `Message`, `AiDecision` (pedido da IA aguardando o profissional), `WaitlistEntry`.
Crie dados realistas brasileiros: uma barbearia com 12 clientes, serviços como "Corte", "Barba", "Corte + Barba", "Pé e mão" e agenda de hoje das 9h às 19h, com 2 cancelamentos e 1 pedido de encaixe pendente. Use funções `async` com atraso falso de 300–600 ms, para as telas já nascerem com estados de carregamento.

## Navegação inicial
Abas inferiores com ícones grandes e rótulos: **Agenda**, **Decisões** (com contador), **Conversas**, **Clientes**, **Ajustes**. Cada aba mostra só um placeholder com o nome por enquanto.

## Página de vitrine
Crie a rota `app/dev/vitrine.tsx`, que mostra todos os componentes em todos os estados, no claro e no escuro. É assim que vou revisar o design system.

## Regras para todas as próximas tarefas (escreva no README)
1. Nenhuma cor, tamanho ou fonte solta no código: sempre tokens.
2. Toda tela tem estados de **carregando**, **vazio** e **erro**.
3. Textos em **português do Brasil**, tom próximo e direto ("Fulano quer horário", não "Nova solicitação de agendamento recebida").
4. Acessibilidade: `accessibilityLabel` em tudo que é tocável e suporte a fonte grande do sistema.
5. Testar no emulador Android antes de dizer que terminou.

## Ao terminar
Rode o app, abra a vitrine, me diga como abrir e pare. Não comece telas.
