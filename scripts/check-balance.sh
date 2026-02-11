#!/usr/bin/env bash
# check-balance.sh — Monitor house wallet balance
# Schedule: Every 15 minutes
# Cron: */15 * * * * /opt/zcashino/scripts/check-balance.sh
#
# Alerts if house balance drops below threshold

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${PROJECT_DIR}/.env.monitoring"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Minimum balance threshold in ZEC (default: 0.5 ZEC)
MIN_BALANCE="${MIN_HOUSE_BALANCE:-0.5}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

# Query health endpoint which now includes house balance
RESPONSE=$(curl -s --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "")

if [[ -z "$RESPONSE" ]]; then
  alert "Balance check FAILED: Health endpoint unreachable"
  exit 1
fi

# Extract house balance (requires jq)
if ! command -v jq &> /dev/null; then
  echo "[$(date -u)] jq not installed, cannot parse health response"
  exit 1
fi

SEVERITY=$(echo "$RESPONSE" | jq -r '.severity // "unknown"')
HOUSE_BALANCE=$(echo "$RESPONSE" | jq -r '.houseBalance.confirmed // "0"')
PENDING_WITHDRAWALS=$(echo "$RESPONSE" | jq -r '.pendingWithdrawals // "0"')

# Check if balance is below threshold
if [[ "$HOUSE_BALANCE" != "null" ]] && (( $(echo "$HOUSE_BALANCE < $MIN_BALANCE" | bc -l 2>/dev/null || echo "0") )); then
  alert "LOW BALANCE: House wallet has ${HOUSE_BALANCE} ZEC (threshold: ${MIN_BALANCE} ZEC). Pending withdrawals: ${PENDING_WITHDRAWALS}"
fi

# Also alert on critical severity
if [[ "$SEVERITY" == "critical" ]]; then
  alert "CRITICAL: Health check reports critical severity. Response: $(echo "$RESPONSE" | jq -c '.')"
fi

echo "[$(date -u)] Balance check: ${HOUSE_BALANCE} ZEC, severity: ${SEVERITY}, pending withdrawals: ${PENDING_WITHDRAWALS}"
