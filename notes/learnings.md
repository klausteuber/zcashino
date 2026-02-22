# Project Learnings

Last updated: 2026-02-18

## Launch-Critical Learnings

1. Security work must start before polish work.
The highest risk was unauthenticated admin and session-based trust in APIs. Securing control paths changed launch readiness more than UI improvements.

2. Separate operational APIs from public gameplay APIs.
Admin actions (pool refill, withdrawal recovery) need their own auth, rate limits, and audit trails.

3. Audit logs are a product feature, not just infra.
When money moves, operators need historical context in the dashboard itself, not only in server logs.

4. Rate limits should be bucketed by intent.
Login endpoints need stricter limits than read endpoints; write/action endpoints need middle-ground limits to protect uptime.

5. Production guardrails should be explicit.
Credential length and secret strength checks prevent weak configuration drift during deployment.

## Engineering Learnings

1. Keep docs synced with reality.
Test counts and feature lists drift quickly; updating README/notes after each hardening pass avoids confusion.

2. Add small, targeted tests for security primitives.
A few focused tests on auth token integrity and rate-limit behavior provided high confidence with low maintenance cost.

3. Document known infrastructure caveats early.
In-memory limits and remote font fetches are acceptable in dev, but must be called out before scale/production.

## Security Hardening Learnings (2026-02-08)

1. **Math.random() is not safe for anything involving money.**
   The provably fair system originally used `Math.random()` for seed generation. This is a predictable PRNG — an attacker could potentially reverse-engineer the seed sequence. Replaced with `node:crypto.randomBytes` which uses the OS CSPRNG. Lesson: audit every call site that generates secrets, not just the obvious ones.

2. **Rate limiting public APIs prevents abuse before it starts.**
   Added bucket-based rate limiting to all public endpoints (`/api/game`, `/api/session`, `/api/wallet`), not just admin routes. Game actions get tighter limits than session reads. Without this, a single client could flood the game engine or spam withdrawal requests.

