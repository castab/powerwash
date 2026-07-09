#!/bin/sh

# Start command for the Railway cron service that runs the booking sweeper.
# Mirrors start.sh's environment validation, but intentionally does NOT run
# migrations or seeding — the web service owns those, and a cron tick must
# never race a deploy's `prisma migrate deploy`.

set -eu

log() {
  echo "[railway-sweep] $1"
}

require_env() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  if [ -z "$var_value" ]; then
    echo "[railway-sweep] Missing required environment variable: $var_name" >&2
    exit 1
  fi
}

require_secret() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  require_env "$var_name"

  case "$var_value" in
    change-me*|replace-with*)
      echo "[railway-sweep] $var_name is still set to a placeholder value" >&2
      exit 1
      ;;
  esac

  if [ "${#var_value}" -lt 32 ]; then
    echo "[railway-sweep] $var_name must be at least 32 characters" >&2
    exit 1
  fi
}

log "Validating environment"
require_env DATABASE_URL
require_env DIRECT_URL
require_env NEXT_PUBLIC_APP_URL
require_secret ADMIN_SESSION_SECRET
require_secret MANAGE_LINK_SECRET
require_env STRIPE_SECRET_KEY
require_env STRIPE_WEBHOOK_SECRET
require_env RESEND_API_KEY
require_env EMAIL_FROM
require_env SUPPORT_EMAIL

if [ ! -f "src/generated/prisma/client.ts" ]; then
  log "Prisma client not found, generating"
  npm run prisma:generate
else
  log "Prisma client already present, skipping generate"
fi

log "Running booking sweeper"
exec npm run sweep
