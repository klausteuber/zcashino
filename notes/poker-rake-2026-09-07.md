# Poker rake — 2026-09-07

## Agreed behavior
New real-ZEC tables use the immutable `zec-2.9-v1` policy: 2.9% of matched pot contributions, rounded down to whole zatoshis, with one per-hand cap of 3 big blinds or 1 when exactly two players were dealt in. Stud uses the small-bet unit. Folded players still count toward the dealt-player cap. Hold’em/Omaha need a flop; stud needs fourth street. Uncalled bets are refunded intact. Practice tables and stored tables without a policy keep zero rake for their entire lifetime, including later hands and new entrants.

## Accounting
The engine computes one fee, then apportions it proportionally across main/side pots using cumulative integer rounding before distributing net awards and odd chips. It resets the hand’s rake at the next deal. The service debits player escrow and inserts a durable PokerEvent of kind `rake` with the exact amount and unique request key `rake:<tableId>:<handNumber>`. That receipt, payout statistics, locked balances, encrypted hand history and table state commit in the same SQLite transaction. Rollback or duplicate execution cannot leave a partial fee. The conservation invariant is original player funds = remaining player funds + recorded rake.

Rake is house revenue held in the existing operator wallet, no longer a player liability. This is an internal accounting transfer, not a blockchain transfer. No schema migration is necessary. Preserve the revenue events; unlike encrypted private hand histories, they must not be expired by evidence-retention cleanup. Do not count the revenue a second time in summaries that already derive house results from totalWagered minus totalWon.

## Player and operator visibility
Creation and seat buy-in forms disclose the percentage, ZEC caps and eligibility. Lobby rows/table headings show the specific table’s policy. Results, activity and encrypted histories record the actual fee. The admin poker page shows all-time/last-24-hour rake and raked-hand counts from durable real-table events, with exact string serialization of zatoshis and the existing admin host/auth/rate-limit checks.

## Validation
- Main working copy: 120 poker tests passed, including 900 randomized raked hands, caps, side pots, ties/odd chips, refunds, preflop/third-street folds, and legacy behavior.
- Funded temporary SQLite: all three variants, practice/legacy tables, cash-outs, duplicate commands, restart, worker timeouts and transaction rollback checked.
- TypeScript and scoped lint passed.
- Standard Turbopack build blocked by environment font fetching and then internal port-binding restrictions; the webpack production build passed, followed by standalone preparation and release-artifact validation. These build checks used the clean poker-release checkout.

Implemented in the clean poker-release checkout and applied to zcashino-app while preserving the latter’s ongoing table presentation edits. No production deployment or blockchain transfer performed.
