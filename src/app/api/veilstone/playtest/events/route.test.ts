import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requirePlayerSessionMock: vi.fn(),
  logVeilstonePlaytestEventMock: vi.fn(),
}))

vi.mock('@/lib/auth/player-session', () => ({
  requirePlayerSession: mocks.requirePlayerSessionMock,
}))

vi.mock('@/lib/veilstone/playtest', () => ({
  VEILSTONE_PLAYTEST_EVENT_NAMES: [
    'playtest_mode_opened',
    'phase_changed',
    'first_meaningful_action',
    'action_submitted',
    'action_succeeded',
    'action_failed',
    'invalid_action_attempted',
    'feedback_opened',
    'feedback_submitted',
    'replay_opened',
    'rematch_clicked',
  ],
  logVeilstonePlaytestEvent: mocks.logVeilstonePlaytestEventMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

describe('/api/veilstone/playtest/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePlayerSessionMock.mockResolvedValue({
      ok: true,
      session: { sessionId: 'session-1' },
    })
    mocks.logVeilstonePlaytestEventMock.mockResolvedValue({ id: 'event-1' })
  })

  it('validates event names', async () => {
    const response = await POST(makeRequest({
      matchId: 'match-1',
      sessionId: 'session-1',
      eventName: 'not_real',
    }))

    expect(response.status).toBe(400)
    expect(mocks.logVeilstonePlaytestEventMock).not.toHaveBeenCalled()
  })

  it('writes a valid playtest event for the authenticated player session', async () => {
    const response = await POST(makeRequest({
      matchId: 'match-1',
      sessionId: 'session-1',
      seatIndex: 0,
      eventName: 'invalid_action_attempted',
      phase: 'EPOCH_1_MARKET',
      stateVersion: '7',
      metadata: { actionType: 'PRODUCE' },
    }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(mocks.logVeilstonePlaytestEventMock).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      sessionId: 'session-1',
      eventName: 'invalid_action_attempted',
    }))
  })
})
