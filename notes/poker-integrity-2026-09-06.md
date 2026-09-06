# Poker integrity controls — 2026-09-06

Implemented locally for the shared CypherJester / 21Z.cash poker pool. No production deployment or real blockchain transfers were performed. Scope: entry checks, durable pseudonymous identities, private histories, and conservative bot/collusion indicators. No player-reporting system, automatic bans, confiscations, or solver-detection claims.

## Player access

- A `PokerIdentity` has a stable public poker ID and nickname, bound one-to-one to the existing `Session`. Both brands use that database. The client cannot change the canonical nickname by sending a different table-entry name.
- Real-money entry requires an existing wallet recovery credential and the player's acknowledgement that the key is safely stored. Existing `/api/session/recovery` restores the same session/identity on either brand and revokes earlier signed browser sessions through `playerAuthVersion`. Recovery also keeps the session's balance, time bank and dealt-hand count. Restrictions live on the identity and survive recovery.
- Practice identities remain browser-bound because the existing wallet recovery flow is for real-money sessions. The UI explains this distinction.
- This is a persistent pseudonym, not proof of one human or one account. There is no KYC or passkey enrollment in this release. Creating new wallets/clearing cookies can evade linkage; the UI asks players to use one poker identity.
- `POST /api/poker/access` validates setup/verification against the authenticated session, strict schemas and same-origin JSON protections. A dedicated rate bucket limits setup/verification traffic. No client-supplied identity, expiry, grant or score is accepted.
- Cloudflare Turnstile verification occurs on the server and checks success, an explicit hostname allowlist, the current host, `poker-entry` action, the identity's one-use nonce, and a five-minute provider timestamp. Raw provider tokens are never stored. Their hashes have ten-minute replay-protection retention. Nonce redemption and observation writes are atomic.
- Each successful check grants one seat entry within five minutes. Create/join consumes it in the same transaction as the buy-in. Duplicate successful request receipts remain safe to retry. Failed buy-ins roll back grant consumption too.
- Continued play verification lasts two hours or 100 hands actually dealt, whichever comes first. It is enforced at Ready and before the next deal. Flag-triggered checks are also enforced only before a new hand. Existing actions, time-bank use, leaving and cash-out remain available during expiry or an identity restriction.
- Missing or invalid Turnstile configuration closes new entry; it never converts real-money play to a fake check. The explicit `local-test` implementation requires a non-production process, testnet and a localhost request and is clearly labeled as not verifying a human.

Cloudflare references: [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/), [test credentials](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). The script receives the per-request CSP nonce; only Cloudflare's challenge origin is added to connect/frame sources. The compact widget fits the narrow table sidebar. Provider errors/expired tokens support retry, with no acceptance fallback.

## Private history and limited linkage

- `PokerHand`, `PokerHandPlayer` and `PokerDecision` are separate from durable financial `PokerEvent` receipts. Recording runs in the same CAS transaction as the successful gameplay change, so stale/replayed/rolled-back actions cannot invent evidence or duplicate it.
- Records include dealt cards, street and board context, legal choices, bets/contributions, outcomes, server-measured elapsed time, bank activation/spend, and explicit `player`, `timeout`, or `leave` sources. Undealt decks are never copied to history. Legacy hands already running when the feature is installed are marked partial.
- Hand and decision payloads use AES-256-GCM with record ID as authenticated context. Poker session IDs and wallet addresses are excluded from the private snapshot payload. Initial and completed card states remain encrypted; the operational current table state is still held by the trusted game server as before.
- A signed first-party cookie contains a random browser marker, valid at most 30 days. Observations keep a keyed digest of that marker, not a canvas/hardware fingerprint. The network signal is a daily keyed digest of the IP obtained only through the existing explicitly trusted proxy helper. Untrusted or unavailable IPs produce no network signal. No browsing history, OS process scanning, or raw IP storage is added.
- Cloudflare sees normal browser/network information needed to perform its check; our Siteverify request sends no wallet addresses, balance, cards or nickname. This dependency and first-party observations are disclosed in `/privacy#poker-integrity` and the poker access panel.
- Private histories, observations and indicators expire after 30 days, with hourly cleanup. Related private decision/player rows cascade from expired histories. Inactive operational table cards/logs older than 30 days are cleared without touching financial receipts or balances. Live hands retain operational state until resolved. Identities and financial records persist. Backups have separate retention, disclosed in the privacy page.

## Indicators and review

Background analysis runs independently of gameplay, with bounded batches of three completed hands every ten seconds. Statistical reads run outside the gameplay transaction. Only real-money, completed, non-partial current hands initiate analysis. Windows are per variant; thresholds are intentionally conservative starter heuristics, not a calibrated model.

