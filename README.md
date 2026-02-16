# CypherJester

Play in Private. Verify in Public. A provably fair, privacy-focused online casino powered by Zcash (ZEC).

## Features

- **Blockchain Provably Fair** - Server seed hashes committed to Zcash blockchain BEFORE you bet
- **On-Chain Verification** - Every game outcome is verifiable with blockchain proof
- **Privacy First** - No accounts required, play with Zcash shielded transactions
- **Instant Payouts** - Automatic withdrawals directly to your wallet
- **Transparent House Edge** - Clear disclosure of all odds

## Current Status

Blackjack and Video Poker are fully playable with server-side game logic, atomic ledger writes, and database persistence. Supports both **demo mode** (mock commitments, instant withdrawals) and **real Zcash node connections** (on-chain commitments, async RPC withdrawals via `z_sendmany`). Configure via environment variables.

### Implemented
- ✅ Single-player Blackjack (Vegas Strip rules)
- ✅ Single-player Video Poker (`jacks_or_better`, `deuces_wild`)
- ✅ Perfect Pairs side bet
- ✅ **Blockchain Provably Fair** - Server seed hashes committed on-chain before betting
- ✅ **Commitment Pool** - Pre-generated commitments for instant game starts
- ✅ **Verification System** - Full verification UI at `/verify`
- ✅ **Verification Parity** - `/api/verify` supports both blackjack and video poker (`gameType`)
- ✅ Hit, Stand, Double, Split actions
- ✅ Server-side API routes (`/api/session`, `/api/game`, `/api/video-poker`, `/api/wallet`, `/api/verify`, `/api/admin/pool`)
- ✅ **Admin Authentication API** (`/api/admin/auth`) with signed HttpOnly session cookies
- ✅ **Admin Overview API** (`/api/admin/overview`) for operations + finance metrics
- ✅ **Admin Dashboard UI** (`/admin`) for pool management and withdrawal recovery
- ✅ **Admin Hardening** - per-IP rate limits and persistent admin audit logs
- ✅ **Race Safety + Atomicity** - conditional debits/credits and guarded completion transitions
- ✅ **Withdrawal Idempotency** - `idempotencyKey` support for safe client retries
- ✅ **Deposit Credit Hardening** - credits based on confirmed txids, resilient to sweeps
- ✅ **Player Session Auth** - signed `zcashino_player_session` cookie (`compat`/`strict` rollout mode)
- ✅ **Request Validation** - strict zod schemas with standardized `400 { error, details }`
- ✅ SQLite database with Prisma 7 (sessions, games, transactions, wallets, commitments)
- ✅ Session management with balance tracking
- ✅ Game history persistence with blockchain proof data
- ✅ **Action History Replay** - Deterministic game state reconstruction for integrity
- ✅ **Zcash Wallet Integration** (deposit addresses, withdrawals, RPC client)
- ✅ **WalletPanel UI component** (balance display, deposit/withdraw interface)
- ✅ **Address validation** (t-addr, z-addr, u-addr support)
- ✅ **Real Withdrawal Execution** - Async `z_sendmany` via RPC, deduct-first/refund-on-failure, demo instant-confirm
- ✅ **Withdrawal Status Polling** - Frontend polls operation status; auto-refunds on failure
- ✅ **Zcash Node Connection** - Full RPC integration (testnet/mainnet), env-configurable, graceful fallback to demo mode
- ✅ **Admin Withdrawal Recovery** - `/api/admin/pool` `process-withdrawals` action for stuck pending withdrawals
- ✅ **Proof of Reserves** - `/reserves` dashboard with on-chain balance verification
- ✅ **Test Suite** - 391 tests across 17 files (game logic, wallet, provably fair, admin security, API race/idempotency, UI + timer regressions)
- ✅ **Cryptographically Secure RNG** - `node:crypto.randomBytes` for all seed/nonce generation (fixed from Math.random)
- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- ✅ **Public API Rate Limiting** - Bucket-based per-IP rate limits on `/api/game`, `/api/session`, `/api/wallet`
- ✅ **Health Check** - `/api/health` endpoint for liveness probes (DB connectivity + uptime)
- ✅ **Sentry Error Tracking** - Full coverage across server, client, edge, and instrumentation runtimes
- ✅ **Legal Pages** - `/terms`, `/privacy`, `/responsible-gambling` static routes
- ✅ **Deployment Ready** - `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `DEPLOYMENT.md`

### UI/UX Features
- ✅ **Card Deal Animation** - Cards fly in from dealer shoe position with rotation and arc trajectory
- ✅ **3D Card Flip** - Enhanced perspective-based flip animation when dealer reveals hole card
- ✅ **Active Hand Highlight** - Gold pulsing glow indicates current player hand during turn
- ✅ **Winner/Loser Effects** - Green glow for winning hands, grayscale fade for losing hands
- ✅ **Dealer Turn Indicator** - Visual pulse effect while dealer is drawing cards
- ✅ **Insurance Prompt** - Interactive Yes/No buttons when dealer shows Ace (pays 2:1)
- ✅ **Balance Feedback** - Visual animations for wins (green pulse) and losses (red pulse)
- ✅ **Floating Payouts** - "+X.XXXX" floats up from balance on wins
- ✅ **Result Animations** - Blackjack glow, win celebration, loss shake, push effects
- ✅ **Sound Effects** - Web Audio API synthesized sounds (cards, chips, wins, losses)
- ✅ **Mute Toggle** - Sound can be enabled/disabled via header icon
- ✅ **Auto-Bet Toggle** - Automatically place same bet and deal new hand after round completes (default: ON)
- ✅ **Perfect Pairs Tooltip** - Hover info showing payout table (25:1, 12:1, 6:1)
- ✅ **Provably Fair UI** - Copy buttons, blockchain commitment display, verify link
- ✅ **Micro-interactions** - Button hover/press effects, chip selection feedback
- ✅ **Responsive Design** - Mobile-friendly layout with touch-optimized controls

### Coming Soon
- 🔄 Zcash testnet integration testing (requires running zcashd)
- 🔄 Load testing (requires deployed instance)
- 🔄 Geo-blocking (UIGEA compliance)
- 🔄 Responsible gambling UI tools (limits, self-exclusion)
- 🔄 Admin MFA and IP allowlist
- 🔄 Redis-backed rate limiting for multi-instance deploys
- 📋 E2E tests (Playwright)
- 📋 Sports betting (Phase 2)
- 📋 Poker (Phase 3)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zcashino.git
cd zcashino/zcashino-app

# Install dependencies
npm install

# Set up database
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

Open [http://localhost:3000/blackjack](http://localhost:3000/blackjack) to play blackjack.

### Build for Production

```bash
npm run build
npm start
```

### Testing

```bash
# Run tests in watch mode
npm test

