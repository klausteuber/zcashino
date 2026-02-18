#!/usr/bin/env bash
#
# Telegram webhook setup for the admin bot endpoint (curl-based).
#
# Usage:
#   ./scripts/telegram-set-webhook.sh --base-url https://cypherjester.com
#   ./scripts/telegram-set-webhook.sh --delete
#
# Reads env from:
#   - .env.mainnet (if present)
#   - existing environment variables
#
# Required env:
#   TELEGRAM_BOT_TOKEN
#   TELEGRAM_WEBHOOK_SECRET
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
ENV_MAINNET_FILE="${PROJECT_DIR}/.env.mainnet"

if [[ -f "$ENV_MAINNET_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_MAINNET_FILE"
fi

BASE_URL=""
DELETE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --delete)
      DELETE=true
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"

if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN" >&2
  exit 2
fi

if [[ -z "$TELEGRAM_WEBHOOK_SECRET" ]]; then
  echo "Missing TELEGRAM_WEBHOOK_SECRET" >&2
  exit 2
fi

if [[ "$DELETE" == "true" ]]; then
  RESP="$(curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook" \
    -H "Content-Type: application/json" \
    -d '{"drop_pending_updates":true}')"
else
  if [[ -z "$BASE_URL" ]]; then
    echo "Missing --base-url" >&2
    exit 2
  fi

  # Telegram requires HTTPS.
  if [[ "$BASE_URL" != https://* ]]; then
    echo "Telegram requires an https:// webhook URL. Got: $BASE_URL" >&2
    exit 2
  fi

  BASE_URL="${BASE_URL%/}"
  WEBHOOK_URL="${BASE_URL}/api/telegram/webhook"

  # NOTE: secret_token is sent to Telegram; Telegram will send it back on every webhook request
  # via X-Telegram-Bot-Api-Secret-Token so we can validate authenticity.
  BODY="$(printf '{"url":"%s","secret_token":"%s","allowed_updates":["message"]}' "$WEBHOOK_URL" "$TELEGRAM_WEBHOOK_SECRET")"

  RESP="$(curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "$BODY")"
fi

if command -v jq >/dev/null 2>&1; then
  echo "$RESP" | jq .
else
  echo "$RESP"
fi

