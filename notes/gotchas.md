# Gotchas & Bugs

## Brand-Scoped UI Leaks (2026-05-16)

**Symptom:** The shared blackjack hand component could render 21z result overlay and streak markup on the default CypherJester brand after a completed hand.

**Root Cause:** 21z-only data props were passed into a shared game component for every brand, while the matching CSS was scoped to `body[data-brand="21z"]`. Non-21z pages received unstyled markup.

**Fix:** Gate 21z-only props and effects in `BlackjackGame.tsx` with `useBrand()`, and only pass overlay/streak values when `brand.id === '21z'`.

## Fake Live Homepage Metrics (2026-05-16)

**Symptom:** The 21z homepage showed hardcoded numbers under a "Live · last 24h" label.

**Root Cause:** Prototype stats were committed as production copy without a live data source.

**Fix:** Replace fake live metrics with static product/table facts, or wire real stats before using live labels.

## React useEffect Timer Bugs

### Stale Closure in setInterval (2025-02-04)

**Symptom:** Auto-bet countdown shows "2..." but never decrements or completes.

**Root Cause:**
When using `setInterval` inside `useEffect`, capturing a local variable in the closure creates a stale reference:

```javascript
// The problem:
let countdown = 2
const intervalId = setInterval(() => {
  countdown -= 1  // ← This references the ORIGINAL countdown, not updated value
  setAutoBetCountdown(countdown)
}, 1000)
```

When React re-renders (due to state changes, strict mode, etc.):
1. The effect may run again
2. A new interval is created with a fresh `countdown = 2`
3. The old interval still references its stale `countdown`
4. Multiple intervals compete, causing erratic behavior

**The Fix:**

1. **Use functional state updates:**
```javascript
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

2. **Always add cleanup function:**
```javascript
useEffect(() => {
  // ... create timer
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }
}, [deps])
```

3. **Clear old timers before creating new ones:**
```javascript
if (timerRef.current) clearTimeout(timerRef.current)
if (intervalRef.current) clearInterval(intervalRef.current)
// THEN create new ones
```

4. **Use a ref for re-entry guard:**
```javascript
const isRunningRef = useRef(false)

