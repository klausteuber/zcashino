# CypherJester Project Guidelines

## Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with custom @theme colors
- **Database:** SQLite with Prisma 7 (LibSQL adapter)
- **Testing:** Vitest 4 + React Testing Library
- **Blockchain:** Zcash mainnet via zcashd v6.11.0 RPC

## Deployment
- **Live:** https://cypherjester.com + https://21z.cash (mainnet, real ZEC, dual-brand)
- **VPS:** 93.95.226.186 (1984.hosting, Iceland)
- **Docker:** `docker compose -p mainnet -f docker-compose.mainnet.yml up -d`
- **DB on host:** `/var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db`
- **Deploy flow:** `git pull` on VPS then rebuild — never rsync source files directly

## Design System Colors
**Always use these - NEVER use zinc/amber/blue/gray:**
- `jester-purple`, `jester-purple-light`, `jester-purple-dark`
- `masque-gold`, `venetian-gold`
- `midnight-black`, `bone-white`
- `crimson-mask`, `blood-ruby`

## Dual-Brand System
- **CypherJester** (cypherjester.com): Venetian masquerade, green felt/gold palette, Cinzel/Inter/IBM Plex Mono
- **21z** (21z.cash): Cyberpunk futurist, void-black/cyan glow, Orbitron/Rajdhani/Space Mono
- Brand detection: `src/lib/brand/server.ts` reads hostname → sets `body[data-brand="cypher"|"21z"]`
- All 21z CSS overrides scoped to `body[data-brand="21z"]` in `globals.css`
- Design doc: `DESIGN_SYSTEM.md` covers both brands
- 21z rules: No textures/grid/scanlines, radial vignette, clip-path bevels (no border-radius), three-layer cyan glow on hover/focus only, no glow at rest

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

### [2026-02-16] House UA Must Include Orchard Receiver
**Problem:** Withdrawal approved by admin but `z_sendmany` failed with "Insufficient funds" — house wallet showed 5.41 ZEC but only 0.009 ZEC was spendable.
**Root Cause:** House UA only had a Sapling receiver. Funds migrated to Orchard pool via internal change outputs from prior withdrawals. `z_sendmany` from a UA only spends from pools with receivers in that UA.
**Fix:** Generate house UA with both pools: `z_getaddressforaccount 0 '["sapling","orchard"]'`. Update `HOUSE_ZADDR_MAINNET` in `.env.mainnet`.
**Also fixed:** Added 3-second opid polling after admin withdrawal approval (`src/app/api/admin/pool/route.ts`) to catch immediate failures and auto-refund users, instead of silently leaving withdrawals stuck as "pending".

### [2026-02-16] z_sendmany Async Failure Detection
**Problem:** Admin approves withdrawal, `z_sendmany` returns opid "successfully", but the operation fails 1-2 seconds later. Client stopped polling when status was `pending_approval`, so nobody detected the failure.
**Fix:** After `z_sendmany` in the approval handler, wait 3 seconds and call `z_getoperationstatus`. If failed, immediately refund user via `prisma.$transaction` and return error to admin.

### [2026-02-17] Docker Build Context Poisoned by Nested Directory
**Problem:** All routes returned 404 after deploy. Build log showed `/src/app/*` prefixed routes instead of `/blackjack`, `/api/health`, etc.
**Root Cause:** Untracked `app/` directory at `/opt/zcashino/app` (containing a full project copy) was COPY'd into Docker build context. Next.js compiled routes from both the root `src/app/` and the nested `app/src/app/`.
**Fix:** Add `app/` and `data/` to `.dockerignore`. Never rsync source files directly to VPS — always use git pull.
**Verification:** Check build log route table. Healthy output shows `/`, `/blackjack`, `/api/health`. Broken output has `/src/app/*` prefix.

### [2026-02-17] CSS Changes Not in Deployed Bundle After Docker Fix
**Problem:** Codex fixed the route prefix bug and rebuilt, but the CSS changes (cyberpunk theme) weren't in the production bundle.
**Root Cause:** CSS changes were committed locally but not pushed/pulled to VPS before rebuild. The fix commit only included `.dockerignore` and `Dockerfile` changes.
**Fix:** Always verify that ALL pending changes are pushed and pulled before rebuilding: `git pull origin main` on VPS, then rebuild. Check deployed CSS bundle hash changes after rebuild.

