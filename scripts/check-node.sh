#!/usr/bin/env bash
# check-node.sh — Monitor zcashd node sync status
# Schedule: Every 5 minutes
# Cron: */5 * * * * /opt/zcashino/scripts/check-node.sh
#
# Alerts if node is not synced or unreachable

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${PROJECT_DIR}/.env.monitoring"
ENV_MAINNET_FILE="${PROJECT_DIR}/.env.mainnet"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Load mainnet env so zcash-cli can authenticate (daemon uses rpcuser/rpcpassword, so no cookie exists).
if [[ -f "$ENV_MAINNET_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_MAINNET_FILE"
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"

# Production uses a dedicated env file + project name.
if [[ "$COMPOSE_FILE" == "docker-compose.mainnet.yml" ]]; then
  COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-.env.mainnet}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mainnet}"
fi

compose() {
  # Build args without relying on exported env vars.
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

# Max block age in seconds before alerting (default: 600 = 10 minutes)
MAX_BLOCK_AGE="${MAX_BLOCK_AGE:-600}"

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

cd "$PROJECT_DIR"

RPC_USER="${ZCASH_RPC_USER:-zcashrpc}"
RPC_PASSWORD="${ZCASH_RPC_PASSWORD:-}"

if [[ -z "$RPC_PASSWORD" ]]; then
  alert "NODE ERROR: ZCASH_RPC_PASSWORD not set (cannot auth zcash-cli)"
  exit 1
fi

zcash_cli() {
  compose exec -T zcashd zcash-cli \
    -rpcuser="$RPC_USER" \
    -rpcpassword="$RPC_PASSWORD" \
    "$@"
}

# Check if zcashd container is running
if ! compose ps zcashd --status running -q 2>/dev/null | grep -q .; then
  alert "NODE DOWN: zcashd container is not running"
  exit 1
fi

# Get blockchain info via zcash-cli inside the container
BLOCKCHAIN_INFO=$(zcash_cli getblockchaininfo 2>/dev/null || echo "")

if [[ -z "$BLOCKCHAIN_INFO" ]]; then
  alert "NODE ERROR: Cannot reach zcash-cli (RPC unresponsive)"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "[$(date -u)] jq not installed, cannot parse response"
  exit 1
fi

BLOCKS=$(echo "$BLOCKCHAIN_INFO" | jq -r '.blocks // 0')
HEADERS=$(echo "$BLOCKCHAIN_INFO" | jq -r '.headers // 0')
PROGRESS=$(echo "$BLOCKCHAIN_INFO" | jq -r '.verificationprogress // 0')

# Check if synced (progress > 99.99%)
IS_SYNCED=$(echo "$PROGRESS > 0.9999" | bc -l 2>/dev/null || echo "0")
if [[ "$IS_SYNCED" != "1" ]]; then
  PROGRESS_PCT=$(echo "$PROGRESS * 100" | bc -l 2>/dev/null || echo "?")
  alert "NODE SYNCING: zcashd at ${PROGRESS_PCT}% (block ${BLOCKS}/${HEADERS})"
fi

# Check block age (get latest block time)
if [[ "$BLOCKS" -gt 0 ]]; then
  BEST_HASH=$(echo "$BLOCKCHAIN_INFO" | jq -r '.bestblockhash // ""')
  if [[ -n "$BEST_HASH" ]]; then
    BLOCK_TIME=$(zcash_cli getblock "$BEST_HASH" 2>/dev/null | jq -r '.time // 0')
    NOW=$(date +%s)
    BLOCK_AGE=$((NOW - BLOCK_TIME))
    if [[ "$BLOCK_AGE" -gt "$MAX_BLOCK_AGE" ]]; then
      alert "NODE STALE: Latest block is ${BLOCK_AGE}s old (threshold: ${MAX_BLOCK_AGE}s). Block ${BLOCKS}."
    fi
  fi
fi

echo "[$(date -u)] Node check: block ${BLOCKS}/${HEADERS}, progress $(echo "$PROGRESS * 100" | bc -l 2>/dev/null || echo "?")%"
