# Operação

Como rodar o Bora Marca em desenvolvimento e em produção, fazer cópia de segurança, atualizar e
agir quando algo cai. O que depende de conta, chave ou aparelho está em
[`PENDENCIAS-HUMANAS.md`](PENDENCIAS-HUMANAS.md).

## Avisos (leia antes)

- **Nunca rode `docker compose ... down -v`**, nem em desenvolvimento nem em produção. O `-v` apaga
  os volumes: banco, Redis (filas de lembretes e prazos), sessões do WhatsApp na Evolution e
  certificados do Caddy. Para parar, use `down` sem `-v` (ou `pnpm down:infra`).
- **Nunca apague a conta de demonstração da Marina (`+5511900000001`)** do banco de
  desenvolvimento. O seed, os roteiros do app e do painel e as capturas contam com ela.
- **Nunca rode `pnpm db:seed` no banco de produção** (grava dados de demonstração).
- **Nunca troque `DATA_ENCRYPTION_KEY`** depois de haver tokens do Voice Monkey salvos: eles ficam
  ilegíveis.
- Não suba a infra de desenvolvimento a partir de outro clone do repositório: o compose monta
  `infra/postgres/init.sql` por caminho relativo e recriaria o contêiner do Postgres do projeto
  `boramarca` apontando para o outro clone.

## Desenvolvimento

Requisitos: Node 24+, pnpm 10 (`corepack enable`), Docker. Para o app: JDK 17 e Android SDK.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

pnpm dev:infra        # compose "boramarca": Postgres, Redis e Evolution; espera ficarem saudáveis
docker compose -p boramarca ps

pnpm db:migrate       # migrações (lê apps/api/.env)
pnpm db:seed          # espaço de demonstração; login da Marina +5511900000001, código 123456

pnpm --filter @boramarca/api dev          # API em http://localhost:3333 (GET /health)
pnpm --filter @boramarca/web dev          # site e painel em http://localhost:3000 (/painel)
pnpm --filter @boramarca/mobile start     # Metro para o dev build
pnpm --filter @boramarca/mobile android   # gera e instala o dev build Android (expo run:android)

pnpm down:infra       # para a infra; os volumes ficam
```

| Serviço              | Porta no host | Observação                                                         |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| Postgres 17.12       | 5440          | bancos `boramarca`, `boramarca_test` e `evolution`; usuário/senha `boramarca` |
| Redis 8.8.4          | 6390          | db 0 app/BullMQ, db 1 testes, db 6 Evolution                       |
| Evolution API v2.3.7 | 8085          | manager em `/manager`; chave `EVOLUTION_API_KEY` do `apps/api/.env` |
| API                  | 3333          | `GET /health` e `GET /v1/health`; documentação em `/v1/docs` fora de produção |
| Web                  | 3000          | site `/`, painel `/painel`                                         |
| Metro (Expo)         | 8081          | no emulador: `adb reverse tcp:8081 tcp:8081`                       |

O app usa dados de demonstração com `EXPO_PUBLIC_DATA_SOURCE=mock` e a API com `api`
(`EXPO_PUBLIC_API_URL=http://10.0.2.2:3333` no emulador Android). Detalhes do app, do dev build e do
limite de 260 caracteres do Windows: `apps/mobile/README.md`. A infra local aceita sobrescrever
usuário, senha e chave da Evolution em `infra/.env` (modelo `infra/.env.example`).

