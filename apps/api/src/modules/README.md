# Módulos da API

Cada pasta em `src/modules/<nome>/` é **um plugin Fastify**, carregado automaticamente por
`@fastify/autoload` (ver `src/app.ts`) com o prefixo `/v1`.

Convenção:

- `index.ts` exporta por padrão um `FastifyPluginAsync` que registra as rotas do módulo. É o único
  arquivo carregado pelo autoload; os demais (`service.ts`, `repo.ts`, `*.test.ts`...) são
  importados por ele.
- Os caminhos dentro do plugin são os da seção 9 do plano, sem o `/v1`
  (ex.: `app.get('/agenda', ...)`). Use os contratos de `routes` em `@boramarca/shared` para os
  schemas de entrada e saída (`fastify-type-provider-zod`); não redefina tipos.
- Cada módulo roda encapsulado. Decorações compartilhadas (`app.config`, `app.db`, `app.redis`) vêm
  de `src/plugins/infra.ts`, registrado antes do autoload. Plugins transversais novos (auth JWT,
  realtime, OpenAPI) vão em `src/plugins/` e são registrados em `app.ts` com `fastify-plugin`.
- Lógica de negócio fica em funções puras testáveis (ex.: `modules/agenda/engine.ts`); o plugin só
  faz HTTP.
- Testes ficam ao lado do código (`*.test.ts`) e usam `app.inject`. Testes de integração usam
  `DATABASE_URL_TEST` / `REDIS_URL_TEST` (infra Docker, banco `boramarca_test`).

Rotas de saúde: `GET /health` (sem prefixo, para Docker e proxy) e `GET /v1/health` (módulo
`health`). As duas respondem 200 sem tocar no banco.
