#!/usr/bin/env bash
# backup-wallet.sh — Back up zcashd wallet.dat
# Schedule: Weekly (e.g., Sunday 4am UTC)
# Cron: 0 4 * * 0 /opt/zcashino/scripts/backup-wallet.sh
#
# 1. Stops zcashd container (clean shutdown ensures wallet consistency)
# 2. Copies wallet.dat from Docker volume
# 3. Encrypts with GPG (symmetric AES-256)
# 4. Restarts zcashd
# 5. Keeps last 4 backups, deletes older
#
# Required env vars:
#   BACKUP_PASSPHRASE — GPG symmetric encryption passphrase
#   BACKUP_DIR        — Where to store backups (default: /opt/zcashino/backups/wallet)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${PROJECT_DIR}/.env.monitoring"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zcashino/backups/wallet}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
KEEP_COUNT=4
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
BACKUP_NAME="wallet-${TIMESTAMP}.dat.gpg"

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

if [[ -z "$BACKUP_PASSPHRASE" ]]; then
  alert "Wallet backup FAILED: BACKUP_PASSPHRASE not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date -u)] Starting wallet backup..."

# Stop zcashd for clean wallet copy
echo "[$(date -u)] Stopping zcashd..."
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" stop zcashd

# Find wallet.dat in the Docker volume
VOLUME_PATH=$(docker volume inspect zcashino_zcash-data --format '{{ .Mountpoint }}' 2>/dev/null || \
  docker volume inspect zcashino_zcash-mainnet-data --format '{{ .Mountpoint }}' 2>/dev/null || \
  echo "")

if [[ -z "$VOLUME_PATH" ]]; then
  docker compose -f "$COMPOSE_FILE" start zcashd
  alert "Wallet backup FAILED: Cannot find zcash data volume"
  exit 1
fi

WALLET_FILE="${VOLUME_PATH}/.zcash/wallet.dat"
if [[ ! -f "$WALLET_FILE" ]]; then
  # Try testnet location
  WALLET_FILE="${VOLUME_PATH}/.zcash/testnet3/wallet.dat"
fi

if [[ ! -f "$WALLET_FILE" ]]; then
  docker compose -f "$COMPOSE_FILE" start zcashd
  alert "Wallet backup FAILED: wallet.dat not found at expected paths"
  exit 1
fi

# Copy and encrypt
echo "[$(date -u)] Encrypting wallet.dat..."
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase "$BACKUP_PASSPHRASE" \
  --output "${BACKUP_DIR}/${BACKUP_NAME}" \
  "$WALLET_FILE"

# Restart zcashd
echo "[$(date -u)] Restarting zcashd..."
docker compose -f "$COMPOSE_FILE" start zcashd

# Verify backup exists and has content
BACKUP_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}" 2>/dev/null || echo "0")
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
  alert "Wallet backup WARNING: Backup file suspiciously small (${BACKUP_SIZE} bytes)"
  exit 1
fi

# Rotate old backups (keep last N)
cd "$BACKUP_DIR"
# shellcheck disable=SC2012
ls -1t wallet-*.dat.gpg 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -f

BACKUP_COUNT=$(ls -1 wallet-*.dat.gpg 2>/dev/null | wc -l)
echo "[$(date -u)] Wallet backup complete: ${BACKUP_NAME} (${BACKUP_SIZE} bytes, ${BACKUP_COUNT} backups kept)"
alert "Wallet backup OK: ${BACKUP_NAME} (${BACKUP_SIZE} bytes)"