useEffect(() => {
  if (isRunningRef.current) return  // Already running
  isRunningRef.current = true
  // ... rest of effect
}, [deps])
```

### Nested Timer Cleanup Cancels Follow-Up Animation (2026-02-14)

**Symptom:** New cards keep the `deal-from-shoe` class indefinitely and never transition into the settled state.

**Root Cause:**
The deal effect scheduled a second timer (`animTimer`) inside the first timeout callback, but the effect depended on `isDealt`. When `setIsDealt(true)` fired, React re-ran the effect and executed cleanup, which cleared `animTimer` before it could set `animationComplete`.

**Fix:**
- Make the deal effect depend on `isNew` and `dealDelay` only.
- Keep both timeout IDs in effect scope.
- Clear both timers in cleanup for unmount/prop changes.

**Regression test:** `src/components/game/Card.test.tsx` verifies deal timing and cleanup behavior.

### React Strict Mode Double-Renders

**Symptom:** Effects run twice in development, timers behave erratically.

**Cause:** React Strict Mode intentionally double-invokes effects to help find bugs.

**Fix:** Always write effects that work correctly even when run multiple times. This means:
- Proper cleanup functions
- Idempotent setup code
- Not relying on "run exactly once" behavior

---

## Tailwind CSS v4

### Missing PostCSS Config (2025-02-04)

**Symptom:** Massive colored SVG covering the entire page, styles broken.

**Cause:** Tailwind CSS v4 requires explicit PostCSS configuration.

**Fix:** Create `postcss.config.mjs`:
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

---

## Prisma / Database

### LibSQL Adapter
This project uses Prisma 7 with LibSQL adapter for SQLite.

**Config file:** `prisma.config.ts`

**Key commands:**
```bash
npx prisma db push    # Apply schema changes
npx prisma generate   # Regenerate client
```

---

## Admin Security

### In-Memory Rate Limiter Scope

**Symptom:** Rate-limit behavior resets after server restart or differs across multiple app instances.

**Cause:** Current admin rate limiter uses in-memory process state.

**Impact:**
- Works well for local dev and single-instance deployments.
- Not globally consistent across horizontally scaled nodes.

**Fix (when scaling):**
- Move rate-limit state to Redis (or another shared store).
- Keep the same bucket structure (`auth-login`, `admin-read`, `admin-action`).

### Production Credential Length Enforcement

**Symptom:** Admin dashboard shows "not configured" in production even when variables are set.

**Cause:** In production mode:
- `ADMIN_PASSWORD` must be at least 12 chars
- `ADMIN_SESSION_SECRET` must be at least 32 chars

**Fix:**
- Rotate to stronger credentials before production deploy.

---

## Next.js Build Environment

### Remote Google Fonts Fetch

**Symptom:** `next build` fails in restricted/offline environments.

**Cause:** `next/font/google` fetches font CSS during build.

**Fix options:**
- Build in an environment with outbound network access, or
- switch to local/self-hosted fonts for fully offline builds.

### Stale `.next/lock` Causes False "Build Hang" (2026-02-14)

**Symptom:** `next build` appears stuck or immediately fails with:
`Unable to acquire lock at .../.next/lock`.

**Root Cause:**
A previous interrupted build left the lock file behind, so subsequent builds were blocked even though code was fine.

**Fix:**
```bash
rm -f .next/lock
npm run build
```

**Verification note:** After clearing the lock, production build completed successfully with Sentry warning-only output (no auth token for release upload).

---

## Zcashd Operations

### Mutable Docker Tags Can Leave Mainnet Behind (2026-06-03)

**Symptom:** `check-node.sh` repeatedly sent `NODE SYNCING` and `NODE STALE` alerts even though the `zcashd` container was running and had peers.

**Root Cause:** The mainnet compose file used `electriccoinco/zcashd:latest`, but the live container kept running the older image already present on the host. During the June 2026 Zcash emergency soft fork, that meant production stayed on `/MagicBean:6.12.1/` while upgraded peers moved ahead.

**Fix:** Pin `zcashd` to the required emergency image digest (`electriccoinco/zcashd@sha256:745098bbec91b7d0ae013c44bcd2400b660b3c7ad80935396df4848af529bfc0`) and explicitly pull/recreate the service during emergency node upgrades. The emergency image defaults to user `zcash`, so keep `user: "0:0"` unless the live chain/wallet volume has been migrated away from root ownership.

**Key files:** `docker-compose.mainnet.yml`, `scripts/check-node.sh`.

---

### Wallet witness assertions can masquerade as RPC outages (2026-06-05)

**Symptom:** The production Telegram monitor repeatedly reported `NODE ERROR: Cannot reach zcash-cli (RPC unresponsive)` after the emergency `zcashd` image was installed.

**Root Cause:** The node was repeatedly restarting during post-fork catch-up with an Orchard wallet witness assertion, then spending most of each restart in `Loading block index...` or `Rescanning...`. The monitor discarded the real RPC startup error text and sent the generic unresponsive alert.

**Fix:** Before wallet repair, enable kill-switch maintenance and take a root-only `wallet.dat` backup. Run a temporary `zcashd` startup with `-zapwallettxes=1` to rebuild wallet transaction and witness state, remove the temporary repair flag once rescan finishes, then restart normally. `check-node.sh` now reports startup/rescan states as maintenance/grace skips instead of urgent alerts, and `backup-wallet.sh` now finds the actual `mainnet_zcash-mainnet-data` wallet path.

**Key files:** `scripts/check-node.sh`, `scripts/backup-wallet.sh`, `docker-compose.mainnet.yml`.
## Zcash Node Operations

### zcashd Docker Image Entrypoint Change (2026-05-01)

**Symptom:** Production showed `zcashNode.connected=false`, real-session creation failed with "The Zcash node is temporarily offline," and the Telegram monitor repeated `NODE ERROR: Cannot reach zcash-cli (RPC unresponsive)`.

**Root Cause:**
The running `electriccoinco/zcashd:latest` image was still v6.11.0 and shut itself down at mainnet block height 3327100 with a deprecation error. Pulling the current image upgraded to v6.12.1, but the newer image no longer accepts raw daemon flags as the container command. It tried to execute `-par=6` as the binary. It also defaults CLI lookups to `/root/.zcash`, while production wallet data is mounted at `/srv/zcashd/.zcash`.

**Fix:**
- Pull the current `electriccoinco/zcashd:latest` image before restarting at deprecation height.
- In `docker-compose.mainnet.yml`, explicitly set `entrypoint: ["zcashd"]`.
- Pass `-datadir=/srv/zcashd/.zcash` and `-printtoconsole` to `zcashd`.
- Pass `-datadir=/srv/zcashd/.zcash` to `zcash-cli` in Docker healthchecks and node-monitor scripts.

**Key files:** `docker-compose.mainnet.yml`, `scripts/check-node.sh`

---

## Brand Reskin / Multi-Skin

### sed Order-Dependency for Color Class Replacement (2026-02-09)

**Symptom:** After sed find-and-replace, some classes become malformed (e.g., `jester-purple-dark` instead of `jester-purple-dark`).

**Cause:** When replacing `pepe-green` → `jester-purple`, the pattern also matches inside `pepe-green-dark` and `pepe-green-light`, producing incorrect results.

**Fix:** Always process the longer, more specific names FIRST:
1. `pepe-green-dark` → `jester-purple-dark`
2. `pepe-green-light` → `jester-purple-light`
3. `pepe-green` → `jester-purple` (base, last)

### Split Brand Name in JSX (2026-02-09)

**Symptom:** Brand name renders incorrectly after text find-and-replace.

**Cause:** The brand name is split across two `<span>` elements for two-tone coloring:
```jsx
<span className="text-masque-gold">Cypher</span>
<span className="text-bone-white">Jester</span>
```
A naive find-and-replace of "Zcashino" → "CypherJester" won't catch this pattern because the text is split across elements.

**Fix:** Handle the split brand name as a separate search-and-replace pass targeting the HTML structure, not just plain text.

### Hero Image Must Exist Before Deploy (2026-02-09)

**Symptom:** Broken image on live site after deploy.

**Cause:** Code references `/images/jester-mask.png` but the actual AI-generated image wasn't ready at deploy time.

**Fix:** Copy the old image as a temporary placeholder before deploying:
```bash
cp public/images/pepe-tuxedo.jpg public/images/jester-mask.png
```
Replace with the real asset when available.

---

## Mainnet Safety — Race Conditions (2026-02-10)

### Double-bet exploit via non-atomic balance deduction

**Symptom:** Two concurrent "start game" requests both succeed even though balance only covers one bet.

**Root Cause:** Reading balance, computing `newBalance = balance - bet`, then writing `balance: newBalance` is not atomic. Two requests read the same balance simultaneously and both write their own deducted value — the second request's write overwrites the first, effectively giving a free bet.

**Fix:** Use Prisma's atomic `balance: { decrement: totalBet }` instead of `balance: newBalance`. Add a post-decrement negative balance check with rollback:
```typescript
const updated = await prisma.session.update({
  where: { id: session.id },
  data: { balance: { decrement: totalBet } }
})
if (updated.balance < 0) {
  // Rollback — another request beat us
  await prisma.session.update({
    where: { id: session.id },
    data: { balance: { increment: totalBet } }
  })
  return error('Insufficient balance')
}
```
**File:** `src/app/api/game/route.ts` → `handleStartGame()`

### Double-claim of commitment pool entries

**Symptom:** Two concurrent game starts could both claim the same server seed, violating provable fairness (same seed used for different games).

**Root Cause:** `findFirst()` + `update()` is not atomic. Two requests both find the same "available" commitment, both update it.

**Fix:** Wrap in `prisma.$transaction()` and use `updateMany` with `status: 'available'` guard:
```typescript
const claimed = await tx.seedCommitment.updateMany({
  where: { id: found.id, status: 'available' }, // ← guard
  data: { status: 'claimed' }
})
if (claimed.count === 0) return null // Another request claimed it first
```
**File:** `src/lib/provably-fair/commitment-pool.ts` → `getAvailableCommitment()`

---

## Mainnet Safety — Silent Fallbacks (2026-02-10)

### Mock commitments created silently on mainnet

**Symptom:** Games start successfully but with fake `mock_*` txHashes that aren't on the blockchain. Players can't verify provable fairness, but the UI shows everything as normal.

**Root Cause:** `commitServerSeedHash()` had fallback paths for when the node is down/syncing/unconfigured that created mock commitments. On testnet this is fine for development, but on mainnet it breaks the core provable fairness guarantee.

**Fix:** Check `const isMainnet = network === 'mainnet'`. On mainnet, return `{ success: false, error: '...' }` instead of mock. This causes game start to fail with 503 — correct behavior.

**File:** `src/lib/provably-fair/blockchain.ts`

### Fake deposit addresses generated on mainnet

**Symptom:** User gets a `t1Demo...` deposit address. If they send real ZEC to it, funds are permanently lost (no private key exists for that address).

**Root Cause:** When zcashd is offline, the code generated placeholder addresses for both testnet and mainnet.

**Fix:** On mainnet with node offline → `throw new Error(...)`. Only allow `tmDemo...` addresses on testnet.

**IMPORTANT:** There are TWO copies of `createWalletForSession()` — one in `src/app/api/session/route.ts` and one in `src/app/api/wallet/route.ts`. Both must be patched. TODO: consolidate into a shared function.

### Withdrawal sent without checking house balance

**Symptom:** Withdrawal RPC call fails because house wallet is empty. User's balance was already deducted, requiring manual refund.

**Fix:** Call `getAddressBalance(houseAddress)` before `sendZec()`. If insufficient, refund immediately.

**File:** `src/app/api/wallet/route.ts` → `handleWithdraw()`

---

## Refactoring — Stale Variable References (2026-02-10)

### Ghost reference to removed variable

**Symptom:** TypeScript build error: "Cannot find name 'newBalance'"

**Root Cause:** After switching from `const newBalance = session.balance - totalBet` to atomic `balance: { decrement }`, a response fallback line still referenced `newBalance`.

**Lesson:** When removing a variable during refactoring, **always search for ALL references** across the entire file before considering the change done. A simple `grep` or Find would have caught this instantly.

---

## Phase 2 Mainnet Hardening — Gotchas (2026-02-10)

### Prisma generate required after schema changes

**Symptom:** TypeScript errors like "Property 'sweepLog' does not exist on type 'PrismaClient'" or "Property 'lastSweptAt' does not exist" even though the field is clearly in `schema.prisma`.

**Root Cause:** Prisma generates TypeScript types from the schema file. Adding a new model (`SweepLog`) or new fields (`lastSweptAt`, `totalSwept` on `DepositWallet`) to `schema.prisma` does NOT automatically update the generated types.

**Fix:** Always run both commands after schema changes:
```bash
npx prisma generate   # Regenerate TypeScript types
npx prisma db push    # Apply schema to database
```

**Lesson:** If you see "property does not exist" errors after adding fields to `schema.prisma`, check whether you ran `prisma generate` before suspecting a code bug.

### processGameCompletion double-payout race condition

**Symptom:** Player receives 2x the correct payout on a winning hand. Balance credited twice for the same game.

**Root Cause:** `processGameCompletion()` can be called from two code paths in the same request cycle:
1. `handleGameAction()` — player action (stand, bust, etc.) completes the hand
2. `handleStartGame()` — auto-dealing a new hand first completes the previous game

If both paths call `processGameCompletion()` for the same game ID, and the function uses a simple `update` to mark the game completed and credit the payout, both calls succeed — the payout is credited twice.

**Fix:** Use `updateMany` with a status guard as a compare-and-swap:
```typescript
const result = await prisma.game.updateMany({
  where: { id: gameId, status: 'active' },  // Only match if STILL active
  data: { status: 'completed' }
})
if (result.count === 0) {
  // Another call already completed this game — skip payout
  return
}
// Safe to credit payout — we won the race
```

**Lesson:** Any function that credits money and can be reached from multiple code paths MUST use an atomic status transition. Check the return count — if 0 rows were updated, someone else already handled it.

### updateMany returns count, not the record

**Symptom:** Trying to access fields on the result of `updateMany()` returns undefined.

**Root Cause:** `prisma.model.updateMany()` returns `{ count: number }`, not the updated record(s). This is different from `prisma.model.update()` which returns the full updated record.

**Fix:** If you need the updated record after an `updateMany`, fetch it separately:
```typescript
const result = await prisma.game.updateMany({
  where: { id: gameId, status: 'active' },
  data: { status: 'completed' }
})
if (result.count > 0) {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  // Now you have the full record
}
```

### Kill switch must not block deposit detection

**Symptom:** During maintenance mode, user deposits arrive on-chain but are never credited to their session balance.

**Root Cause:** A naive kill switch implementation that blocks all POST /api/wallet requests also blocks the deposit polling/detection flow.

**Fix:** The kill switch should only gate specific actions (`action === 'start'` for games, `action === 'withdraw'` for wallet), not entire endpoints. Deposit detection (`action === 'deposit-status'` or similar) must continue working during maintenance.

---

## Withdrawal Reliability — Gotchas (2026-02-16)

### UI shows 0.5500 but withdrawal still says insufficient

**Symptom:** Withdrawal modal shows `Available Balance: 0.5500 ZEC`, `Amount: 0.5499`, fee `0.0001`, but button remains disabled with "Insufficient balance (need 0.5500 ZEC including fee)".

**Root Cause:** Session balance in DB drifted to a float-dust value (`0.5499999999999996`) while UI displayed rounded 4 decimals. Validation compared against the real underlying value, not the displayed value.

**Fix:**
- Validate withdrawal amounts in zatoshi-style integer math in UI.
- Add ledger-level normalization after each mutation:
  - `balance`
  - `totalWagered`
  - `totalWon`
  - `totalDeposited`
  - `totalWithdrawn`
- Allow sub-zatoshi tolerance in atomic reserve checks to avoid IEEE754 dust false negatives.
- Round API response balances to 8 decimals before returning to clients.

### "Withdrawal temporarily unavailable. Balance has been refunded." with healthy house funds

**Symptom:** Withdrawal request is accepted, then fails with temporary unavailability and refunds user balance.

**Root Cause:** House liquidity precheck used stricter confirmation behavior than the actual `z_sendmany` operation (which runs with `minconf=1`), so precheck could reject funds that were actually spendable by the send path.

**Fix:**
- Add `minConfirmations` parameter to `getAddressBalance(...)`.
- Use `getAddressBalance(houseAddress, network, 1)` in both:
  - user withdrawal precheck (`/api/wallet`)
  - admin approval send path (`/api/admin/pool`)
- Keep deposit confirmation requirements unchanged; this fix is only for house-spend prechecks.

### `tx unpaid action limit exceeded` on withdrawal

**Symptom:** Withdrawal fails with:
`SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 1 action(s) exceeds limit of 0`

**Root Cause:** `z_sendmany` was called with `fee = null`, and node policy treated the transaction as unpaid for shielded action accounting.

**Fix:**
- In `sendZec(...)`, pass an explicit fee to `z_sendmany` (0.0001 ZEC) instead of `null`.
- Keep fee normalized to 8 decimals before RPC call.

### `tx unpaid action limit exceeded` still occurs with fee=0.0001

**Symptom:** Withdrawal still fails even after explicit fee with:
`SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: 2 action(s) exceeds limit of 0`

**Root Cause:** A fixed fee may still underpay ZIP-317 unpaid-action policy for transactions with more logical actions.

**Fix:**
- Add automatic retry in `sendZec(...)` for this error signature.
- Parse unpaid/limit counts from the error and increase fee by marginal ZIP-317 steps (`+5000` zats per additional paid action).
- Retry `z_sendmany` with elevated fee up to bounded attempts.

### Unpaid-action failure appears in `withdrawal-status` after submission

**Symptom:** Initial withdrawal submission returns pending with an operation id, but status polling later reports:
`SendTransaction: Transaction commit failed:: tx unpaid action limit exceeded: ...`

**Root Cause:** The operation can fail asynchronously after opid creation. Retrying only at the initial `z_sendmany` call is insufficient.

**Fix:**
- In `handleWithdrawalStatus(...)`, detect unpaid-action failure from `getOperationStatus(...)`.
- Resubmit the withdrawal with adjusted fee and update the stored `operationId`.
- Track bounded retry attempts via `failReason` retry marker while status remains pending.
- Refund and mark failed only after retries are exhausted or non-retryable failure occurs.
- Emit `player.withdraw.unpaid_action_retry` telemetry and surface counts in admin overview (24h + all-time).

### Session seed pool reports low availability even though refill is running

**Symptom:** `/api/health` shows `sessionSeedPool.available=0` and fairness warnings/critical status, while pool refill jobs and manual refill actions appear to run.

**Root Cause:** Session fairness seed creation could fail asynchronously after `z_sendmany` returned an opid. The commitment path only handled unpaid-action retries at call-time, not operation-completion-time, so refill silently produced no new seeds.

**Fix:**
- Add operation-level retry in `commitServerSeedHash(...)` when `waitForOperation(...)` fails with `tx unpaid action limit exceeded`.
- Increase fee using the same ZIP-317 marginal step logic used for immediate RPC rejections.
- Add explicit logging in:
  - `createAnchoredFairnessSeed(...)` for commitment creation failures
  - `session-seed-pool-manager` refill loop when seed creation returns null

---

## Build/Deploy Outage — Gotchas (2026-02-17)

### All routes return 404 after successful container start

**Symptom:** `https://21z.cash`, `https://cypherjester.com`, and `/api/health` all return Next.js 404 while container logs show startup success.

