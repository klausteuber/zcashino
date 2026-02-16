#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# CypherJester Mainnet Cutover Script
# Run on VPS as root: bash /opt/zcashino/scripts/mainnet-cutover.sh
#
# PREREQUISITES:
#   1. Mainnet zcashd fully synced (verificationprogress ~1.0)
#   2. House wallet generated + HOUSE_ZADDR_MAINNET set in .env.mainnet
#   3. House wallet funded with initial ZEC
#   4. Wallet backup stored off-site
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_DIR="/opt/zcashino"
MAINNET_COMPOSE="docker compose -p mainnet -f docker-compose.mainnet.yml"
TESTNET_COMPOSE="docker compose"
RPC_PASS=$(grep ZCASH_RPC_PASSWORD "$COMPOSE_DIR/.env.mainnet" | cut -d= -f2)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "\n${YELLOW}═══ $1 ═══${NC}"; }

cd "$COMPOSE_DIR"

# ─────────────────────────────────────────────────────────────────────
step "1. Pre-flight checks"
# ─────────────────────────────────────────────────────────────────────

# Check mainnet zcashd is running
if ! docker ps --format '{{.Names}}' | grep -q mainnet-zcashd; then
  error "Mainnet zcashd is not running!"
  exit 1
fi
info "Mainnet zcashd container running"

# Check sync status
SYNC_INFO=$(docker exec mainnet-zcashd-1 zcash-cli \
  -rpcuser=zcashrpc -rpcpassword="$RPC_PASS" \
  getblockchaininfo 2>/dev/null)

BLOCKS=$(echo "$SYNC_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['blocks'])")
HEADERS=$(echo "$SYNC_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['headers'])")
PROGRESS=$(echo "$SYNC_INFO" | python3 -c "import sys,json; print(f'{json.load(sys.stdin)[\"verificationprogress\"]*100:.2f}')")

echo "  Blocks: $BLOCKS / $HEADERS  Progress: $PROGRESS%"

if (( HEADERS - BLOCKS > 10 )); then
  error "Mainnet zcashd is NOT fully synced ($BLOCKS / $HEADERS). Aborting."
  exit 1
fi
info "Mainnet zcashd is fully synced"

# Check .env.mainnet has house address
HOUSE_ADDR=$(grep HOUSE_ZADDR_MAINNET "$COMPOSE_DIR/.env.mainnet" | cut -d= -f2)
if [ -z "$HOUSE_ADDR" ] || [ "$HOUSE_ADDR" = "" ]; then
  error "HOUSE_ZADDR_MAINNET is not set in .env.mainnet"
  error "Generate it first: $MAINNET_COMPOSE exec zcashd zcash-cli z_getnewaccount"
  exit 1
fi
info "House z-address configured: ${HOUSE_ADDR:0:20}..."

# Check house balance
BALANCE=$(docker exec mainnet-zcashd-1 zcash-cli \
  -rpcuser=zcashrpc -rpcpassword="$RPC_PASS" \
  z_gettotalbalance 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('private','0'))")

echo "  House balance: $BALANCE ZEC"
if [ "$BALANCE" = "0" ] || [ "$BALANCE" = "0.00000000" ]; then
  error "House wallet has 0 ZEC! Fund it before cutover."
  exit 1
fi
info "House wallet funded with $BALANCE ZEC"

# ─────────────────────────────────────────────────────────────────────
step "2. Stop testnet containers"
# ─────────────────────────────────────────────────────────────────────

if docker ps --format '{{.Names}}' | grep -q zcashino-app; then
  $TESTNET_COMPOSE stop app
  info "Testnet app stopped"
else
  info "Testnet app already stopped"
fi

if docker ps --format '{{.Names}}' | grep -q zcashino-zcashd; then
  $TESTNET_COMPOSE stop zcashd
  info "Testnet zcashd stopped"
else
  info "Testnet zcashd already stopped"
fi

# ─────────────────────────────────────────────────────────────────────
step "3. Reduce mainnet zcashd memory (post-IBD)"
# ─────────────────────────────────────────────────────────────────────

# After IBD, zcashd needs far less memory. Update if still set high.
warn "If zcashd memory limit is still 14G, consider reducing to 4G in docker-compose.mainnet.yml"

# ─────────────────────────────────────────────────────────────────────
step "4. Build and start mainnet app"
# ─────────────────────────────────────────────────────────────────────

# Fresh DB for mainnet (no testnet game history)
# The app will create it on first start via Prisma
info "Starting mainnet app..."
$MAINNET_COMPOSE up -d --build app

# Wait for app to be healthy
echo -n "  Waiting for app to be healthy"
for i in $(seq 1 30); do
  if docker exec mainnet-app-1 node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo ""
    info "App is healthy!"
    break
  fi
  echo -n "."
  sleep 2
done

if [ $i -eq 30 ]; then
  error "App failed to become healthy after 60s"
  echo "  Check logs: $MAINNET_COMPOSE logs app"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────
step "5. Smoke test"
# ─────────────────────────────────────────────────────────────────────

# Health endpoint
HEALTH=$(curl -s http://localhost:3000/api/health)
HEALTH_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
echo "  Health: $HEALTH_STATUS"

if [ "$HEALTH_STATUS" = "ok" ] || [ "$HEALTH_STATUS" = "degraded" ]; then
  info "Health endpoint responding"
else
  error "Health endpoint returned: $HEALTH_STATUS"
fi

# Check network is mainnet
NETWORK=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('network','unknown'))" 2>/dev/null || echo "unknown")
echo "  Network: $NETWORK"

# Test public page
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://cypherjester.com/)
echo "  Homepage: HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  info "Public site is accessible"
else
  warn "Homepage returned HTTP $HTTP_CODE (may need Nginx check)"
fi

# ─────────────────────────────────────────────────────────────────────
step "6. Post-cutover reminders"
# ─────────────────────────────────────────────────────────────────────

echo ""
warn "Manual steps remaining:"
echo "  1. Close port 8233 on UFW:  ufw delete allow 8233"
echo "  2. Remove port 8233 from docker-compose.mainnet.yml (if mapped)"
echo "  3. Reduce zcashd memory limit from 14G to 4G"
echo "  4. Verify: curl https://cypherjester.com/api/health"
echo "  5. Test a real game with a small deposit"
echo ""
info "🎭 CypherJester is LIVE on mainnet!"
