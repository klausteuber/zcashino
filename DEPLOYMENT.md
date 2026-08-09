# CypherJester Deployment Guide

## Prerequisites

- Docker & Docker Compose (or Node.js 22+)
- A domain with DNS pointing to your server
- TLS certificate (Let's Encrypt recommended)
- Zcash testnet or mainnet node (included in docker-compose)

## GitHub-Only Deploy Prompt

For AI-assisted deploys, use the reusable prompt at:

- `notes/github-only-deploy-prompt.md`

This enforces GitHub-first deployment (commit/push first, server only pulls and rebuilds).

## Quick Start (Docker)

```bash
# 1. Clone and enter project
git clone <repo-url> && cd zcashino-app

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with production values (see "Environment Variables" below)

# 3. Start services
docker compose up -d

# 4. Apply database migrations
docker compose exec app npx prisma migrate deploy

# 5. Verify
curl http://localhost:3000/api/health
```

## Environment Variables

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `file:/app/data/zcashino.db` |
| `ZCASH_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `ZCASH_RPC_USER` | Zcash node RPC username | `zcashrpc` |
| `ZCASH_RPC_PASSWORD` | Zcash node RPC password (strong random) | `<64-char random>` |
| `ZCASH_RPC_URL` | Wallet RPC endpoint for mainnet | `http://zallet:8232` |
| `ZCASH_TESTNET_RPC_URL` | RPC endpoint for testnet | `http://zcashd:18232` |
| `HOUSE_ZADDR_TESTNET` | House shielded address (testnet) | `ztestsapling1...` |
| `HOUSE_ZADDR_MAINNET` | House unified address (mainnet, must include Orchard receiver) | `u1...` |
| `DEMO_MODE` | Set to `false` for real money | `false` |
| `ADMIN_USERNAME` | Admin dashboard username | `admin` |
| `ADMIN_PASSWORD` | Admin password (16+ chars) | `<strong password>` |
| `ADMIN_SESSION_SECRET` | Session signing secret (64+ chars) | `<64-char hex>` |
| `PLAYER_SESSION_SECRET` | Player session cookie signing secret (32+ chars) | `<64-char hex>` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `FORCE_HTTPS` | Set to `true` for secure cookies (required behind TLS proxy) | `false` |
| `PLAYER_SESSION_AUTH_MODE` | Player auth rollout mode: `compat` or `strict` | `compat` |
| `WITHDRAWAL_APPROVAL_THRESHOLD` | Withdrawals >= this amount require admin approval (ZEC) | `1.0` |
| `KILL_SWITCH` | Set to `true` to block new games/withdrawals at startup | `false` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN | (disabled) |
| `SENTRY_AUTH_TOKEN` | Sentry source map upload token | (disabled) |
| `MULTI_BRAND_ENABLED` | Enable host-based dual-brand frontend | `false` |
| `FORCE_BRAND` | Emergency override (`cypher` or `21z`) | (unset) |
| `CYPHER_HOSTS` | Comma-separated hosts that render Cypher branding | `cypherjester.com,www.cypherjester.com` |
| `BRAND_21Z_HOSTS` | Comma-separated hosts that render 21z branding | `21z.cash,www.21z.cash` |

### Dual-Brand Deployment Defaults (Mainnet)

Use these defaults for live dual-brand operation:

```env
MULTI_BRAND_ENABLED=true
FORCE_BRAND=
CYPHER_HOSTS=cypherjester.com,www.cypherjester.com
BRAND_21Z_HOSTS=21z.cash,www.21z.cash
```

Emergency rollback to Cypher-only visuals:

```env
FORCE_BRAND=cypher
```

### Generating Secrets

```bash
# Generate ADMIN_SESSION_SECRET (64-char hex)
openssl rand -hex 32

# Generate PLAYER_SESSION_SECRET (64-char hex)
openssl rand -hex 32

# Generate ADMIN_PASSWORD (24-char alphanumeric)
openssl rand -base64 18

# Generate ZCASH_RPC_PASSWORD
openssl rand -hex 32
```

## Reverse Proxy (Nginx)

Place behind Nginx for TLS termination:

```nginx
server {
    listen 443 ssl http2;
    server_name cypherjester.example.com 21z.cash www.21z.cash;

    ssl_certificate /etc/letsencrypt/live/cypherjester.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cypherjester.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name cypherjester.example.com 21z.cash;
    return 301 https://$host$request_uri;
}

server {
    listen 80;
    server_name www.21z.cash;
    return 301 https://21z.cash$request_uri;
}
```

## Database: Turso (Production)

For production, use Turso instead of local SQLite:

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create cypherjester

# Get connection URL and token
turso db show cypherjester --url
turso db tokens create cypherjester

# Set in .env
DATABASE_URL="libsql://cypherjester-<your-org>.turso.io"
TURSO_AUTH_TOKEN="<your-token>"

# Push schema
npx prisma db push
```

No code changes needed — the LibSQL adapter handles both local and Turso URLs.

## Credential Rotation

Rotate credentials regularly (at least every 90 days):

```bash
# Generate new admin password
NEW_PASSWORD=$(openssl rand -base64 18)
echo "New ADMIN_PASSWORD: $NEW_PASSWORD"

# Generate new session secret (invalidates all active admin sessions)
NEW_SECRET=$(openssl rand -hex 32)
echo "New ADMIN_SESSION_SECRET: $NEW_SECRET"

# Generate new player session secret (invalidates active player cookies)
NEW_PLAYER_SECRET=$(openssl rand -hex 32)
echo "New PLAYER_SESSION_SECRET: $NEW_PLAYER_SECRET"

# Generate new RPC password (must also update zcashd config)
NEW_RPC=$(openssl rand -hex 32)
echo "New ZCASH_RPC_PASSWORD: $NEW_RPC"
```

After rotating, restart the application and zcashd (if RPC password changed).

## Remediation Rollout (2026-02-15)

Ship the money-safety and auth hardening in this order:

1. Run duplicate deposit tx-hash cleanup (dry run first):

```bash
docker compose exec app node scripts/dedupe-transaction-txhash.js
docker compose exec app node scripts/dedupe-transaction-txhash.js --apply
```

2. Apply Prisma migrations:

```bash
docker compose exec app npx prisma migrate deploy
```

3. Deploy app with compatibility auth mode:
- `PLAYER_SESSION_AUTH_MODE=compat`
- Keep clients sending `sessionId` while new signed player cookie is being adopted
- Wallet withdraw clients must send `idempotencyKey` on every withdrawal request

4. Monitor `/admin` and `/api/admin/overview` for 24-48h:
- `transactions.raceRejections24h`
- `transactions.raceRejectionsAllTime`
- `transactions.idempotencyReplays24h`
- `transactions.idempotencyReplaysAllTime`
- `security.legacyPlayerAuthFallback24h`
- `security.legacyPlayerAuthFallbackAllTime`
- Negative balances must remain zero

5. Flip to strict mode after metrics are clean:
- Set `PLAYER_SESSION_AUTH_MODE=strict`
- Reject legacy body/query-only player session access

## Live Guardrails (2026-02-16 onward)

Production is already live. Use this section and `notes/mainnet-guarded-live-runbook.md` for post-launch operations.

- Initial real-money smoke test (deposit -> play -> verify -> withdraw) has passed.
- Commitment pool refill is intentionally one commitment per cycle (~5 minutes) because fresh Sapling notes cannot be spent until witness data is anchored in a block.
- Health balance warning logic uses confirmed + pending house balance totals to avoid false alerts during commitment self-send cycles.
- Keep `PLAYER_SESSION_AUTH_MODE=compat` until strict cutover preconditions pass for a full 48-hour window.

## Zcash Node Setup

### Mainnet: Zebra + Zallet

Mainnet uses Zebra 6.0.0 for consensus and Zallet 0.1.0-beta.1 for wallet RPC. `zcashd`
reached its mandatory end-of-support height at block 3417100 and cannot follow NU6.3.
The production images are pinned by digest in `docker-compose.mainnet.yml`.

Zallet is still beta software. Keep maintenance mode enabled during migration or recovery,
retain the original `wallet.dat`, and always back up both `wallet.db` and
`encryption-identity.txt`. The application adapter uses Zallet's UUID account model and
fails closed if an individual account cannot be resolved.

The development/testnet Compose file continues to use zcashd until its test workflow is
migrated separately.

### Docker Setup (Recommended)

The `docker-compose.yml` includes zcashd pre-configured for testnet:

```bash
# Start everything (app + zcashd)
docker compose up -d

# Check sync progress (wait for verificationprogress ~1.0)
docker compose exec zcashd zcash-cli -testnet getblockchaininfo

# Generate a house shielded address (unified account model)
docker compose exec zcashd zcash-cli -testnet z_getnewaccount
# → {"account": 0}
docker compose exec zcashd zcash-cli -testnet z_getaddressforaccount 0 '["sapling"]'
# → {"address": "utest1...", "account": 0}

# Set the sapling component in .env as HOUSE_ZADDR_TESTNET
```

**Testnet sync:** ~2-12 hours, ~60 GB disk.
**Mainnet sync:** ~15-24 hours, ~300 GB disk.

### Requirements

| Resource | Testnet | Mainnet |
|----------|---------|---------|
| RAM | 4 GB (8 GB recommended) | 8 GB |
| Disk | 60 GB | 300+ GB |
| CPU | 2+ cores | 4 cores recommended |

### Getting Testnet ZEC

- **Mine it yourself:** `docker compose exec zcashd zcash-cli -testnet setgenerate true 1` (WARNING: testnet difficulty is too high for CPU mining — this is unlikely to produce blocks)
- **Ask on Discord:** Join [discord.gg/zcash](https://discord.gg/zcash) and request TAZ in the testnet channel

### Manual Setup (Without Docker)

```bash
# Install zcashd (Ubuntu/Debian)
sudo apt install zcash

# Configure
mkdir -p ~/.zcash
cat > ~/.zcash/zcash.conf <<EOF
testnet=1
addnode=testnet.z.cash
rpcuser=zcashrpc
rpcpassword=$(openssl rand -hex 32)
rpcallowip=127.0.0.1
rpcport=18232
experimentalfeatures=1
txindex=1
i-am-aware-zcashd-will-be-replaced-by-zebrad-and-zallet-in-2025=1
EOF

# Download Zcash params (one-time, ~1.7 GB)
zcash-fetch-params

# Start and wait for sync
zcashd -daemon
zcash-cli -testnet getblockchaininfo
```

### Cloud Hosting

Wallet RPC requires private spending keys, so the Zebra/Zallet stack is self-hosted.

**Recommended VPS providers:**
- **1984.hosting** (~€149/month, 16 GB RAM, 6 CPU, 320 GB SSD, Iceland, no-KYC) — current deployment
- **Hetzner CX32** (~$8/month, 8 GB RAM, 80 GB disk) — budget option (requires passport/KYC)
- **DigitalOcean** ($48/month, 8 GB RAM, 160 GB disk) — testnet or small mainnet
- For mainnet, add a volume for 300+ GB blockchain storage

### Docker Gotchas

- **Must use `node:22-slim`** (NOT `node:22-alpine`) — Alpine's musl libc breaks @libsql native binaries (`fcntl64: symbol not found`)
- **Copy native modules to production stage**: `node_modules/.prisma`, `node_modules/@prisma`, `node_modules/@libsql`
- **SQLite file permissions**: App runs as uid 1001 (nextjs user). DB file AND parent directory must be owned by 1001: `chown -R 1001:1001 /data`
- **CSP + Next.js**: `script-src` must include `'unsafe-inline'` — Next.js uses inline scripts for hydration that CSP blocks otherwise
- **Firewall**: Only expose ports 22 (SSH), 80 (HTTP), 443 (HTTPS). Block app port 3000 and wallet/node RPC ports externally — app is only accessible via Nginx reverse proxy
- **House UA must include Orchard receiver**: `z_sendmany` from a UA only spends from pools with receivers in that UA. Without an Orchard receiver, funds that migrate to Orchard (via internal change outputs) become unspendable. Generate with `z_getaddressforaccount 0 '["sapling","orchard"]'`
- **`--env-file` required**: `docker compose -f docker-compose.mainnet.yml` requires `--env-file .env.mainnet` or env vars won't be interpolated (e.g., `ZCASH_RPC_PASSWORD is required` error)

## Mainnet Deployment

### Prerequisites

- VPS with 16 GB RAM, 6 CPU, 420 GB+ disk (Zebra mainnet state is ~300 GB)
- Docker & Docker Compose v2
- Nginx with TLS (Let's Encrypt)
- UFW firewall: only ports 22, 80, 443

### Step-by-Step

```bash
# 1. Copy mainnet config
cp .env.mainnet.example .env.mainnet
# Edit .env.mainnet with real values (see file for generation instructions)

# 2. Start Zebra and monitor its readiness endpoint
docker compose --env-file .env.mainnet -p mainnet -f docker-compose.mainnet.yml up -d zebra
docker compose --env-file .env.mainnet -p mainnet -f docker-compose.mainnet.yml \
  exec zebra curl -fsS http://localhost:8080/ready

# 3. Initialize Zallet's encryption identity, then create or migrate the wallet.
# For an existing zcashd wallet, follow the guarded migration runbook and keep
# the original wallet.dat permanently. Do not start real-money traffic yet.
# The pinned beta.1 image omits db_dump: build Oracle Berkeley DB 6.2.32's
# helper from its checksum-verified source, verify `db_dump -V` inside the
# Zallet image, and mount the helper only for migrate-zcashd-wallet.

# 4. Start Zallet and inspect wallet scan status
docker compose --env-file .env.mainnet -p mainnet -f docker-compose.mainnet.yml up -d zallet
docker compose --env-file .env.mainnet -p mainnet -f docker-compose.mainnet.yml exec zallet \
  zallet -d /var/lib/zallet rpc getwalletstatus

# 5. Back up wallet.db + encryption-identity.txt as one encrypted archive
COMPOSE_FILE=docker-compose.mainnet.yml COMPOSE_PROJECT_NAME=mainnet scripts/backup-wallet.sh
# Store the encrypted copy and passphrase in separate, off-site locations.

# 6. Start the app only when node_tip, wallet_tip, and fully_synced_height match
docker compose --env-file .env.mainnet -p mainnet -f docker-compose.mainnet.yml up -d

# 7. Verify health
curl https://cypherjester.com/api/health

# 8. Install monitoring cron jobs (see Monitoring section)

# 9. Smoke test: deposit small amount, play one hand, withdraw
```

### Mainnet vs Testnet Differences

| Aspect | Testnet | Mainnet |
|--------|---------|---------|
| Compose file | `docker-compose.yml` | `docker-compose.mainnet.yml` |
| Env file | `.env` | `.env.mainnet` |
| Consensus node | zcashd testnet | Zebra 6.0.0 |
| RPC port | 18232 | 8232 |
| Wallet service | zcashd | Zallet 0.1.0-beta.1 |
| RPC exposure | Host-mapped | Docker-internal only |
| `rpcallowip` | `0.0.0.0/0` | `172.16.0.0/12` |
| App port | `3000:3000` | `127.0.0.1:3000:3000` |
| Fake addresses | Allowed (testnet) | Blocked (fail-closed) |
| Mock commitments | Allowed | Blocked |
| Disk | ~60 GB | ~300+ GB |
| RAM (node + wallet) | 8 GB | 11 GB combined limits |

## Monitoring

### Health Endpoint

`GET /api/health` returns:
- Database connectivity
- Zebra node and Zallet wallet scan status (connected, synced, block height)
- Commitment pool count and warning threshold
- House wallet balance (confirmed/pending)
- Pending withdrawal count
- Kill switch status
- Overall severity: `ok`, `warning`, or `critical`

### Monitoring Scripts

All scripts are in `scripts/`. Configure credentials in `.env.monitoring`:

```bash
# .env.monitoring
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
BACKUP_PASSPHRASE=your-gpg-passphrase
MIN_HOUSE_BALANCE=0.5
DISK_THRESHOLD=85
APP_BASE_URL=http://127.0.0.1:3000

# Optional node-alert tuning (defaults shown):
# NODE_ALERT_COOLDOWN_SECONDS=1800  # repeat same-class node alerts at most every 30 min (0 disables)
# NODE_STARTUP_GRACE_SECONDS=1800   # no sync/RPC alerts while a container is starting/restarting
# NODE_SYNC_LAG_TOLERANCE=2         # blocks of wallet-scan lag tolerated before NODE SYNCING
```

Install cron jobs:

```bash
# Edit crontab
crontab -e

# Add these entries:
*/5 * * * *  /opt/zcashino/scripts/check-node.sh    >> /var/log/zcashino-monitor.log 2>&1
*/15 * * * * /opt/zcashino/scripts/check-balance.sh  >> /var/log/zcashino-monitor.log 2>&1
0 * * * *    /opt/zcashino/scripts/check-disk.sh     >> /var/log/zcashino-monitor.log 2>&1
0 3 * * *    /opt/zcashino/scripts/backup-db.sh      >> /var/log/zcashino-backup.log 2>&1
0 4 * * 0    /opt/zcashino/scripts/backup-wallet.sh  >> /var/log/zcashino-backup.log 2>&1
# Guarded-live window:
# First 6h (keep this line enabled):
*/15 * * * * /opt/zcashino/scripts/guarded-live-monitor.js --alert >> /var/log/zcashino-guarded-live.log 2>&1
# After first 6h, disable the 15m line above and enable this hourly line:
# 0 * * * *    /opt/zcashino/scripts/guarded-live-monitor.js --alert >> /var/log/zcashino-guarded-live.log 2>&1
0 5 * * *    /opt/zcashino/scripts/guarded-live-reconcile.js >> /var/log/zcashino-reconcile.log 2>&1
```

| Script | Schedule | What it checks |
|--------|----------|----------------|
| `check-node.sh` | Every 5 min | Zebra reachable and Zallet fully scanned to the node tip; container-down alerts include exit code/OOM/restart diagnostics; same-class alerts rate-limited with a `NODE OK` recovery message |
| `check-balance.sh` | Every 15 min | House balance above threshold |
| `check-disk.sh` | Hourly | Disk usage below 85% |
| `backup-db.sh` | Daily 3am | SQLite backup, gzipped, 30-day retention |
| `backup-wallet.sh` | Weekly Sun 4am | Zallet database + encryption identity, GPG encrypted, 4-copy retention |
| `guarded-live-baseline.js` | Manual at launch | Captures day-zero invariants for diffing |
| `guarded-live-monitor.js` | 15 min (first 6h), then hourly | Checks `/api/health`, `/api/admin/overview`, and DB invariants against alert gates |
| `guarded-live-reconcile.js` | Daily | Logs liabilities vs house balance + withdrawal queues |
| `send-alert.sh` | (shared) | Telegram notification delivery |

Detailed guarded-live cadence and cutover gates: `notes/mainnet-guarded-live-runbook.md`.

### Telegram Admin Bot (Optional)

This enables running admin ops from a **private Telegram chat** (recommended).

1. Add these to `.env.mainnet` (and restart the app after changes):

```bash
# Telegram bot token (create via @BotFather)
TELEGRAM_BOT_TOKEN=...

# Webhook request authentication (required)
TELEGRAM_WEBHOOK_SECRET=...

# Allowlist of admin chat IDs (comma-separated). For private chat, it's one value.
TELEGRAM_ADMIN_CHAT_IDS=...
```

2. Set the webhook (must be HTTPS, and should be the **cypher** domain):

```bash
./scripts/telegram-set-webhook.sh --base-url https://cypherjester.com
```

3. In Telegram, message your bot:
- `/whoami` (get your `chat_id`)
- `/help`
- `/status`

**Safety**: all state-changing commands require `/confirm <token>` and expire quickly.

### External Monitoring

- **Uptime**: Point UptimeRobot or similar at `https://yourdomain.com/api/health`
- **Errors**: Configure `NEXT_PUBLIC_SENTRY_DSN` for Sentry error tracking
- **Admin dashboard**: `https://yourdomain.com/admin` for operational oversight
- **Race/idempotency telemetry**: track `raceRejections24h` and `idempotencyReplays24h` from `GET /api/admin/overview`
- **Compat fallback telemetry**: track `legacyPlayerAuthFallback24h` from `GET /api/admin/overview` before strict auth cutover

## Backups

### Database (SQLite)

Automated via `scripts/backup-db.sh` (daily, 30-day retention):

```bash
# Manual backup
scripts/backup-db.sh

# Restore from backup
gunzip /opt/zcashino/backups/db/zcashino-YYYYMMDD-HHMMSS.db.gz
cp zcashino-YYYYMMDD-HHMMSS.db /opt/zcashino/data/zcashino.db
chown 1001:1001 /opt/zcashino/data/zcashino.db
docker compose restart app
```

### Wallet (zcashd)

Automated via `scripts/backup-wallet.sh` (weekly, 4-copy retention):

```bash
# Manual backup
scripts/backup-wallet.sh

# Restore from encrypted backup
gpg --decrypt wallet-YYYYMMDD.dat.gpg > wallet.dat
# Stop zcashd, replace wallet.dat in volume, restart
```

### Backup Verification

Run a restore drill at least once during the first 30 days of mainnet operation.

## Incident Runbooks

### Node Falls Behind (Not Synced)

**Symptoms**: `check-node.sh` alerts, health endpoint shows `synced: false`

1. Check zcashd logs: `docker compose logs --tail 100 zcashd`
2. Check disk space: `df -h`
3. Check memory: `free -h`
4. If disk full: expand volume or clean Docker images (`docker system prune`)
5. If OOM: increase zcashd memory limit in compose file
6. Restart: `docker compose restart zcashd`
7. Wait for resync (monitor with `zcash-cli getblockchaininfo`)
8. If stuck: stop, delete `~/.zcash/blocks/` in volume, restart (full resync ~24h)

### House Balance Low

**Symptoms**: `check-balance.sh` alerts, health shows `warning` severity

1. Activate kill switch (admin dashboard or API) to pause withdrawals
2. Check pending withdrawals in admin dashboard
3. Transfer ZEC from cold wallet to house z-address
4. Verify balance recovered: `zcash-cli z_getbalance <house-addr>`
5. Deactivate kill switch once balance is healthy

### Stuck Withdrawal (z_sendmany Pending)

**Symptoms**: Withdrawal stuck in `pending` status, user complaining

1. Get the operation ID from the transaction record:
   ```bash
   sqlite3 /var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db \
     "SELECT id, status, operationId, failReason, amount FROM \"Transaction\" WHERE type='withdrawal' ORDER BY createdAt DESC LIMIT 5;"
   ```
2. Check status: `zcash-cli z_getoperationstatus '["opid-xxx"]'`
3. If `failed`: note the error, refund user balance:
   ```bash
   # Mark tx as failed and refund session
   sqlite3 /var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db "
     UPDATE \"Transaction\" SET status='failed', failReason='<error>' WHERE id='<txId>';
     UPDATE Session SET balance=balance+<amount+fee>, totalWithdrawn=totalWithdrawn-<amount> WHERE id='<sessionId>';
   "
   ```
4. If `executing` for > 30 min: check node sync status
5. If node is synced but op stuck: restart zcashd (safe — pending ops resume)
6. Check result after restart: `zcash-cli z_getoperationresult '["opid-xxx"]'`

**Common failure: "Insufficient funds"** — This usually means the house UA lacks a receiver
for the pool where funds are held. Check pool distribution:
```bash
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=USER -rpcpassword=PASS z_getbalanceforaccount 0 1
```
If funds are in Orchard but the house UA only has a Sapling receiver, generate a new UA:
```bash
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=USER -rpcpassword=PASS \
  z_getaddressforaccount 0 '["sapling","orchard"]'
```
Update `HOUSE_ZADDR_MAINNET` in `.env.mainnet` and redeploy the app.

**Note**: As of 2026-02-16, the admin approval handler polls the opid for 3 seconds after
`z_sendmany` to catch immediate failures (like insufficient funds) and auto-refunds the user.
Earlier versions did not do this, leaving withdrawals silently stuck as `pending`.

### Commitment Pool Depleted

**Symptoms**: Health shows pool count = 0, new games fail

1. Check house wallet balance (pool refill requires on-chain tx)
2. If balance sufficient: trigger manual refill from admin dashboard
3. If balance insufficient: fund house wallet first
4. Monitor pool count in admin dashboard until restored
5. If node is down: activate kill switch until node recovers

### Database Corruption

**Symptoms**: App crashes, Prisma errors, health endpoint returns 500

1. Stop the app: `docker compose stop app`
2. Check SQLite integrity: `sqlite3 /opt/zcashino/data/zcashino.db "PRAGMA integrity_check;"`
3. If corrupt: restore from latest daily backup
4. Verify restored DB: `sqlite3 restored.db "PRAGMA integrity_check;"`
5. Replace: `cp restored.db /opt/zcashino/data/zcashino.db && chown 1001:1001 /opt/zcashino/data/zcashino.db`
6. Restart: `docker compose start app`
7. Reconcile: compare session balances vs on-chain state

### VPS Outage / Server Migration

1. Provision new VPS (16 GB RAM, 420 GB disk minimum)
2. Install Docker, Nginx, certbot
3. Restore wallet from encrypted backup (GPG decrypt)
4. Restore database from latest backup
5. Copy `.env.mainnet` and `docker-compose.mainnet.yml`
6. Update DNS to point to new IP
7. Start services: `docker compose -p mainnet -f docker-compose.mainnet.yml up -d`
8. Wait for zcashd to sync (can take 24h for full resync)
9. Verify: `curl https://cypherjester.com/api/health`
10. Install monitoring cron jobs

## Kill Switch

The kill switch blocks new games and withdrawals while allowing in-progress games to complete.

```bash
# Activate via API (from server)
# First, get an admin session token:
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin-password>"}' \
  -c - | grep zcashino_admin_session | awk '{print $NF}')

# Toggle kill switch (via /api/admin/pool endpoint):
curl -X POST http://127.0.0.1:3000/api/admin/pool \
  -H "Cookie: zcashino_admin_session=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"toggle-kill-switch"}'

# Or use admin dashboard: https://cypherjester.com/admin
```

State persists across container restarts (stored in `/app/data/kill-switch.json`). The `KILL_SWITCH` env var takes precedence over file state.

## Launch Checklist (Fresh Environment / DR Restore)

Use this checklist when launching a new environment or restoring to a fresh host. Production may already be live.

### Security
- [ ] Strong credentials set in `.env.mainnet` (all generated with `openssl rand`)
- [ ] `PLAYER_SESSION_SECRET` set (32+ chars)
- [ ] `DEMO_MODE=false`
- [ ] UFW firewall: only ports 22, 80, 443 (no direct app/RPC access)
- [ ] SSH key-only auth (`PasswordAuthentication no`)
- [ ] Nginx rate limiting on `/api/` routes
- [ ] `FORCE_HTTPS=true`

### Infrastructure
- [ ] Zcash node fully synced (`verificationprogress >= 0.9999`)
- [ ] House wallet funded with initial bankroll
- [ ] Wallet backed up (GPG encrypted, 2+ locations)
- [ ] Commitment pool populated (check admin dashboard)
- [ ] Health check returns `severity: ok`
- [ ] TLS/HTTPS configured and cert not expiring soon
- [ ] Monitoring cron jobs installed and tested
- [ ] Backup scripts tested (DB + wallet)

### Application
- [ ] DB dedupe + migration completed (`scripts/dedupe-transaction-txhash.js --apply`, `prisma migrate deploy`)
- [ ] `WITHDRAWAL_APPROVAL_THRESHOLD` set (recommend 1.0 ZEC initially)
- [ ] `PLAYER_SESSION_AUTH_MODE=compat` on first deployment
- [ ] Sentry DSN configured
- [ ] Admin dashboard accessible
- [ ] Client withdrawal requests include `idempotencyKey`
- [ ] Legal pages reviewed (/terms, /privacy, /responsible-gambling)
- [ ] Smoke test: deposit, play, withdraw with real ZEC

### Live Environment (First 30 Days)
- [ ] Daily reconciliation: `sum(session.balance)` vs on-chain house balance
- [ ] Daily canary for first 7 days: deposit tiny amount, play one hand, verify, withdraw
- [ ] Monitor race/idempotency counters in admin overview for first 48h
- [ ] Monitor legacy compat-auth fallback counter (`security.legacyPlayerAuthFallback24h`) before strict cutover
- [ ] Flip `PLAYER_SESSION_AUTH_MODE=strict` after clean metrics
- [ ] Weekly dependency/security patch review
- [ ] Backup restore drill completed at least once
- [ ] Credential rotation at 90 days
- [ ] Let's Encrypt cert renewal verified
- [ ] zcashd version check (v6.11.0, monitor for deprecation notices)
