#!/usr/bin/env bash
# send-alert.sh — Send alert via Telegram
# Shared by all monitoring scripts
#
# Required env vars (set in /opt/zcashino/.env.monitoring):
#   TELEGRAM_BOT_TOKEN — Telegram bot API token
#   TELEGRAM_CHAT_ID   — Telegram chat/group ID
#
# Usage: ./send-alert.sh "Alert message here"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.monitoring"

# Load monitoring config if exists
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
HOSTNAME="${HOSTNAME:-$(hostname)}"

if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]]; then
  echo "[ALERT] Telegram not configured. Message: $1" >&2
  exit 0
fi

MESSAGE="🎭 *CypherJester Alert*
Host: \`${HOSTNAME}\`
Time: $(date -u '+%Y-%m-%d %H:%M UTC')

$1"

curl -s -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  -d text="$MESSAGE" \
  -d parse_mode="Markdown" \
  > /dev/null 2>&1 || echo "[ALERT] Failed to send Telegram message" >&2
