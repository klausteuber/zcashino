# Gotchas & Bugs

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
