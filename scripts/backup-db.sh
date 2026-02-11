#!/usr/bin/env bash
# backup-db.sh — Back up SQLite database
# Schedule: Daily (e.g., 3am UTC)
# Cron: 0 3 * * * /opt/zcashino/scripts/backup-db.sh
#
# 1. Copies the SQLite database file
# 2. Compresses with gzip
# 3. Keeps last 30 daily backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${PROJECT_DIR}/.env.monitoring"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

DB_PATH="${DB_PATH:-/opt/zcashino/data/zcashino.db}"
BACKUP_DIR="${DB_BACKUP_DIR:-/opt/zcashino/backups/db}"
KEEP_DAYS=30
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
BACKUP_NAME="zcashino-${TIMESTAMP}.db.gz"

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  alert "DB backup FAILED: Database not found at ${DB_PATH}"
  exit 1
fi

echo "[$(date -u)] Starting database backup..."

# Use sqlite3 .backup for consistency (if available), otherwise copy
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/zcashino-${TIMESTAMP}.db'"
  gzip "${BACKUP_DIR}/zcashino-${TIMESTAMP}.db"
else
  cp "$DB_PATH" "${BACKUP_DIR}/zcashino-${TIMESTAMP}.db"
  gzip "${BACKUP_DIR}/zcashino-${TIMESTAMP}.db"
fi

# Verify
BACKUP_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null || echo "0")
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
  alert "DB backup WARNING: Backup suspiciously small (${BACKUP_SIZE} bytes)"
  exit 1
fi

# Rotate old backups
find "$BACKUP_DIR" -name "zcashino-*.db.gz" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

BACKUP_COUNT=$(find "$BACKUP_DIR" -name "zcashino-*.db.gz" | wc -l)
echo "[$(date -u)] Database backup complete: ${BACKUP_NAME} (${BACKUP_SIZE} bytes, ${BACKUP_COUNT} backups kept)"
