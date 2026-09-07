import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { UseGameSessionReturn } from '@/hooks/useGameSession'
import PokerAccessPanel from './PokerAccessPanel'
vi.mock('./HumanCheck', () => ({ default: () => null }))
const access = { identityId: 'test-player', nickname: 'Alice', avatar: 'fox', recoveryRequired: false, setupComplete: true, playVerified: true, entryVerified: true, restricted: false, provider: 'self-hosted', nonce: 'nonce' }
const game = { session: { id: 'session', isDemo: true } } as UseGameSessionReturn
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('saves a catalog choice and shows the selected avatar from the server', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => access })
  vi.stubGlobal('fetch', fetch)
  render(<PokerAccessPanel game={game} />)
  const button = await screen.findByRole('button', { name: 'Use Owl avatar', hidden: true })
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...access, avatar: 'owl' }) })
  fireEvent.click(button)
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
  expect(fetch).toHaveBeenLastCalledWith('/api/poker/access', expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'avatar', avatar: 'owl' }) }))
  expect(screen.getByRole('img', { name: 'Alice — Owl avatar' })).toBeInTheDocument()
})
it('keeps the original selection when saving fails', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => access })
  vi.stubGlobal('fetch', fetch)
  render(<PokerAccessPanel game={game} />)
  const owl = await screen.findByRole('button', { name: 'Use Owl avatar', hidden: true })
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Please try again.' }) })
  fireEvent.click(owl)
  expect(await screen.findByText('Please try again.')).toBeInTheDocument()
  expect(owl).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Use Fox avatar', hidden: true })).toHaveAttribute('aria-pressed', 'true')
})
