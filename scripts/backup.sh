#!/bin/bash
# Backup da base de dados PostgreSQL
# Uso local:      ./scripts/backup.sh
# Uso em Docker:  chamado pelo serviço backup no docker-compose.prod.yml

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/infra/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

# Variáveis de ligação (podem vir do ambiente Docker ou do .env local)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-redacao_hg}"
DB_USER="${DB_USER:-redacao}"
DB_PASS="${POSTGRES_PASSWORD:-}"

if [ -z "$DB_PASS" ] && [ -f "$ROOT/.env" ]; then
  source "$ROOT/.env"
  DB_PASS="$POSTGRES_PASSWORD"
fi

if [ -z "$DB_PASS" ]; then
  echo "✗ POSTGRES_PASSWORD não definida"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="redacao_hg_${TIMESTAMP}.sql.gz"
FILEPATH="$BACKUP_DIR/$FILENAME"

echo "▶ A fazer backup: $FILENAME"

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$FILEPATH"

SIZE=$(du -sh "$FILEPATH" | cut -f1)
echo "✔ Backup concluído: $FILEPATH ($SIZE)"

# Apagar backups com mais de KEEP_DAYS dias
DELETED=$(find "$BACKUP_DIR" -name "redacao_hg_*.sql.gz" -mtime "+$KEEP_DAYS" -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "✔ $DELETED backup(s) antigo(s) removido(s)"
fi

# Listar backups existentes
echo ""
echo "Backups disponíveis:"
ls -lh "$BACKUP_DIR"/redacao_hg_*.sql.gz 2>/dev/null || echo "  (nenhum)"