**Root Cause:** The server repo had an untracked nested `app/` directory with a second copy of the codebase (`app/src/app/...`). Docker copied it into build context, and Next.js compiled route entries from that tree, producing path-prefixed routes (`/src/app/...`) that do not match public URLs.

**Fix:**
- Add `app/` (and `data/`) to `.dockerignore`.
- Rebuild with `--no-cache` so stale route layers are not reused.
- Verify build route table includes `/`, `/blackjack`, `/api/health` (no `/src/app/*` routes).

### Hotfix build fails with `unknown option '--no-turbopack'`

**Symptom:** Docker build fails at Next build step with `error: unknown option '--no-turbopack'`.

**Root Cause:** Current Next.js CLI version on production (`16.1.4`) does not support `--no-turbopack`.

**Fix:**
- Use the supported build command (`npm run build`, which maps to `next build` in this repo).
- Confirm valid CLI options before pushing Dockerfile flag changes.

### rsync to VPS overwrites deployment-specific patches

**Symptom:** After rsyncing local source to VPS, Docker build fails or produces broken routes — even though local builds work fine.

**Root Cause:** Direct `rsync` from local development machine to VPS overwrites files that had been specifically patched for production Docker builds (e.g., Dockerfile, next.config.ts). It can also create nested directories that pollute the Docker build context.

**Fix:**
- **NEVER** rsync source files directly to VPS.
- Always use the git workflow: commit → push → `git pull` on VPS → rebuild.
- The `.dockerignore` file protects against known stale directories (`app/`, `data/`), but new rsync artifacts can introduce new problems.

### CSS changes deployed but not visible in production

**Symptom:** Routes return 200, pages render, but visual changes (e.g., cyberpunk theme overrides) are missing from the page.

**Root Cause:** The Docker rebuild used source code that was missing the CSS changes — they were committed locally but not yet pushed/pulled to the VPS.

**Fix:**
1. After deploying, check the CSS bundle hash in `<link>` tags — it should differ from the previous deployment.
2. Grep the production CSS bundle for specific identifiers (e.g., `activeHandPulse21z`) to confirm changes are present.
3. Before rebuilding, always verify `git log` on VPS matches the expected commit hash.

