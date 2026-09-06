# Omaha, seven-card stud and replenishing time bank

The shared CypherJester/21z poker room now supports three immutable table types: no-limit Hold'em, four-card pot-limit Omaha high, and fixed-limit seven-card stud high. All use the existing 2–6 player seating, real/practice separation, signed sessions, ZEC table escrow, limits, durable deadlines and zero-rake settlement. Existing table JSON without a variant loads as Hold'em. No production deployment or real blockchain transfer was performed.

## Omaha

Players receive four downcards and form a hand using exactly two of them plus exactly three community cards. The maximum raise is the player's call plus the pot after calling, constrained by their stack. The server rejects pot overbets and inappropriate hand combinations. Streets, entry blinds and action order use the shared Hold'em flow. These rules follow the [PokerStars Omaha rules](https://www.pokerstars.com/poker/games/omaha/).

## Seven-card stud

Players receive two downcards and one upcard on third street, upcards on fourth through sixth street, then a final downcard on seventh street. There is no community board. The lowest third-street upcard starts with a bring-in or a completed bet; rank ties use clubs, diamonds, hearts, spades. Later streets open with the highest exposed hand among players able to act; tied exposed hands use the lowest numbered seat. Downcards remain private until contested showdown and stay hidden when folded. Previously exposed cards remain public. Dealing and the fourth-street open-pair option follow the [PokerStars stud rules](https://www.pokerstars.com/poker/games/stud/).

Explicit room settings:

- The existing stake unit (`bigBlind` in storage/API) represents the small fixed bet for stud. The upper bet is twice that unit. The UI labels these as limits, and buy-ins as 20–100 small bets.
- Ante: 10% of the small bet; bring-in: 50% of the small bet. Both are posted as integer zatoshis; the ante contributes to the pot, never the amount owed on the current street.
- Third/fourth street use the small bet; fifth through seventh use the large bet. An exposed pair on fourth permits a large bet/raise, after which that street continues in large increments.
- Four full bets per street (opening bet plus three raises), including heads-up. A bring-in does not use a full-bet slot. A short all-in of at least half a fixed bet reopens betting and counts toward the cap; smaller all-ins may be completed to a full bet.
- Timeouts/leaving cannot avoid an owed bring-in. It is posted automatically; subsequent decisions check/fold. Timed-out players sit out the next hand.
- Six players need at most 42 dealt cards plus four burns, so no deck exhaustion/community-card fallback is needed at this table size.

## Time bank

The normal clock stays at 30 seconds for each decision. Every player starts with a 30-second reserve and can press **Use time bank** once during their own live decision, before its normal deadline. This extends that deadline by their available reserve. Only milliseconds used after the normal deadline are deducted; early action retains the unused time. Exhausting the extended clock triggers the normal timeout action and sit-out behavior.

Players earn 5 seconds every 10 hands actually dealt to them, capped at 30 seconds. Sit-outs do not earn credit. The hand counter and bank persist on the authenticated session across table changes and variants, with the active bank/deadline in durable table state. Disconnects do not reset the clock. The bank is never activated automatically, and clients cannot request arbitrary durations. Existing sessions receive the initial reserve through the new migration; existing table JSON receives compatible defaults without changing cards or money.

Database migration: `20260906020000_poker_time_bank` adds only `Session.pokerTimeBankMs` and `Session.pokerHandsDealt`. Do not edit the preceding six-max migration. All bank changes, hand counts and poker financial operations commit with the table's existing optimistic version transaction. The migration has been applied only to the isolated preview database; production requires the standard online backup and rehearsal.

## Verification

- 68 Vitest files / 691 tests passed with `npx vitest run --maxWorkers=2`, including 60 poker tests. This includes 300 randomized Omaha and 300 randomized stud hands, in addition to the original 500 Hold'em runs, checking exact chip conservation.
- Engine tests cover Omaha selection and pot caps, stud up/downcard privacy, bring-in/completion, betting increments/caps, open pairs, short all-ins and street order, plus bank charging/refills and forbidden extensions.
- SQLite integration checks settle six-player hands for both new variants, preserve total funds, persist refill counts, retain banks across table changes, arbitrate repeated requests, and resume an activated bank through a new database connection.
- Actual local HTTP checks completed both six-player real-balance paths using artificial funds, returning each group's original 6 ZEC total and clearing all locks. An Omaha player activated the bank, waited beyond the normal 30 seconds, then acted successfully with the spent bank deducted. No actual ZEC was deposited or transferred.
- Browser checks created a stud table through the lobby, activated a bank, completed a bring-in, and checked desktop/mobile card layouts through seventh street. The lobby offers game filters and variant-aware creation controls. The reserve and table stats are from the isolated preview, not production.
- Browser checks also created an Omaha table, selected **Pot** to set a 0.00065 play-ZEC maximum facing a 0.0001 call into a 0.00045 pot, and submitted the raise successfully. The player's partially spent bank carried over from stud. Both variants fit within a 390 px viewport without horizontal overflow; exposed suits remain fully visible above the stud seat panels.
- Production webpack build, TypeScript, targeted ESLint and standalone artifact validation passed. New migration coverage preserves existing balance data and verifies default bank fields and SQLite integrity.
- Final standalone smoke testing used a separate online copy of the preview database and confirmed a persisted deadline advanced on startup before any HTTP request, followed by successful page/static-asset and anonymous-access checks.

Implementation areas: `src/lib/poker/{engine,stud,evaluator,time-bank,types,service}.ts`, the poker API routes and `src/components/poker`. Runtime activation remains `POKER_REAL_MONEY_ENABLED=true`; the existing production gate stays off by default.


Poker entry/identity/history controls are documented in [Poker integrity controls](poker-integrity-2026-09-06.md).