- Shared browser/network markers between identities that played the same hand generate an indicator. Shared networks are informational. Neither alone imposes a restriction or recheck.
- Uniform decision timing requires at least 80 eligible decisions across 40 hands, multiple streets/actions and at least 30 decisions facing a call. Actual bank-spending decisions, forced bring-ins, automatic timeouts/departures and non-decision commands are excluded. Merely activating an unused bank cannot erase otherwise eligible timing; activation itself contributes no suspicion.
- A human recheck is requested only when uniform timing is corroborated by a shared browser marker at the same table. Rechecks are throttled to once per identity per 12 hours and become effective between hands.
- Possible chip dumping requires at least 30 shared hands, strongly one-sided large pots, and at least eight repeated folds facing a low additional call after substantial contribution. The evidence explicitly cautions that these are not direct-transfer calculations or proof of cheating; cards, side pots and legitimate strategy need review.
- Selective passivity compares enough legal raising opportunities against one opponent with opportunities against at least three others. Each group needs 40 decisions across 20 hands. Cards, position and opponent strategy remain review considerations.
- Signals are deduplicated by rule/player pair/day and written atomically with existing `AdminAlert` notifications. No funds or exclusion state are automatically changed. No external messages are sent.
- `/admin/poker` is a read-only evidence viewer accessible from the existing sidebar. `/api/admin/poker/integrity` requires a positive Cypher hostname mapping even in single-brand/forced-brand mode, as well as the existing brand guard, authenticated `view_games` permission, admin read rate limiting, audit logging and no-store responses. Only completed, unexpired hands can be decrypted through it—even for an admin. Ordinary table snapshots never contain integrity evidence, link signals, other players' IDs or private folded cards.

These heuristics do not reliably detect every bot, live solver assistance, separate-device cheating or deliberately randomized behavior. They need operational review and tuning against real traffic; a winning player, long session, shared IP or time-bank use alone is not proof of cheating.

## Production configuration and migration

No live Turnstile keys were present in the workspace during this implementation.

1. Configure a genuine Turnstile widget for `21z.cash`, `www.21z.cash`, `cypherjester.com`, and `www.cypherjester.com` (only add hostnames actually served). Set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `TURNSTILE_HOSTNAMES` in the runtime environment. The public site key is served dynamically; no client rebuild is needed for key configuration.
2. Set a dedicated random `POKER_INTEGRITY_SECRET` of at least 32 characters and back it up securely. If absent, the server derives its integrity key from `PLAYER_SESSION_SECRET`. Do not casually rotate either effective encryption secret while retained hands exist: existing evidence needs its original key, and in-flight hand completion reads its encrypted initial record. There is no multi-key rotation workflow yet.
3. Keep `POKER_HUMAN_CHECK_MODE=turnstile` in production. Published Cloudflare test credentials are rejected. Local tests are never accepted in production or mainnet mode.
4. Existing Compose `env_file` supplies runtime settings. The existing trusted proxy setup must overwrite `X-Real-IP`; direct caller forwarding headers are not accepted as network evidence.
5. Apply only the new additive migration `20260906030000_poker_integrity`, after the existing six-max and time-bank migrations. It adds private integrity tables and relations; no applied migration SQL was edited. The repository's legacy chain cannot be replayed naively in a shadow DB; the migration was generated by comparing old/new schemas and verified with the safe migrator on the isolated preview DB.
6. Follow the existing production fetch/rebase, backup, copied-database migration rehearsal, artifact validation and release checks before any deployment. Do not enable real entry until genuine Turnstile credentials have been exercised on the intended production hosts.

## Verification

- Full suite: 73 files / 720 tests passed; TypeScript and targeted ESLint passed.
- Additive migration applied through `migrate-safe.js` only to the isolated preview database (17 migrations current).
- Tests cover no-money-reservation before recovery/human verification, canonical identity continuity, single-use grants, safe idempotent retries, concurrent and cross-identity token replay, expiry during a hand, 100-hand refresh, identity restriction persistence, all three game histories, automatic/bank source distinction, encrypted payload integrity, conservative positive/negative rule fixtures, shared-browser alert deduplication and no automatic financial penalty, private data expiry, request spoofing and authenticated/brand-scoped admin boundaries.
- Actual HTTP rehearsal on localhost with artificial real-balance sessions used the real recovery endpoint, verified checks, dealt Omaha, activated a bank, expired a check mid-hand, completed the hand, restored the identity and returned all 2 test ZEC with zero locked exposure. Private records were encrypted and the unauthenticated evidence endpoint stayed closed.
- Browser checks: practice identity setup and the explicit local mock check succeeded; the canonical nickname populated the table form; sidebar play/exit controls remain above the compact identity panel. Expanded panel at 390px has no horizontal document overflow.
- Production webpack build and standalone artifact validation passed. The standalone smoke verified a persisted hand advances before any HTTP request, HTML/static assets load, authenticated reviewers can read encrypted completed evidence, active down cards remain inaccessible, and a raw HTTP request on the 21z hostname is rejected even in single-brand mode.

Final preview: `http://127.0.0.1:3200/poker`, running the final source against the isolated test-fund database with the explicit local mock. No production deployment.

## Release preparation

An isolated `release/poker-20260906` checkout starts from current GitHub main (`6f558a6`), preserving the deployed SEO changes and excluding unrelated blackjack presentation/coaching edits. That exact release passes 691 tests in 71 files, full lint, TypeScript, coverage thresholds, safe migration checks and the standard Turbopack production build/artifact validator. A production standalone test verifies background timing and private evidence boundaries with a copied test-fund database.

Production configuration inspection found no Turnstile credentials. Publishing the application must not be represented as opening playable real-ZEC tables: genuine provider checks still need configuration and verification before real entry is enabled. The migration plan uses an online SQLite backup, the exact release migrator image on a private copy, integrity/foreign-key checks and comparison of all existing table rows before running the live migrator.
