import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/ui/JesterLogo', () => ({
  default: () => <div data-testid="jester-logo" />,
}))

vi.mock('@/components/game/Card', () => ({
  default: () => <div data-testid="card" />,
  Hand: ({ label }: { label?: string }) => <div data-testid="hand">{label || 'HAND'}</div>,
}))

vi.mock('@/components/game/Chip', () => ({
  ChipStack: ({ values, onSelect }: { values: number[]; onSelect: (value: number) => void }) => (
    <div data-testid="chip-stack">
      {values.map(value => (
        <button key={value} onClick={() => onSelect(value)}>{value}</button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/game/HandHistory', () => ({
  HandHistory: () => <div data-testid="hand-history" />,
}))

vi.mock('@/hooks/useGameSounds', () => ({
  useGameSounds: () => ({
    playSound: vi.fn(),
    toggleMute: vi.fn(),
    isMuted: false,
  }),
}))

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}))

vi.mock('@/components/onboarding/OnboardingModal', () => ({
  OnboardingModal: () => null,
}))

vi.mock('@/components/wallet/DepositWidget', () => ({
  DepositWidget: () => <div data-testid="deposit-widget" />,
  DepositWidgetCompact: () => <div data-testid="deposit-widget-compact" />,
}))

vi.mock('@/components/wallet/WithdrawalModal', () => ({
  WithdrawalModal: () => null,
}))

import BlackjackGame from './BlackjackGame'

const sessionPayload = {
  id: 'session-1',
  walletAddress: 'demo_wallet',
  balance: 1,
  totalWagered: 0,
  totalWon: 0,
  isDemo: true,
  isAuthenticated: true,
  depositAddress: 'tmock',
}

const completeGameState = {
  phase: 'complete',
  playerHands: [
    {
      cards: [
        { rank: '10', suit: 'hearts', faceUp: true },
        { rank: 'Q', suit: 'clubs', faceUp: true },
      ],
      bet: 0.1,
      isBlackjack: false,
      isBusted: false,
    },
  ],
  dealerHand: {
    cards: [
      { rank: '9', suit: 'spades', faceUp: true },
      { rank: '7', suit: 'diamonds', faceUp: true },
    ],
    isBusted: false,
  },
  currentHandIndex: 0,
  balance: 0.9,
  currentBet: 0.1,
  perfectPairsBet: 0,
  insuranceBet: 0,
  serverSeedHash: 'seed-hash',
  clientSeed: 'client-seed',
  nonce: 0,
  lastPayout: 0,
  message: 'Round complete',
  perfectPairsResult: null,
}

describe('BlackjackGame auto-bet timers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()

    ;(window.localStorage.getItem as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'zcashino_onboarding_seen') return 'true'
      if (key === 'zcashino_session_id') return 'session-1'
      if (key === 'zcashino_auto_bet') return 'true'
      return null
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.startsWith('/api/session')) {
        return {
          ok: true,
          json: async () => sessionPayload,
        } as Response
      }

      if (url.startsWith('/api/game?')) {
        return {
          ok: true,
          json: async () => ({ games: [] }),
        } as Response
      }

      if (url === '/api/game' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            gameId: 'game-1',
            gameState: completeGameState,
            balance: 0.9,
            totalWagered: 0.1,
            totalWon: 0,
            commitment: null,
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ error: `Unexpected fetch url: ${url}` }),
      } as Response
    })

    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('cleans up pending auto-bet timer on unmount to avoid extra game starts', async () => {
    const { unmount } = render(<BlackjackGame />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'DEAL' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'DEAL' }))

    await waitFor(() => {
      expect(screen.getByText(/Auto-dealing in 2/)).toBeInTheDocument()
    })

    const gameStartsBeforeUnmount = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url, init]) => url === '/api/game' && init?.method === 'POST').length
    expect(gameStartsBeforeUnmount).toBe(1)

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(2600)
    })

    const gameStartsAfterUnmount = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url, init]) => url === '/api/game' && init?.method === 'POST').length
    expect(gameStartsAfterUnmount).toBe(1)
  })

  it('cancels auto-bet countdown when user clicks Cancel', async () => {
    render(<BlackjackGame />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'DEAL' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'DEAL' }))

    await waitFor(() => {
      expect(screen.getByText(/Auto-dealing in 2/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await act(async () => {
      vi.advanceTimersByTime(2600)
    })

    const gameStarts = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url, init]) => url === '/api/game' && init?.method === 'POST').length
    expect(gameStarts).toBe(1)
    expect(screen.queryByText(/Auto-dealing in/)).not.toBeInTheDocument()
  })
})
