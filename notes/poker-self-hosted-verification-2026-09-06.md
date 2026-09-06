# Self-hosted poker entry verification — 2026-09-06

The user requested verification without Cloudflare or another outside verification service. This release replaces Turnstile with Cap's pinned open-source core and locally served widget/solver. It is a security check, not proof of a human, and does not replace the existing poker integrity monitoring and review.

## Implementation

- Cap core 0.1.2, widget 0.1.57 and WASM solver 0.0.7 are pinned in the lockfile. `predev`/`prebuild` prepare versioned assets under `public/vendor/cap/0.1.57`, including licenses and a local decompression fallback. The asset preparer rewrites the two exact pinned CDN defaults and fails if an upgrade changes their expected form. This is necessary because the widget preloads WASM before React effects can configure it.
- Authenticated, rate-limited same-origin JSON POST routes under `/api/poker/check/[nonce]/challenge` and `/redeem` issue and validate the challenge. Identity setup/recovery and the signed browser cookie are required first. No player-supplied difficulty or grant is accepted.
- Twenty SHA-256 puzzles at four hexadecimal target characters add modest computational friction. A five-minute signed challenge is bound by a keyed scope to the poker identity, identity nonce, entire signed browser cookie and actual request hostname. Public production hosts are explicitly limited to the two casino brands and their www hosts. Testnet localhost is allowed only in non-production processes.
- The solution schema is bounded; invalid/expired/forged/cross-scope proofs fail closed. A successful proof atomically rotates the identity nonce and grants entry in the existing database transaction. This durable nonce rotation is the replay-consumption mechanism across workers; it also rejects alternate encodings of the same valid proof. Financial entry still consumes the grant once, preserving idempotent buy-in receipts.
- The redeem response includes a UI receipt after persistence; that string has no authority and cannot be presented to bypass verification. Refreshing status reads the actual stored grant.
- Existing two-hour/100-dealt-hand play verification, between-hand rechecks, recovery, restrictions, bank and cash-out behavior are unchanged. Existing tables/financial data need no migration.
- Cap's optional instrumentation executes `eval`/`new Function` inside its generated browser probes. It is intentionally disabled because it conflicts with the app's nonce CSP. JavaScript `unsafe-eval` remains disallowed in production. Poker pages alone permit local blob workers and `wasm-unsafe-eval` for the solver; other pages do not receive those additions. Cloudflare connect/frame permissions are removed.
- A browser can automate and solve this proof of work. Do not label it verified-human or claim it detects live solver assistance. Existing account-link, decision-timing and collusion indicators still require conservative manual review.
- Privacy text and player messages describe the locally processed security check; no external CAPTCHA provider receives verification requests. Existing first-party poker integrity observations remain disclosed.

References: https://capjs.js.org/guide/capjs-core.html and the pinned package source. The deployed configuration is `POKER_HUMAN_CHECK_MODE=self-hosted`; old Turnstile configuration does not silently work. Signing derives a separate key from the existing integrity secret, so no new external keys are needed and retained-history encryption is unchanged.

## Verification

- 697 tests in 72 files passed, including genuine public-protocol proof solving, scope/tamper/expiry rejection, concurrent redemption, accounting after entry/cash-out, HTTP auth/origin/rate/size restrictions and CSP scope.
- Full lint, TypeScript, coverage and production standalone artifact validation pass.
- Browser verification uses artificial practice balances. Its live resource list confirms the solver loads from our own origin, and the stored entry grant becomes ready after solving.
- Required release gates and public checks must pass before describing production as activated.
