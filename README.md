# Bora Marca

Assistente de agenda por WhatsApp e voz para profissionais que trabalham com hora marcada.
Especificação em [`docs/02-plano-de-implementacao.md`](docs/02-plano-de-implementacao.md).

## Estrutura

| Pasta               | Pacote                | O que é                                                                            |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `apps/api`          | `@boramarca/api`      | Fastify + Drizzle (Postgres) + Redis/BullMQ. Único dono do banco e das regras      |
| `apps/mobile`       | `@boramarca/mobile`   | Expo SDK 58 (dev build) + expo-router, Android e iOS                               |
| `apps/web`          | `@boramarca/web`      | Next.js 16 (App Router) + Tailwind 4: site em `app/(site)`, painel em `app/painel` |
| `packages/shared`   | `@boramarca/shared`   | Contratos Zod, rotas, eventos, ferramentas da IA e tokens visuais                  |
| `packages/whatsapp` | `@boramarca/whatsapp` | Gateway (Evolution / falso) e guarda de envio                                      |
| `packages/ia`       | `@boramarca/ia`       | Cliente LLM, prompts, transcrição                                                  |
| `packages/alexa`    | `@boramarca/alexa`    | Skill da Alexa e Voice Monkey                                                      |
| `infra/`            |                       | `docker-compose.yml` de desenvolvimento                                            |
| `Bora-Marca-Kit/`   |                       | Kit de marca (somente leitura)                                                     |

## Requisitos

Node 24+, pnpm 10 (`corepack enable`), Docker. Para o app: JDK 17 e Android SDK.

## Instalar

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## Infraestrutura local

```sh
pnpm dev:infra        # sobe Postgres, Redis e Evolution API e espera ficarem saudáveis
docker compose -p boramarca ps
pnpm down:infra       # derruba (os volumes ficam)
```

| Serviço              | Porta no host | Observação                                                                             |
| -------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Postgres 17.12       | 5440          | bancos `boramarca`, `boramarca_test` (testes) e `evolution`; usuário/senha `boramarca` |
| Redis 8.8.4          | 6390          | db 0 app/BullMQ, db 1 testes, db 6 Evolution                                           |
| Evolution API v2.3.7 | 8085          | imagem oficial `evoapicloud/evolution-api`; manager em `/manager`                      |
| API                  | 3333          | `GET /health` e `GET /v1/health`                                                       |
| Web                  | 3000          | site `/`, painel `/painel`                                                             |
| Metro (Expo)         | 8081          |                                                                                        |

As portas evitam 5432–5434 e 6379–6380, já usadas nesta máquina por outros projetos.

## Rodar

```sh
pnpm db:migrate && pnpm db:seed           # migrações e dados de demonstração
pnpm --filter @boramarca/api dev          # API em http://localhost:3333
pnpm --filter @boramarca/web dev          # site e painel em http://localhost:3000
pnpm --filter @boramarca/mobile start     # Metro para o dev build
pnpm --filter @boramarca/mobile android   # gera e instala o dev build Android (expo run:android)
pnpm eval                                 # avaliação da IA (só com chaves; fora do portão)
```

## Portão de qualidade

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Roda em todos os pacotes (`pnpm -r`) e no GitHub Actions (`.github/workflows/ci.yml`). O `build`
do app mobile é só verificação de tipos; o do site é `next build`.

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
