import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameSession } from './useGameSession'

describe('useGameSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens restore guidance when a stale local session id returns 401', async () => {
    ;(window.localStorage.getItem as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'zcashino_session_id') return 'session-stale'
      return null
    })

    ;(global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: 'Session expired. Please refresh to start a new session.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 'demo-1',
          walletAddress: 'demo_wallet',
          balance: 10,
          totalWagered: 0,
          totalWon: 0,
          isDemo: true,
          isAuthenticated: true,
          depositAddress: null,
          recovery: null,
          fairness: null,
        }),
      })

    const { result } = renderHook(() => useGameSession())

    await waitFor(() => {
      expect(result.current.session?.id).toBe('demo-1')
    })

    expect(result.current.showOnboarding).toBe(true)
    expect(result.current.onboardingMode).toBe('restore')
    expect(result.current.restoreNotice).toContain('Use your recovery key')
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('zcashino_session_id')
  })

  it('restores a session through the recovery API and hydrates local state', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 'demo-1',
          walletAddress: 'demo_wallet',
          balance: 10,
          totalWagered: 0,
          totalWon: 0,
          isDemo: true,
          isAuthenticated: true,
          depositAddress: null,
          recovery: null,
          fairness: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 'session-real',
          walletAddress: 'real_wallet',
          balance: 2.5,
          totalWagered: 1.25,
          totalWon: 3,
          isDemo: false,
          isAuthenticated: true,
          depositAddress: 'u1deposit',
          recovery: {
            enabled: true,
            lastUsedAt: '2026-03-23T23:10:00.000Z',
          },
          fairness: null,
        }),
      })

    const { result } = renderHook(() => useGameSession())

    await waitFor(() => {
      expect(result.current.session?.id).toBe('demo-1')
    })

    await act(async () => {
      const restoreResult = await result.current.handleRestoreSession(
        'zrec_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd'
      )
      expect(restoreResult).toEqual({ success: true })
    })

    expect(result.current.session?.id).toBe('session-real')
    expect(result.current.session?.recovery).toEqual({
      enabled: true,
      lastUsedAt: '2026-03-23T23:10:00.000Z',
    })
    expect(window.localStorage.setItem).toHaveBeenCalledWith('zcashino_session_id', 'session-real')
  })
})