# Single run
npx vitest run

# With coverage
npx vitest run --coverage
```

**391 tests** across 17 test files:

| Module | File | Tests | Coverage |
|--------|------|-------|----------|
| Deck & Cards | `src/lib/game/deck.test.ts` | 72 | Hand values, shuffle determinism, Perfect Pairs |
| Blackjack Engine | `src/lib/game/blackjack.test.ts` | 54 | Game state, actions, payouts, edge cases |
| Wallet Utilities | `src/lib/wallet/index.test.ts` | 42 | Address validation, ZEC formatting, conversions |
| Deposit Addresses | `src/lib/wallet/addresses.test.ts` | 18 | Memo round-trip, explorer URLs, deposit info |
| Provably Fair | `src/lib/provably-fair/index.test.ts` | 25 | Seed generation, SHA-256 hashing, verification |
| Admin Auth | `src/lib/admin/auth.test.ts` | 4 | Signed session token validity, tamper/expiry rejection |
| Admin Rate Limit | `src/lib/admin/rate-limit.test.ts` | 2 | Bucket cap enforcement and retry header behavior |
| Game API | `src/app/api/game/route.test.ts` | 2 | Atomic decrement rollback and completion idempotency guard |
| Wallet API | `src/app/api/wallet/route.test.ts` | 3 | Withdrawal status transitions and refund path integrity |
| Card Animations | `src/components/game/Card.test.tsx` | 3 | Deal timing, flip reveal timing, timer cleanup on unmount |
| Blackjack UI Timers | `src/components/game/BlackjackGame.test.tsx` | 2 | Auto-bet cleanup on unmount and cancel |
| QR Code | `src/components/ui/QRCode.test.tsx` | 15 | Canvas rendering, copy button |
| Hand History UI | `src/components/game/HandHistory.test.tsx` | 12 | Result badges, layout, history rendering |
| Onboarding | `src/components/onboarding/OnboardingModal.test.tsx` | 13 | Flow navigation, address validation |
| Deposit Polling | `src/hooks/useDepositPolling.test.ts` | 10 | Polling lifecycle, callbacks |
| Keyboard Shortcuts | `src/hooks/useKeyboardShortcuts.test.ts` | 16 | Action shortcuts and insurance keyboard flow |

Playwright smoke suite:

```bash
# Route smoke checks (requires Playwright runtime available)
npm run test:e2e:smoke
```

## Deployment

The app includes production-ready deployment configuration.

### Docker

```bash
# Build and run with Docker Compose
docker compose up --build

