#!/usr/bin/env bash
set -euo pipefail

APP="cobro"
PORT="4009"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true

cd "/var/www/${APP}"
git fetch origin main
git reset --hard origin/main

pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

for attempt in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "Deploy OK -> https://${APP}.olcas.app"
    exit 0
  fi
  echo "Esperando healthcheck (${attempt}/15)…"
  sleep 2
done

echo "Healthcheck FALLÓ tras 30 segundos"
pm2 logs "${APP}" --lines 50 --nostream || true
exit 1
