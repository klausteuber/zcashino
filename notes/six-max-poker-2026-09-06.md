# Six-max ZEC Hold'em

Update: Omaha, seven-card stud and persistent time banks have since been added. See [variant and timing settings](poker-variants-and-time-bank-2026-09-06.md) for the current behavior; this document records the initial Hold'em implementation.

The user requested six-max multiplayer poker and explicitly chose existing real ZEC balances. The implementation adds `/poker` and `/poker/table/[tableId]`, a lobby, six-seat tables, invitation links, reconnecting clients, and authenticated multiplayer endpoints. No production deployment or actual blockchain transfer was performed for this change.

## Play and accounting

- No-limit Hold'em for 2–6 players; correct heads-up blinds/order; no rake. Supported big blinds are 0.0001, 0.001, and 0.01 ZEC, with 20–100 BB buy-ins.
- Players ready themselves; at least two ready players start a hand. Turns last 30 seconds; timeout checks when legal or folds, and sits the player out next hand. The result remains visible for eight seconds.
- Joining after the opening hand or returning after missing a hand posts one live big blind, with any normal blind already posted counting toward it. This room rule prevents cycling seats for free hands.
- Server dealing uses Node's cryptographic random integer generator and Fisher–Yates. The engine handles all-ins, side pots, uncalled refunds, split pots, odd zatoshis clockwise from the button, and short raises/reopening.
- Integer zatoshis are used throughout the poker engine. Buy-ins atomically transfer available `Session.balance` into table escrow and `Session.pokerLockedZats`; cash-outs reverse that transfer. Balance transfers do not count as wagers or wins.
- Actual matched contributions and awards update `totalWagered` and `totalWon` once per settled hand. All table chips must equal escrow before any state commits. Poker locks also count toward reserve liabilities, admin alerts and operational reconciliation.
- One seat per session globally. State versions, database transactions, unique seats and idempotent request receipts prevent conflicting actions and duplicate debits. Mid-hand departures check/fold on their next turn and cash out after settlement. Existing hands and departures continue when new real-money play is disabled.

## Zcash privacy and trust model

The room reuses the existing Zcash deposit and withdrawal flow, including its supported shielded/transparent address options. No new wallet or on-chain settlement protocol is introduced: hands settle in the operator's balance ledger.

Table nicknames and public betting actions are separate from wallet addresses and session identifiers. Responses reveal only the requesting player's hole cards, plus non-folded cards at a contested showdown. Folded cards remain hidden from other players. Decks and settlement identities stay server-side. The operator necessarily has access to the private game state and holds player funds; this is not mental poker or a public cryptographic shuffle proof. This limitation is stated on the table and lobby.

The public reserve endpoint now exposes aggregate figures without publishing per-session wallet addresses, balances or withdrawal addresses. The page calls this an operator-reported reserve report rather than an independently verified proof. Zcash shielded payments do not by themselves prove the accuracy of an operator's reported liabilities or the fairness of a poker shuffle.

## Runtime and activation

1. Use a persistent Node.js process with the existing SQLite database. This version polls table snapshots every second; it does not use WebSockets or require Redis. It is not intended for stateless functions that suspend between requests.
2. Apply additive migration `20260906010000_add_six_max_poker` through the repository's safe migration procedure. It adds the session lock column and durable table, seat and event storage. Do not edit existing migration files. Production rollout still requires the established online backup and migration rehearsal procedure.
3. Set `POKER_REAL_MONEY_ENABLED=true` in the runtime environment to allow new real-ZEC tables, buy-ins and hands. Both env examples default it to `false`; Compose already imports `.env.mainnet`. Real entry requires a signed, deposit-authenticated session, an available balance, an allowed region and the existing play limits. Practice sessions cannot enter real tables or vice versa.
4. `KILL_SWITCH` also stops new entries/hands. Neither flag prevents completing an active hand or returning a saved stack. Cash-outs return funds to the existing site balance; the existing withdrawal flow sends them to a wallet.
5. Table deadlines are stored in the database. A one-second worker starts in instrumentation and also initializes on the first authenticated poker request, covering development runtimes that skip instrumentation. Versioned transactions arbitrate competing workers. Verify worker advancement without table polling after changing startup code.

At current scope there is no rake, tournament manager, automatic top-up, collusion detection, or public hand-shuffle proof. Public-facing fair-game claims should not imply those features exist.

## Validation

- Full Vitest suite: 67 files, 667 tests passed with `npx vitest run --maxWorkers=2` before the final browser/server import extraction. Poker includes 36 tests across engine, real-balance service, HTTP boundaries, migration and worker behavior. Engine coverage includes 500 randomized hands with exact chip conservation.
- Six separate authenticated HTTP clients completed a full hand and cash-outs through the real-balance path in an isolated SQLite preview. Their aggregate available balance returned to the original 6 ZEC and all table locks cleared. These were artificial test balances, not on-chain ZEC.
- A separate HTTP check read the database after all clients stopped polling and confirmed the worker dealt the next hand. Service integration tests also reopen the persisted database and settle an expired turn.
- Browser checks covered lobby creation, ready state, six occupied seats, hidden opponent cards, a Check action advancing to the flop, and mobile layout at 390 px without horizontal overflow. Controls appear before hand activity on narrow screens.
- The production compiler found existing browser imports of server-only shuffle code through blackjack constants and video-poker paytable helpers. Those browser-safe exports were extracted without changing payout values or server dealing behavior.
- Final webpack production build and TypeScript compilation passed, followed by standalone artifact sanitization/validation. Turbopack could not bind its build helper port in this environment, so the verification used `npx next build --webpack`. The final display-data extraction passed all 172 affected blackjack/video-poker tests and targeted ESLint.
- The built standalone server passed HTML, static asset and anonymous-access checks using a separate copied test database. Crucially, it advanced a persisted table deadline after restart before receiving any HTTP request. Safe migration bootstrap, existing-history deployment and fail-closed checks all passed. Whitespace checks passed for source changes; the unrelated existing `dev.log` has trailing whitespace and was left alone.

Local preview data lives outside the repository at `/private/tmp/zcashino-poker-preview`, with no production environment files or wallet credentials. Tests and build checks must not use the production database or exercise actual financial transfers.
