#!/bin/bash
# Deploy para VPS
# Uso: ./scripts/deploy-vps.sh
# Pré-requisitos: Docker, Docker Compose, .env preenchido com CADDY_DOMAIN e CADDY_EMAIL

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Redação HG — Deploy"
echo ""

# Verificar .env
if [ ! -f "$ROOT/.env" ]; then
  echo "✗ Ficheiro .env não encontrado. Copia .env.example e preenche."
  exit 1
fi

# Verificar variáveis obrigatórias
source "$ROOT/.env"
for VAR in POSTGRES_PASSWORD NEXTAUTH_SECRET CADDY_DOMAIN CADDY_EMAIL; do
  if [ -z "${!VAR}" ]; then
    echo "✗ Variável $VAR não definida no .env"
    exit 1
  fi
done

echo "✔ Configuração verificada"
echo "  Domínio: $CADDY_DOMAIN"
echo "  Email:   $CADDY_EMAIL"
echo ""

# Construir e arrancar
echo "▶ A construir imagens..."
docker compose -f "$ROOT/docker-compose.prod.yml" build --no-cache

echo "▶ A arrancar serviços..."
docker compose -f "$ROOT/docker-compose.prod.yml" up -d

echo ""
echo "✔ Deploy concluído!"
echo "  A aplicação estará disponível em https://$CADDY_DOMAIN"
echo "  (pode demorar 1-2 minutos para o certificado SSL ser emitido)"
echo ""
echo "  Ver logs:  npm run prod:logs"
echo "  Parar:     npm run prod:down"
