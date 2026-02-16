#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Generate Mainnet House Wallet
# Run on VPS as root: bash /opt/zcashino/scripts/generate-house-wallet.sh
#
# PREREQUISITE: Mainnet zcashd must be fully synced
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_DIR="/opt/zcashino"
RPC_PASS=$(grep ZCASH_RPC_PASSWORD "$COMPOSE_DIR/.env.mainnet" | cut -d= -f2)

CLI="docker exec mainnet-zcashd-1 zcash-cli -rpcuser=zcashrpc -rpcpassword=$RPC_PASS"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "\n${YELLOW}═══ $1 ═══${NC}"; }

# ─────────────────────────────────────────────────────────────────────
step "1. Verify sync status"
# ─────────────────────────────────────────────────────────────────────

SYNC=$($CLI getblockchaininfo 2>/dev/null)
BLOCKS=$(echo "$SYNC" | python3 -c "import sys,json; print(json.load(sys.stdin)['blocks'])")
HEADERS=$(echo "$SYNC" | python3 -c "import sys,json; print(json.load(sys.stdin)['headers'])")
echo "  Blocks: $BLOCKS / $HEADERS"

if (( HEADERS - BLOCKS > 10 )); then
  error "Not fully synced. Wait for sync to complete."
  exit 1
fi
info "Node is fully synced"

# ─────────────────────────────────────────────────────────────────────
step "2. Create account + Sapling address"
# ─────────────────────────────────────────────────────────────────────

# Create a new account (returns account number)
ACCOUNT=$($CLI z_getnewaccount | python3 -c "import sys,json; print(json.load(sys.stdin)['account'])")
info "Created account #$ACCOUNT"

# Get a unified address for this account (Sapling pool)
UA=$($CLI z_getaddressforaccount $ACCOUNT '["sapling"]' | python3 -c "import sys,json; print(json.load(sys.stdin)['address'])")
info "Unified address: $UA"

# Extract the Sapling receiver from the unified address
SAPLING=$($CLI z_listunifiedreceivers "$UA" | python3 -c "import sys,json; print(json.load(sys.stdin)['sapling'])")
info "Sapling address: $SAPLING"

# ─────────────────────────────────────────────────────────────────────
step "3. Back up wallet IMMEDIATELY"
# ─────────────────────────────────────────────────────────────────────

BACKUP_DIR="/opt/zcashino/backups/wallet"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/wallet-mainnet-$(date +%Y%m%d-%H%M%S).dat"

$CLI z_exportwallet "wallet-export-$(date +%Y%m%d).txt" 2>/dev/null || true
docker cp mainnet-zcashd-1:/srv/zcashd/.zcash/wallet.dat "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
info "Wallet backed up to: $BACKUP_FILE"

# ─────────────────────────────────────────────────────────────────────
step "4. Update .env.mainnet"
# ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}Add this to .env.mainnet:${NC}"
echo ""
echo "  HOUSE_ZADDR_MAINNET=$SAPLING"
echo ""
echo -e "${YELLOW}Then run the cutover:${NC}"
echo "  bash /opt/zcashino/scripts/mainnet-cutover.sh"
echo ""

# Auto-update if confirmed
read -p "Auto-update .env.mainnet now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  sed -i "s|^HOUSE_ZADDR_MAINNET=.*|HOUSE_ZADDR_MAINNET=$SAPLING|" "$COMPOSE_DIR/.env.mainnet"
  info "Updated .env.mainnet with house address"
fi

echo ""
warn "CRITICAL: Copy wallet backup off-server NOW!"
echo "  scp root@93.95.226.186:$BACKUP_FILE ."
echo ""
info "House wallet generation complete"