## Portão de qualidade

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm format:check
```

Roda em todos os pacotes (`pnpm -r`) e no GitHub Actions (`.github/workflows/ci.yml`, job
`quality-gate`). Os testes da API usam Postgres e Redis reais: `pnpm dev:infra` antes. O Vitest
não lê o `apps/api/.env`; sem `DATABASE_URL_TEST`/`REDIS_URL_TEST` exportados ele usa
`boramarca_test` e o Redis db 1. `pnpm eval` (avaliação da IA) fica fora do portão e só roda com
chaves (`PENDENCIAS-HUMANAS.md`, item 2).

## Verificação do fluxo de ponta a ponta

```sh
pnpm dev:infra
node scripts/verificar-fluxo.mjs
```

Confere a infra, cria o banco descartável `bm_fluxo` (com `btree_gist`), migra e popula, sobe a API
na porta 3355 com WhatsApp e IA simulados (`apps/api/scripts/api-fluxo.ts`, sem chaves), manda as
mensagens do fluxo do PDF pelo webhook e confere tudo pela API. No fim encerra a API, apaga
`bm_fluxo` e limpa o Redis db 7. Nada sai da máquina. Termina com `TUDO OK` (cerca de 5 minutos).
Variáveis opcionais: `FLUXO_DB`, `FLUXO_REDIS_DB`, `FLUXO_PORT`.

## Produção

Uma VPS (2 a 4 GB) com Docker e o plugin Compose. `infra/docker-compose.prod.yml` sobe Caddy (TLS
automático), site, API, migrações, Postgres, Redis e Evolution; só o Caddy publica portas (80 e
443). Primeira vez: DNS, segredos e conta de revisão em `PENDENCIAS-HUMANAS.md`, itens 1 e 6.

### Arquivo de ambiente

```sh
cp infra/.env.prod.example infra/.env.prod   # nunca versionar; guarde uma cópia fora da VPS
# preencha todo change-me (segredos: openssl rand -base64 48; DATA_ENCRYPTION_KEY: openssl rand -base64 32)
```

**Sem `infra/.env.prod` o compose falha de propósito.** As variáveis obrigatórias
(`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `EVOLUTION_API_KEY`, `ACME_EMAIL`, `API_DOMAIN`,
`SITE_DOMAIN`) são `${VAR:?}`, então `docker compose -f infra/docker-compose.prod.yml config` sem
`--env-file` sai com "required variable ... is missing a value". Use sempre `--env-file`. Para só
validar o arquivo de compose sem segredos:

```sh
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod.example config --quiet
```

A API também se recusa a subir em produção com segredo `change-me`, segredos JWT iguais ou
`WHATSAPP_WEBHOOK_SECRET` com menos de 16 caracteres.

### Subir

Todos os comandos abaixo na raiz do repositório. Para encurtar:

```sh
alias dc='docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod'

dc up -d --build      # constrói as imagens boramarca-api e boramarca-web com a tag RELEASE
dc ps                 # migrate "exited (0)"; os demais "healthy"
dc logs migrate       # migrações aplicadas
dc logs caddy         # certificados emitidos na primeira requisição
curl https://api.boramarca.com.br/health
```

O serviço `migrate` aplica as migrações e sai; a API só sobe depois que ele termina bem. O webhook
da Evolution aponta para `http://api:3333` dentro da rede do Docker.

### Conta de revisão das lojas

`REVIEW_PHONE` (um número que não é de nenhuma conta real) e `REVIEW_OTP` (6 dígitos) no
`infra/.env.prod`, depois `dc up -d api`. Sem as duas, a conta de revisão fica desligada. A API
cria o "Espaço Demonstração (revisão)" no primeiro login, com WhatsApp simulado (nunca envia de
verdade); recusa um número que já seja conta real (`403 REVIEW_PHONE_IN_USE`) e trava o número por
uma hora depois de 10 códigos errados. Os valores vão só nas notas de revisão coladas nos consoles
das lojas, nunca no git.

### Mudar variáveis

- Da API (`JWT_*`, chaves de IA, `REVIEW_*`, `ALEXA_*`...): edite `infra/.env.prod` e `dc up -d api`.
- Do site (`SUPPORT_EMAIL`, `PLAY_URL`, `APPSTORE_URL`, domínios): viram `NEXT_PUBLIC_*` no build,
  então `dc up -d --build web`.

## Produção na VPS (atual)

A produção roda na VPS compartilhada 72.60.10.108 (outros projetos no mesmo host). Difere do
`docker-compose.prod.yml` puro em três pontos, todos em `infra/docker-compose.vps.yml`:

