import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    veilstoneEvent: {
      findUnique: vi.fn(),
    },
    veilstoneMatch: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  default: mocks.prismaMock,
}))

import {
  PLAYER_WORKING_CAPITAL_ZATS,
  createInitialVeilstoneState,
} from '@/lib/veilstone/engine'
import { applyVeilstoneMatchAction } from './service'

function makeStateJson() {
  const state = createInitialVeilstoneState({
    matchId: 'match-duplicate',
    tableId: 'table-duplicate',
    now: new Date('2026-05-16T12:00:00Z'),
    seats: [0, 1, 2, 3].map((index) => ({
      seatId: `seat-${index}`,
      sessionId: `player-${index}`,
      seatIndex: index,
      displayName: `Player ${index + 1}`,
      houseId: 'glass-ledger-republic',
      isBot: index > 0,
      publicStartZats: '35000000',
      shieldedStartZats: (PLAYER_WORKING_CAPITAL_ZATS - 35_000_000n).toString(),
    })),
  }).state
  return JSON.stringify(state)
}

describe('Veilstone service idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.$transaction.mockImplementation(async (callback) => callback(mocks.prismaMock))
  })

  it('returns the existing snapshot without applying duplicate clientActionId', async () => {
    mocks.prismaMock.veilstoneEvent.findUnique.mockResolvedValue({
      id: 'event-duplicate',
      clientActionId: 'client-action-1',
    })
    mocks.prismaMock.veilstoneMatch.findUnique.mockResolvedValue({
      id: 'match-duplicate',
      stateVersion: 0n,
      epoch: 1,
      phase: 'EPOCH_1_FORECAST',
      stateJson: makeStateJson(),
    })

    const result = await applyVeilstoneMatchAction({
      matchId: 'match-duplicate',
      actorSessionId: 'player-0',
      clientActionId: 'client-action-1',
      expectedStateVersion: '0',
      action: { type: 'ADVANCE_PHASE', payload: {} },
    })

    expect(result.duplicate).toBe(true)
    expect(mocks.prismaMock.veilstoneMatch.findUnique).toHaveBeenCalledTimes(1)
  })
})
