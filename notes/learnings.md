# Project Learnings

Last updated: 2026-02-08

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

## Next Hardening Learnings To Capture

1. Add Redis-backed shared rate limiting for multi-instance deploys.
2. Add MFA and optional IP allowlist for `/api/admin/*`.
3. Add automated alerts on abnormal admin audit patterns (failed logins, repeated 429s).
4. Abstract RPC interface for future Zallet migration.
5. Add E2E tests that run against a real testnet node.