- o **nginx do host** faz o HTTPS (certbot, webroot `/var/www/html`); o Caddy fica desligado.
  Site: `/etc/nginx/sites-available/boramarca` (cópia de `infra/vps/nginx-host.conf`);
- `web` escuta em `127.0.0.1:3150` e `api` em `127.0.0.1:3151` (`WEB_PORT`/`API_PORT`);
- as imagens vêm prontas do GHCR (`ghcr.io/fernandinhomartins40/boramarca-api|web`): a VPS não compila.

**Deploy:** todo push na `main` (fora `docs/`, `*.md` e `apps/mobile/`) roda `deploy.yml`: portão
(`ci.yml`) → build e push das imagens → SSH na VPS com uma chave que só executa
`/usr/local/bin/boramarca-deploy` (copia de `infra/vps/boramarca-deploy`). O script sincroniza o
código em `/opt/boramarca`, grava `RELEASE=<sha>` em `infra/.env.prod`, baixa as imagens, sobe
(`migrate` antes da `api`) e confere a saúde. Segredos do GitHub: `VPS_HOST`, `VPS_SSH_KEY`,
`VPS_KNOWN_HOSTS`. Nunca crie branch: o deploy só olha a `main`.

**Rollback:** na VPS, troque `RELEASE=` em `/opt/boramarca/infra/.env.prod` pelo SHA anterior (a
imagem da release anterior fica guardada) e rode o `up -d` abaixo.

**Comando base na VPS** (`ssh digiurban-vps`):

```sh
cd /opt/boramarca
C="docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml -f infra/docker-compose.vps.yml"
$C ps; $C logs --tail=100 api; $C up -d
```

**Mudou `boramarca-deploy` ou `nginx-host.conf`?** Copie de novo para a VPS
(`scp infra/vps/boramarca-deploy digiurban-vps:/usr/local/bin/`) — o deploy não reinstala esses dois.
`infra/vps/preparar-vps.sh` refaz a preparação inteira e é idempotente.

**Apps nativos:** `.github/workflows/apps-nativos.yml` compila Android e iOS no GitHub (sem Mac).
No push só confere que compila; pelo botão "Run workflow" assina e envia, se os segredos existirem.

## Atualização

1. Faça uma cópia de segurança (abaixo).
2. `git pull`.
3. Em `infra/.env.prod`, troque `RELEASE` para uma tag nova (ex.: a data, `2026-11-16`) e anote a
   anterior. As imagens antigas ficam guardadas com a tag velha.
4. `dc up -d --build`. O `migrate` aplica as migrações novas antes de a API subir.
5. Confira `dc ps`, `dc logs migrate` e `/health`.

Voltar atrás: `RELEASE` com a tag anterior e `dc up -d` (sem `--build`). Se a versão nova aplicou
migração, a imagem antiga pode não entender o banco: restaure a cópia feita no passo 1.

**Evolution:** a versão é fixa (`evoapicloud/evolution-api:v2.3.7`) nos dois arquivos de compose.
Para subir de versão, leia o changelog, troque a tag nos dois arquivos, rode
`pnpm --filter @boramarca/whatsapp test` e `node scripts/verificar-fluxo.mjs` localmente, teste um
pareamento real e só então `dc up -d evolution`. As sessões ficam no volume `evolution_instances`
e no banco `evolution`.

## Cópia de segurança e restauração do Postgres

A política de privacidade promete cópias guardadas por **até 30 dias**. Salve as do banco
`boramarca` (dados do produto) e do `evolution` (sessões do WhatsApp).

Script diário, por exemplo `/usr/local/bin/boramarca-backup.sh` (ajuste o caminho do repositório e
`-U` se mudou `POSTGRES_USER`):