# Or build the image directly
docker build -t cypherjester .
docker run -p 3000:3000 cypherjester
```

The Dockerfile uses multi-stage builds with Next.js standalone output for minimal image size (~200MB). The health check endpoint at `/api/health` is used for container liveness probes.

### CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR:
1. **Lint** - ESLint
2. **Typecheck** - `tsc --noEmit`
3. **Test** - `vitest run` (391 tests)
4. **Build** - Production build verification

### Production Database

The app uses SQLite locally and is Turso-ready for production. Switch by changing `DATABASE_URL` to a Turso connection string — no code changes needed thanks to Prisma's LibSQL adapter.

### Monitoring

- **Sentry** - Error tracking across all Next.js runtimes (server, client, edge). Configure via `SENTRY_DSN` environment variable. No DSN = silently disabled.
- **Health check** - `GET /api/health` returns DB status, uptime, and timestamp.

See `DEPLOYMENT.md` for full deployment guide.

## Zcash Node Connection

The app supports both **demo mode** and **real zcashd node** connections. Configure via `.env`:

```env
# Network: testnet or mainnet
ZCASH_NETWORK=testnet

# RPC credentials (must match zcashd config)
ZCASH_RPC_USER=zcashrpc
ZCASH_RPC_PASSWORD=your_rpc_password
ZCASH_RPC_URL=http://127.0.0.1:8232
ZCASH_TESTNET_RPC_URL=http://127.0.0.1:18232

# House wallet z-addresses (must be controlled by zcashd wallet)
HOUSE_ZADDR_MAINNET=
HOUSE_ZADDR_TESTNET=ztestsapling1...

# Demo mode: set to false when connecting a real node
DEMO_MODE=true

# Admin dashboard access
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
ADMIN_SESSION_SECRET=replace-with-a-long-random-secret

# Player session auth (required in production)
PLAYER_SESSION_SECRET=replace-with-a-second-long-random-secret
# Deploy in compat first, then switch to strict after metrics are clean
PLAYER_SESSION_AUTH_MODE=compat

