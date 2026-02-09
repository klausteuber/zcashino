# Zcashino Deployment Guide

## Prerequisites

- Docker & Docker Compose (or Node.js 22+)
- A domain with DNS pointing to your server
- TLS certificate (Let's Encrypt recommended)
- Zcash testnet or mainnet node (included in docker-compose)

## Quick Start (Docker)

```bash
# 1. Clone and enter project
git clone <repo-url> && cd zcashino-app

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with production values (see "Environment Variables" below)

# 3. Start services
docker compose up -d

# 4. Verify
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
| `ZCASH_RPC_URL` | RPC endpoint for mainnet | `http://zcashd:8232` |
| `ZCASH_TESTNET_RPC_URL` | RPC endpoint for testnet | `http://zcashd:18232` |
| `HOUSE_ZADDR_TESTNET` | House shielded address (testnet) | `ztestsapling1...` |
| `HOUSE_ZADDR_MAINNET` | House shielded address (mainnet) | `zs1...` |
| `DEMO_MODE` | Set to `false` for real money | `false` |
| `ADMIN_USERNAME` | Admin dashboard username | `admin` |
| `ADMIN_PASSWORD` | Admin password (16+ chars) | `<strong password>` |
| `ADMIN_SESSION_SECRET` | Session signing secret (64+ chars) | `<64-char hex>` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN | (disabled) |
| `SENTRY_AUTH_TOKEN` | Sentry source map upload token | (disabled) |

### Generating Secrets

```bash
# Generate ADMIN_SESSION_SECRET (64-char hex)
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
    server_name zcashino.example.com;

    ssl_certificate /etc/letsencrypt/live/zcashino.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zcashino.example.com/privkey.pem;

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
    server_name zcashino.example.com;
    return 301 https://$host$request_uri;
}
```

## Database: Turso (Production)

For production, use Turso instead of local SQLite:

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create zcashino

# Get connection URL and token
turso db show zcashino --url
turso db tokens create zcashino

# Set in .env
DATABASE_URL="libsql://zcashino-<your-org>.turso.io"
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

# Generate new RPC password (must also update zcashd config)
NEW_RPC=$(openssl rand -hex 32)
echo "New ZCASH_RPC_PASSWORD: $NEW_RPC"
```

After rotating, restart the application and zcashd (if RPC password changed).

## Zcash Node Setup

### Why zcashd (not Zebra + Zallet)

We use zcashd because the replacement stack (Zebra + Zallet) cannot yet support our needs:
- **Zallet is alpha** (v0.1.0-alpha.3, Dec 2025). Missing critical RPCs: `z_getbalance`, `z_listreceivedbyaddress`, `listtransactions`.
- **`z_sendmany` exists but is being deprecated** in favor of an unimplemented replacement (`z_sendfromaccount`).
- **Address model is changing** from address-based to account-based (`z_getnewaccount` + `z_getaddressforaccount` instead of `getnewaddress`).
- **No Docker image, no security audit, no production deployments** of Zallet exist.
- **No stable release timeline** (GitHub issue #346 "Stable Release version estimation date" is still open).

zcashd is deprecated but functional. When Zallet reaches beta (all wallet RPCs exist), we'll evaluate migration. The RPC calls are isolated in `src/lib/wallet/rpc.ts` for easy swapping.

### Docker Setup (Recommended)

The `docker-compose.yml` includes zcashd pre-configured for testnet:

```bash
# Start everything (app + zcashd)
docker compose up -d

# Check sync progress (wait for verificationprogress ~1.0)
docker compose exec zcashd zcash-cli -testnet getblockchaininfo

# Generate a house shielded address
docker compose exec zcashd zcash-cli -testnet z_getnewaddress sapling

# Set the address in .env as HOUSE_ZADDR_TESTNET
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

- **Mine it yourself:** `docker compose exec zcashd zcash-cli -testnet setgenerate true 1` (testnet difficulty is low)
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

No hosted RPC provider supports the wallet methods we need (`z_sendmany`, `z_getnewaddress`, etc.) — these require private keys on the node. Self-hosted is the only option.

**Recommended VPS providers:**
- **1984.hosting** (~€60/month, 8 GB RAM, 4 CPU, 160 GB SSD, Iceland, no-KYC) — current deployment
- **Hetzner CX32** (~$8/month, 8 GB RAM, 80 GB disk) — budget option (requires passport/KYC)
- **DigitalOcean** ($48/month, 8 GB RAM, 160 GB disk) — testnet or small mainnet
- For mainnet, add a volume for 300+ GB blockchain storage

### Docker Gotchas

- **Must use `node:22-slim`** (NOT `node:22-alpine`) — Alpine's musl libc breaks @libsql native binaries (`fcntl64: symbol not found`)
- **Copy native modules to production stage**: `node_modules/.prisma`, `node_modules/@prisma`, `node_modules/@libsql`
- **SQLite file permissions**: App runs as uid 1001 (nextjs user). DB file AND parent directory must be owned by 1001: `chown -R 1001:1001 /data`
- **CSP + Next.js**: `script-src` must include `'unsafe-inline'` — Next.js uses inline scripts for hydration that CSP blocks otherwise
- **Firewall**: Only expose ports 22 (SSH) and 3000 (app). Block zcashd RPC port (18232/8232) externally

## Monitoring

- **Health check**: `GET /api/health` returns database, node, and pool status
- **Uptime**: Point UptimeRobot or similar at `https://yourdomain.com/api/health`
- **Errors**: Configure `NEXT_PUBLIC_SENTRY_DSN` for Sentry error tracking
- **Admin dashboard**: `https://yourdomain.com/admin` for operational oversight

## Database Backups

For SQLite (MVP):

```bash
# Manual backup
cp /app/data/zcashino.db /backups/zcashino-$(date +%Y%m%d).db

# Cron job (daily at 3am)
0 3 * * * cp /app/data/zcashino.db /backups/zcashino-$(date +\%Y\%m\%d).db
```

For production, migrate to Turso or PostgreSQL.

## Pre-Launch Checklist

- [ ] Strong credentials set in `.env`
- [ ] `DEMO_MODE=false`
- [ ] Zcash node synced and connected
- [ ] House wallet funded with ZEC
- [ ] Commitment pool populated (check admin dashboard)
- [ ] Health check returns `ok`
- [ ] TLS/HTTPS configured
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place
- [ ] Legal pages reviewed (/terms, /privacy, /responsible-gambling)
