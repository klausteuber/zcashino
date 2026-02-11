# Architecture Decisions

## Auto-Bet Feature (2025-02-04)

### Decision
Implemented auto-bet as a toggle (default ON) that automatically places the same bet and deals a new hand after a round completes.

### Why
- Improves UX for players who want continuous play
- Reduces friction between hands
- Common feature in online casinos

### Implementation
- **State:** `isAutoBetEnabled`, `isAutoBetting`, `autoBetCountdown`
- **Persistence:** localStorage key `zcashino_auto_bet`
- **UI:** Toggle button in header (refresh arrows icon), countdown indicator in complete phase
- **Timing:** 2-second countdown to view results before auto-dealing
- **Cancel:** Users can click "Cancel" or "PLAY AGAIN" to stop auto-bet

### Key Technical Choices

1. **useRef for re-entry guard:** Using `isAutoBettingRef.current` instead of just state because the effect shouldn't re-trigger during countdown.

2. **Functional state updates for countdown:** Avoids stale closure bugs with setInterval.

3. **Capture values in setTimeout closure:** Session, bet amounts captured at timer creation time to avoid stale values.

4. **Cleanup function:** Proper cleanup prevents timer pileup during hot reloads and React strict mode.

---

## Sound Effects (Earlier)

### Decision
Use Web Audio API for synthesized sounds instead of audio files.

### Why
- No additional network requests
- Smaller bundle size
- More control over timing and parameters

### Implementation
- Custom `useGameSounds` hook
- Sounds: card deal, chip click, win, loss, etc.
- Mute toggle persisted in localStorage

---

## Provably Fair System

### Decision
On-chain commitment scheme using Zcash blockchain.

### Why
- Transparent verification
- Can't cheat on outcomes
- Aligns with "provably fair" casino industry standard

### Implementation
- Pre-generated commitment pool
- SHA256 hash commitment before game
- Reveal server seed after game
- Verification page at `/verify`

---

## Design System

### Decision
Custom color palette with gold/purple Venetian masquerade theme.

### Why
- Luxury casino aesthetic
- Brand differentiation (CypherJester identity)
- Consistency across components

### Colors
- Masque gold / venetian gold (primary accent)
- Jester purple variants (brand identity)
- Midnight black / bone white (text/backgrounds)
- Crimson mask / blood ruby (secondary accents)

### Rules
- Never use generic Tailwind colors (zinc, amber, blue, gray, purple)
- Three-tier text opacity: 100%, venetian-gold, venetian-gold/50

---

## Admin Hardening (2026-02-06)

### Decision
Add a secured admin control plane with authenticated sessions, per-IP rate limiting, and persistent audit logs.

### Why
- Admin endpoints control money movement and operational recovery.
- Shared links or leaked session IDs should not grant admin access.
- We need traceability for security incidents and operational actions.

### Implementation
- **Auth model:** HMAC-signed admin session cookie (`zcashino_admin_session`) from `/api/admin/auth`.
- **Route protection:** Admin APIs require `requireAdmin(request)` guard.
- **Rate limiting:** Separate buckets for login, read, and action endpoints.
- **Audit logs:** `AdminAuditLog` table stores action, actor, IP, route, method, success, details, metadata.
- **Dashboard telemetry:** `/admin` shows failed logins, rate-limit hits, and recent audit events.

### Key Technical Choices
1. **Signed cookie sessions over client tokens:** Keeps session validation server-side and uses HttpOnly cookie protection.
2. **Bucketed rate limits:** Login is strict; read/action endpoints are less strict to preserve operability.
3. **Log failures too:** Unauthorized and rate-limited attempts are logged, not just successful admin actions.
4. **Production credential checks:** Enforce stronger password/secret lengths only in production.

---

## Security Headers & CSP Policy (2026-02-08)

### Decision
Add Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, and Permissions-Policy headers via `next.config.ts`.

### Why
- CSP blocks inline script injection and restricts resource origins, closing XSS vectors.
- HSTS forces HTTPS and prevents downgrade attacks.
- X-Frame-Options prevents clickjacking by disallowing iframe embedding.
- Permissions-Policy disables browser features the app doesn't need (camera, microphone, geolocation).

### Key Technical Choices
1. **CSP is restrictive by default:** Only allows `self` and explicitly listed origins. Inline styles are allowed (`unsafe-inline`) because Tailwind generates them, but inline scripts are blocked.
2. **Headers live in Next.js config, not middleware:** Keeps them declarative, applied to all routes, and avoids middleware overhead.

---

## Public API Rate Limiting (2026-02-08)

