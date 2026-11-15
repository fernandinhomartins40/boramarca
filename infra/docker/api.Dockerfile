# syntax=docker/dockerfile:1
# Bora Marca API. Build from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t boramarca-api .
# Workspace packages ship TypeScript source, so the runtime runs it with tsx (in-process loader).
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
# Retries: a slow or flaky registry connection should not fail the whole build.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true npm_config_fetch_retries=6 npm_config_fetch_retry_maxtimeout=120000
RUN corepack enable
WORKDIR /repo
COPY . .
# Everything but the mobile app; then a self-contained copy of the API with production deps only.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '!@boramarca/mobile'
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @boramarca/api deploy --prod --legacy /out \
 && find /out -name '*.test.ts' -delete \
 && rm -rf /out/src/test /out/.env* /out/node_modules/.cache

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
WORKDIR /app
# Root-owned and read-only for the app user.
COPY --from=build /out ./
USER node
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Migrations: docker compose runs `node --import tsx src/db/migrate.ts` once before the API.
CMD ["node", "--import", "tsx", "src/server.ts"]
