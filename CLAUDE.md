# CypherJester Project Guidelines

## Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with custom @theme colors
- **Database:** SQLite with Prisma 7 (LibSQL adapter)
- **Testing:** Vitest 4 + React Testing Library
- **Blockchain:** Zcash mainnet via zcashd v6.11.0 RPC

## Deployment
- **Live:** https://cypherjester.com (mainnet, real ZEC)
- **VPS:** 93.95.226.186 (1984.hosting, Iceland)
- **Docker:** `docker compose -p mainnet -f docker-compose.mainnet.yml up -d`
- **DB on host:** `/var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db`

## Design System Colors
**Always use these - NEVER use zinc/amber/blue/gray:**
- `jester-purple`, `jester-purple-light`, `jester-purple-dark`
- `masque-gold`, `venetian-gold`
- `midnight-black`, `bone-white`
- `crimson-mask`, `blood-ruby`

## Mistakes to Avoid

### [2025-02-04] React useEffect Timer/Interval Bug
**Problem:** Timer stuck, countdown never completes
**Root Cause:** Capturing local variables in setInterval closures creates stale closures on re-renders

```javascript
// BAD - stale closure captures countdown variable
let countdown = 2
setInterval(() => {
  countdown -= 1  // This captures stale value!
  setAutoBetCountdown(countdown)
}, 1000)

// GOOD - functional state update
setInterval(() => {
  setAutoBetCountdown(prev => {
    if (prev === null || prev <= 1) {
      clearInterval(intervalId)
      return null
    }
    return prev - 1
  })
}, 1000)
```

**Also required:**
1. Always add cleanup function to useEffect with timers
2. Clear old timers before creating new ones
3. Use refs for re-entry guards (`isAutoBettingRef.current`)

### [2025-02-04] Tailwind CSS v4 PostCSS Config
**Problem:** Massive blue SVG covering the page
**Root Cause:** Missing postcss.config.mjs for Tailwind v4
**Fix:** Create `postcss.config.mjs` with `@tailwindcss/postcss` plugin

### [2026-02-15] zcashd Sapling Witness Constraint
**Problem:** Commitment pool refill creates 1 tx then all subsequent fail with "Missing witness for Sapling note"
**Root Cause:** Sapling notes can't be spent until their witness is anchored in a block. Each self-send creates unconfirmed change that isn't spendable for ~75 seconds.
**Fix:** `refillPool()` creates at most 1 commitment per call. Pool manager (5-min interval) gradually fills the pool.

### [2026-02-15] zcashd RPC Error Handling
**Problem:** zcashd returns HTTP 500 for JSON-RPC errors, but `rpcCall()` threw at `response.ok` check without reading the body.
**Fix:** Always parse JSON body first, then check `data.error` before `response.ok`. The body contains structured error info.

### [2026-02-15] Unified Address Required for z_sendmany
**Problem:** Bare Sapling receiver rejected as `fromAddress` in `z_sendmany`.
**Fix:** Must use the full Unified Address (UA) returned by `z_getaddressforaccount`, not the bare Sapling receiver from `z_listunifiedreceivers`.

### [2026-02-15] TypeScript Prisma $transaction Narrowing
**Problem:** Variables assigned inside `prisma.$transaction()` callbacks get narrowed to `never` by TypeScript.
**Fix:** Use type assertions at usage sites: `(variable as { balance: number } | null)?.balance ?? 0`

## Code Patterns

### Auto-bet Feature Pattern
Location: `src/app/blackjack/page.tsx`

Key state:
```typescript
const [isAutoBetEnabled, setIsAutoBetEnabled] = useState<boolean>(true)
const [isAutoBetting, setIsAutoBetting] = useState<boolean>(false)
const [autoBetCountdown, setAutoBetCountdown] = useState<number | null>(null)
const isAutoBettingRef = useRef<boolean>(false)  // Re-entry guard
```

localStorage persistence for user preference: `zcashino_auto_bet`

### Sound Toggle Pattern
```typescript
const { playSound, isMuted, toggleMute } = useGameSounds(true)
```

### Session/Bet Refs Pattern
Use refs to capture values for timer closures:
```typescript
const sessionRef = useRef<SessionData | null>(null)
const selectedBetRef = useRef<number>(0.1)

// Keep refs in sync with state
useEffect(() => { sessionRef.current = session }, [session])
```

### Commitment Pool Pattern
- `src/lib/provably-fair/commitment-pool.ts` — pool management
- `src/lib/provably-fair/blockchain.ts` — on-chain commitment creation
- `src/lib/services/commitment-pool-manager.ts` — background 5-min interval
- Creates 1 commitment per cycle (Sapling witness constraint)
- Pool target: 15, minimum healthy: 5
- Falls back to on-demand creation if pool empty

### Deployment Pattern
```bash
# Deploy code changes (app only, keeps zcashd running):
ssh root@93.95.226.186
cd /opt/zcashino && git pull origin main
set -a && source .env.mainnet && set +a
docker compose -p mainnet -f docker-compose.mainnet.yml build app
docker compose -p mainnet -f docker-compose.mainnet.yml up -d --no-deps app

# Check health:
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool

# Check zcashd:
RPC_USER=$(grep ZCASH_RPC_USER .env.mainnet | cut -d= -f2)
RPC_PASS=$(grep ZCASH_RPC_PASSWORD .env.mainnet | cut -d= -f2)
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS getblockchaininfo
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS z_gettotalbalance

# Check DB from host:
sqlite3 /var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db "SELECT status, count(*) FROM SeedCommitment GROUP BY status;"
```

## Testing
- 293 tests across 12 files
- Run: `npm test` or `npx vitest run`
- Game is at: http://localhost:3000/blackjack

## API Endpoints
- `POST /api/session` - Create/get session
- `POST /api/game` - Game actions (start, hit, stand, double, split)
- `POST /api/video-poker` - Video poker (start, draw)
- `POST /api/wallet` - Deposits/withdrawals
- `GET /api/verify` - Game verification
- `GET /api/health` - System health (db, node, pool, balance, kill switch)
- `GET /api/reserves` - Public reserve proof

## Build Commands
```bash
npm run dev      # Development
npm run build    # Production build
npm test         # Run tests
```
