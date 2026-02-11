#!/usr/bin/env bash
# check-disk.sh — Monitor disk usage
# Schedule: Hourly
# Cron: 0 * * * * /opt/zcashino/scripts/check-disk.sh
#
# Alerts if disk usage exceeds threshold

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.monitoring"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Alert threshold (default: 85%)
DISK_THRESHOLD="${DISK_THRESHOLD:-85}"

alert() {
  "${SCRIPT_DIR}/send-alert.sh" "$1" || true
}

# Check root partition usage
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

if [[ "$USAGE" -ge "$DISK_THRESHOLD" ]]; then
  # Get breakdown of largest directories
  TOP_DIRS=$(du -sh /opt/zcashino/ /var/lib/docker/ /var/log/ 2>/dev/null | sort -rh | head -5)
  alert "DISK WARNING: ${USAGE}% used (threshold: ${DISK_THRESHOLD}%)

Top directories:
\`\`\`
${TOP_DIRS}
\`\`\`"
fi

echo "[$(date -u)] Disk check: ${USAGE}% used"