# Sentry error tracking (optional - disabled if not set)
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Optional admin API rate limits
ADMIN_RATE_LIMIT_LOGIN_MAX=10
ADMIN_RATE_LIMIT_LOGIN_WINDOW_MS=900000
ADMIN_RATE_LIMIT_READ_MAX=180
ADMIN_RATE_LIMIT_READ_WINDOW_MS=60000
ADMIN_RATE_LIMIT_ACTION_MAX=30
ADMIN_RATE_LIMIT_ACTION_WINDOW_MS=60000
```

### Demo Mode (`DEMO_MODE=true`)
- Mock commitments (prefixed `mock_`) for provably fair system
- Instant withdrawal confirmation with `demo_tx_` hashes
- No zcashd required — works out of the box for development

### Real Node Mode (`DEMO_MODE=false`)
- On-chain commitments via shielded transactions
- Async withdrawals via `z_sendmany` with operation tracking
- Deposit detection via `listunspent` / `z_listreceivedbyaddress`
- Requires a running zcashd with the configured house z-address in the wallet

## Withdrawals

### Flow
1. Player submits withdrawal request with `idempotencyKey`
2. Balance deducted immediately (prevents double-spend)
3. **Demo**: Transaction marked `confirmed` instantly
4. **Real**: `z_sendmany` called, `operationId` stored, status returned as `pending`
5. Frontend polls `/api/wallet` with `withdrawal-status` action every 5 seconds
6. On operation success: transaction updated with `txHash`, marked `confirmed`
7. On operation failure: balance refunded, transaction marked `failed`

### Error Recovery
- All failures automatically refund the player's balance
- Admin can process stuck withdrawals via `POST /api/admin/pool` with `action: "process-withdrawals"`
- Failure reasons are stored on the transaction record for audit

## API Compatibility Update (2026-02-15)

### Additive request fields
- `POST /api/wallet` with `action: "withdraw"` requires `idempotencyKey` (string, max 128 chars)
- `GET /api/verify` and `POST /api/verify` accept `gameType: "blackjack" | "video_poker"` (default: `blackjack`)

### Player auth rollout
- Session auth uses signed `httpOnly` cookie `zcashino_player_session`
- `PLAYER_SESSION_AUTH_MODE=compat`: cookie preferred, legacy `sessionId` fallback accepted
- `PLAYER_SESSION_AUTH_MODE=strict`: valid cookie required for privileged player actions

### Validation errors
- Invalid API payloads return `400` in this shape:
  - `{ "error": "Invalid request payload", "details": { "field.path": ["message"] } }`

## Admin Dashboard

The admin dashboard lives at [`/admin`](http://localhost:3000/admin) and is protected by server-side auth.

### What it does
- Sign-in with `ADMIN_USERNAME` + `ADMIN_PASSWORD`
- Uses signed, HttpOnly session cookies (`ADMIN_SESSION_SECRET`)
- Rate-limits admin auth/read/action endpoints by IP
- Persists admin audit logs in database (`AdminAuditLog`)
- Shows platform metrics (liabilities, deposits, withdrawals, active games)
- Shows infrastructure health (node sync + commitment pool status)
- Lists pending withdrawals for operations triage
- Shows recent admin audit events + security counters
- Provides one-click admin actions:
  - `refill`
  - `cleanup`
  - `init`
  - `process-withdrawals`

### Security notes
- In production, `ADMIN_PASSWORD` must be at least 12 characters.
- In production, `ADMIN_SESSION_SECRET` must be at least 32 characters.

### API endpoints
- `GET/POST/DELETE /api/admin/auth` - login/logout/session check
- `GET /api/admin/overview` - dashboard data snapshot
- `GET/POST /api/admin/pool` - protected pool/withdrawal operations
- `GET /api/health` - liveness probe (DB status, uptime)

### Related docs
- `notes/admin-dashboard-architecture.md` - implementation and threat model notes
- `notes/learnings.md` - launch and security learnings log

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** SQLite with Prisma 7 (LibSQL adapter, Turso-ready for production)
- **Blockchain:** Zcash (ZEC)
- **Testing:** Vitest 4 + React Testing Library

## Game Rules

### Blackjack (Vegas Strip Rules)

- 6 decks, shuffled every hand (CSM-style)
- Dealer stands on soft 17
- Blackjack pays 3:2
- Double on any two cards
- Split any pair (up to 4 hands)
- Double after split allowed
- No surrender
- Insurance offered (2:1)

### Perfect Pairs Side Bet

- Mixed Pair (different color): 6:1
- Colored Pair (same color): 12:1
- Perfect Pair (same suit): 25:1

### House Edge

| Game | House Edge |
|------|------------|
| Blackjack (basic strategy) | ~0.5% |
| Perfect Pairs | ~4.5% |
| Insurance | ~7.4% |

## Blockchain Provably Fair

Every game uses an on-chain commit-reveal scheme:

### Flow
1. **Pre-commitment:** Server generates seed, commits SHA256 hash to Zcash blockchain
2. **Betting:** Player sees commitment tx hash + block height before placing bet
3. **Game execution:** Outcome determined by `SHA256(serverSeed:clientSeed:nonce)`
4. **Verification:** Server seed revealed, player can verify:
   - Hash matches pre-committed value
   - Commitment exists on blockchain (before game started)
   - Replay game with revealed seeds

### Commitment Pool
- Pre-generated commitments stored in database for instant game starts
- Background service maintains pool (refills when low, cleans expired)
- Each commitment has txHash, blockHeight, blockTimestamp

### Verification Page (`/verify`)
- Enter Game ID to verify any completed game
- Step-by-step verification: hash match, on-chain confirmation, timestamp validity, outcome replay
- Manual verification mode for external validation

### Demo Mode
When no Zcash node is connected, the system uses mock commitments (prefixed with `mock_`) for development/demo purposes. These demonstrate the full provably fair flow without requiring blockchain infrastructure.

See the [Provably Fair documentation](/provably-fair) for technical details.

### Game State Integrity

The game uses **action history replay** to ensure deterministic state reconstruction:

1. **Seeded Deck**: Each game's deck order is determined by `SHA256(serverSeed:clientSeed:nonce)`
2. **Action Storage**: Every player action (hit, stand, double, split) is recorded in `actionHistory`
3. **State Replay**: On each API request, the game state is reconstructed by:
   - Regenerating the deck from seeds (identical order every time)
   - Replaying all previous actions in sequence
   - Executing the new action
4. **Deck Position**: This ensures the deck position is always correct, preventing card duplication or loss

This architecture guarantees that cards dealt to the player remain in their hand throughout the game, and the dealer always draws from the correct position in the deck.

## Project Structure

```
zcashino-app/
├── prisma/
│   ├── schema.prisma       # Database schema (Session, BlackjackGame, Transaction, DepositWallet, SeedCommitment, GeoCheck)
│   └── dev.db              # SQLite database (dev)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── session/    # Session management API
│   │   │   ├── game/       # Game actions API
│   │   │   ├── video-poker/ # Video poker API
│   │   │   ├── wallet/     # Wallet API (deposits, withdrawals)
│   │   │   ├── verify/     # Game verification API
│   │   │   ├── health/     # Health check endpoint
│   │   │   └── admin/      # Admin APIs (auth, overview, pool)
│   │   ├── page.tsx        # Landing page
│   │   ├── blackjack/      # Blackjack game UI
│   │   ├── video-poker/    # Video poker game UI
│   │   ├── verify/         # Game verification page
│   │   ├── reserves/       # Proof of reserves dashboard
│   │   ├── terms/          # Terms of service
│   │   ├── privacy/        # Privacy policy
│   │   ├── responsible-gambling/ # Responsible gambling info
│   │   └── globals.css     # Global styles & animations
│   ├── components/
│   │   ├── game/           # Card, Chip components
│   │   ├── ui/             # JesterLogo, shared UI
│   │   ├── wallet/         # WalletPanel component
│   │   └── onboarding/     # OnboardingModal component
│   ├── hooks/
│   │   ├── useGameSounds.ts # Web Audio sound effects
│   │   └── useDepositPolling.ts # Deposit confirmation polling
│   ├── lib/
│   │   ├── db.ts           # Prisma client with LibSQL adapter
│   │   ├── auth/           # Player session cookie signing/validation
│   │   ├── validation/     # Zod API request schemas
│   │   ├── game/           # Blackjack logic, deck utilities
│   │   ├── provably-fair/  # Provably fair system
│   │   │   ├── index.ts    # Core provably fair functions
│   │   │   ├── blockchain.ts # Blockchain commitment service
│   │   │   └── commitment-pool.ts # Pool management
│   │   ├── services/
│   │   │   ├── ledger.ts   # Atomic reserve/credit/release helpers
│   │   │   └── commitment-pool-manager.ts # Background pool service
│   │   └── wallet/         # Zcash wallet integration
│   │       ├── index.ts    # Core utilities, address validation
│   │       ├── addresses.ts # Address generation, deposit info
│   │       └── rpc.ts      # Zcash RPC client (zcashd)
│   └── types/              # TypeScript definitions
├── instrumentation.ts      # Sentry server instrumentation
├── instrumentation-client.ts # Sentry client instrumentation
├── sentry.server.config.ts # Sentry server config
├── sentry.edge.config.ts   # Sentry edge config
├── Dockerfile              # Multi-stage production build
├── docker-compose.yml      # Container orchestration
├── DEPLOYMENT.md           # Production deployment guide
└── prisma.config.ts        # Prisma 7 configuration
```

## License

Proprietary - All rights reserved.

## Security

- **Cryptographic RNG:** All seed and nonce generation uses `node:crypto.randomBytes` (256-bit entropy)
- **Security Headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- **Rate Limiting:** Per-IP bucket-based limits on all public and admin API endpoints
- **Admin Auth:** HMAC-SHA256 signed HttpOnly cookies with timing-safe comparison
- **Audit Logging:** All admin actions (and failures) persisted to database
- **Error Tracking:** Sentry integration across all runtimes (server, client, edge)

## Responsible Gambling

Gambling can be addictive. Please play responsibly.

- Set limits before you play
- Never chase losses
- Take breaks regularly
- Seek help if needed: [Gamblers Anonymous](https://www.gamblersanonymous.org)

---

**Note:** This software is for educational purposes. Operating an online casino may require licensing in your jurisdiction.
