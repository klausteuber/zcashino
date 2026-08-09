#!/usr/bin/env bash
# check-node.sh — Monitor the configured Zcash node and wallet backend
# Schedule: Every 5 minutes
# Cron: */5 * * * * /opt/zcashino/scripts/check-node.sh
#
# Alerts if node is not synced or unreachable.
#
# Alert hygiene:
#   - Repeats of the same alert class (NODE DOWN / NODE ERROR / NODE SYNCING /
#     NODE STALE) are suppressed for NODE_ALERT_COOLDOWN_SECONDS (default 1800)
#     so an ongoing incident pages every 30 minutes, not every cron run.
#   - A single "NODE OK" recovery message is sent when a check passes after a
#     previously alerted incident.
#   - Startup windows (container uptime < NODE_STARTUP_GRACE_SECONDS) never
#     produce sync/RPC alerts — a freshly (re)started wallet legitimately
#     reports empty scan state before its scanner has loaded.

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
NODE_ALERT_STATE_FILE="${NODE_ALERT_STATE_FILE:-${PROJECT_DIR}/.node-monitor-alerts}"
NODE_ALERT_COOLDOWN_SECONDS="${NODE_ALERT_COOLDOWN_SECONDS:-1800}"
NODE_SYNC_LAG_TOLERANCE="${NODE_SYNC_LAG_TOLERANCE:-2}"

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

ALERTED=0

# Send an alert unless the same class fired within the cooldown window.
# Class = message text before the first ':', so changing block heights or
# diagnostics in the body do not defeat the dedup.
alert() {
  local message="$1"
  local class="${message%%:*}"
  local now last=""
  now=$(date +%s)
  ALERTED=1
  if [[ "$NODE_ALERT_COOLDOWN_SECONDS" -gt 0 && -f "$NODE_ALERT_STATE_FILE" ]]; then
    last=$(awk -F'|' -v c="$class" '$1 == c { ts = $2 } END { print ts }' "$NODE_ALERT_STATE_FILE" 2>/dev/null || true)
    if [[ -n "$last" && $((now - last)) -lt "$NODE_ALERT_COOLDOWN_SECONDS" ]]; then
      echo "[$(date -u)] Alert suppressed (class '${class}' sent $((now - last))s ago, cooldown ${NODE_ALERT_COOLDOWN_SECONDS}s): ${message}"
      return 0
    fi
  fi
  {
    if [[ -f "$NODE_ALERT_STATE_FILE" ]]; then
      awk -F'|' -v c="$class" '$1 != c' "$NODE_ALERT_STATE_FILE" 2>/dev/null || true
    fi
    printf '%s|%s\n' "$class" "$now"
  } > "${NODE_ALERT_STATE_FILE}.tmp"
  mv "${NODE_ALERT_STATE_FILE}.tmp" "$NODE_ALERT_STATE_FILE"
  "${SCRIPT_DIR}/send-alert.sh" "$message" || true
}

# After a fully healthy check, send one recovery message if a prior run alerted.
mark_healthy() {
  if [[ "$ALERTED" -eq 0 && -f "$NODE_ALERT_STATE_FILE" ]]; then
    rm -f "$NODE_ALERT_STATE_FILE"
    "${SCRIPT_DIR}/send-alert.sh" "NODE OK: $1" || true
  fi
}

