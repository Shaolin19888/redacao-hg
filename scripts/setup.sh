#!/bin/bash
set -e

echo "=== Redação HG — Setup ==="

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ .env criado — preenche as variáveis antes de continuar."
  exit 1
fi

echo "→ A instalar dependências..."
npm install --ignore-scripts

echo "→ A gerar cliente Prisma..."
node_modules/.bin/prisma generate --schema=apps/web/prisma/schema.prisma

echo "→ A iniciar base de dados..."
docker compose up -d

echo "→ A aguardar PostgreSQL..."
sleep 3

echo "→ A criar tabelas (migrate)..."
cd apps/web && ../../node_modules/.bin/prisma migrate dev --name init
cd ../..

echo "→ A criar utilizador admin (seed)..."
cd apps/web && npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
cd ../..

echo ""
echo "✅ Setup completo!"
echo "   Inicia o painel com: npm run dev"
echo "   Acede em: http://localhost:3000"
