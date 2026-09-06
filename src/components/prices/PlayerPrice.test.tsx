import { act, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerPriceProvider, PriceReference, UsdEstimate } from './PlayerPrice'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('updates an edited buy-in, labels failed refreshes, and removes expired dollars', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ zecUsd: 125, updatedAt: new Date().toISOString(), source: 'Coinbase', stale: false }) }).mockRejectedValue(new Error('Offline')))
  const view = (zats: number | null) => <PlayerPriceProvider><UsdEstimate zats={zats} /><PriceReference /></PlayerPriceProvider>
  const { rerender } = render(view(1_000_000))
  await act(async () => {})
  expect(screen.getByText('≈ $1.25 USD')).toBeInTheDocument()
  rerender(view(2_000_000))
  expect(screen.getByText('≈ $2.50 USD')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(60_000) })
  expect(screen.getByText('≈ $2.50 USD (last known price)')).toBeInTheDocument()
  await act(async () => { vi.advanceTimersByTime(14 * 60_000) })
  expect(screen.queryByText(/2.50/)).not.toBeInTheDocument()
  expect(screen.getByText(/USD estimate unavailable/)).toBeInTheDocument()
})
it('never invents a price when the provider is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  render(<PlayerPriceProvider><UsdEstimate zats={100_000_000} /><PriceReference /></PlayerPriceProvider>)
  expect(await screen.findByText(/USD estimate unavailable/)).toBeInTheDocument()
  expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
})