---

## Dual-Brand CSS — Gotchas (2026-02-17)

### 21z overrides not applying despite correct CSS

**Symptom:** CSS rules with `body[data-brand="21z"]` prefix have no effect on the page.

**Possible Causes:**
1. `data-brand` attribute not set on `<body>` — check `src/lib/brand/server.ts` and `src/app/layout.tsx`.
2. Specificity issue — the 21z override selector must be at least as specific as the base rule. Use `!important` only for properties that truly need it (e.g., `border-radius: 0 !important` for beveled shapes).
3. CSS rule order — 21z overrides must appear AFTER the base rule in `globals.css`.

### clip-path bevels don't clip overflow content

**Symptom:** Content overflows past the beveled corner on 21z panels/buttons.

**Root Cause:** `clip-path` creates a visual clip but doesn't affect layout or overflow behavior. If a child element has `overflow: visible` or positioned content extends beyond the parent, it won't be clipped by the parent's `clip-path`.

**Fix:** Ensure the parent has `overflow: hidden` if child content might extend past the bevel, or apply the clip-path to a wrapper that contains all content.

### Session seed pool drained by abandoned sessions (2026-02-18)

**Symptom:** Pool stays at target (15 available) but `assigned` count grows unbounded (35+). Seeds are consumed faster than refilled even with low traffic.

**Root Cause:** Every new session claims a fairness seed eagerly (on first page load / API call). Most visitors never play a hand — they claim a seed, browse, and leave. The seed stays `assigned` forever because there's no cleanup for unused claims.

**Fix:** Added `reclaimStaleSessions()` to the 5-minute periodic check in `session-seed-pool-manager.ts`. Reclaims seeds where:
- `nextNonce = 0` (seed never used for any game hand)
- Session `lastActiveAt` is older than 24 hours
- Seed status is still `assigned`

Safe because: a seed with nonce 0 has never been used to derive a game outcome, so returning it to the pool doesn't affect fairness integrity.

**File:** `src/lib/services/session-seed-pool-manager.ts`

### Pool stuck at same size despite raising targetSize (2026-02-20)

**Symptom:** Pool has 81 total seeds, 7 available. Changed `targetSize` from 15 to 1000 but pool didn't grow after 24+ hours.

**Root Cause:** The refill gate checked `autoRefillThreshold` (5) BEFORE `targetSize`:
```typescript
// BUG: With available=7 > threshold=5, this always exits early
if (status.available > tuning.autoRefillThreshold) {
  return  // ← never reaches targetSize check
}
const needed = Math.max(0, tuning.targetSize - status.available)
```

The `autoRefillThreshold` was designed as a "low water mark" for a small pool (target=15). When target was raised to 1000, the gate still blocked creation anytime available > 5.

**Fix:** Changed gate to check targetSize:
```typescript
if (status.available >= tuning.targetSize) {
  return
}
```

**Lesson:** When two sequential gates exist (threshold gate → target gate), raising the second gate's limit has no effect if the first gate blocks first. Always trace the full code path to confirm your config change actually takes effect. In this case, changing `targetSize` from 15 to 1000 was invisible because the `autoRefillThreshold` gate (line 131) returned early before `targetSize` was ever read (line 135).

**File:** `src/lib/services/session-seed-pool-manager.ts`

---

### Session creation fails with generic error when zcashd is briefly unreachable (2026-02-18)

**Symptom:** User clicks "Deposit Real ZEC", modal transitions to error step showing "Something Went Wrong / Failed to create session. Please try again." Error is transient — resolves on its own after zcashd recovers.

**Root Cause (5 compounding issues):**

1. **No RPC retry:** `createDepositWalletForSession()` made a single `checkNodeStatus()` call with 5s timeout. One timeout = immediate failure.

2. **Generic error masking:** API catch block returned `{ error: 'Failed to get session' }` for ALL failures — node down, DB error, rate limit, race condition. Frontend couldn't distinguish or show helpful message.

3. **No pre-flight check:** OnboardingModal called `onCreateRealSession()` directly. The 5s+ timeout on wallet creation left the user staring at a spinner before getting an unhelpful error.

4. **Address index race condition:** `findFirst({ orderBy: addressIndex: 'desc' })` + increment was not atomic. Two concurrent session creates could collide on the same index.

5. **Rate limit too tight:** `session-create` bucket was 10 req/60s — easy to hit during demos or rapid testing.

**Fix:**

```typescript
// 1. Retry with 2s backoff (session-wallet.ts)
let nodeStatus = await checkNodeStatus(network)
if (!nodeStatus.connected) {
  await new Promise(resolve => setTimeout(resolve, 2000))
  nodeStatus = await checkNodeStatus(network)
}

// 2. Specific error codes (api/session/route.ts)
return NextResponse.json({
  walletError: 'node_unavailable',
  walletErrorMessage: 'The Zcash node is temporarily unavailable...',
})

// 3. Pre-flight health check (OnboardingModal.tsx)
const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(4000) })
if (health.zcashNode && !health.zcashNode.connected) {
  setErrorMessage('The Zcash node is temporarily offline...')
  return
}

// 4. Atomic address index (session-wallet.ts)
const wallet = await prisma.$transaction(async (tx) => {
  const lastWallet = await tx.depositWallet.findFirst({ orderBy: { addressIndex: 'desc' } })
  const addressIndex = (lastWallet?.addressIndex ?? -1) + 1
  return tx.depositWallet.create({ data: { sessionId, addressIndex, ... } })
})

// 5. Rate limit bump (rate-limit.ts)
'session-create': { maxRequests: 20, windowMs: 60 * 1000 }
```

**Lesson:** Every user-facing operation that depends on external services (RPC, DB) needs three things: retry on transient failure, specific error codes, and a user message that explains what happened. "Something went wrong" during a live demo is unacceptable.

**Files:** `session-wallet.ts`, `api/session/route.ts`, `OnboardingModal.tsx`, `useGameSession.ts`, `rate-limit.ts`

---

### Deposit modal renders empty — black screen (2026-02-18)

**Symptom:** Clicking "Deposit" → "Real ZEC" shows a dark backdrop with no modal content. The modal container is only 2px tall with zero children. Affects both brands (21z and CypherJester).

**Root Cause:** Two-part failure in falsy value handling:

1. `BlackjackGame.tsx:394` — `data.depositAddress || ''` converted null/undefined deposit address into empty string `''`
2. `OnboardingModal.tsx:160` — Conditional render `step === 'deposit' && localDepositAddress && (...)` treated `''` as falsy

The `handleRealSelect` callback called `setStep('deposit')` unconditionally, but the `DepositScreen` component only rendered when `localDepositAddress` was truthy. Empty string `''` is falsy in JavaScript, so the step transitioned but nothing rendered — leaving a dark `bg-black/80` backdrop with an empty container.

**Fix:**
1. Changed fallback from `|| ''` to `|| null` — don't mask null as empty string
2. Added validation before `setStep('deposit')` — only transition if `result.depositAddress` is truthy
3. Added `'error'` step with retry UI — shows "Something Went Wrong" instead of blank screen
4. Added auto-advance — when modal opens with existing deposit address, skip welcome screen

**Lesson:** Never use `|| ''` as a fallback for values used in conditional rendering. Empty string is falsy. Use `|| null` and handle null explicitly.

**Files:** `src/components/onboarding/OnboardingModal.tsx`, `src/components/game/BlackjackGame.tsx`

---

### Admin kill switch banner always visible (2026-02-18)

**Symptom:** Admin dashboard permanently shows "WARNING: Kill switch active — new games and withdrawals are blocked." even though kill switch is off.

**Root Cause:** The banner condition checked `overview.killSwitch` instead of `overview.killSwitch?.active`. The API returns `killSwitch: { active: false, activatedAt: null, activatedBy: null }` — an object, which is **always truthy** in JavaScript regardless of the `active` property value.

