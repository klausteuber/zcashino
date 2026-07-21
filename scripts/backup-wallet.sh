#!/usr/bin/env bash
# backup-wallet.sh — Encrypt a recoverable wallet backup.
# Schedule: Weekly (e.g., Sunday 4am UTC)
# Cron: 0 4 * * 0 /opt/zcashino/scripts/backup-wallet.sh
#
# Zallet: backs up wallet.db plus encryption-identity.txt together.
# Legacy zcashd/testnet: backs up wallet.dat.

set -euo pipefail
umask 077

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
cd "$PROJECT_DIR"

BACKEND="zcashd"
if compose config --services 2>/dev/null | grep -qx 'zallet'; then
  BACKEND="zallet"
fi

SERVICE_WAS_RUNNING=false
if compose ps "$BACKEND" --status running -q 2>/dev/null | grep -q .; then
  SERVICE_WAS_RUNNING=true
fi

restart_wallet_if_needed() {
  if [[ "$SERVICE_WAS_RUNNING" == "true" ]]; then
    echo "[$(date -u)] Restarting ${BACKEND}..."
    compose start "$BACKEND" >/dev/null
  fi
}

trap restart_wallet_if_needed EXIT

echo "[$(date -u)] Starting ${BACKEND} wallet backup..."
if [[ "$SERVICE_WAS_RUNNING" == "true" ]]; then
  echo "[$(date -u)] Stopping ${BACKEND} for a consistent copy..."
  compose stop "$BACKEND" >/dev/null
else
  echo "[$(date -u)] ${BACKEND} is not running; backing up its current wallet files"
fi

VOLUME_CANDIDATES=()
if [[ -n "${ZCASH_VOLUME_NAME:-}" && "$BACKEND" == "zcashd" ]]; then
  VOLUME_CANDIDATES+=("$ZCASH_VOLUME_NAME")
fi
if [[ -n "${ZALLET_VOLUME_NAME:-}" && "$BACKEND" == "zallet" ]]; then
  VOLUME_CANDIDATES+=("$ZALLET_VOLUME_NAME")
fi
if [[ -n "$COMPOSE_PROJECT_NAME" ]]; then
  if [[ "$BACKEND" == "zallet" ]]; then
    VOLUME_CANDIDATES+=("${COMPOSE_PROJECT_NAME}_zallet-mainnet-data")
  else
    VOLUME_CANDIDATES+=(
      "${COMPOSE_PROJECT_NAME}_zcash-mainnet-data"
      "${COMPOSE_PROJECT_NAME}_zcash-data"
    )
  fi
fi
if [[ "$BACKEND" == "zallet" ]]; then
  VOLUME_CANDIDATES+=("mainnet_zallet-mainnet-data" "zcashino_zallet-mainnet-data")
else
  VOLUME_CANDIDATES+=(
    "mainnet_zcash-mainnet-data"
    "zcashino_zcash-mainnet-data"
    "zcashino_zcash-data"
  )
fi

VOLUME_PATH=""
for volume_name in "${VOLUME_CANDIDATES[@]}"; do
  VOLUME_PATH=$(docker volume inspect "$volume_name" --format '{{ .Mountpoint }}' 2>/dev/null || true)
  if [[ -n "$VOLUME_PATH" ]]; then
    break
  fi
done

if [[ -z "$VOLUME_PATH" ]]; then
  alert "Wallet backup FAILED: Cannot find ${BACKEND} wallet volume"
  exit 1
fi

if [[ "$BACKEND" == "zallet" ]]; then
  for required_file in wallet.db encryption-identity.txt; do
    if [[ ! -f "${VOLUME_PATH}/${required_file}" ]]; then
      alert "Wallet backup FAILED: Zallet ${required_file} is missing"
      exit 1
    fi
  done
  BACKUP_NAME="zallet-wallet-${TIMESTAMP}.tar.gpg"
  echo "[$(date -u)] Encrypting Zallet wallet database and identity..."
  tar -C "$VOLUME_PATH" -cf - wallet.db encryption-identity.txt |
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --pinentry-mode loopback \
      --passphrase "$BACKUP_PASSPHRASE" \
      --output "${BACKUP_DIR}/${BACKUP_NAME}"
else
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
  BACKUP_NAME="wallet-${TIMESTAMP}.dat.gpg"
  echo "[$(date -u)] Encrypting wallet.dat..."
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --pinentry-mode loopback \
    --passphrase "$BACKUP_PASSPHRASE" \
    --output "${BACKUP_DIR}/${BACKUP_NAME}" \
    "$WALLET_FILE"
fi

restart_wallet_if_needed
trap - EXIT

BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
BACKUP_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null || echo "0")
if [[ "$BACKUP_SIZE" -lt 100 ]]; then
  alert "Wallet backup WARNING: Backup file suspiciously small (${BACKUP_SIZE} bytes)"
  exit 1
fi

cd "$BACKUP_DIR"
shopt -s nullglob
BACKUP_FILES=(wallet-*.dat.gpg zallet-wallet-*.tar.gpg)
if [[ "${#BACKUP_FILES[@]}" -gt "$KEEP_COUNT" ]]; then
  # shellcheck disable=SC2012
  ls -1t "${BACKUP_FILES[@]}" | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -f
fi

BACKUP_COUNT=$(find . -maxdepth 1 -type f \( -name 'wallet-*.dat.gpg' -o -name 'zallet-wallet-*.tar.gpg' \) | wc -l)
echo "[$(date -u)] Wallet backup complete: ${BACKUP_NAME} (${BACKUP_SIZE} bytes, ${BACKUP_COUNT} backups kept)"
alert "Wallet backup OK: ${BACKUP_NAME} (${BACKUP_SIZE} bytes)"
