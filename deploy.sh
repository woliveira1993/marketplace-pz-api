#!/bin/bash
# Deploy script — marketplace-pz-api
# Uso: bash deploy.sh
# Requer: Node.js, PM2, .env configurado no diretório do projeto

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PM2_APP="marketplace-pz-api"

echo "==> [marketplace-pz-api] Iniciando deploy..."
cd "$APP_DIR"

echo "==> Pulling latest code..."
git pull origin main

echo "==> Instalando dependências..."
npm install

echo "==> Compilando TypeScript..."
npm run build

echo "==> Rodando migrations..."
npm run migrate

echo "==> Recarregando no PM2..."
if pm2 describe "$PM2_APP" > /dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  echo "    App não encontrado no PM2 — iniciando pela primeira vez..."
  pm2 start ecosystem.config.cjs --env production
  pm2 save
fi

echo ""
echo "==> Deploy concluído!"
pm2 show "$PM2_APP"