### Decision
Apply bucket-based rate limiting to all public API endpoints (`/api/game`, `/api/session`, `/api/wallet`), reusing the same rate-limit infrastructure built for admin routes.

### Why
- Without rate limits, a single client could flood the game engine, spam session creation, or attempt withdrawal abuse.
- Different endpoints have different risk profiles and need different limits.

### Implementation
- **Shared store:** Same in-memory `RateLimitStore` from `src/lib/admin/rate-limit.ts` is used for both admin and public buckets.
- **Bucket design:** Game actions (start/hit/stand) get stricter limits than session reads. Wallet operations (deposit/withdraw) have their own bucket to prevent financial abuse.
- **Per-IP tracking:** Limits are enforced per client IP, extracted from request headers.

### Key Technical Choices
1. **In-memory store is acceptable for single-instance deploys.** For multi-instance, swap to Redis (documented as future work).
2. **Reuse admin rate-limit module** rather than adding a new dependency. Same API surface, different bucket configs.

---

## Turso for Production Database (2026-02-08)

### Decision
Use Turso (distributed LibSQL) for production while keeping local SQLite for development.

### Why
- SQLite is great for dev (zero config, fast, file-based) but doesn't scale for multi-region or concurrent writes in production.
- Turso provides a managed, distributed SQLite-compatible database with edge replicas.
- Prisma 7's LibSQL adapter makes the switch transparent — same schema, same queries.

### Key Technical Choices
1. **LibSQL adapter in `src/lib/db.ts`:** The Prisma client is configured with `@prisma/adapter-libsql`, so switching between local SQLite and Turso is just an environment variable change (`DATABASE_URL`).
2. **No migration pain:** Prisma's schema-push workflow works identically against both backends.

---

## Standalone Docker Output (2026-02-08)

### Decision
Set `output: 'standalone'` in `next.config.ts` and build a multi-stage Dockerfile targeting the standalone output.

### Why
- Default Next.js builds include the entire `node_modules` directory, producing images 500MB+.
- Standalone output bundles only required dependencies into `.next/standalone`, producing images under 200MB.
- Smaller images mean faster deploys, lower storage costs, and reduced attack surface.

### Implementation
- **Dockerfile:** Multi-stage build (deps → build → runtime). Final stage copies only `.next/standalone`, `.next/static`, and `public/`.
- **docker-compose.yml:** Defines the app service with health check (`/api/health`), restart policy, and environment variables.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, tests, and a production build on every push/PR.

### Key Technical Choices
1. **Multi-stage build** keeps build tools out of the final image.
2. **Health check endpoint** (`/api/health`) enables Docker and orchestrator liveness probes.
3. **Non-root user** in the runtime stage for defense-in-depth.

---

## Sentry Configuration Approach (2026-02-08)

### Decision
Integrate Sentry for error tracking using four separate instrumentation entry points to cover all Next.js runtimes.

### Why
- Next.js App Router runs code in four distinct runtimes: Node.js server, Edge runtime, client browser, and instrumentation hooks.
- Missing any one entry point creates blind spots where errors go unreported.
- Sentry provides stack traces, breadcrumbs, and performance data that console logs cannot.

### Implementation
- `instrumentation.ts` — Next.js instrumentation hook, initializes Sentry server-side on app startup.
- `instrumentation-client.ts` — Client-side Sentry initialization (browser runtime).
- `sentry.server.config.ts` — Server-specific Sentry configuration (sampling rates, integrations).
- `sentry.edge.config.ts` — Edge runtime Sentry configuration.

### Key Technical Choices
1. **DSN via environment variable** (`SENTRY_DSN`). No DSN = Sentry silently disabled (safe for local dev).
2. **Sample rate tuned per environment:** Lower in production to control costs, higher in staging for visibility.
3. **Source maps uploaded during build** for readable stack traces in production.

---

## Zcash Node: zcashd over Zebra + Zallet (2026-02-08)

### Decision
Use zcashd (deprecated but functional) for the Zcash node, not the new Zebra + Zallet stack.

### Why
We evaluated Zebra (v4.1.0, production-ready consensus node) + Zallet (v0.1.0-alpha.3, wallet) as the "future-proof" option. The conclusion: **Zallet is not ready for production, especially for a financial application.**

**What Zallet is missing (Feb 2026):**
- `z_getbalance` / `getbalance` — cannot check balances
- `z_listreceivedbyaddress` — cannot detect deposits
- `listtransactions` — cannot list transaction history
- `getnewaddress` / `z_getnewaddress` — not ported (replaced by account model)
- No Docker image, no security audit, no stable release timeline
- `z_sendmany` exists but is being deprecated for an unimplemented replacement