3. **CSP and security headers are cheap insurance.**
   Adding `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, and `Permissions-Policy` via `next.config.ts` headers took minimal effort but closes entire classes of XSS, clickjacking, and MIME-sniffing attacks.

4. **Sentry integration needs four entry points in Next.js.**
   Next.js App Router requires separate instrumentation files for server (`instrumentation.ts`), client (`instrumentation-client.ts`), server config (`sentry.server.config.ts`), and edge (`sentry.edge.config.ts`). Missing any one means silent gaps in error reporting for that runtime.

5. **Health check endpoints are essential for deployment.**
   `/api/health` provides a lightweight liveness probe for Docker, load balancers, and CI. It checks DB connectivity and returns uptime, making it trivial to wire into orchestration health checks.

## Deployment & Infrastructure Learnings (2026-02-08)

1. **Next.js standalone output mode is critical for Docker.**
   Setting `output: 'standalone'` in `next.config.ts` produces a self-contained `.next/standalone` directory that includes only the needed `node_modules`. Without it, Docker images carry the full `node_modules` tree (hundreds of MB larger).

2. **Turso/LibSQL is a smooth SQLite-to-production path.**
   Using Prisma's LibSQL adapter means the same schema and queries work with local SQLite in dev and Turso (distributed SQLite) in production. No migration pain, no ORM swap.

3. **Docker Compose should separate app and DB concerns.**
   The `docker-compose.yml` defines the app container with health checks and restart policies, keeping infrastructure config declarative and reproducible.

4. **CI should run lint, typecheck, and tests as separate steps.**
   The GitHub Actions workflow (`.github/workflows/ci.yml`) runs `lint`, `tsc --noEmit`, and `vitest run` independently so failures are easy to diagnose. A build step after tests confirms the production bundle compiles.

5. **Legal pages are a launch prerequisite, not a nice-to-have.**
   `/terms`, `/privacy`, and `/responsible-gambling` pages were created as static routes. Gambling platforms without these are non-starters for any jurisdiction.

## Zcash Infrastructure Learnings (2026-02-08)

1. **No hosted RPC provider supports wallet methods.**
   Services like GetBlock, NOWNodes, and Tatum offer Zcash RPC access, but only for read-only chain queries. Wallet operations (`z_sendmany`, `z_getnewaddress`, `listunspent`) require private keys on the node, which shared infrastructure cannot provide. Self-hosted is the only option for a casino.

2. **Zebra + Zallet is not production-ready for financial apps.**
   Zebra (v4.1.0) is a solid consensus node, but Zallet (v0.1.0-alpha.3) is alpha software missing critical wallet RPCs (`z_getbalance`, `z_listreceivedbyaddress`, `listtransactions`). The API is actively changing — `z_sendmany` is being deprecated, the address model is shifting from address-based to account-based. No Docker image, no security audit, no timeline for stable release.

3. **zcashd is deprecated but still the only viable option.**
   Requires `i-am-aware-zcashd-will-be-replaced-by-zebrad-and-zallet-in-2025=1` in config. The binary still works, has Docker images (`electriccoinco/zcashd`), and provides all wallet RPCs we need. Monitor Zallet for beta; plan migration when API stabilizes.

4. **Testnet faucets are unreliable — mine your own.**
   Zcash testnet faucets go offline frequently. Mining testnet coins with `zcash-cli setgenerate true 1` is the most reliable way to get TAZ. Alternatively, ask in the Zcash Discord.

5. **zcashd resource requirements are non-trivial.**
   Testnet: ~60 GB disk, 4-8 GB RAM, 2-12 hours sync. Mainnet: ~300 GB disk, 8 GB RAM, 15-24 hours sync. A Hetzner CX32 ($8/month) handles testnet comfortably.

6. **Isolate RPC calls behind an adapter layer.**
   All Zcash RPC calls are in `src/lib/wallet/rpc.ts`. When Zallet reaches beta, we swap the implementation without touching game logic. The account-based address model change will require rethinking deposit address generation.

## Brand Reskin Learnings (2026-02-09)

1. **Tailwind v4 `@theme` block makes full color system swaps clean.**
   Define all custom colors in the `@theme` block in `globals.css` with `--color-` prefix. Tailwind v4 automatically generates utility classes (`text-jester-purple`, `bg-masque-gold`, etc.) from these definitions. Legacy aliases (e.g., `--casino-green: var(--jester-purple)`) can bridge the transition.

2. **sed replacement order matters for overlapping names.**
   When replacing color class names like `pepe-green-dark`, `pepe-green-light`, and `pepe-green`, process the longer/more-specific names FIRST. Otherwise `pepe-green` matches inside `pepe-green-dark` and produces `jester-purple-dark` → wrong. Order: `-dark` → `-light` → base.

3. **Keep localStorage keys stable across rebrands.**
   The `zcashino_*` localStorage keys (session, auto-bet, onboarding) were intentionally NOT renamed to avoid breaking existing user sessions. Internal identifiers don't need to match the public brand.

4. **SVG data URIs work well for repeating background textures.**
   The damask brocade pattern is defined as inline SVG in the `background-image` CSS property, encoded as a data URI. This avoids an extra network request and gives precise control over opacity, color, and repeat pattern.

5. **Google Fonts swap via next/font is seamless.**
   Changing from Playfair Display/DM Sans/JetBrains Mono to Cinzel/Inter/IBM Plex Mono required only updating the imports and CSS variable names in `layout.tsx`. The `next/font/google` system handles subsetting and self-hosting automatically.

6. **Git rebase conflicts during deploy are manageable.**
   When the remote had a mobile-responsive commit that modified the same header section being reskinned, the rebase produced 2 conflicts. Resolution: take the reskin colors but keep the remote's responsive classes (px-2 sm:px-4, etc.). Always check both sides before resolving.

7. **Hero image placeholder prevents broken deploys.**
   The AI-generated hero image wasn't ready at deploy time. Copying the old image as a placeholder (`cp pepe-tuxedo.jpg jester-mask.png`) prevented a broken `<img>` on the live site. Replace with real asset when available.

## Mainnet Readiness Audit Learnings (2026-02-10)

1. **A 50-finding mainnet audit is normal for a first pass.**
   Running a systematic audit against mainnet criteria (not just "does it work on testnet") surfaced 7 CRITICAL, 19 HIGH, 18 MEDIUM, 6 LOW findings. Most were silent fallbacks that work fine in dev but are dangerous with real money.

2. **"Works on testnet" ≠ "safe for mainnet".**
   Mock commitments, fake addresses, and silent fallbacks are fine for development iteration speed. But every single fallback path must be audited for mainnet — the question is always "what happens if this runs with real ZEC?"

3. **Atomic database operations are non-negotiable for financial apps.**
   Prisma's `{ decrement: amount }` and `$transaction()` with optimistic locking (`updateMany` with status guard) are the right patterns. Read-compute-write is always a race condition when money is involved.

4. **Startup validation catches config drift before it causes damage.**
   A startup validator that checks env vars, credential strength, and feature flags at boot time prevents deploying to mainnet with testnet config. Fatal on mainnet, warnings on testnet.

5. **Rate limit ALL endpoints, not just POST.**
   GET endpoints for session, wallet, and game were initially unprotected. A scraper could enumerate sessions or DoS the node with balance queries. Rate limiting reads is cheap insurance.

6. **House balance check before withdrawal is a MUST.**
   Without checking if the house wallet actually has funds before calling `sendZec()`, the user's balance gets deducted, the RPC fails, and manual intervention is needed. Always verify funds before sending.

7. **Duplicate code is a mainnet safety hazard.**
   `createWalletForSession()` exists in both `session/route.ts` and `wallet/route.ts`. When patching the fake address bug, both copies needed the same fix. Consolidate into a shared module.

8. **`instrumentation.ts` is the right place for startup hooks in Next.js.**
   The `register()` function runs once on server startup — ideal for startup validation and background service initialization (commitment pool manager).

## Phase 2 Mainnet Hardening Learnings (2026-02-10)

1. **Float64 is exact for ZEC amounts — integer migration is unnecessary.**
   IEEE 754 Float64 has 53 bits of mantissa, representing integers exactly up to 2^53 (~9.007e15). Since the ZEC supply cap is 21M ZEC = 2.1e15 zatoshi, every possible zatoshi amount is represented exactly. A `roundZec()` wrapper (`Math.round(amount * 1e8) / 1e8`) at DB write boundaries eliminates arithmetic drift from intermediate calculations without the cost of a full integer migration across every API, DB column, and UI formatter.

2. **Double-payout is a real race condition, not theoretical.**
   `processGameCompletion()` can be called from two code paths: `handleStartGame` (auto-dealing the next hand after completing the current one) and `handleGameAction` (player action that ends the hand). Without atomic status transition, both paths credit the payout. The fix is `updateMany where status='active'` — if 0 rows match, the payout was already credited. This pattern (compare-and-swap via WHERE clause) is the standard solution for idempotent state transitions.

3. **Kill switches need to be surgical, not total.**
   A naive kill switch that blocks all API endpoints breaks in-progress games (players can't finish their hand) and stops deposit detection (funds arrive but aren't credited). The correct design: block only new game starts and new withdrawals. Let everything else flow — in-progress games complete, deposits detect, session reads work, admin operates.

4. **Deposit sweep is a background concern, not an inline concern.**
   Sweeping transparent deposit balances to the house shielded address should not happen synchronously during deposit detection. A fixed-interval background service (every 10 min) is simpler, doesn't add latency, and naturally batches multiple deposits into a single sweep transaction (saving on-chain fees).

5. **Withdrawal approval is a policy knob, not a binary feature.**
   Defaulting `WITHDRAWAL_APPROVAL_THRESHOLD` to 0 (disabled) preserves the auto-approve UX. Operators increase it when they want human review for large amounts. This is better than a boolean enable/disable because it allows granular control — small withdrawals stay instant, only large ones queue for review.

6. **Prisma schema changes require `prisma generate` before the app compiles.**
   After adding the `SweepLog` model and new fields to `DepositWallet`, the TypeScript types aren't updated until `npx prisma generate` runs. Forgetting this step produces confusing "property does not exist" errors that look like code bugs rather than schema sync issues.

7. **`updateMany` returns a count, not the updated record.**
   Unlike `update()` which returns the full record, `updateMany()` returns `{ count: number }`. When using it for atomic status transitions, you check `count === 0` to detect that another caller already transitioned the record. You cannot access the updated fields from the return value — fetch separately if needed.

## Guarded-Live Launch Learnings (2026-02-16)

1. **Commitment pool refill must respect Sapling witness anchoring.**
   Creating many commitments in a single refill batch can fail because newly created Sapling notes cannot be immediately re-spent until witness data is anchored in a block. Refilling one commitment per cycle avoids this failure mode and recovers the pool steadily.

2. **House balance health warnings must use confirmed + pending total.**
   Commitment self-sends move funds through a temporary confirmed -> pending -> confirmed cycle. Alerting on confirmed balance alone creates false warnings during normal operation.

3. **Post-launch safety needs explicit invariant scripts, not ad-hoc checks.**
   Baseline/monitor/reconcile scripts provide consistent day-over-day evidence for negative balance checks, duplicate prevention, and liabilities reconciliation.

4. **Strict auth cutover should be telemetry-gated, not date-gated.**
   Keeping compat mode until legacy fallback traffic is near-zero reduces customer-impact risk during migration to cookie-only auth.

## Next Hardening Learnings To Capture

1. Add Redis-backed shared rate limiting for multi-instance deploys.
2. Add MFA and optional IP allowlist for `/api/admin/*`.
3. Add automated alerts on abnormal admin audit patterns (failed logins, repeated 429s).
4. Abstract RPC interface for future Zallet migration.
5. Add E2E tests that run against a real testnet node.
6. Consolidate duplicate `createWalletForSession()` into shared module.

## Frontend Reliability Learnings (2026-02-14)

1. **Nested timers in effects can self-cancel on dependency changes.**
   If an effect schedules timer B from timer A, and timer A updates a dependency, cleanup can run before timer B fires. Keep dependency arrays minimal and test the full lifecycle (`start -> intermediate -> settled`) with fake timers.

2. **Animation bugs need dedicated regression tests.**
   Adding `src/components/game/Card.test.tsx` caught a real issue where `deal-from-shoe` never cleared. UI animation paths are easy to break silently without explicit timer-based tests.

3. **Use Testing Library `waitFor`, not `vi.waitFor`, for React state assertions.**
   `waitFor` from Testing Library wraps React `act`, removing warning noise and making async state tests align with React’s update semantics.

4. **Build hangs can be environment artifacts, not code defects.**
   A stale `.next/lock` can mimic a hanging build. Clear lock files before deeper diagnosis and then rerun build with deterministic env (`CI=1`, telemetry disabled) to get a clean pass/fail signal.

## Withdrawal Reliability Learnings (2026-02-16)

1. **Display precision and ledger precision must not diverge.**
   Showing `0.5500` in UI while storing `0.5499999999999996` in the session record creates false "insufficient balance" errors. For money UIs, if you round for display, normalize for validation and persistence too.

2. **Normalize money fields at ledger boundaries, not ad hoc in UI.**
   Rounding `balance`, `totalWagered`, `totalWon`, `totalDeposited`, and `totalWithdrawn` after each ledger mutation prevents float dust from accumulating and breaking later checks.

3. **Use the same confirmation depth for liquidity precheck and send path.**
   Withdrawal precheck used stricter balance criteria than the actual `z_sendmany` call, causing false "temporarily unavailable" refunds even when funds were spendable. Precheck and send must evaluate the same spendability rule.

4. **Persisted session state must be mirrored in local UI state immediately.**
   After setting withdrawal address during onboarding, local session state must update right away. Otherwise withdrawal modal can show "Not set" until refresh even though backend data is correct.

5. **`z_sendmany` fee must be explicit under unpaid-action policy.**
   Passing `null` for fee can be interpreted as a zero-fee transaction, which trips node policy (`tx unpaid action limit exceeded`) on shielded sends. Always pass an explicit paid fee (0.0001 ZEC) in the RPC call.

6. **Shielded action count can require fee escalation beyond 0.0001 ZEC.**
   Even with explicit fee, some transactions exceed unpaid-action policy when they involve more logical actions. Parse the unpaid-action error and retry with incremented ZIP-317 marginal fee steps (5000 zats per additional paid action).

7. **`z_sendmany` failures can occur after opid creation, not only at call time.**
   Some fee-policy failures surface in `z_getoperationstatus` as a failed operation. Recovery must exist in withdrawal status polling too: detect unpaid-action failure, resubmit with adjusted fee, and only refund after bounded retry attempts.

8. **Retry resilience needs observable counters in admin ops.**
   Add explicit telemetry (`player.withdraw.unpaid_action_retry`) and expose 24h/all-time counts in admin overview so fee-policy friction is visible and tunable.

## Admin Ops Learnings (2026-02-18)

1. **Settings must be enforced at runtime, not just stored.**
   Symptom: Admin settings UI saved bet limits/pool thresholds/alert thresholds, but gameplay and ops behavior did not change.
   Root cause: `AdminConfig` values were stored but not loaded/consumed by game/pool/alert services.
   Fix: Add a typed runtime settings loader with a short TTL cache + invalidation on PATCH, then consume it in:
   - game start wager validation (blackjack/video poker)
   - pool auto-refill thresholds and target sizing
   - alert thresholds (large win + high RTP)
   - responsible gambling defaults on new sessions
   Key files: `src/lib/admin/runtime-settings.ts`, `src/app/api/admin/settings/route.ts`, `src/app/api/game/route.ts`, `src/app/api/video-poker/route.ts`, `src/lib/provably-fair/commitment-pool.ts`.

2. **Background services must start in standalone Node deployments (even when `NEXT_RUNTIME` is unset).**
   Symptom: Alerts page stayed empty even during critical conditions (pool empty, kill switch active, withdrawal backlog).
   Root cause: service startup was incorrectly gated on `NEXT_RUNTIME` being set, so the alert generator never started.
   Fix: Treat anything except explicit `edge` as the Node.js runtime in `instrumentation.ts`, and expose service status in admin overview/alerts UI.
   Key files: `src/instrumentation.ts`, `src/lib/services/alert-generator.ts`, `src/app/api/admin/alerts/route.ts`.

3. **Operators need row-level withdrawal recovery, not one blunt "Process Withdrawals" button.**
   Symptom: Failed withdrawals accumulated with no per-withdrawal retry, and pending withdrawals could not be polled.
   Root cause: admin tooling lacked targeted actions for `pending`/`failed` states.
   Fix: Add two safe admin actions:
   - `poll-withdrawal`: check opid status and confirm or fail+refund
   - `requeue-withdrawal`: create a new `pending_approval` tx by reserving funds again
   Key files: `src/app/api/admin/pool/route.ts`, `src/app/admin/withdrawals/page.tsx`.

4. **Health endpoints must match pool semantics (don't count expired commitments as available).**
   Symptom: `/api/health` could report "pool low/ok" while the real pool was unusable due to expired commitments.
   Root cause: query counted `status='available'` without `expiresAt > now`.
   Fix: filter by `expiresAt > now` in the health check.
   Key files: `src/app/api/health/route.ts`.

## Session Fairness Seed Pool Learnings (2026-02-16)

1. **`z_sendmany` fee-policy errors can surface after opid creation in seed commits too.**
   Seed commitment creation originally only retried when `z_sendmany` itself threw an unpaid-action policy error. In production, the RPC call often returned an opid and the failure appeared later in `z_getoperationstatus`, which left the session seed pool starved (`available=0`) despite refill attempts.

2. **Commitment creation needs operation-level fee escalation, not just call-level retries.**
   `commitServerSeedHash()` now retries when `waitForOperation(...)` fails with `tx unpaid action limit exceeded`, recomputes a higher ZIP-317 fee target, and resubmits with bounded attempts. This closes the gap between submission-time and execution-time fee-policy failures.

3. **Pool starvation diagnosis depends on explicit seed creation error logs.**
   `createAnchoredFairnessSeed()` and `session-seed-pool-manager` now log commitment failure causes and refill failures directly. Without this, admin-triggered refill appears successful while no new seeds are actually created.

## Routing Outage Learnings (2026-02-17)

1. **Untracked nested project directories can poison Docker build context.**
   The production host had an untracked `app/` directory containing a full project copy (`app/src/app/*`). Because `.dockerignore` did not exclude `app/`, Next.js compiled extra routes and emitted path-prefixed entries that broke the live route map.

2. **Build logs are the fastest truth source for route integrity.**
   The decisive signal was the route table in the Docker build output. Healthy output listed `/`, `/blackjack`, and `/api/health`. Broken output had `/src/app/*` prefixed routes and served 404 for all public paths.

3. **A hotfix must be committed, not only patched on server.**
   Server-local edits restore service quickly, but the source-of-truth repo must immediately include the same protections (`.dockerignore` exclusions and valid build command) or the next deploy can reintroduce outage behavior.

4. **Keep Dockerfile build command aligned with supported Next.js CLI flags.**
   On Next.js 16.1.4, `--no-turbopack` is invalid. Use a supported build invocation (`next build` via `npm run build`) unless a compatible explicit flag is confirmed.

5. **Never rsync source files directly to VPS — use git pull.**
   An `rsync` from local to VPS overwrote deployment-specific patches (Dockerfile, next.config.ts) that had been specifically fixed for Docker builds. The correct deploy flow: commit → push → `git pull` on VPS → rebuild. Direct file sync bypasses version control and can silently reintroduce fixed bugs.

6. **Verify ALL pending changes are deployed, not just the hotfix.**
   After Codex fixed the route prefix bug and rebuilt, the CSS changes (cyberpunk theme) were missing from production because they hadn't been pushed/pulled yet. The fix commit only contained `.dockerignore` and `Dockerfile` — the CSS was a separate commit. Always check that the full intended changeset is on the VPS before rebuilding.

## 21z Cyberpunk Visual Refinement Learnings (2026-02-17)

1. **CSS-only brand overrides via `body[data-brand="21z"]` selectors are zero-risk.**
   All 21z visual changes (~180 lines of CSS) were scoped to `body[data-brand="21z"]`. CypherJester rendering was completely unaffected — verified both locally and in production. This dual-brand CSS architecture makes visual experiments safe.

2. **Three-layer box-shadow creates convincing glow with minimal performance cost.**
   The pattern `0 0 5px (strong), 0 0 15px (medium), 0 0 30px (faint)` creates realistic light falloff. GPU-composited, no layout thrashing. Used consistently across buttons, panels, cards, and game state indicators for brand coherence.

3. **Button state machines need explicit `transition` properties.**
   Setting `transition: background 0.2s, box-shadow 0.2s, border-color 0.2s` (specific properties) rather than `transition: all 0.3s` prevents unintended transitions on `clip-path`, `color`, and other properties that shouldn't animate.

4. **Pair every `:hover` state with `:focus-visible` for keyboard accessibility.**
   Every 21z glow effect on hover was duplicated for `:focus-visible`. This ensures keyboard-only users get the same interactive feedback without triggering glow on every tab press (`:focus` would fire on click too).

5. **Game animation overrides need matching `@keyframes` — can't just restyle the class.**
   Changing `.active-hand` colors from gold to cyan required a new `@keyframes activeHandPulse21z` because the animation references specific color values. A CSS variable approach would have been more maintainable, but the keyframe approach keeps brand specificity explicit and avoids variable cascade issues.

6. **`prefers-reduced-motion` media query respects all new animations automatically.**
   The existing `@media (prefers-reduced-motion: reduce)` rule uses `animation-duration: 0.01ms !important` which catches all new 21z keyframes without any additional work. A single well-placed accessibility rule scales to unlimited animations.

7. **Verify deployed CSS by checking bundle hash, not just route health.**
   After deployment, routes returning 200 doesn't mean your CSS changes are live. The CSS bundle hash (e.g., `321fafd1c4b23bb6.css` vs `b065e617b503309a.css`) changes when CSS is updated. Grep the bundle for specific class names or keyframe identifiers to confirm.

## Session Seed Pool Reclamation Learnings (2026-02-18)

1. **Assigned seeds without usage are a pool drain, not a pool feature.**
   35 of 52 seeds were stuck in `assigned` status — claimed by sessions that visited but never played (nextNonce=0). These one-time visitors consumed seeds that could never be reclaimed, slowly exhausting the pool. The fix: a periodic reclaim job that returns unused assigned seeds (nextNonce=0, session inactive 24h+) back to `available`.

2. **Background services should always log on startup.**
   The session seed pool manager started silently — no log line on success, only on failure. Compared to `[Sweep] Started successfully` and `[alert-generator] Starting alert generator`, the pool manager was invisible in container logs, making it impossible to confirm it was running without checking the DB directly. Every background service should log its startup state.

3. **Reclamation must be safe against in-flight usage.**
   A seed with nextNonce=0 is safe to reclaim because no game hand has ever used it. Seeds with nextNonce>0 have been used to generate game outcomes and cannot be returned to the pool — they must remain assigned to preserve provable fairness integrity. The reclaim uses `$transaction` with status guards to handle race conditions where a session resumes during reclamation.

4. **Pool "health" should account for reclaimable seeds.**
   After deploying reclamation, the first startup cycle recovered 24 seeds, jumping available from 15 to 39. The pool was never actually low — it just had resources locked by abandoned sessions. Future pool health metrics should distinguish between truly consumed seeds and reclaimable ones.

## Modal State Machine Learnings (2026-02-18)

1. **Never use `|| ''` for values consumed by conditional rendering.**
   `data.depositAddress || ''` silently converts null to empty string. Empty string is falsy in JavaScript, so `localDepositAddress && (<Component />)` evaluates to false. This caused the deposit modal to show a dark backdrop with zero content — a completely invisible failure. Use `|| null` and handle null explicitly with an error state.

2. **Multi-step modals need an error state, not just happy-path steps.**
   The OnboardingModal had steps: welcome → setup → deposit → confirming → ready. When the async session creation returned without a deposit address, the step advanced to `'deposit'` but the render condition failed silently. Adding an explicit `'error'` step with retry UI ensures every failure path has a visible outcome. Users see "Something Went Wrong" instead of a black screen.

3. **Auto-advance modals to the most relevant step on open.**
   When a modal opens and the data it needs is already available (existing session with deposit address), skip intermediate steps. The deposit modal was showing "Welcome → Choose Demo or Real" every time, even for users who already had a real session with a deposit address. Auto-advancing with a `useEffect` that checks `isOpen && depositAddress && sessionId` gives returning users a direct path.

4. **Reset modal state on close, not on open.**
   Resetting `step` to `'welcome'` when `!isOpen` (in a useEffect) ensures the modal always starts fresh on the next open. Resetting on open can race with auto-advance logic. The pattern: close resets state, open triggers auto-advance if conditions are met.

## Admin Dashboard Learnings (2026-02-18)

1. **Never check truthiness of status objects — check the boolean property.**
   `overview.killSwitch` is `{ active: false, activatedAt: null, activatedBy: null }` — an object that is always truthy. The admin banner condition `overview.killSwitch && (...)` displayed the "Kill switch active" warning permanently. The fix: `overview.killSwitch?.active`. This is a general JavaScript pitfall: `!!{}` is `true`, `!!{ active: false }` is `true`. Always destructure or access the specific boolean field.

## Session Creation Resilience (2026-02-18)

1. **Transient RPC failures need retry, not immediate error.**
   A single 5-second timeout on `checkNodeStatus()` meant any brief zcashd hiccup (restart, GC pause, network blip) showed users an error. Adding a single retry with 2-second backoff catches >90% of transient failures without meaningfully increasing latency for genuine outages.

2. **Pre-flight health checks save user-facing latency on known failures.**
   A 4-second `/api/health` probe before session creation catches node downtime instantly. Without it, the user waits for the full session creation flow (DB write + RPC + retry) before seeing an error — up to 12+ seconds of spinner.

3. **Error codes are the API's responsibility, not the frontend's.**
   The API should return `walletError: 'node_unavailable'` so the frontend can show "Zcash node is temporarily offline" vs "Rate limit exceeded" vs "Please try again." When the API returns only `{ error: 'Failed' }`, the frontend can't do anything useful.

4. **Demo-time rate limits should be generous.**
   10 session creates per minute sounds reasonable, but during a live demo with retries, page refreshes, and brand-switching, you burn through them fast. 20/min is a safer floor for a product with both demo and real-money modes.

5. **Always wrap read-then-write sequences in `$transaction`.**
   `findFirst({ orderBy: 'desc' })` + create with incremented index is textbook race condition. Two concurrent requests read the same max index, both increment, and the second fails on unique constraint. This was already learned in Phase 2 (commitment pool) but not applied to deposit wallet creation.

## Game Startup Funnel Redesign (2026-02-18)

1. **localStorage per-domain isolation causes cross-brand inconsistency.**
   The `zcashino_onboarding_seen` flag is per-domain. CypherJester (visited before) auto-skipped the modal while 21z.cash (fresh domain) showed it. When localStorage flags control UX flow, behavior diverges across domains sharing the same codebase. Fix: don't gate on localStorage flags — derive behavior from session state.

2. **Extract shared hooks when two components duplicate session logic.**
   BlackjackGame and VideoPokerGame each had ~100 lines of identical session init, onboarding, and handler code. The `useGameSession` hook eliminated duplication and made both components consistent. When two game components share the same session lifecycle, extract the hook early.

3. **Demo-first reduces friction more than choice modals.**
   A "Choose Demo or Real" modal creates decision paralysis for first-time visitors. Auto-creating a demo session with zero clicks lets users experience the product immediately. Conversion nudges (banner, win toast, depleted prompt) handle the upgrade path without interrupting gameplay.

4. **Conversion nudge timing matters — trigger on positive moments.**
   The win nudge toast fires once per session after a demo win (positive emotion). The depleted prompt fires when balance drops below minimum bet (natural pause point). Both are non-blocking. Avoid interrupting active gameplay with conversion prompts.

5. **VideoPokerGame had OnboardingModal as early return, not overlay.**
   BlackjackGame rendered the modal as an overlay on top of the game. VideoPokerGame used an early return pattern that blocked the entire game UI. Converting to overlay pattern made both consistent and allowed the game to render behind the modal.

## Production Investigation Learnings (2026-02-18)

1. **`.env.example` is a template, not production truth.**
   Both `.env.example` and `.env.mainnet.example` in the repo showed `PROVABLY_FAIR_MODE=legacy_per_game_v1`. Production had `session_nonce_v1`. Incorrectly assumed example = production and built an unnecessary deployment plan. Production config lives only on the VPS at `/opt/zcashino/.env.mainnet` (chmod 600, gitignored). Always SSH and check.

2. **Code defaults ≠ production values.**
   `mode.ts` defaults to `legacy_per_game_v1` when `PROVABLY_FAIR_MODE` env is unset. This is a safe fallback, not a description of what's running. The env IS set in production. Never conclude "production uses X" from reading a fallback branch.

3. **Trust the operator's memory, then verify.**
   When the user said "I thought we changed the architecture to session-per-seed", that was correct. The investigation should have started with `ssh root@VPS "docker exec app printenv PROVABLY_FAIR_MODE"` and `curl localhost:3000/api/health`, not with grepping example files.

4. **Health endpoints are the fastest truth source.**
   `/api/health` reports `fairnessMode`, pool status, house balance, and kill switch state directly. One curl gives more truth about production than 30 minutes of code exploration. Check it first for any production question.

5. **The commitment pool numbers mean different things in different modes.**
   In legacy mode: available = unused commitments, used = hands played. In session_nonce_v1: available = unassigned seeds, assigned = active sessions, revealed = rotated seeds. Same numbers, completely different semantics. Always check `fairnessMode` before interpreting pool metrics.

## External Review Response Learnings (2026-02-20)

1. **Verify reviewer claims against the actual codebase before acting.**
   An iGaming executive flagged 6 "missing" features — 4 were actually implemented (card animations, insurance prompt, VP demo mode, auto-deal confirmation gate). Had we built a plan around all 6, half the work would have been wasted. Always read the code first, then prioritize only genuine gaps.

2. **"Feature exists but is gated" is different from "feature is missing."**
   Surrender was fully coded (`executeSurrender()`, `getAvailableActions()` gate, type in `BlackjackAction`) but missing from the Zod schema and API route switch. This is a 3-line fix, not a feature build. Check all layers of the stack before estimating effort: types → schema validation → route dispatch → game logic → UI.

3. **Tests that assert rejection of valid actions break when you enable those actions.**
   The `rejects surrender action payload` test asserted 400 (Zod rejection). After adding surrender to the schema, the action passes validation and hits game lookup instead (404). Always search tests for the feature name before wiring it in — you'll find tests to update.

4. **Admin toggle + default-off is the safest rollout pattern for gameplay changes.**
   Surrender was wired through all layers but left disabled via `allowSurrender: false` default in `runtime-settings.ts`. This means the code ships, tests pass, and production is unaffected until an admin explicitly flips the toggle. Instant rollback without redeploy.

5. **UI text can lag behind enforcement reality.**
   Deposit limits were fully enforced in production (`isDepositWithinLimit()` at `wallet/route.ts:273-294`) but 3 UI surfaces still said "Planned — not yet enforced." This creates a credibility gap with external reviewers. Always update user-facing text when enforcement ships, not later.

6. **Privacy-preserving public feeds require more than anonymization.**
   For the verified hands feed: timestamp precision, bet amount granularity, and low-traffic windows all create linkability risks. The plan requires minute-bucketed timestamps, bet range buckets (not exact amounts), and a minimum-volume floor before displaying entries.

## Feed API Testing Learnings (2026-02-20)

1. **Module-level in-memory caches in route handlers persist across Vitest test runs.**
   The feed route's `cachedResponse` variable caused 8/12 tests to fail on first attempt — after the volume-floor test cached an empty response, all subsequent tests got stale data instead of hitting mocked DB calls. Fix: `vi.resetModules()` + `const { GET } = await import('./route')` per test gives a fresh module with empty cache. This is different from `vi.clearAllMocks()` which only resets mock call history, not module state.

2. **When testing rate-limited endpoints, mock the rate limiter to avoid test coupling.**
   Import the module and mock the specific function (`checkPublicRateLimit`) rather than testing rate limiting behavior through the route. This keeps tests focused on route logic, not infrastructure.

## AI-Assisted SVG Asset Generation Learnings (2026-02-20)

1. **Detailed prompts with exact specs produce usable SVGs from Gemini 3.1 Pro with zero manual cleanup.**
   Including hex color codes, viewBox size constraints, and explicit style guidance (no gradients vs. gradients, stroke widths, shape vocabulary) gives clean, copy-paste-ready output. Vague prompts produce SVGs that need significant rework.

2. **For dual-brand systems, generate all brand variants in separate prompts.**
   Each prompt should include the full design context for its brand only. Cross-contamination happens when both brands are in one prompt — the model blends visual languages instead of keeping them distinct.

3. **Inline SVGs in JSX are fine for small counts (~30 total SVG elements per page).**
   For larger sets (52 playing cards), consider SVG sprites or lazy loading to avoid bundle bloat. The 24 confetti particles + 4 chips = 28 inline SVGs had negligible impact on bundle size.

## Client-Side Brand Detection Learnings (2026-02-20)

1. **`document.body.dataset.brand` via `useEffect` is the correct pattern for brand-specific client components.**
   The server-side `getBrandFromHost()` sets the `data-brand` attribute on `<body>`, and client components read it after hydration. This avoids prop drilling brand through every component tree. Works well for selecting brand-specific SVG asset sets, color overrides, etc.

2. **The `useState(false)` + `useEffect` pattern causes one render with the default brand before switching.**
   For purely decorative elements like confetti, this flash is invisible (particles don't render until the overlay mounts). For prominent brand-switching elements, use server components or pass brand as a prop to avoid the flash.

## UI/UX & Mobile Design Learnings (2026-02-21)

1. **Static UI components vs. Responsive Containers.**
   Duplicating `<header>` blocks across static pages creates maintenance overhead and leads to layout bugs. Extracting a unified `<SiteHeader>` component with specific mobile responsive considerations (`overflow-x-auto no-scrollbar` for links) ensures a consistent layout and single source of truth without overlapping links.

2. **Mobile interaction spacing needs intentional "fat-finger" protection.**
   Simply using Flexbox gaps (`gap-4`) on action buttons doesn't scale linearly down to mobile. Buttons on mobile require a reduction in `gap` accompanied by tailored horizontal padding (`px-4 sm:px-8`) to prevent mis-taps while preserving touch target height (`py-2.5 sm:py-3`).

3. **Empty states must communicate system status visually, not just through text.**
   A text string "No recent verified hands" fails to engage players and doesn't communicate the system's "always active" heartbeat. An empty state visualization (e.g., a pulsing "Live Seed Active" ring) transforms a blank feed into a manifestation of the platform's provably fair operations.

## Session Hardening Learnings (2026-02-22)

1. **Strict mode is not enough if session restore trusts query/localStorage identifiers.**
   Flipping `PLAYER_SESSION_AUTH_MODE=strict` protects privileged POST flows, but `GET /api/session?sessionId=...` can still become an escalation path if it mints a fresh signed cookie from a caller-supplied ID.

2. **Every read endpoint that accepts `sessionId` must bind to a trusted cookie identity.**
   Query params are convenience hints, not identity. Route handlers must derive effective identity from `requirePlayerSession(...)` and use `playerSession.session.sessionId` for DB lookups.

3. **Legacy fallback should be denied on sensitive GET routes during hardening.**
   For wallet/game history endpoints, returning 401 on `legacyFallback` prevents an attacker from using an ID-only path to read data during compat migration windows.

4. **Coverage should include mismatch attacks, not just happy paths.**
   Added tests for:
   - no-cookie + query ID restore attempts
   - cookie/query session mismatch
   - forced trusted-session DB queries despite attacker query values

**Key files:** `src/app/api/session/route.ts`, `src/app/api/wallet/route.ts`, `src/app/api/game/route.ts`, `src/app/api/video-poker/route.ts`, `src/app/api/session/route.test.ts`, `src/app/api/wallet/route.test.ts`, `src/app/api/game/route.test.ts`, `src/app/api/video-poker/route.test.ts`
