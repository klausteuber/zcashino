# Player dollar estimates — September 6, 2026

Poker now displays approximate USD beside real wallet balances, lobby stakes, selected table limits, and both create-table and join-table buy-ins. Practice stakes and buy-ins have no dollar conversion. ZEC remains the sole input, settlement currency, and ledger unit.

The public `/api/price` endpoint retrieves Coinbase's ZEC-USD spot price server-side, validates the currency pair and positive finite amount, coalesces concurrent requests, and caches/backoffs for one minute. It exposes no wallet or admin information. The existing authenticated admin price endpoint is unchanged. Provider reference: https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices

A shared poker price provider polls once per minute. Failed refreshes label the last known price; quotes older than 15 minutes disappear, including when browser requests fail. The timestamp is the time Coinbase was checked, not an exchange execution timestamp. Below-cent amounts display `<$0.01`. Quotes are estimates, never guaranteed conversion or withdrawal proceeds.

Validation: price caching, concurrent fetches, provider errors, invalid prices and pairs, stale expiration, and sub-cent formatting have automated coverage. Do not use USD floats to calculate poker transactions; integer zatoshi validation remains authoritative.