container_uptime_seconds() {
  local container_id="$1"
  local started_at
  started_at=$(docker inspect --format '{{.State.StartedAt}}' "$container_id" 2>/dev/null || true)
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

cd "$PROJECT_DIR"

if [[ -f "$NODE_MONITOR_PAUSE_FILE" ]]; then
  echo "[$(date -u)] Node check skipped: pause file present at ${NODE_MONITOR_PAUSE_FILE}"
  exit 0
fi

if [[ "$SUPPRESS_NODE_ALERTS_DURING_KILL_SWITCH" == "true" && "${KILL_SWITCH:-}" == "true" ]]; then
  echo "[$(date -u)] Node check skipped: KILL_SWITCH=true"
  exit 0
fi

# Zebra + Zallet replaced zcashd at its mandatory end-of-support height.
# Production must never fall through to the legacy zcashd check just because a
# transient `docker compose config` probe fails.
WALLET_BACKEND="${NODE_WALLET_BACKEND:-}"
if [[ -z "$WALLET_BACKEND" && "$COMPOSE_FILE" == "docker-compose.mainnet.yml" ]]; then
  WALLET_BACKEND="zallet"
elif [[ -z "$WALLET_BACKEND" ]]; then
  if compose config --services 2>/dev/null | grep -qx 'zallet'; then
    WALLET_BACKEND="zallet"
  else
    WALLET_BACKEND="zcashd"
  fi
fi

# Zallet's wallet status covers both the backing Zebra tip and the wallet scan.
if [[ "$WALLET_BACKEND" == "zallet" ]]; then
  PS_ERROR_FILE=$(mktemp)
  PS_STATUS=0
  CONTAINER_ID=$(compose ps zallet --status running -q 2>"$PS_ERROR_FILE" | head -n 1) || PS_STATUS=$?
  PS_ERROR=$(<"$PS_ERROR_FILE")
  rm -f "$PS_ERROR_FILE"

  # A failing `docker compose ps` probe is a docker/daemon problem, not proof
  # the wallet is down (see notes/gotchas.md 2026-07-21) — its own alert class.
  if [[ "$PS_STATUS" -ne 0 ]]; then
    CLEAN_ERROR=$(printf '%s' "$PS_ERROR" | tr '\n' ' ' | cut -c1-180)
    alert "NODE ERROR: docker compose ps failed for Zallet (${CLEAN_ERROR:-unknown error})"
    exit 1
  fi

  if [[ -z "$CONTAINER_ID" ]]; then
    # Include the stopped/restarting container's state and last log lines so
    # the alert carries the reason (exit code, OOM kill, crash loop).
    DIAG=""
    LAST_LOG=""
    ANY_ID=$(compose ps zallet --all -q 2>/dev/null | head -n 1 || true)
    if [[ -n "$ANY_ID" ]]; then
      DIAG=$(docker inspect --format 'state={{.State.Status}} exit={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}} finishedAt={{.State.FinishedAt}}' "$ANY_ID" 2>/dev/null || true)
      LAST_LOG=$({ docker logs --tail 5 "$ANY_ID" 2>&1 || true; } | tr '\n' ' ' | cut -c1-200)
    fi
    alert "NODE DOWN: Zallet wallet container is not running${DIAG:+ [${DIAG}]}${LAST_LOG:+ — last log: ${LAST_LOG}}"
    exit 1
  fi

  UPTIME_SECONDS=$(container_uptime_seconds "$CONTAINER_ID")

  RPC_STATUS=0
  RPC_ERROR_FILE=$(mktemp)
  WALLET_STATUS=$(compose exec -T zallet zallet -d /var/lib/zallet rpc getwalletstatus 2>"$RPC_ERROR_FILE") || RPC_STATUS=$?
  WALLET_ERROR=$(<"$RPC_ERROR_FILE")
  rm -f "$RPC_ERROR_FILE"
  if [[ "$RPC_STATUS" -ne 0 || -z "$WALLET_STATUS" ]]; then
    CLEAN_ERROR=$(printf '%s %s' "$WALLET_STATUS" "$WALLET_ERROR" | tr '\n' ' ' | cut -c1-180)
    if [[ "$UPTIME_SECONDS" -gt 0 && "$UPTIME_SECONDS" -lt "$NODE_STARTUP_GRACE_SECONDS" ]]; then
      echo "[$(date -u)] Node check skipped: Zallet still starting (${UPTIME_SECONDS}s/${NODE_STARTUP_GRACE_SECONDS}s): ${CLEAN_ERROR}"
      exit 0
    fi
    alert "NODE ERROR: Cannot reach Zallet (${CLEAN_ERROR:-RPC unresponsive})"
    exit 1
  fi

  NODE_HEIGHT=$(echo "$WALLET_STATUS" | jq -r '.node_tip.height // 0')
  WALLET_HEIGHT=$(echo "$WALLET_STATUS" | jq -r '.wallet_tip.height // 0')
  FULLY_SYNCED_HEIGHT=$(echo "$WALLET_STATUS" | jq -r '.fully_synced_height // 0')
  SYNC_REMAINING=$(echo "$WALLET_STATUS" | jq -r '.sync_work_remaining // empty')
  SYNC_PROGRESS=$(echo "$WALLET_STATUS" | jq -r '.sync_work_remaining.progress // empty')

  # Zero tips right after a (re)start mean the scanner has not loaded yet —
  # that is startup, not a sync regression. Beyond the grace window a zero is
  # real trouble: wallet DB empty/rebuilding, or the indexer cut off from Zebra.
  if [[ "$NODE_HEIGHT" -eq 0 || "$WALLET_HEIGHT" -eq 0 || "$FULLY_SYNCED_HEIGHT" -eq 0 ]]; then
    if [[ "$UPTIME_SECONDS" -gt 0 && "$UPTIME_SECONDS" -lt "$NODE_STARTUP_GRACE_SECONDS" ]]; then
      echo "[$(date -u)] Node check skipped: Zallet scan state not ready while starting (${UPTIME_SECONDS}s/${NODE_STARTUP_GRACE_SECONDS}s): Zebra ${NODE_HEIGHT}, wallet ${WALLET_HEIGHT}, fully scanned ${FULLY_SYNCED_HEIGHT}"
      exit 0
    fi
    if [[ "$NODE_HEIGHT" -eq 0 ]]; then
      alert "NODE ERROR: Zallet reports Zebra tip 0 after ${UPTIME_SECONDS}s uptime — indexer may be disconnected from Zebra"
    else
      alert "NODE ERROR: Zallet wallet scan is at ${WALLET_HEIGHT} (fully scanned ${FULLY_SYNCED_HEIGHT}) while Zebra is at ${NODE_HEIGHT} after ${UPTIME_SECONDS}s uptime — wallet DB may be empty or rebuilding"
    fi
    exit 1
  fi

  WALLET_LAG=$((NODE_HEIGHT - WALLET_HEIGHT))
  SCAN_LAG=$((WALLET_HEIGHT - FULLY_SYNCED_HEIGHT))
  if [[ "$WALLET_LAG" -gt "$NODE_SYNC_LAG_TOLERANCE" || "$SCAN_LAG" -gt "$NODE_SYNC_LAG_TOLERANCE" || -n "$SYNC_REMAINING" ]]; then
    # A recently (re)started wallet catching up to the tip is expected — the
    # weekly backup stop/start and every deploy produce this window.
    if [[ "$UPTIME_SECONDS" -gt 0 && "$UPTIME_SECONDS" -lt "$NODE_STARTUP_GRACE_SECONDS" ]]; then
      echo "[$(date -u)] Node check skipped: Zallet catching up after restart (${UPTIME_SECONDS}s/${NODE_STARTUP_GRACE_SECONDS}s): Zebra ${NODE_HEIGHT}, wallet ${WALLET_HEIGHT}, fully scanned ${FULLY_SYNCED_HEIGHT}"
      exit 0
    fi
    alert "NODE SYNCING: Zebra ${NODE_HEIGHT}, Zallet wallet ${WALLET_HEIGHT}, fully scanned ${FULLY_SYNCED_HEIGHT}${SYNC_PROGRESS:+, progress ${SYNC_PROGRESS}}"
    exit 0
  fi

  echo "[$(date -u)] Node check: Zebra and Zallet synced at block ${NODE_HEIGHT}"
  mark_healthy "Zebra and Zallet synced at block ${NODE_HEIGHT}"
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

is_startup_rpc_error() {
  local output="$1"
  grep -Eiq 'Loading block index|Loading wallet|Verifying wallet|Rescanning|Importing blocks|Rewinding blocks|Verifying blocks' <<<"$output"
}

# Get blockchain info via zcash-cli inside the container
RPC_STATUS=0
BLOCKCHAIN_INFO=$(zcash_cli getblockchaininfo 2>&1) || RPC_STATUS=$?

if [[ "$RPC_STATUS" -ne 0 || -z "$BLOCKCHAIN_INFO" ]]; then
  UPTIME_SECONDS=$(container_uptime_seconds "$CONTAINER_ID")
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
mark_healthy "zcashd synced at block ${BLOCKS}/${HEADERS}"