```sh
#!/bin/sh
set -eu
cd /srv/boramarca
DEST=/var/backups/boramarca
mkdir -p "$DEST"
DC="docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
for DB in boramarca evolution; do
  $DC exec -T postgres pg_dump -U boramarca -Fc "$DB" > "$DEST/$DB-$(date +%F).dump"
done
find "$DEST" -name '*.dump' -mtime +29 -delete   # rotação: até 30 dias
```

Cron (`crontab -e` como root): `15 3 * * * /usr/local/bin/boramarca-backup.sh`. Copie a pasta para
fora da VPS (armazenamento de objetos ou outro servidor) com a mesma rotação de 30 dias.

Restaurar (para a API, restaura e sobe de novo):

```sh
dc stop api
dc exec -T postgres pg_restore -U boramarca -d boramarca --clean --if-exists --no-owner < /var/backups/boramarca/boramarca-AAAA-MM-DD.dump
dc up -d api
```

Testar uma cópia sem tocar no banco real:

```sh
dc exec postgres createdb -U boramarca restauracao_teste
dc exec -T postgres pg_restore -U boramarca -d restauracao_teste --no-owner < /var/backups/boramarca/boramarca-AAAA-MM-DD.dump
dc exec postgres psql -U boramarca -d restauracao_teste -c 'select count(*) from professionals'
dc exec postgres dropdb -U boramarca restauracao_teste
```

O Redis guarda as filas (lembretes, prazos de Decisões) com AOF no volume `redis_data`; não precisa
de cópia à parte, mas `down -v` o apaga.

## Logs por 30 dias

A política promete registros técnicos por até 30 dias. O compose usa o driver `json-file` girando
por tamanho (5 arquivos de 10 MB por serviço), o que com pouco tráfego guarda mais de 30 dias.
Escolha um:

**A. logrotate (funciona com o compose atual).** `/etc/logrotate.d/boramarca-docker`:

```
/var/lib/docker/containers/*/*-json.log {
  daily
  rotate 30
  maxage 30
  dateext
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
```

E um cron diário para os arquivos que o próprio Docker gira por tamanho:
`20 3 * * * find /var/lib/docker/containers -name '*-json.log.[0-9]*' -mtime +30 -delete`.
Teste com `logrotate -d /etc/logrotate.d/boramarca-docker`.

**B. journald.** Exige trocar o `logging` de `x-service` em `infra/docker-compose.prod.yml` para
`driver: journald` (mudança de código; peça ao responsável pela `infra/`). Depois, em
`/etc/systemd/journald.conf`, `MaxRetentionSec=30day`, `systemctl restart systemd-journald` e
`dc up -d`. Ler: `journalctl CONTAINER_NAME=boramarca-prod-api-1`.

Os logs da API não trazem telefone nem texto de mensagem em nível `info`
(`apps/api/src/lib/logger.ts`). O job diário `retention` da API apaga contatos do site com mais de
12 meses e o `audit_log` com mais de 90 dias.

## Quando algo cai

- **Sessão do WhatsApp caiu:** o app mostra a faixa vermelha "WhatsApp desconectado"; o
  profissional toca nela e reconecta (QR ou código). As respostas pendentes saem ao reconectar; as
  com mais de 30 minutos são descartadas e ficam no `audit_log`. No servidor:
  `dc logs --since 1h evolution` e `dc ps`; se a Evolution estiver `unhealthy`, `dc restart evolution`.
- **API fora:** `dc ps`, `dc logs --since 30m api`. Se o `migrate` falhou, a API nem sobe:
  `dc logs migrate`.
- **Certificado:** `dc logs caddy`; confira se o DNS ainda aponta para a VPS e se 80/443 estão
  abertas.
- **Memória:** `docker stats --no-stream`. Limites no compose: Evolution 1 GB, API 512 MB,
  Postgres 512 MB, site 384 MB, Redis 256 MB (`maxmemory 200mb`, sem descarte), Caddy 128 MB. A
  Evolution cresce com o número de sessões conectadas; se encostar no limite, aumente o limite e a
  VPS antes de aceitar mais profissionais.
