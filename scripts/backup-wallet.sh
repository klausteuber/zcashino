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
ENV_MAINNET_FILE="${PROJECT_DIR}/.env.mainnet"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if [[ -f "$ENV_MAINNET_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_MAINNET_FILE"
fi

BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zcashino/backups/wallet}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"
KEEP_COUNT="${BACKUP_KEEP_COUNT:-4}"
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
BACKUP_NAME="wallet-${TIMESTAMP}.dat.gpg"

# Production uses a dedicated env file + project name.
if [[ "$COMPOSE_FILE" == "docker-compose.mainnet.yml" ]]; then
  COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-.env.mainnet}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mainnet}"
fi

compose() {
  local args=()
  if [[ -n "$COMPOSE_ENV_FILE" ]]; then
    args+=(--env-file "$COMPOSE_ENV_FILE")
  fi
  if [[ -n "$COMPOSE_PROJECT_NAME" ]]; then
    args+=(-p "$COMPOSE_PROJECT_NAME")
  fi
  args+=(-f "$COMPOSE_FILE")
  docker compose "${args[@]}" "$@"
}

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

if [[ -z "$BACKUP_PASSPHRASE" ]]; then
  alert "Wallet backup FAILED: BACKUP_PASSPHRASE not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date -u)] Starting wallet backup..."

cd "$PROJECT_DIR"

ZCASHD_WAS_RUNNING=false
if compose ps zcashd --status running -q 2>/dev/null | grep -q .; then
  ZCASHD_WAS_RUNNING=true
fi

restart_zcashd_if_needed() {
  if [[ "$ZCASHD_WAS_RUNNING" == "true" ]]; then
    echo "[$(date -u)] Restarting zcashd..."
    compose start zcashd >/dev/null
  fi
}

trap restart_zcashd_if_needed EXIT

# Stop zcashd for clean wallet copy
if [[ "$ZCASHD_WAS_RUNNING" == "true" ]]; then
  echo "[$(date -u)] Stopping zcashd..."
  compose stop zcashd >/dev/null
else
  echo "[$(date -u)] zcashd is not running; backing up the current wallet file without restart"
fi

# Find wallet.dat in the Docker volume
VOLUME_CANDIDATES=()
if [[ -n "${ZCASH_VOLUME_NAME:-}" ]]; then
  VOLUME_CANDIDATES+=("$ZCASH_VOLUME_NAME")
fi
if [[ -n "$COMPOSE_PROJECT_NAME" ]]; then
  VOLUME_CANDIDATES+=(
    "${COMPOSE_PROJECT_NAME}_zcash-mainnet-data"
    "${COMPOSE_PROJECT_NAME}_zcash-data"
  )
fi
VOLUME_CANDIDATES+=(
  "mainnet_zcash-mainnet-data"
  "zcashino_zcash-mainnet-data"
  "zcashino_zcash-data"
)

VOLUME_PATH=""
for volume_name in "${VOLUME_CANDIDATES[@]}"; do
  VOLUME_PATH=$(docker volume inspect "$volume_name" --format '{{ .Mountpoint }}' 2>/dev/null || true)
  if [[ -n "$VOLUME_PATH" ]]; then
    break
  fi
done

if [[ -z "$VOLUME_PATH" ]]; then
  alert "Wallet backup FAILED: Cannot find zcash data volume"
  exit 1
fi

WALLET_FILE=""
for wallet_path in \
  "${VOLUME_PATH}/wallet.dat" \
  "${VOLUME_PATH}/.zcash/wallet.dat" \
  "${VOLUME_PATH}/testnet3/wallet.dat" \
  "${VOLUME_PATH}/.zcash/testnet3/wallet.dat"; do
  if [[ -f "$wallet_path" ]]; then
    WALLET_FILE="$wallet_path"
    break
  fi
done

if [[ -z "$WALLET_FILE" ]]; then
  alert "Wallet backup FAILED: wallet.dat not found at expected paths"
  exit 1
fi

# Copy and encrypt
echo "[$(date -u)] Encrypting wallet.dat..."
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --pinentry-mode loopback \
  --passphrase "$BACKUP_PASSPHRASE" \
  --output "${BACKUP_DIR}/${BACKUP_NAME}" \
  "$WALLET_FILE"

restart_zcashd_if_needed
trap - EXIT

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