### [2026-02-18] Insurance Decline Was Client-Only — No Dealer Blackjack Check
**Problem:** When dealer shows Ace, player could Hit/Stand while insurance prompt was visible. Declining insurance was purely client-side (`setInsuranceDeclined(true)`) — no server call, so `dealerPeeked` stayed `false` and dealer blackjack was never checked. Players could play hands they should have lost to dealer blackjack.

**Root Causes:**
1. Action buttons rendered when `phase === 'playerTurn'` with no check for `showInsuranceOffer`
2. `handleInsurance(false)` only set local state — server never learned the player declined

**Fix:** (a) Added `&& !showInsuranceOffer` guard to action buttons render, (b) Added `decline_insurance` server action that triggers dealer peek, (c) Client sends server call on decline

**Rule:** Every game state transition that affects gameplay flow MUST round-trip through the server. Client-only state changes are only acceptable for UI-cosmetic behavior (animations, tooltips), NEVER for game logic decisions like "should the dealer peek for blackjack." When adding new game features, audit: "does this client-side state change affect what hands/outcomes are possible?"

**Files:** `blackjack.ts`, `route.ts`, `BlackjackGame.tsx`, `api-schemas.ts`, `blackjack.test.ts`

### [2026-02-18] Push Incorrectly Shown as Win
**Problem:** A push (tie) was shown as "WIN" with win animation and "You won X ZEC!" message.
**Root Cause:** Both the message builder (`blackjack.ts`) and the result animation (`BlackjackGame.tsx`) checked `payout > 0` before checking `onlyPushes`/`message.includes('push')`. A push returns the original bet (payout > 0), so push was caught by the win branch first.

```typescript
// BAD - push has payout > 0 so it falls into 'win' before 'push' is ever checked
: totalPayout > 0 ? `You won ${totalPayout.toFixed(4)} ZEC!`
: onlyPushes ? 'Push - bet returned'

// GOOD - check push before payout in ALL three places:
// 1. blackjack.ts resolveRound() message
// 2. BlackjackGame.tsx resultAnimation setter
// 3. BlackjackGame.tsx hand history outcome
: onlyPushes ? 'Push - bet returned'
: totalPayout > 0 ? `You won ${totalPayout.toFixed(4)} ZEC!`
```

**Rule:** Whenever branching on `payout > 0` vs. push, always check push first. Push returns the stake so payout is never zero.

### [2026-02-18] Session Creation Fails Silently When Zcash Node is Down
**Problem:** User clicks "Deposit Real ZEC", sees "Something Went Wrong / Failed to create session" with no indication of root cause. Error was transient — gone when tested later.
**Root Cause:** `createDepositWalletForSession()` calls `checkNodeStatus()` → single RPC check with 5s timeout. If node is briefly unreachable (network hiccup, restart), wallet creation fails. The API catch block returned generic `{ error: 'Failed to get session' }` — no error code, no retry, no health check.
**Fix (5 changes):**
1. RPC retry with 2s backoff in `session-wallet.ts` before giving up
2. Specific error codes (`node_unavailable`, `rate_limited`, `wallet_conflict`) from API
3. Pre-flight `/api/health` check in OnboardingModal catches node downtime before session creation
4. `$transaction` around address index to prevent race condition on concurrent creates
5. Rate limit bumped 10 → 20/min (10 too tight for demo scenarios)

**Rule:** Any user-facing operation that depends on external services (RPC, DB) must: (a) retry at least once on transient failure, (b) return a specific error code, (c) show the user what actually went wrong. Generic "something went wrong" errors are debugging nightmares.

**Files:** `session-wallet.ts`, `api/session/route.ts`, `OnboardingModal.tsx`, `useGameSession.ts`, `rate-limit.ts`

### [2026-02-18] Never Assume Production Config from .env.example
**Problem:** Wrongly told user production was running `legacy_per_game_v1` mode and built an entire deployment plan around switching it — but production had ALREADY been running `session_nonce_v1` for days.
**Root Cause:** Grepped `.env.example` and `.env.mainnet.example` (both show legacy default), concluded that was production config. The real `.env.mainnet` lives only on the VPS (`/opt/zcashino/.env.mainnet`, chmod 600, gitignored) and had `PROVABLY_FAIR_MODE=session_nonce_v1` already set.
**Rule:** When answering questions about production state:
1. **Never infer production config from example files or defaults** — always SSH and check the actual `.env.mainnet`
2. **Trust the user's memory over code exploration** — if user says "I thought we changed X", verify on VPS before contradicting
3. **Check `docker exec <container> printenv <VAR>`** to see what the running container actually has
4. **Check the health endpoint first** (`curl http://localhost:3000/api/health`) — it reports `fairnessMode` directly

