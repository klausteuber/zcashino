# Security remediation release notes — September 4, 2026

This release addresses the nine findings in `reports/security-audit-2026-09-04/report.md`. All validation gates listed below passed. No production changes are part of this local remediation.

## Required rollout steps

- Set `PLAYER_SESSION_AUTH_MODE=strict` and `FAIRNESS_DEFAULT_VERSION=hmac_sha256_v1`. Mainnet startup refuses unsafe settings. Public session IDs no longer authorize any operations; existing signed cookies and recovery keys remain supported.
- Back up the production SQLite database using the online backup procedure and rehearse the new `20260905050000_security_session_and_game_versions` migration against a copy. It adds admin authentication versions and blackjack action versions without changing old migration files.
- Existing administrator cookies must sign in again because old tokens have no immutable account ID/authentication version. Password reset, role changes, deactivation, MFA changes, and logout revoke prior tokens.
- Fresh installations require explicit administrator initialization with `npm run admin:bootstrap`. Existing administrators need no bootstrap. Login no longer creates an administrator or falls back to an environment password.
- If Telegram administration is enabled, explicitly provision its database-backed service account. With the mainnet builder/migration image and configuration, run `docker compose -f docker-compose.mainnet.yml run --rm migrate npm run admin:bootstrap -- --telegram` after migration. Existing account permissions and deactivation are preserved. Disabling `telegram-bot` in Admin Users blocks subsequent bot actions.
- Keep ambiguous payments reserved. Rows with `submission_unknown:` require wallet reconciliation before any manual refund or retry. A timeout or failed application write is not evidence that no payment was made. Review historical refunded withdrawals against wallet outcomes before assuming the older bug caused no loss.
- Blackjack clients receive explicit public action choices and identity-free hidden cards. All wager-bearing actions use a database version claim so conflicting requests cannot charge twice or overwrite a settled hand. Historical legacy shuffle replays remain supported; new games use HMAC only.
- Keep the existing release discipline: fetch/rebase before a production push, rerun gates, verify the standalone artifact, then follow the normal deployment skill. No deployment, automatic historical refund, or production database mutation was performed here.

## Lessons incorporated

A card-back UI does not protect card identity. A conditional balance debit is not sufficient unless the game transition is committed with it. Admin tokens must consult current account state. RPC submission errors must distinguish proven rejection from unknown payment outcomes. Dependency advisory counts require checking the actual installed versions and runtime applicability.

## Validation completed

- 592 tests passed across 59 suites, including real SQLite concurrent-action, transaction-rollback, and exact additive-migration checks.
- Coverage passed all project thresholds: statements 59.43%, branches 49.53%, functions 63.59%, lines 61.22%.
- ESLint with zero warnings and TypeScript checking passed.
- Eight Chromium smoke tests passed against the standalone production app, including signed demo gameplay and rejection of session-ID-only mutations. The local test wallet node is intentionally absent; reserves checks logged connection refusals without failing the tests. No real funds were sent.
- Migration bootstrap, already-migrated deployment, and rejection of untracked non-empty databases passed on disposable local databases. The bootstrap now uses non-destructive `db push` without the unnecessary data-loss override after verifying emptiness.
- Production build passed with Next.js 16.3.4 and Prisma 7.10.0. The build now removes Next's automatically copied `.env` / `.env.production` from the generated standalone root and runs the artifact validator. Real workspace environment files are untouched. Docker still excludes environment files before building.
- Full npm audit (including development dependencies) reported zero vulnerabilities. Patched transitive overrides are retained for Hono's Node adapter, ip-address, PostCSS, deepmerge-ts, mysql2, and sharp; no forced Prisma/geoip-lite downgrade was used.
- Diff whitespace check passed for changed code; the pre-existing `dev.log` change and older untracked audit documents were left untouched.

## Audit finding closure map

| Finding | Implemented remediation |
| --- | --- |
| 01 Hidden dealer card | Public card placeholders, masked hidden flags, server-provided actions, serializer/API/browser regression tests. |
| 02 Unsafe refunds | Typed definitive wallet rejection; durable reservations and review state for uncertain submissions, post-send failures, and retries; guarded refunds and clear withdrawal UI. |
| 03 ID-only authentication | Cookie-free fallback removed globally; strict mainnet validation and updated environment/deployment examples. |
| 04 Non-revocable admin sessions | Immutable account ID and auth version in tokens; current account permissions checked on every API request; security changes/logout revoke tokens; TOTP challenge version binding. |
| 05 Non-atomic blackjack | Database version claim commits with additional stake, persisted game history, and payout; persisted insurance decisions restored; real concurrent SQLite tests. |
| 06 Weak shuffle fallback | HMAC default for new hands; legacy/invalid new-game configuration rejected; historical legacy replay preserved. |
| 07 Admin fallback | Password-only environment fallback removed; explicit bootstrap command and revocable Telegram service account. |
| 08 Incorrect verification success | Failed timestamps, replay exceptions, and requested chain proofs fail validation; response/UI distinguish shuffle-only checks from recorded-game proof. |
| 09 Dependencies | Updated compatible releases and reviewed overrides; full registry audit clean. |

Production remains unchanged. Deploying this release still requires the backed-up migration rehearsal and runtime configuration checks described above. These fixes do not establish whether the older flaws were exploited; historical wallet reconciliation remains an operational follow-up.