**Fix:** Changed both checks from `overview.killSwitch` to `overview.killSwitch?.active`:
- Line 606: outer container visibility condition
- Line 620: inner banner render condition

**Lesson:** When an API returns a status object like `{ active: boolean }`, never check truthiness of the object itself. Always check the specific boolean property. Objects are always truthy — even `{}`, `{ active: false }`, and `{ enabled: 0 }`.

**File:** `src/app/admin/page.tsx`

---

### Hover glow visible on mobile (touch devices)

**Symptom:** On mobile, tapping a button shows the hover glow that stays visible after releasing.

**Root Cause:** Many mobile browsers trigger `:hover` on tap and leave it active until the user taps elsewhere.

**Note:** This is a known browser behavior. The glow is subtle enough that it's acceptable. A `@media (hover: hover)` wrapper could restrict glow to pointer devices only, but this would also exclude stylus users.

---

### localStorage per-domain causes inconsistent UX across brands (2026-02-18)

**Symptom:** Clicking "Play Blackjack" on cypherjester.com went to demo mode, but on 21z.cash went to real ZEC choice modal.

**Root Cause:** `localStorage.getItem('zcashino_onboarding_seen')` is per-domain. CypherJester had it set from prior testing; 21z.cash did not. The onboarding modal only showed when this flag was absent.

**Fix:** Removed dependency on the `zcashino_onboarding_seen` flag entirely. The `useGameSession` hook checks for `zcashino_session_id` — if present, restore session; if absent, auto-create demo. No localStorage flag gates the UX flow.

**Lesson:** Never use per-domain localStorage flags to control UX that must be identical across domains sharing the same codebase. Derive UX state from actual data (session exists? demo or real?) not from flags that may differ per origin.

**Files:** `src/hooks/useGameSession.ts`, `src/components/game/BlackjackGame.tsx`, `src/components/game/VideoPokerGame.tsx`

---

### Demo cookie blocked real-session creation and showed fake deposit-wallet error (2026-04-09)

**Symptom:** A player clicked "Deposit Real ZEC" from an active demo session and saw "Something Went Wrong / Failed to generate deposit address." The live API looked healthy, but the modal still failed.

**Root Cause:** `GET /api/session` trusted the existing signed player cookie before honoring the `?wallet=real_...` query param used by `handleCreateRealSession()`. If the browser already had a demo-session cookie, the route returned that same demo session instead of creating a new real-money session. The frontend then received `depositAddress: null` and showed the generic deposit-address failure message even though wallet generation had never actually been attempted for a real session.

There was a second trap hiding behind the same symptom: if a real session had been created earlier during a transient wallet outage and therefore had `wallet: null`, later `GET /api/session` restores would keep returning that incomplete session without retrying wallet creation.

**Fix:**
1. Treat an explicit `?wallet=...` request from a demo cookie session as an upgrade request, not a restore request.
2. Skip wallet-address lookup in that upgrade path so the route proceeds to create a new real session.
3. Self-heal real sessions that exist without a deposit wallet by retrying `createDepositWalletForSession()` on subsequent session reads.
4. Add regression tests for both flows.

**Lesson:** When one route handles both "restore current session" and "create new real session", cookie restoration cannot blindly win. Explicit create intent must override a demo-session cookie, or the UI will surface a misleading downstream error.

**Files:** `src/app/api/session/route.ts`, `src/app/api/session/route.test.ts`

---

### Insurance decline must be server-side - game logic never client-only (2026-02-18)

**Symptom:** Player allowed to Hit/Stand while insurance prompt was visible. Dealer blackjack not checked after declining insurance. Player could play a full hand and lose to a dealer blackjack that should have ended the round immediately.

**Root Cause:** `handleInsurance(false)` only set `insuranceDeclined = true` locally. No server call → `dealerPeeked` stays `false` → dealer blackjack never checked → player plays a hand they should have lost to dealer BJ. Also, action buttons rendered when `phase === 'playerTurn'` with no guard for pending insurance.

**Fix:** Added `decline_insurance` server action. Client sends POST to `/api/game` with `action: 'decline_insurance'`. Server calls `declineInsurance()` which peeks for dealer blackjack. If dealer has BJ, round resolves immediately (dealer wins). Also added `!showInsuranceOffer` guard on action buttons render.

**Rule:** Game logic = server-side. UI state = client-side. Never blur this boundary. When adding any new game feature, ask: "does this client-side state change affect what hands/outcomes are possible?" If yes, it must round-trip through the server.

**Files:** `src/lib/game/blackjack.ts`, `src/app/api/game/route.ts`, `src/components/game/BlackjackGame.tsx`, `src/lib/validation/api-schemas.ts`

---

## Investigation Process — Gotchas (2026-02-18)

### Module-level cache pollution in Vitest (2026-02-20)

**Symptom:** 8/12 feed API tests fail. First test passes, subsequent tests return cached data from the first test instead of hitting mocked DB calls.

**Root Cause:** The feed route handler has a module-level `let cachedResponse` variable that persists between tests in the same Vitest worker. After one test caches a response, all subsequent tests get stale data regardless of their mock setup.

**Important:** `vi.clearAllMocks()` does NOT help — it only resets mock call counts and return values, not module-level state like cache variables.

**Fix:**
```typescript
async function importGET() {
  vi.resetModules()  // Clears module registry
  const mod = await import('./route')  // Fresh import = empty cache
  return mod.GET
}

it('test case', async () => {
  const GET = await importGET()
  // Each test gets its own module instance with empty cache
})
```

**Rule:** Any route handler with module-level state (cache, counters, singletons) needs `vi.resetModules()` + dynamic import in tests. This applies to:
- In-memory response caches
- Rate limiter instances created at module scope
- Singleton database connections
- Any `let` or `const` at the top level of a module

**File:** `src/app/api/feed/route.test.ts`

---

### Never infer production config from .env.example files

**Symptom:** Incorrectly told user production was running `legacy_per_game_v1` fairness mode and planned an unnecessary deployment to "switch" it — when production had already been running `session_nonce_v1` for days.

**Root Cause:** Grepped `.env.example` and `.env.mainnet.example` in the repo (both showed `legacy_per_game_v1` as default). Concluded this was production config. The actual `.env.mainnet` lives only on the VPS at `/opt/zcashino/.env.mainnet` (chmod 600, gitignored) — it already had `PROVABLY_FAIR_MODE=session_nonce_v1`.

Also ignored the user's own statement ("I thought we changed the architecture") which was correct — compounding the error by second-guessing the user.

**Fix — Investigation Protocol for Production Questions:**
1. **Check the running container first:** `ssh root@93.95.226.186 "docker exec mainnet-app-1 printenv <VAR>"`
2. **Check the health endpoint:** `curl http://localhost:3000/api/health` — it reports `fairnessMode` directly
3. **Check the actual env file:** `ssh root@93.95.226.186 "grep <VAR> /opt/zcashino/.env.mainnet"`
4. **Never trust `.env.example`** — these are templates for initial setup, not production truth
5. **Never trust code defaults** — `mode.ts` defaults to `legacy_per_game_v1` when env is unset, but that doesn't mean the env IS unset
6. **Trust the user's memory** — if they say "we changed X", verify on VPS before contradicting

**Lesson:** Production state = what's running on the VPS. Repo state = what code supports. These are different things. Always verify the former when answering questions about "what is production doing."

---

### Session ID restore can bypass strict cookie intent if restore endpoint mints cookies from query IDs (2026-02-22)

**Symptom:** Even with strict player-session auth for privileged actions, an attacker with a leaked `sessionId` could attempt to restore that session by calling `GET /api/session?sessionId=<victim>` and receive a fresh signed cookie.

**Root Cause:** Session restore accepted caller-provided identifiers as authority. The route used query `sessionId` (and wallet lookup hints) directly, then set a signed cookie for the found session. Identity was not derived from an existing valid cookie.