### [2026-02-18] Deposit Addresses Are Unified (u...), Not Transparent (t...)
**Correction:** Users see the unified address (`u1...`) for deposits, NOT transparent. The system generates both via `z_getaddressforaccount` + `z_listunifiedreceivers`, stores both in `DepositWallet`, but displays the unified address in UI. The transparent companion is used internally by deposit sweep only.

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

### Provably Fair: Session Nonce Mode (PRODUCTION)
**Production runs `PROVABLY_FAIR_MODE=session_nonce_v1`** — set in `.env.mainnet` on VPS (not in repo).

- **1 seed per SESSION**, nonce increments per hand (NOT 1 commitment per hand)
- Pool manager: `src/lib/services/session-seed-pool-manager.ts` (NOT `commitment-pool-manager.ts`)
- Seed table: `FairnessSeed` (status: available → assigned → revealed)
- Session state: `SessionFairnessState` (links session to seed, tracks `nextNonce`)
- Session fairness logic: `src/lib/provably-fair/session-fairness.ts`
- Game route branches at `src/app/api/game/route.ts:234` → `handleStartGameSessionNonce()`
- `ensureActiveFairnessState()` lazily creates state on first game start
- `allocateNonce()` atomically increments `nextNonce` per hand
- `SESSION_SEED_ON_DEMAND_CREATE=true` — games work even if pool is empty
- Pool target: 15, min healthy: 5, refill: 1 seed per 5-min cycle
- Stale reclaim: seeds assigned to sessions inactive 24h+ with nextNonce=0
- Server seed hidden until player rotates seed (NOT revealed per-game like legacy)

**Legacy mode (`legacy_per_game_v1`) still exists but is NOT used in production.**
- Legacy pool: `src/lib/provably-fair/commitment-pool.ts` + `commitment-pool-manager.ts`
- Legacy burns 1 blockchain commitment per hand (expensive, slow to refill)

### Admin Pool Status
- `/api/admin/pool` and `/api/health` auto-detect mode
- Session mode shows: available, assigned, revealed, expired
- Legacy mode shows: available, used, expired

### Deployment Pattern
```bash
# Deploy code changes (app only, keeps zcashd running):
ssh root@93.95.226.186
cd /opt/zcashino && git pull origin main
docker compose -p mainnet -f docker-compose.mainnet.yml --env-file .env.mainnet up -d --no-deps --build app

# Verify both domains:
curl -s -o /dev/null -w '%{http_code}' https://cypherjester.com/api/health
curl -s -o /dev/null -w '%{http_code}' https://21z.cash/api/health

# Check health:
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool

# Check zcashd:
RPC_USER=$(grep ZCASH_RPC_USER .env.mainnet | cut -d= -f2)
RPC_PASS=$(grep ZCASH_RPC_PASSWORD .env.mainnet | cut -d= -f2)
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS getblockchaininfo
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS z_gettotalbalance
# Per-pool breakdown (important — z_gettotalbalance hides pool distribution):
docker exec mainnet-zcashd-1 zcash-cli -rpcuser=$RPC_USER -rpcpassword=$RPC_PASS z_getbalanceforaccount 0 1

# Check DB from host (session_nonce_v1 mode):
sqlite3 /var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db "SELECT status, count(*) FROM FairnessSeed GROUP BY status;"
# Legacy mode (not used in production):
# sqlite3 /var/lib/docker/volumes/mainnet_app-data/_data/zcashino.db "SELECT status, count(*) FROM SeedCommitment GROUP BY status;"
```

**CRITICAL: Never rsync source files directly to VPS.** Always commit → push → git pull on VPS → rebuild. Direct rsync can overwrite deployment-specific patches and introduce stale files into the Docker build context.

## Testing
- 448 tests across 30 files
- Run: `npm test` or `npx vitest run`
- Game is at: http://localhost:3000/blackjack

## API Endpoints
- `POST /api/session` - Create/get session (actions: set-withdrawal-address, change-withdrawal-address, update-limits, reset-demo-balance)
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
