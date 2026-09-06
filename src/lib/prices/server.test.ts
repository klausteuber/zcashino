import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatUsd, usableQuote } from './zec-usd'

const response = (amount = '125.50', base = 'ZEC') => ({ ok: true, json: async () => ({ data: { base, currency: 'USD', amount } }) })
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T12:00:00Z')) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('player ZEC quote', () => {
  it('coalesces concurrent requests and caches the public quote', async () => {
    const fetch = vi.fn().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetch)
    const { getZecQuote } = await import('./server')
    const [a, b] = await Promise.all([getZecQuote(), getZecQuote()])
    expect(a).toEqual(b)
    expect(a?.zecUsd).toBe(125.5)
    await getZecQuote()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('labels a failed refresh stale and expires it without extending its timestamp', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockRejectedValue(new Error('Offline'))
    vi.stubGlobal('fetch', fetch)
    const { getZecQuote } = await import('./server')
    const first = await getZecQuote()
    vi.advanceTimersByTime(60_000)
    expect(await getZecQuote()).toEqual({ ...first, stale: true })
    vi.advanceTimersByTime(14 * 60_000)
    expect(await getZecQuote()).toBeNull()
  })
  it.each([['0', 'ZEC'], ['-1', 'ZEC'], ['Infinity', 'ZEC'], ['bad', 'ZEC'], ['100', 'BTC']])('rejects invalid price %s/%s and backs off', async (amount, base) => {
    const fetch = vi.fn().mockResolvedValue(response(amount, base))
    vi.stubGlobal('fetch', fetch)
    const { getZecQuote } = await import('./server')
    expect(await getZecQuote()).toBeNull()
    expect(await getZecQuote()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not round sub-cent stakes to zero', () => {
    expect(formatUsd(1_000, 125)).toBe('<$0.01')
    expect(formatUsd(1_000_000, 125)).toBe('$1.25')
    expect(formatUsd(0, 125)).toBe('$0.00')
  })
  it('rejects expired, future, and malformed timestamps', () => {
    const quote = { zecUsd: 125, source: 'Coinbase' as const, stale: false, updatedAt: new Date().toISOString() }
    expect(usableQuote(quote)).toBe(true)
    expect(usableQuote({ ...quote, updatedAt: 'bad' })).toBe(false)
    expect(usableQuote(quote, Date.now() + 15 * 60_000)).toBe(false)
    expect(usableQuote(quote, Date.now() - 120_000)).toBe(false)
  })
})