**Fix:**
1. In `GET /api/session`, only allow restore when query `sessionId` matches a valid signed cookie identity.
2. Reject ID-only/mismatch restore attempts with 401.
3. In `GET /api/wallet`, `GET /api/game`, and `GET /api/video-poker`, require `requirePlayerSession(...)`, reject `legacyFallback`, and use trusted cookie session ID for DB queries.
4. Added regression tests for no-cookie/mismatch/attacker-query scenarios.

**Key files:** `src/app/api/session/route.ts`, `src/app/api/wallet/route.ts`, `src/app/api/game/route.ts`, `src/app/api/video-poker/route.ts`, `src/app/api/session/route.test.ts`, `src/app/api/wallet/route.test.ts`, `src/app/api/game/route.test.ts`, `src/app/api/video-poker/route.test.ts`

---

### Strict cookie restore without a backup credential creates a dead-end UX (2026-03-23)

**Symptom:** The app correctly blocked `sessionId`-only restores for security, but players who lost the signed browser cookie had no supported way back into a real-money session. The onboarding modal still showed a restore affordance, so the experience felt broken even though the hardening was intentional.

**Root Cause:** Session security and session recovery were treated as the same feature. Once the cookie became the only authority source, the product needed a second authority source for cross-browser/manual restore. Without that, the "restore" UI was either a dead button or a security regression waiting to happen.

**Fix:**
1. Add a separate recovery credential model for non-demo sessions and store only a hash of a high-entropy recovery key.
2. Add `playerAuthVersion` to session auth state and signed player cookies so a successful manual restore can invalidate older browser cookies.
3. Add `/api/session/recovery` for key creation, regeneration, and restore; never trust caller-supplied `sessionId` for manual recovery.
4. Keep same-browser auto-restore via local storage + cookie, but when stale local storage hits a `401`, guide the user into the recovery flow instead of silently dropping them into a new session.

**Key files:** `prisma/schema.prisma`, `src/lib/auth/player-session.ts`, `src/app/api/session/recovery/route.ts`, `src/hooks/useGameSession.ts`, `src/components/onboarding/OnboardingModal.tsx`

---

### Pending withdrawals can look unresolved even after zcashd has already sent them (2026-03-24)

**Symptom:** The admin dashboard showed a fresh withdrawal as `PENDING`, but zcashd had already finished the `z_sendmany` operation and assigned a real txid. The dashboard also continued to show old `pending` rows unless someone used a manual poll action.

**Root Cause:** Withdrawal state reconciliation only happened in ad hoc action paths. Read endpoints such as `/api/admin/overview`, `/api/admin/withdrawals`, and `/api/health` were returning raw DB rows without first checking `operationId` state against zcashd.

**Fix:**
1. Add a shared withdrawal reconciliation service that:
   - confirms successful operations and stores txid/confirmedAt
   - retries unpaid-action failures with adjusted ZIP-317 fee
   - refunds only real failures
2. Run reconciliation before admin overview, admin withdrawals, and health reads.
3. Reuse the same service for player polling and admin poll/process actions so there is one source of truth.

**Files:** `src/lib/services/withdrawal-reconciliation.ts`, `src/app/api/wallet/route.ts`, `src/app/api/admin/overview/route.ts`, `src/app/api/admin/withdrawals/route.ts`, `src/app/api/admin/pool/route.ts`, `src/app/api/health/route.ts`

---

### `Operation not found` must stay in manual-review territory (2026-03-24)

**Symptom:** Older pending withdrawals can survive container restarts with an `operationId` that zcashd no longer remembers. A naive reconciler sees that missing op and could mark the withdrawal failed and refund the player.

**Root Cause:** zcashd operation memory is not a durable source of truth. Once an op disappears from `z_getoperationstatus`, the system no longer has enough evidence to distinguish "never sent" from "sent successfully but op memory is gone" unless it also has the chain txid.

**Fix:** Treat `Operation not found` as `unknown`, leave the row out of the automatic refund path, and provide a deliberate admin-only manual confirm action that requires the known chain txid.

**Files:** `src/lib/services/withdrawal-reconciliation.ts`, `src/app/api/admin/pool/route.ts`, `src/app/admin/withdrawals/page.tsx`, `src/app/admin/page.tsx`

---

### Swap onboarding can fail in two subtle ways at once (2026-04-09)

**Symptom:** "Play & Swap" on `/get-zec` landed on Blackjack without opening the deposit flow, and once players manually opened the real-money onboarding modal the "Need ZEC?" tab could spam `/api/wallet`, throw `Maximum update depth exceeded`, and make the swap UI look broken.

**Root Cause:** The CTA still linked to `/blackjack` instead of `/blackjack?onboarding=deposit`, so the swap journey was not entered directly. Separately, `useDepositPolling()` depended on mutable status values and inline callbacks, so every render rebuilt `checkForDeposits()`, restarted the polling effect, and triggered a render loop inside `OnboardingModal`.

**Fix:** Pointed the `/get-zec` swap CTA directly at deposit onboarding and stabilized `useDepositPolling()` with refs for the latest status/callbacks so polling keeps one steady interval instead of rearming on every render. Added a regression test that rerenders with new callback identities and confirms polling does not restart.

**Key files:** `src/app/get-zec/page.tsx`, `src/hooks/useDepositPolling.ts`, `src/hooks/useDepositPolling.test.ts`

---

### Admin withdrawal decisions need a guarded status claim before moving funds (2026-04-24)

**Symptom:** Two concurrent admin approval clicks could both read the same `pending_approval` withdrawal and each call `sendZec(...)`. Two concurrent rejection clicks could each refund the same reserved withdrawal balance.

**Root Cause:** The approval/rejection paths used read-then-act flows around money movement. The row status was only updated after the external wallet call or after balance mutation, so duplicate requests had a race window.

**Fix:**
1. Approval must first claim the row with `updateMany({ where: { status: 'pending_approval' } })` before calling `sendZec(...)`.
2. Duplicate approval callers should re-read the row and return an idempotent "already processing/processed" response, not call the wallet RPC again.
3. Rejection must move `pending_approval -> failed` and release held funds in the same Prisma transaction.
4. Only refund/release funds when the guarded status update affects exactly one row.

**Files:** `src/app/api/admin/pool/route.ts`, `src/app/api/admin/pool/route.test.ts`

---

### Primary CTAs can disappear inside mobile overflow nav (2026-04-24)

**Symptom:** A "Buy ZEC" header CTA looked clear on desktop but sat off-screen on mobile because it was the final item in a horizontally scrollable nav row.

**Root Cause:** The header treated the primary acquisition CTA like a normal navigation link. On narrow viewports, the overflow nav showed the early game links first and required horizontal scrolling before users could find the action meant for visitors who do not already have ZEC.

**Fix:** Keep the primary CTA in the always-visible header row and put secondary nav links in the scrollable row on smaller screens.

**Lesson:** Acquisition or deposit CTAs should not depend on horizontal scrolling for discovery. For mobile headers, separate the primary action from secondary navigation.

**Files:** `src/components/layout/SiteHeader.tsx`, `src/app/globals.css`

---

### zcashd Docker Image Entrypoint Change (2026-05-01)

**Symptom:** Production showed `zcashNode.connected=false`, real-session creation failed with "The Zcash node is temporarily offline," and the Telegram monitor repeated `NODE ERROR: Cannot reach zcash-cli (RPC unresponsive)`.

**Root Cause:** The running `electriccoinco/zcashd:latest` image was still v6.11.0 and shut itself down at mainnet block height 3327100 with a deprecation error. Pulling the current image upgraded to v6.12.1, but the newer image no longer accepts raw daemon flags as the container command. It tried to execute `-par=6` as the binary. It also defaults CLI lookups to `/root/.zcash`, while production wallet data is mounted at `/srv/zcashd/.zcash`.

**Fix:** Pull the current image, explicitly set `entrypoint: ["zcashd"]`, pass `-datadir=/srv/zcashd/.zcash` and `-printtoconsole` to `zcashd`, and pass the same `-datadir` to every `zcash-cli` healthcheck/monitor command. The app health endpoint must also use per-RPC wallet timeouts instead of only `Promise.race`, because racing a slow balance promise does not cancel the underlying RPC work.

