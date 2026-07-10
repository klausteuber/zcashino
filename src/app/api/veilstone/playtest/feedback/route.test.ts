import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requirePlayerSessionMock: vi.fn(),
  upsertVeilstonePlaytestFeedbackMock: vi.fn(),
}))

vi.mock('@/lib/auth/player-session', () => ({
  requirePlayerSession: mocks.requirePlayerSessionMock,
}))

vi.mock('@/lib/veilstone/playtest', () => ({
  upsertVeilstonePlaytestFeedback: mocks.upsertVeilstonePlaytestFeedbackMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest
}

const validFeedback = {
  matchId: 'match-1',
  sessionId: 'session-1',
  seatIndex: 0,
  understoodGoal: 6,
  decisionsMattered: 6,
  understoodOutcome: 5,
  shieldedFeltFair: 5,
  trustPrestigeMattered: 6,
  feltSkillful: 6,
  wouldPlayAgain: 7,
  mostExcitingMoment: 'sealed bid reveal',
  mostConfusingMoment: 'final payout',
  oneThingToChange: 'clearer phase prompts',
}

describe('/api/veilstone/playtest/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePlayerSessionMock.mockResolvedValue({
      ok: true,
      session: { sessionId: 'session-1' },
    })
    mocks.upsertVeilstonePlaytestFeedbackMock.mockResolvedValue({ id: 'feedback-1' })
  })

  it('rejects ratings outside the 1-7 survey scale', async () => {
    const response = await POST(makeRequest({
      ...validFeedback,
      wouldPlayAgain: 8,
    }))

    expect(response.status).toBe(400)
    expect(mocks.upsertVeilstonePlaytestFeedbackMock).not.toHaveBeenCalled()
  })

  it('upserts feedback for the authenticated player session', async () => {
    const response = await POST(makeRequest(validFeedback))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(mocks.upsertVeilstonePlaytestFeedbackMock).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'match-1',
      sessionId: 'session-1',
      wouldPlayAgain: 7,
    }))
  })
})