**What zcashd provides that we need:**
- `z_sendmany` — send ZEC from house wallet to player
- `z_getnewaddress` / `getnewaddress` — generate deposit addresses
- `z_getoperationstatus` — track async withdrawal status
- `listunspent` / `z_listreceivedbyaddress` — detect deposits
- `getblockchaininfo` — health checks and sync status
- Production-tested, Docker image available, well-documented

### Migration Path
1. RPC calls are isolated in `src/lib/wallet/rpc.ts` — swap implementation when ready.
2. Monitor Zallet for beta release (when all intended RPCs exist and API is stable).
3. The address model change (address-based → account-based) will require rethinking deposit address generation.

### Risk
zcashd is deprecated. The deprecation flag (`i-am-aware-zcashd-will-be-replaced-by-zebrad-and-zallet-in-2025=1`) is required in config. No announced end-of-life date — the binary continues to work on the current network.

---

## Crypto Vulnerability Fix: Math.random → node:crypto (2026-02-08)

### Decision
Replace all uses of `Math.random()` in the provably fair system with `node:crypto.randomBytes`.

### Why
- `Math.random()` uses a predictable PRNG (xorshift128+ in V8). An attacker observing enough outputs could predict future seeds.
- For a gambling platform, seed predictability means outcome predictability — a critical vulnerability.
- `node:crypto.randomBytes` uses the OS CSPRNG (`/dev/urandom` on Linux, CryptGenRandom on Windows), which is cryptographically secure.

### Implementation
- **File:** `src/lib/provably-fair/index.ts`
- **Change:** `randomBytes(32).toString('hex')` replaces `Math.random().toString(36)` for all seed and nonce generation.
- **Tests:** Existing provably fair tests continue to pass; randomness source is an implementation detail.

### Key Technical Choices
1. **32 bytes (256 bits) of entropy** — industry standard for cryptographic seeds.
2. **Hex encoding** — consistent, URL-safe, and easy to hash with SHA-256.
3. **No fallback to Math.random** — if `node:crypto` is unavailable, the app should fail loudly rather than silently degrade.

---

## Phase 1 Mainnet Safety Guards (2026-02-10)

### Decision
Implement defensive safety guards that distinguish testnet (permissive) from mainnet (strict) behavior across all critical code paths.

### Why
A mainnet readiness audit identified 50 findings (7 CRITICAL, 19 HIGH). The core issue: code designed for fast testnet iteration had silent fallbacks that would be catastrophic with real money. Phase 1 addresses the highest-severity items.

### Implementation

**1. Startup Validator (`src/lib/startup-validator.ts`)**
- Validates environment configuration at server boot
- Fatal errors on mainnet: DEMO_MODE=true, missing house address, weak credentials, no FORCE_HTTPS
- Warnings on testnet for same issues
- Wired into `instrumentation.ts` → runs on every Node.js startup

**2. Mock Commitment Blocking (`src/lib/provably-fair/blockchain.ts`)**
- On mainnet: all 4 fallback paths return `{ success: false }` instead of mock commitments
- Games cannot start without real on-chain proofs on mainnet
- On testnet: behavior unchanged (mocks still allowed for development)

**3. Atomic Commitment Claims (`src/lib/provably-fair/commitment-pool.ts`)**
- `prisma.$transaction()` with `updateMany` + status guard prevents double-claim
- Pattern: find → updateMany where status='available' → check count → return null if 0

**4. Atomic Balance Deduction (`src/app/api/game/route.ts`)**
- `balance: { decrement: totalBet }` replaces read-compute-write pattern
- Negative balance rollback as safety net

**5. Fake Address Blocking (`session/route.ts` + `wallet/route.ts`)**
- Mainnet + node offline → throw error (not generate fake address)
- Testnet only: `tmDemo...` placeholder allowed

**6. House Balance Verification (`src/app/api/wallet/route.ts`)**
- `getAddressBalance()` check before `sendZec()` in withdrawal handler
- Insufficient funds → refund user immediately

**7. Background Services (`src/instrumentation.ts`)**
- Startup validator + commitment pool manager wired into Next.js `register()`
- Pool manager: 5-min refill interval, 1-hour cleanup interval

**8. Rate Limiting on GET Endpoints**
- Added `checkPublicRateLimit()` to GET /api/game, GET /api/session, GET /api/wallet

