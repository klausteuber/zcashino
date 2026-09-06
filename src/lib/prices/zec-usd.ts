export const PRICE_FRESH_MS = 2 * 60_000
export const PRICE_EXPIRES_MS = 15 * 60_000
export interface ZecQuote { zecUsd: number; updatedAt: string; source: 'Coinbase'; stale: boolean }

export function quoteAge(quote: ZecQuote, now = Date.now()): number {
  return now - Date.parse(quote.updatedAt)
}
export function usableQuote(quote: ZecQuote, now = Date.now()): boolean {
  const age = quoteAge(quote, now)
  return Number.isFinite(quote.zecUsd) && quote.zecUsd > 0 && Number.isFinite(age) && age >= -60_000 && age < PRICE_EXPIRES_MS
}
export function formatUsd(zats: number, price: number): string {
  const amount = zats / 100_000_000 * price
  if (amount > 0 && amount < 0.01) return '<$0.01'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
