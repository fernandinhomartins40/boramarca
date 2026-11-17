# Bora Marca

Assistente de agenda para profissionais que trabalham com hora marcada (beleza, saúde, bem-estar,
aulas). A IA lê as mensagens dos clientes no WhatsApp do profissional, responde o que é simples e
pergunta ao profissional o que precisa da palavra dele, por notificação com Sim/Não, pelo Modo
Balcão (voz, com as mãos ocupadas) ou pela Alexa. Toda mudança na agenda passa por um motor de
regras; a IA nunca escreve no banco sozinha. Inclui lembretes, lista de espera automática, painel
web do dono e site público com as páginas legais.

Especificação em [`docs/02-plano-de-implementacao.md`](docs/02-plano-de-implementacao.md).

## Estado

O código está completo e verificado num clone limpo: portão de qualidade (552 testes), fluxo de
exemplo de ponta a ponta contra Postgres e Redis reais, APK de debug e de release, build do site,
exclusão de conta e imagens de produção
([`docs/verificacao-final.md`](docs/verificacao-final.md)). A revisão de segurança e LGPD não tem
achados graves abertos ([`docs/revisao-seguranca.md`](docs/revisao-seguranca.md)).

Falta o que só uma pessoa faz: servidor e DNS, chaves de IA, provedor de SMS, contas das lojas,
WhatsApp e testes em aparelho, revisão jurídica e publicação. Tudo em ordem, com passo a passo, em
[`docs/PENDENCIAS-HUMANAS.md`](docs/PENDENCIAS-HUMANAS.md).

## Documentos

| Documento                                                        | Para quê                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`docs/OPERACAO.md`](docs/OPERACAO.md)                           | Desenvolvimento, produção, cópia de segurança, logs, atualização |
| [`docs/PENDENCIAS-HUMANAS.md`](docs/PENDENCIAS-HUMANAS.md)       | O que depende de conta, chave, aparelho, loja ou advogado        |
| [`docs/verificacao-final.md`](docs/verificacao-final.md)         | Verificação da definição de pronto, com as saídas                |
| [`docs/revisao-seguranca.md`](docs/revisao-seguranca.md)         | Revisão de segurança, LGPD e proteção do número                  |
| [`apps/mobile/store/PUBLICAR.md`](apps/mobile/store/PUBLICAR.md) | Publicação no Google Play e na App Store                         |

## Estrutura

| Pasta               | Pacote                | O que é                                                                            |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `apps/api`          | `@boramarca/api`      | Fastify + Drizzle (Postgres) + Redis/BullMQ. Único dono do banco e das regras      |
| `apps/mobile`       | `@boramarca/mobile`   | Expo SDK 58 (dev build) + expo-router, Android e iOS; material de loja em `store/` |
| `apps/web`          | `@boramarca/web`      | Next.js 16 (App Router) + Tailwind 4: site em `app/(site)`, painel em `app/painel` |
| `packages/shared`   | `@boramarca/shared`   | Contratos Zod, rotas, eventos, ferramentas da IA e tokens visuais                  |
| `packages/whatsapp` | `@boramarca/whatsapp` | Gateway (Evolution / falso) e guarda de envio                                      |
| `packages/ia`       | `@boramarca/ia`       | Cliente LLM, prompts, transcrição e avaliação (`pnpm eval`)                        |
| `packages/alexa`    | `@boramarca/alexa`    | Skill da Alexa e Voice Monkey                                                      |
| `infra/`            |                       | Compose de desenvolvimento e de produção (Caddy), Dockerfiles da API e do site     |
| `scripts/`          |                       | `verificar-fluxo.mjs`: fluxo de exemplo de ponta a ponta pela API                  |
| `Bora-Marca-Kit/`   |                       | Kit de marca (somente leitura)                                                     |

## Início rápido

Requisitos: Node 24+, pnpm 10 (`corepack enable`), Docker. Para o app: JDK 17 e Android SDK.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

pnpm dev:infra                            # Postgres 5440, Redis 6390, Evolution 8085
pnpm db:migrate && pnpm db:seed           # migrações e dados de demonstração
pnpm --filter @boramarca/api dev          # API em http://localhost:3333
pnpm --filter @boramarca/web dev          # site e painel em http://localhost:3000
pnpm --filter @boramarca/mobile start     # Metro para o dev build
pnpm --filter @boramarca/mobile android   # gera e instala o dev build Android
```

Login de demonstração: Marina, `+5511900000001`, código `123456` (só fora de produção). Portas,
produção, cópia de segurança e atualização: [`docs/OPERACAO.md`](docs/OPERACAO.md). As portas
evitam 5432–5434 e 6379–6380, já usadas nesta máquina por outros projetos.

## Portão de qualidade

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Roda em todos os pacotes (`pnpm -r`) e no GitHub Actions (`.github/workflows/ci.yml`). O `build`
do app mobile é só verificação de tipos; o do site é `next build`. Os testes da API precisam da
infra local de pé.

## Decisões da fundação

- **Sem build entre pacotes.** Os pacotes internos exportam `src/index.ts` direto; a API roda com
  `tsx`, os testes com Vitest, o site com `transpilePackages` e o app com Metro. O `build` dos
  pacotes é `tsc --noEmit`.
- **`nodeLinker: hoisted`** (em `pnpm-workspace.yaml`). O Expo suporta instalações isoladas desde o
  SDK 54, mas o autolinking do React Native, o Gradle e bibliotecas nativas como o Picovoice
  esperam `node_modules/<pacote>`, e os caminhos longos de `.pnpm/` estouram o limite de 260
  caracteres do Windows nos builds Android. A documentação do Expo indica `hoisted` como
  alternativa. Metro usa a configuração automática de monorepo do Expo (SDK 52+).
- **Versões:** Expo SDK 58 (React Native 0.88, React 19.3), Next.js 16.4, Tailwind 4.3, Zod 4.6,
  Fastify 5.12, Drizzle ORM 0.45, TypeScript 6.0 (a versão que o SDK 58 pede), ESLint 10.
- **OpenAPI:** Zod 4 + `fastify-type-provider-zod` 7 + `@fastify/swagger`, a partir de
  `routes` em `@boramarca/shared`.
- **Tailwind sem cores soltas:** `apps/web/app/theme.css` é gerado de `packages/shared/src/theme.ts`
  (`pnpm --filter @boramarca/web theme`) e remove a paleta padrão do Tailwind; um teste falha se o
  arquivo estiver desatualizado.
- Os masters 4K do kit ficam fora do git (`.gitignore`).