**Key files:** `docker-compose.mainnet.yml`, `scripts/check-node.sh`, `src/app/api/health/route.ts`, `src/lib/wallet/rpc.ts`

---

### Public health checks must not run withdrawal reconciliation (2026-05-07)

**Symptom:** `/api/health` was publicly reachable and ran `reconcilePendingWithdrawals()` before reporting status, so monitoring traffic could trigger withdrawal retries or refunds.

**Root Cause:** Withdrawal reconciliation had been reused as part of health reporting. The reconciliation service also updated/refunded failed rows without first atomically claiming the pending withdrawal state it had observed.

**Fix:** Keep `/api/health` read-only by reporting the pending withdrawal count directly. In reconciliation, use conditional `updateMany` claims before retrying unpaid-action sends, confirming rows, or refunding failed withdrawals; skip when another worker has already claimed or processed the row.

**Key files:** `src/app/api/health/route.ts`, `src/lib/services/withdrawal-reconciliation.ts`, `src/app/api/health/route.test.ts`, `src/lib/services/withdrawal-reconciliation.test.ts`

---

### GET routes can hide production side effects even when auth-protected (2026-05-15)

**Symptom:** Admin dashboard GET routes still ran withdrawal reconciliation, and the public reserves GET endpoint refreshed per-wallet balance cache rows while serving transparency data.

**Root Cause:** Read endpoints had accumulated convenience maintenance work. That made page refreshes, uptime checks, crawlers, or repeated public reads capable of triggering reconciliation or expensive cache-refresh writes.

**Fix:** Keep admin overview/withdrawal reads observational and leave reconciliation on explicit admin/background paths. Keep `/api/reserves` read-only by returning cached wallet balances, adding a public read rate limit, and avoiding per-wallet RPC/cache writes during the request.

**Key files:** `src/app/api/admin/overview/route.ts`, `src/app/api/admin/withdrawals/route.ts`, `src/app/api/reserves/route.ts`, `src/lib/admin/rate-limit.ts`

---

### Admin secure-cookie defaults must match production, not just FORCE_HTTPS (2026-05-15)

**Symptom:** Player session cookies were marked `Secure` automatically under `NODE_ENV=production`, but admin session cookies only used `Secure` when `FORCE_HTTPS=true`.

**Root Cause:** The two auth cookie helpers had drifted. Admin auth depended on an optional deployment flag instead of the standard production environment signal.

**Fix:** Mark admin session cookies secure when `NODE_ENV=production` or `FORCE_HTTPS=true`, while keeping local/test HTTP usable.

**Key files:** `src/lib/admin/auth.ts`, `src/lib/admin/auth.test.ts`

---

### Treat npm audit force-fixes as suspect when they propose framework downgrades (2026-05-15)

**Symptom:** `npm audit` reported high/moderate dependency advisories after the API surface hardening. Same-major updates reduced the production audit from 22 findings to 5 moderate findings, but the remaining `npm audit fix --force` suggestions wanted to downgrade core packages such as Prisma or Next.

**Root Cause:** Some advisories were in transitive framework/tooling packages where npm's resolver could not find a non-breaking patched path yet, so its "force" suggestion chose an older incompatible version.

**Fix:** Updated current same-major packages (`next`, `prisma`, `@prisma/client`, `@sentry/nextjs`, `postcss`) and verified tests, TypeScript, and production build. Do not run `npm audit fix --force` blindly on this app; inspect the proposed package plan first.

**Key files:** `package.json`, `package-lock.json`

---

### Green health does not mean clean ops logs (2026-07-05)

**Symptom:** Public health, cron checks, and Telegram were quiet, but production app logs contained repeated sweep errors, Next.js image-cache `EACCES` errors, and `/api/reserves` reported a scary false underfunded state.

**Root Cause:** Four old deposit wallets were missing `unifiedAddr`; two had enough cached t-address balance to make the sweep service attempt `z_sendmany` with a bare transparent receiver every 10 minutes. The Docker runtime user did not own `.next/cache`. The reserves endpoint mixed demo-linked wallets and transparent snapshots into the reserve ratio instead of using real-money liabilities and the full wallet balance.

**Fix:** Skip legacy no-UA sweep rows without counting them as sweep errors, chown `.next` for the `nextjs` runtime user, filter demo sessions from reserves, calculate reserve coverage from wallet balance, and auto-dismiss resolved stale alerts when their owning checks prove recovery.

**Key files:** `src/lib/services/deposit-sweep.ts`, `src/app/api/reserves/route.ts`, `src/app/reserves/page.tsx`, `src/lib/admin/alerts.ts`, `Dockerfile`
### Standalone output, nonce CSP, and proxy trust cross release boundaries (2026-07-09)

**Symptoms:** A local standalone build could contain environment/database/project files; a strict script policy could block JSON-LD; CI smoke could run a server with missing static assets or a different SQLite file; and a caller-supplied forwarded host could select the Cypher admin brand.

**Root causes:** Next.js traces files loaded during the build, standalone `server.js` changes its working directory, `public/` and `.next/static/` are not copied automatically, nonced CSP applies to non-executable JSON-LD script tags too, and `x-forwarded-host` is untrusted unless the deployment proxy overwrites it.

**Fix:** Validate the standalone artifact and construct the runtime image only from validated output; copy public/static assets for standalone smoke tests and use an absolute test database URL; generate one request nonce in `proxy.ts` and pass it to all JSON-LD; ignore forwarded hosts unless explicitly trusted; and make admin host checks reject fallback resolution.

**Key files:** `Dockerfile`, `.dockerignore`, `scripts/validate-standalone-artifact.mjs`, `scripts/prepare-standalone-smoke.mjs`, `src/proxy.ts`, `src/components/seo/JsonLd.tsx`, `src/lib/brand/resolve-host.ts`, `src/lib/admin/host-guard.ts`

---

### zcashd hard-stops at block 3417100 and cannot serve NU6.3 (2026-07-19)

**Symptom:** Telegram reported `NODE ERROR: Cannot reach zcash-cli`, and the
zcashd container repeatedly restarted even though it was not out of memory.

**Root Cause:** The pinned zcashd 6.20.0 predisclosure build reached its mandatory
deprecation height, logged that the version was deprecated as of block 3417100,
and exited normally. There is no later zcashd release that supports NU6.3.

**Fix:** Enable the production kill switch, stop the restart loop, and take a
hash-verified root-only copy of `wallet.dat`. Replace mainnet with digest-pinned
Zebra 6.0.0 and Zallet 0.1.0-beta.1, migrate the wallet under maintenance, and
reopen only after Zebra and the Zallet wallet scan are at the same tip. Monitoring
must use `getwalletstatus`; encrypted backups must contain both `wallet.db` and
`encryption-identity.txt`.

**Key files:** `docker-compose.mainnet.yml`, `src/lib/wallet/rpc.ts`,
`scripts/check-node.sh`, `scripts/backup-wallet.sh`

---

### Zallet beta.1 container omits two host dependencies (2026-07-19)

**Symptom:** `migrate-zcashd-wallet` reported that `db_dump` was missing, and
the Zaino backend later failed with `No CA certificates were loaded from the
system` even though it was connecting to Zebra over private HTTP.

**Root Cause:** The digest-pinned beta.1 image is a fully static distroless
runtime. It does not contain the Berkeley DB 6.2 `db_dump` migration helper,
a dynamic loader, or a CA certificate bundle.

**Fix:** For the one-time migration, build `db_dump` from checksum-verified
Oracle Berkeley DB 6.2.32 source and mount it with its matching musl loader;
verify `db_dump -V` inside the pinned Zallet image before exposing the wallet.
For runtime, mount the host's `/etc/ssl/certs` read-only and set
`SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`.

**Key file:** `docker-compose.mainnet.yml`

---

### `--no-scan` can create a wallet that reaches tip but never becomes ready (2026-07-20)

**Symptom:** Zallet's wallet and fully-synced heights match Zebra, but
`getwalletstatus.sync_work_remaining.progress` remains far below 100%.

