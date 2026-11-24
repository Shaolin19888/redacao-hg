#!/bin/bash
# Arranca o ambiente de desenvolvimento local
# Uso: ./scripts/start-dev.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"

echo "▶ A arrancar PostgreSQL e Redis..."
docker compose -f "$ROOT/docker-compose.yml" up -d

echo "⏳ A aguardar base de dados..."
until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U redacao -d redacao_hg &>/dev/null; do
  sleep 1
done

echo "✔ Base de dados pronta."

echo "▶ A aplicar migrações..."
cd "$WEB" && npx prisma migrate deploy

echo "▶ A arrancar worker em background..."
cd "$WEB" && npm run worker &
WORKER_PID=$!

echo "▶ A arrancar Next.js..."
cd "$WEB" && npm run dev

# Quando Next.js parar, parar o worker
kill $WORKER_PID 2>/dev/null
echo "✔ Serviços parados."
