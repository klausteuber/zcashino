# Project Learnings

Last updated: 2026-02-14

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
