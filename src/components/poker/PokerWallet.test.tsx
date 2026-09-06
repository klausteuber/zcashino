import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameSession } from '@/hooks/useGameSession'
import PokerWallet from './PokerWallet'

vi.mock('@/components/onboarding/OnboardingModal', () => ({ OnboardingModal: () => null }))
vi.mock('@/components/wallet/WithdrawalModal', () => ({ WithdrawalModal: () => null }))

function Wallet() {
  const game = useGameSession()
  return <PokerWallet game={game} />
}

describe('PokerWallet deposit synchronization', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('credits a pending deposit after leaving the dialog and displays the full server balance', async () => {
    let confirmed = false
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url === '/api/session'
      ? { id: 'real-1', walletAddress: 'real-wallet', balance: 0, isDemo: false, isAuthenticated: false, depositAddress: 'u1deposit' }
      : { success: true, newDeposit: confirmed, depositAmount: confirmed ? 1 : null,
        pendingDeposits: confirmed ? [] : [{ amount: 1, txHash: 'tx-pending', confirmations: 2 }],
        session: { balance: confirmed ? 2.25 : 0, isAuthenticated: confirmed } } }))
    global.fetch = fetchMock
    render(<Wallet />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Deposit pending: 1 ZEC · 2/3 confirmations')
    confirmed = true
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(screen.getByText('2.25')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/session')).toHaveLength(1)
  })

  it('clears an expired-session polling error after the browser credential recovers', async () => {
    let restored = false
    global.fetch = vi.fn(async (url: string) => ({ ok: url === '/api/session' || restored, status: restored ? 200 : 401,
      json: async () => url === '/api/session'
        ? { id: 'real-1', walletAddress: 'real-wallet', balance: 0, isDemo: false, depositAddress: 'u1deposit' }
        : restored ? { success: true, newDeposit: false, session: { balance: 1, isAuthenticated: true } }
          : { error: 'Player session expired. Please refresh your session.' } }))
    render(<Wallet />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('alert')).toHaveTextContent('Player session expired')
    restored = true
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
