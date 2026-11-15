# syntax=docker/dockerfile:1
# Bora Marca site and panel (Next.js). Build from the repo root:
#   docker build -f infra/docker/web.Dockerfile -t boramarca-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.boramarca.com.br .
# NEXT_PUBLIC_* are embedded at build time (apps/web/.env.example): change one, rebuild.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
# Retries: a slow or flaky registry connection should not fail the whole build.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true npm_config_fetch_retries=6 npm_config_fetch_retry_maxtimeout=120000 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
ARG NEXT_PUBLIC_API_URL=https://api.boramarca.com.br
ARG NEXT_PUBLIC_SITE_URL=https://boramarca.com.br
ARG NEXT_PUBLIC_SUPPORT_EMAIL=contato@boramarca.com.br
ARG NEXT_PUBLIC_PLAY_URL=
ARG NEXT_PUBLIC_APPSTORE_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL NEXT_PUBLIC_PLAY_URL=$NEXT_PUBLIC_PLAY_URL \
    NEXT_PUBLIC_APPSTORE_URL=$NEXT_PUBLIC_APPSTORE_URL
# shortcut: next.config.ts has no `output: 'standalone'`, so the runtime keeps next's prod
# node_modules (pnpm deploy); switch to .next/standalone once apps/web enables it.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '!@boramarca/mobile'
RUN pnpm --filter @boramarca/web build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @boramarca/web deploy --prod --legacy /out \
 && rm -rf /out/.next && cp -r apps/web/.next /out/.next && rm -rf /out/.next/cache \
 && find /out -name '*.test.ts' -delete

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start"]