**Root Cause:** The offline migration could not resolve transaction birthdays
or fetch the prior block's Sapling and Orchard tree state. Migrated accounts were
stored with zero birthday tree sizes, so scan progress counted incompatible ranges.

**Fix:** Keep the original `wallet.dat`, perform a fresh chain-aware migration
without `--no-scan` in a separate volume, initialize wallet encryption first, and
do not swap it into production until scan readiness, balances, account mappings,
SQLite integrity, and encrypted recovery artifacts all pass.

**Key files:** `src/lib/wallet/rpc.ts`, `scripts/backup-wallet.sh`

---

### Migrated accounts do not prove published Unified Addresses are registered (2026-07-20)

**Symptom:** Account indices, seed fingerprints, and balances migrate correctly,
but `z_getaccount` and `listaddresses` do not contain the deposit UAs stored by
the application.

**Root Cause:** The Zallet beta importer can generate a new default receiver set
at a zcashd diversifier index instead of preserving the original
`unifiedaddrmeta` receiver set. The underlying Sapling and transparent receivers
remain derivable, but the exact published UA is not registered for scanning and
attribution.

**Fix:** Preserve the original `wallet.dat`; extract its `unifiedaccount` and
`unifiedaddrmeta` records; verify every stored UA's decoded receivers against the
migrated account and diversifier; and register or repair the exact UA in an
isolated, backed-up wallet database before cutover.

**Key files:** `src/lib/wallet/rpc.ts`, `prisma/schema.prisma`

---

### Production monitoring must select Zallet explicitly and parse stdout only (2026-07-21)

**Symptom:** Telegram repeatedly reports `NODE DOWN: zcashd container is not
running` after production has successfully migrated to Zebra and Zallet. The
monitor log also contains `jq` parse errors.

**Root Cause:** The monitor inferred its backend from a fallible Compose probe,
so a failed probe fell through to the retired zcashd check. It also merged
Zallet's informational stderr log with its JSON stdout before passing the result
to `jq`.

**Fix:** Select Zallet deterministically for the mainnet Compose file, keep the
legacy zcashd path only for non-mainnet stacks, and capture RPC stderr separately
so only JSON stdout is parsed.

**Key files:** `scripts/check-node.sh`, `.env.monitoring`

---

### Legacy SQLite migration history cannot be validated by a clean database alone (2026-07-09)

**Symptom:** Clean bootstrap and fully migrated database tests pass, but a production database with partial/manual schema changes may still fail a pending historical migration.

**Root cause:** The legacy migration chain and production's recorded `_prisma_migrations` state can diverge from the current schema. Rewriting historical SQL would break checksums and make existing installations less trustworthy.

**Fix:** Empty databases use the current Prisma schema and baseline all historical migrations; non-empty databases without history fail closed; databases with history use normal deploy/status. Before the first rollout of automatic migration gating, back up production and inspect its migration rows and schema, then explicitly resolve or forward-repair any drift.

**Key files:** `scripts/migrate-safe.js`, `scripts/check-migrations.js`, `docker-compose.mainnet.yml`, `prisma/migrations/`

---

### Alternating NODE DOWN / NODE SYNCING-wallet-0 alerts are a Zallet restart loop the monitor couldn't explain (2026-08-07)

**Symptom:** Telegram pages every 5 minutes, alternating between `NODE DOWN:
Zallet wallet container is not running` and `NODE SYNCING: Zebra <tip>, Zallet
wallet 0, fully scanned 0` while Zebra's height keeps advancing normally.

**Root Cause:** The Zallet container is repeatedly leaving the `running` state.
Each cron run caught it either mid-restart (`compose ps --status running` empty
→ DOWN) or freshly started, when `getwalletstatus` legitimately reports
absent/zero `wallet_tip` and `fully_synced_height` before the scanner loads
(→ "SYNCING wallet 0"). Later confirmed on the VPS as *planned* stops — see the
2026-08-09 entry below — not an OOM kill or crash loop.
The monitor had three gaps: the container-down and scan-state branches ignored
`NODE_STARTUP_GRACE_SECONDS` (only the RPC-error branch used it), the DOWN
alert carried no evidence of *why* the container was gone, and identical alerts
re-fired every 5 minutes with no dedup.

**Fix:** `check-node.sh` now (a) attaches `docker inspect` state (exit code,
`OOMKilled`, restart count) plus the last log lines to DOWN alerts, (b) applies
the startup grace to zero scan-state readings and raises a distinct
`NODE ERROR: wallet DB may be empty or rebuilding` only beyond the grace
window, (c) tolerates `NODE_SYNC_LAG_TOLERANCE` (2) blocks of scan lag,
(d) rate-limits same-class alerts via `NODE_ALERT_COOLDOWN_SECONDS` (30 min)
in `.node-monitor-alerts` and sends one `NODE OK` recovery message, and
(e) reports a failed `docker compose ps` probe as its own error instead of
NODE DOWN. Diagnose the loop itself on the VPS with `docker inspect
mainnet-zallet-1 --format '{{.State.Status}} {{.State.ExitCode}}
{{.State.OOMKilled}} {{.RestartCount}}'` and `docker logs --tail 100
mainnet-zallet-1`; if `OOMKilled=true`, raise the zallet memory limit in
`docker-compose.mainnet.yml`.

**Key files:** `scripts/check-node.sh`, `DEPLOYMENT.md`, `.gitignore`

---

### The weekly wallet backup stops Zallet — planned maintenance paged as NODE DOWN (2026-08-09)

**Symptom:** Follow-up to the 2026-08-07 entry. On the VPS, `docker inspect
mainnet-zallet-1` showed `exit=0 oom=false restarts=0
started=2026-08-09T04:00:11Z` (a Sunday), kernel logs had no OOM kills, and
the wallet was healthily re-scanning toward the tip.

**Root Cause:** `backup-wallet.sh` (cron: Sunday 04:00 UTC) intentionally runs
`compose stop zallet`, encrypts `wallet.db` + `encryption-identity.txt`, then
`compose start zallet`. `check-node.sh` (cron: every 5 min, including :00)
races the stop window and pages NODE DOWN, then pages NODE SYNCING while the
restarted wallet re-scans blocks to catch up. Two cooperating cron jobs, no
coordination.

**Fix:** (a) `backup-wallet.sh` now creates the monitor's existing pause file
(`.node-monitor-paused`) before stopping the wallet and removes it in its EXIT
cleanup — only if the backup itself created it, so an operator-placed pause
survives. (b) `check-node.sh` treats scan lag while container uptime is inside
`NODE_STARTUP_GRACE_SECONDS` as expected catch-up (logged, not paged), covering
the post-backup re-scan and every deploy restart.

**Rule:** Any script that intentionally stops a monitored service must pause
the monitor for the duration (pause file), and monitors must treat the
post-restart catch-up window as startup, not degradation.

**Key files:** `scripts/backup-wallet.sh`, `scripts/check-node.sh`
## Security audit remediation (2026-09-04)

**Symptom:** Hidden dealer cards leaked through JSON; concurrent game actions and uncertain withdrawal sends could corrupt accounting; stale admin tokens remained usable.

**Root cause:** Internal state was serialized directly, accounting writes were separate, transport failures were treated as definitive rejections, and authorization trusted token snapshots.

**Fix:** Explicit public game serialization, versioned atomic game transactions, held withdrawals on uncertain sends, strict signed player sessions, database-bound admin token versions and explicit provisioning, HMAC shuffle defaults, scoped verification, and patched dependencies. Rehearse additive migrations on an online production backup before rollout.

**Key files:** `src/lib/game/public-blackjack.ts`, `src/lib/services/blackjack-action.ts`, `src/lib/services/withdrawal-submission.ts`, `src/lib/admin/auth.ts`, `scripts/bootstrap-admin.ts`, `prisma/migrations/20260905050000_security_session_and_game_versions/migration.sql`. Full closure and validation: `notes/security-remediation-2026-09-04.md`.
