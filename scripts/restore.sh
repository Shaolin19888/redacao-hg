#!/bin/bash
# Restaurar backup da base de dados
# Uso: ./scripts/restore.sh infra/backups/redacao_hg_20260628_120000.sql.gz

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BACKUP_FILE="$1"
if [ -z "$BACKUP_FILE" ]; then
  echo "Uso: ./scripts/restore.sh <ficheiro_backup>"
  echo ""
  echo "Backups disponíveis:"
  ls -lh "$ROOT/infra/backups"/redacao_hg_*.sql.gz 2>/dev/null || echo "  (nenhum)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  # Tentar path relativo à raiz do projecto
  BACKUP_FILE="$ROOT/$BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "✗ Ficheiro não encontrado: $BACKUP_FILE"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-redacao_hg}"
DB_USER="${DB_USER:-redacao}"
DB_PASS="${POSTGRES_PASSWORD:-}"

if [ -z "$DB_PASS" ] && [ -f "$ROOT/.env" ]; then
  source "$ROOT/.env"
  DB_PASS="$POSTGRES_PASSWORD"
fi

echo "⚠️  ATENÇÃO: Isto vai SUBSTITUIR todos os dados em '$DB_NAME'."
echo "   Ficheiro: $BACKUP_FILE"
echo ""
read -p "Tens a certeza? (escreve 'sim' para confirmar): " CONFIRM

if [ "$CONFIRM" != "sim" ]; then
  echo "Operação cancelada."
  exit 0
fi

echo "▶ A restaurar..."

gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASS" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME"

echo "✔ Restauro concluído."