### Key Technical Choices
1. **Fail-closed on mainnet, fail-open on testnet.** Every safety check uses `if (isMainnet)` to determine behavior. Testnet preserves developer experience.
2. **Atomic Prisma operations over application-level locks.** Database-level atomicity is more reliable than in-process mutexes, especially under concurrent requests.
3. **Refund-first error handling for withdrawals.** Any failure after balance deduction triggers immediate refund, not manual recovery.

---

## Phase 2 Mainnet Hardening (2026-02-10)

### Decision
Implement five operational safety features for mainnet readiness: platform kill switch, float precision defense, atomic game completion, deposit sweep service, and withdrawal approval threshold.

### Why
Phase 1 addressed safety guards (fail-closed on mainnet, atomic operations). Phase 2 addresses operational concerns that arise when running a real-money casino: emergency shutdown capability, float precision bugs in payout math, double-payout race conditions, fund consolidation from deposit addresses, and human oversight for large withdrawals.

### Implementation

**1. Platform Kill Switch (`src/lib/kill-switch.ts`)**
- Runtime in-memory flag + `KILL_SWITCH` env var for persistence across restarts
- Blocks new game starts (POST /api/game) and withdrawals (POST /api/wallet)
- Allows in-progress games to complete naturally (no mid-hand interruption)
- Deposit detection continues working (don't lose user funds during maintenance)
- Admin toggle in dashboard with confirmation dialog
- Session GET returns `maintenanceMode` flag for frontend maintenance banner

**2. Float Precision Defense (`roundZec()` in `src/lib/wallet/index.ts`)**
- `Math.round(amount * 1e8) / 1e8` applied at every DB write boundary
- Covers: blackjack payouts, perfect pairs side bet, insurance payouts, balance updates, deposit amounts, withdrawal amounts, processGameCompletion crediting
- Prevents accumulation of IEEE 754 floating-point artifacts in balance records

**3. Atomic Game Completion (double-payout fix in `src/app/api/game/route.ts`)**
- `processGameCompletion()` uses `updateMany where status='active'` to atomically transition game status
- If 0 rows updated, another call path already credited the payout (idempotent)
- Fixes race where both `handleStartGame` (auto-dealing next hand) and `handleGameAction` (completing current hand) could call `processGameCompletion` for the same game

**4. Deposit Sweep Service (`src/lib/services/deposit-sweep.ts`)**
- Background service running every 10 minutes (configurable)
- Consolidates transparent deposit address balances into the house shielded z-address
- Min sweep threshold: 0.001 ZEC (avoids sweeping dust that costs more in fees than it's worth)
- Tracks sweep history via `SweepLog` Prisma model and `lastSweptAt`/`totalSwept` on `DepositWallet`
- Admin can trigger manual sweep from dashboard
- Reserves API includes `totalSweptToHouseWallet` for public transparency
- Wired into `instrumentation.ts` alongside commitment pool manager

**5. Withdrawal Approval Threshold**
- Configurable via `WITHDRAWAL_APPROVAL_THRESHOLD` env var (default: 0, meaning disabled)
- Withdrawals >= threshold get `status: 'pending_approval'` instead of immediate z_sendmany
- Admin approve: triggers z_sendmany, transitions to `pending` (normal async flow)
- Admin reject: refunds user balance atomically, marks transaction `failed`
- Admin dashboard shows approve/reject buttons for pending_approval withdrawals
- WithdrawalModal shows "Awaiting Admin Approval" step in the progress flow

### Key Technical Choices
1. **`roundZec()` over integer zatoshi migration.** IEEE 754 Float64 has 53 bits of mantissa, which represents integers exactly up to 2^53. Since 90M ZEC = 9e15 zatoshi < 2^53 = ~9.007e15, Float64 can represent every possible zatoshi amount without precision loss. A full integer migration would touch every API, DB column, and UI format string for zero practical benefit.
2. **`updateMany` for idempotent game completion.** The `where: { id, status: 'active' }` clause acts as a compare-and-swap. If another code path already completed the game, the update matches 0 rows and the caller knows to skip payout. This is simpler and more reliable than distributed locking.
3. **In-memory kill switch with env var fallback.** The in-memory flag gives instant toggle without restart. The `KILL_SWITCH` env var ensures the switch survives container restarts. Both are checked — either one being set activates maintenance mode.
4. **Sweep service as a background interval, not triggered by deposits.** Running on a fixed interval is simpler to reason about, doesn't add latency to deposit processing, and naturally batches multiple deposits into one sweep transaction (saving fees).
5. **Withdrawal threshold defaults to 0 (disabled).** Zero means all withdrawals are auto-approved, preserving the current UX. Operators set a non-zero value when they want human oversight for large amounts.
