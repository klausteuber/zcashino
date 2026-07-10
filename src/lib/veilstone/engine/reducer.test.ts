import { describe, expect, it } from 'vitest'
import {
  PLAYER_WORKING_CAPITAL_ZATS,
  TOTAL_POOL_ZATS,
  applyVeilstoneAction,
  assertMatchPoolConserved,
  createInitialVeilstoneState,
  getPublicSnapshot,
  getPlayerSnapshot,
  parseZats,
} from './index'

function makeState() {
  return createInitialVeilstoneState({
    matchId: 'match-test',
    tableId: 'table-test',
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
}

describe('Veilstone MVP-zero engine', () => {
  it('creates a conserved initial match pool', () => {
    const state = makeState()
    assertMatchPoolConserved(state)
    const total = Object.values(state.accounts).reduce((sum, account) => sum + parseZats(account.balanceZats), 0n)
    expect(total).toBe(TOTAL_POOL_ZATS)
    expect(state.phase).toBe('EPOCH_1_FORECAST')
  })

  it('rejects actions outside their legal phase', () => {
    const state = makeState()
    expect(() => applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'PRODUCE', payload: {} },
      now: new Date(),
    })).toThrow(/not allowed/)
  })

  it('applies production and preserves the pool', () => {
    let state = makeState()
    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'ADVANCE_PHASE', payload: {} },
      now: new Date(),
    }).state

    const produced = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'PRODUCE', payload: {} },
      now: new Date(),
    })

    expect(produced.state.players['player-0'].producedEpochs).toEqual([1])
    assertMatchPoolConserved(produced.state)
  })

  it('redacts opponent shielded balances but keeps own vault visible', () => {
    let state = makeState()
    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'ADVANCE_PHASE', payload: {} },
      now: new Date(),
    }).state
    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'ADVANCE_PHASE', payload: {} },
      now: new Date(),
    }).state
    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'ADVANCE_PHASE', payload: {} },
      now: new Date(),
    }).state

    const contractId = state.contracts[0].id
    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'SEALED_BID_COMMIT', payload: { contractId, amountZats: '1000000', dataSpent: 1 } },
      now: new Date(),
    }).state

    const ownView = getPlayerSnapshot(state, 'player-0')
    const opponentView = getPlayerSnapshot(state, 'player-1')
    const publicView = getPublicSnapshot(state)
    expect(ownView.players['player-0'].shieldedZats).toBeDefined()
    expect(ownView.commitments[0]).toHaveProperty('reveal')
    expect(ownView.contracts[0].shieldedStakeZats).toBeNull()
    expect(opponentView.players['player-0'].shieldedZats).toBeNull()
    expect(opponentView.commitments[0]).not.toHaveProperty('reveal')
    expect(opponentView.commitments[0]).not.toHaveProperty('publicAmountZats')
    expect(opponentView.contracts[0].shieldedStakeZats).toBeNull()
    expect(publicView.players['player-0'].shieldedZats).toBeNull()
    expect(publicView.commitments[0]).not.toHaveProperty('reveal')
    expect(publicView.commitments[0]).not.toHaveProperty('publicAmountZats')
    expect(publicView.contracts[0].shieldedStakeZats).toBeNull()
  })

  it('finalizes with payouts that equal the match pool', () => {
    let state = makeState()
    for (let i = 0; i < 24; i += 1) {
      state = applyVeilstoneAction({
        state,
        actorSessionId: 'player-0',
        action: { type: 'ADVANCE_PHASE', payload: {} },
        now: new Date(),
      }).state
    }

    const finalized = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'FINALIZE_MATCH', payload: {} },
      now: new Date(),
    }).state

    const payoutTotal = Object.values(finalized.players).reduce(
      (sum, player) => sum + parseZats(player.payoutZats ?? '0'),
      0n
    )
    expect(finalized.phase).toBe('MATCH_COMPLETE')
    expect(payoutTotal).toBe(TOTAL_POOL_ZATS)
  })

  it('reveals commitments and resolves contracts during final reckoning', () => {
    let state = makeState()
    for (let i = 0; i < 3; i += 1) {
      state = applyVeilstoneAction({
        state,
        actorSessionId: 'player-0',
        action: { type: 'ADVANCE_PHASE', payload: {} },
        now: new Date(),
      }).state
    }

    state = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: {
        type: 'SEALED_BID_COMMIT',
        payload: { contractId: state.contracts[0].id, amountZats: '1000000', dataSpent: 1 },
      },
      now: new Date(),
    }).state

    for (let i = 0; i < 21; i += 1) {
      state = applyVeilstoneAction({
        state,
        actorSessionId: 'player-0',
        action: { type: 'ADVANCE_PHASE', payload: {} },
        now: new Date(),
      }).state
    }

    const finalized = applyVeilstoneAction({
      state,
      actorSessionId: 'player-0',
      action: { type: 'FINALIZE_MATCH', payload: {} },
      now: new Date(),
    }).state

    expect(finalized.contracts.every((contract) => contract.status === 'resolved')).toBe(true)
    expect(finalized.commitments.every((commitment) => commitment.status === 'revealed')).toBe(true)
  })
})
