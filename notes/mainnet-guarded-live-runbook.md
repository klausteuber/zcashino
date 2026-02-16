# Mainnet Guarded-Live Runbook

This runbook is for the post-launch guarded-live window (February 16, 2026 to March 18, 2026).

Current production notes:
- Initial real-money smoke test has already passed.
- Commitment refill intentionally creates one commitment per cycle (~5 minutes) to avoid Sapling witness anchoring failures.
- Health balance alerts should evaluate house confirmed + pending totals.

## Phase 0 (Day 0) — Baseline and Invariants

Run once at the start of guarded live:

```bash
npm run ops:baseline
```

What it captures:
- Negative balances
- Pending withdrawals older than 30 minutes
- Duplicate deposit tx hashes by session/type
- Duplicate idempotency keys by session/type
- Current commitment-pool availability

Output:
- Appends JSONL records to `ops/guarded-live-baseline.jsonl` (or `GUARDED_LIVE_BASELINE_LOG`).

## Phase 1 (72h) — Guarded Monitoring

First 6 hours:
- Run guarded-live monitor every 15 minutes.

Next 66 hours:
- Run guarded-live monitor hourly.

Command:

```bash
npm run ops:monitor
```

With Telegram alerts:

```bash
node scripts/guarded-live-monitor.js --alert
```

What it checks:
- `/api/health` status and commitment-pool state
- `/api/admin/overview` counters:
  - `transactions.raceRejections24h`
  - `transactions.idempotencyReplays24h`
  - `security.legacyPlayerAuthFallback24h`
- DB invariants:
  - Negative balances
  - Pending withdrawals older than 30 minutes

Alert gates:
- Critical:
  - Any negative balances
  - Commitment pool at 0 for >=10 minutes
- Warning:
  - Commitment pool below 5 for >=30 minutes
  - Pending withdrawals older than 30 minutes > 0
  - Race/idempotency counters spike above 3x first-day baseline

## Daily Reconciliation (Fixed Time)

Run once daily:

```bash
npm run ops:reconcile
```

What it captures:
- Internal liabilities (`sum(Session.balance)`)
- House wallet confirmed, pending, total (from `/api/health`)
- Delta (`houseTotal - liabilities`)
- Withdrawal queues (`pending`, `pending_approval`, `failed`) with sample rows

Output:
- Appends JSONL records to `ops/guarded-live-reconcile.jsonl` (or `GUARDED_LIVE_RECONCILE_LOG`).

## Strict Auth Cutover

Preconditions before setting `PLAYER_SESSION_AUTH_MODE=strict`:
- 48h with no negative balances
- No unresolved pending withdrawals older than 30 minutes
- No unexplained reconciliation deltas
- Legacy compat fallback usage near-zero:
  - `security.legacyPlayerAuthFallback24h` near zero

Rollout:
1. Deploy at low traffic.
2. Monitor 2 hours continuously:
   - 401/403 rates
   - wallet/game success rates

Rollback:
- Revert to `PLAYER_SESSION_AUTH_MODE=compat` immediately if:
  - auth rejections spike >2x baseline for 15+ minutes
  - withdrawal/game success rate drops below 99%

## Real-Money Canary Checklist

Run daily for first 7 days:
1. Deposit tiny amount.
2. Play one blackjack hand.
3. Verify hand via `/verify`.
4. Withdraw tiny amount.

Record txids/game ids in your daily ops log.
