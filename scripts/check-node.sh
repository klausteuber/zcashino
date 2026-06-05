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
NODE_MONITOR_PAUSE_FILE="${NODE_MONITOR_PAUSE_FILE:-${PROJECT_DIR}/.node-monitor-paused}"
NODE_STARTUP_GRACE_SECONDS="${NODE_STARTUP_GRACE_SECONDS:-1800}"
SUPPRESS_NODE_ALERTS_DURING_KILL_SWITCH="${SUPPRESS_NODE_ALERTS_DURING_KILL_SWITCH:-true}"

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

if [[ -f "$NODE_MONITOR_PAUSE_FILE" ]]; then
  echo "[$(date -u)] Node check skipped: pause file present at ${NODE_MONITOR_PAUSE_FILE}"
  exit 0
fi

if [[ "$SUPPRESS_NODE_ALERTS_DURING_KILL_SWITCH" == "true" && "${KILL_SWITCH:-}" == "true" ]]; then
  echo "[$(date -u)] Node check skipped: KILL_SWITCH=true"
  exit 0
fi

RPC_USER="${ZCASH_RPC_USER:-zcashrpc}"
RPC_PASSWORD="${ZCASH_RPC_PASSWORD:-}"
ZCASH_CLI_DATADIR="${ZCASH_CLI_DATADIR:-/srv/zcashd/.zcash}"

if [[ -z "$RPC_PASSWORD" ]]; then
  alert "NODE ERROR: ZCASH_RPC_PASSWORD not set (cannot auth zcash-cli)"
  exit 1
fi

zcash_cli() {
  compose exec -T zcashd zcash-cli \
    "-datadir=${ZCASH_CLI_DATADIR}" \
    -rpcuser="$RPC_USER" \
    -rpcpassword="$RPC_PASSWORD" \
    "$@"
}

# Check if zcashd container is running
CONTAINER_ID=$(compose ps zcashd --status running -q 2>/dev/null | head -n 1 || true)
if [[ -z "$CONTAINER_ID" ]]; then
  alert "NODE DOWN: zcashd container is not running"
  exit 1
fi

container_uptime_seconds() {
  local started_at
  started_at=$(docker inspect --format '{{.State.StartedAt}}' "$CONTAINER_ID" 2>/dev/null || true)
  if [[ -z "$started_at" ]]; then
    echo "0"
    return
  fi

  local started_epoch now_epoch
  started_epoch=$(
    date -d "$started_at" +%s 2>/dev/null ||
      date -j -u -f "%Y-%m-%dT%H:%M:%S" "${started_at%%.*}" +%s 2>/dev/null ||
      echo "0"
  )
  now_epoch=$(date +%s)
  if [[ "$started_epoch" -le 0 || "$now_epoch" -lt "$started_epoch" ]]; then
    echo "0"
    return
  fi

  echo $((now_epoch - started_epoch))
}

is_startup_rpc_error() {
  local output="$1"
  grep -Eiq 'Loading block index|Loading wallet|Verifying wallet|Rescanning|Importing blocks|Rewinding blocks|Verifying blocks' <<<"$output"
}

# Get blockchain info via zcash-cli inside the container
RPC_STATUS=0
BLOCKCHAIN_INFO=$(zcash_cli getblockchaininfo 2>&1) || RPC_STATUS=$?

if [[ "$RPC_STATUS" -ne 0 || -z "$BLOCKCHAIN_INFO" ]]; then
  UPTIME_SECONDS=$(container_uptime_seconds)
  if is_startup_rpc_error "$BLOCKCHAIN_INFO" && [[ "$UPTIME_SECONDS" -lt "$NODE_STARTUP_GRACE_SECONDS" ]]; then
    CLEAN_ERROR=$(printf '%s' "$BLOCKCHAIN_INFO" | tr '\n' ' ' | cut -c1-180)
    echo "[$(date -u)] Node check skipped: zcashd still starting (${UPTIME_SECONDS}s/${NODE_STARTUP_GRACE_SECONDS}s): ${CLEAN_ERROR}"
    exit 0
  fi

  CLEAN_ERROR=$(printf '%s' "$BLOCKCHAIN_INFO" | tr '\n' ' ' | cut -c1-180)
  if [[ -z "$CLEAN_ERROR" ]]; then
    CLEAN_ERROR="RPC unresponsive"
  fi
  alert "NODE ERROR: Cannot reach zcash-cli (${CLEAN_ERROR})"
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
