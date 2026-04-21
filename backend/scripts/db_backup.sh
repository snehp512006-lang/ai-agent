#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-./scripts/backup.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

: "${MYSQL_HOST:?Missing MYSQL_HOST}"
: "${MYSQL_PORT:?Missing MYSQL_PORT}"
: "${MYSQL_DATABASE:?Missing MYSQL_DATABASE}"
: "${MYSQL_USER:?Missing MYSQL_USER}"
: "${MYSQL_PASSWORD:?Missing MYSQL_PASSWORD}"
: "${BACKUP_DIR:?Missing BACKUP_DIR}"

RETENTION_DAYS="${RETENTION_DAYS:-30}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${MYSQL_DATABASE}_${TS}.sql"

export MYSQL_PWD="$MYSQL_PASSWORD"

"$MYSQLDUMP_BIN" \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --triggers \
  --set-gtid-purged=OFF \
  "$MYSQL_DATABASE" > "$BACKUP_FILE"

find "$BACKUP_DIR" -type f -name "*.sql" -mtime "+$RETENTION_DAYS" -delete

echo "Backup completed: $BACKUP_FILE"
