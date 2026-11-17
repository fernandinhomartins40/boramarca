#!/usr/bin/env bash
# Preparação ÚNICA da VPS compartilhada para o Bora Marca. Roda NA VPS, como root, depois de copiar para /root:
#   boramarca-deploy  nginx-host.conf  boramarca_deploy.pub   (docs/OPERACAO.md, "Produção na VPS")
#   bash /root/preparar-vps.sh
# Idempotente: não recria .env.prod nem certificado que já existam. Não toca nos outros sites do nginx.
set -euo pipefail
cd /root

install -m 755 boramarca-deploy /usr/local/bin/boramarca-deploy
sed -i 's/\r$//' /usr/local/bin/boramarca-deploy

# Chave do GitHub Actions: só consegue rodar o script de deploy
if ! grep -q "github-actions deploy boramarca" /root/.ssh/authorized_keys; then
  echo "command=\"/usr/local/bin/boramarca-deploy\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(tr -d '\r' < boramarca_deploy.pub)" >> /root/.ssh/authorized_keys
fi

mkdir -p /opt/boramarca/infra /opt/boramarca-backups
cd /opt/boramarca
[ -d .git ] || git init -q -b main
ENV=/opt/boramarca/infra/.env.prod
if [ ! -f "$ENV" ]; then
  umask 077
  r() { openssl rand -hex "$1"; }
  cat > "$ENV" <<EOF
# Produção do Bora Marca nesta VPS. Gerado em $(date +%F). Não commitar. Modelo comentado: infra/.env.prod.example
SITE_DOMAIN=boramarca.com.br
API_DOMAIN=api.boramarca.com.br
# O Caddy fica desligado nesta VPS (o nginx do host faz o HTTPS); o compose ainda exige a variável.
ACME_EMAIL=contato@boramarca.com.br
WEB_PORT=3150
API_PORT=3151
SUPPORT_EMAIL=contato@boramarca.com.br
POSTGRES_USER=boramarca
POSTGRES_PASSWORD=$(r 24)
REDIS_PASSWORD=$(r 24)
EVOLUTION_API_KEY=$(r 24)
LOG_LEVEL=info
JWT_ACCESS_SECRET=$(r 48)
JWT_REFRESH_SECRET=$(r 48)
WHATSAPP_WEBHOOK_SECRET=$(r 24)
# Nunca troque depois que houver tokens salvos (ficam ilegíveis)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
# Conta de revisão das lojas: número que não é de ninguém + código fixo
REVIEW_PHONE=+5511900009999
REVIEW_OTP=$(shuf -i 100000-999999 -n 1)
# Chaves de IA, transcrição, Alexa, Voice Monkey e push: docs/PENDENCIAS-HUMANAS.md (vazio = desligado)
LLM_PRIMARY_BASE_URL=https://api.deepseek.com
LLM_PRIMARY_API_KEY=
LLM_PRIMARY_MODEL=deepseek-flash
LLM_FALLBACK_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
LLM_FALLBACK_API_KEY=
LLM_FALLBACK_MODEL=qwen3.8-flash
TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1
TRANSCRIBE_API_KEY=
TRANSCRIBE_MODEL=whisper-large-v3-turbo
PUSH_PROVIDER=expo
EXPO_ACCESS_TOKEN=
ALEXA_SKILL_ID=
ALEXA_OAUTH_CLIENT_ID=alexa-skill
ALEXA_OAUTH_CLIENT_SECRET=
VOICE_MONKEY_TOKEN=
RELEASE=latest
EOF
  echo ".env.prod criado em $ENV"
else
  echo ".env.prod já existia, mantido"
fi

# nginx do host: primeiro só HTTP (desafio do certificado), depois HTTPS
SITE=/etc/nginx/sites-available/boramarca
if [ ! -f /etc/letsencrypt/live/boramarca.com.br/fullchain.pem ]; then
  awk '/^server \{/{n++} n<2' /root/nginx-host.conf > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/boramarca
  if nginx -t; then systemctl reload nginx; else rm -f /etc/nginx/sites-enabled/boramarca; echo "nginx -t falhou; site removido"; exit 1; fi
  certbot certonly -n --agree-tos --register-unsafely-without-email --webroot -w /var/www/html \
    --cert-name boramarca.com.br -d boramarca.com.br -d www.boramarca.com.br -d api.boramarca.com.br
fi
cp "$SITE" /root/boramarca-nginx.bak 2>/dev/null || true
cp /root/nginx-host.conf "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/boramarca
if nginx -t; then
  systemctl reload nginx && echo "OK: nginx do host servindo boramarca.com.br em HTTPS (502 até o primeiro deploy)"
else
  cp /root/boramarca-nginx.bak "$SITE"; nginx -t && systemctl reload nginx
  echo "config HTTPS falhou; voltei para a anterior"; exit 1
fi
