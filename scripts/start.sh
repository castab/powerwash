#!/bin/sh

set -eu

log() {
  echo "[railway-start] $1"
}

require_env() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  if [ -z "$var_value" ]; then
    echo "[railway-start] Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

log "Validating environment"
require_env DATABASE_URL
require_env DIRECT_URL
require_env NEXT_PUBLIC_APP_URL
require_env ADMIN_SESSION_SECRET
require_env STRIPE_SECRET_KEY
require_env STRIPE_WEBHOOK_SECRET
require_env RESEND_API_KEY
require_env EMAIL_FROM
require_env SUPPORT_EMAIL

if [ ! -d "node_modules/@prisma/client" ]; then
  log "Prisma client not found, generating"
  npm run prisma:generate
else
  log "Prisma client already present, skipping generate"
fi

log "Running database migrations"
npm run prisma:migrate

log "Checking bootstrap data"
if npm run seed:check; then
  log "Bootstrap data missing, running seed"
  npm run prisma:seed
else
  log "Bootstrap data already present, skipping seed"
fi

log "Starting Next.js"
exec npm run start -- --hostname "${HOSTNAME:-0.0.0.0}" --port "${PORT:-3000}"
