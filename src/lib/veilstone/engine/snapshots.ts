import type { VeilstoneCommitmentState, VeilstoneContractState, VeilstoneState } from './types'

function redactCommitmentForViewer(commitment: VeilstoneCommitmentState, viewerSessionId?: string) {
  if (viewerSessionId && commitment.playerSessionId === viewerSessionId) {
    return commitment
  }

  return {
    id: commitment.id,
    playerSessionId: commitment.playerSessionId,
    contractId: commitment.contractId,
    commitmentHash: commitment.commitmentHash,
    actionType: commitment.actionType,
    status: commitment.status,
  }
}

function redactContractForViewer(contract: VeilstoneContractState, mode: 'public' | 'player' | 'admin' | 'replay') {
  if (mode === 'admin' || mode === 'replay') return contract
  return {
    ...contract,
    shieldedStakeZats: null,
  }
}

function redactState(state: VeilstoneState, viewerSessionId?: string, mode: 'public' | 'player' | 'admin' | 'replay' = 'public') {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([sessionId, player]) => {
      const own = viewerSessionId === sessionId
      if (mode === 'admin' || mode === 'replay' || own) {
        return [sessionId, player]
      }

      return [
        sessionId,
        {
          sessionId: player.sessionId,
          seatIndex: player.seatIndex,
          displayName: player.displayName,
          houseId: player.houseId,
          isBot: player.isBot,
          publicZats: player.publicZats,
          shieldedZats: null,
          lockedZats: player.lockedZats,
          resources: player.resources,
          trust: player.trust,
          prestige: player.prestige,
          builtStructures: player.builtStructures,
          commitmentIds: player.commitmentIds,
          payoutZats: player.payoutZats,
        },
      ]
    })
  )

  const commitments = state.commitments.map((commitment) => {
    if (mode === 'admin' || mode === 'replay') return commitment
    return redactCommitmentForViewer(commitment, mode === 'player' ? viewerSessionId : undefined)
  })

  return {
    matchId: state.matchId,
    tableId: state.tableId,
    stateVersion: state.stateVersion,
    epoch: state.epoch,
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    players,
    map: state.map,
    orders: state.orders,
    contracts: state.contracts.map((contract) => redactContractForViewer(contract, mode)),
    commitments,
    crises: state.crises,
    finalLedgerHash: state.finalLedgerHash,
  }
}

export function getPlayerSnapshot(state: VeilstoneState, viewerSessionId: string) {
  return redactState(state, viewerSessionId, 'player')
}

export function getPublicSnapshot(state: VeilstoneState) {
  return redactState(state, undefined, 'public')
}

export function getAdminSnapshot(state: VeilstoneState) {
  return redactState(state, undefined, 'admin')
}

export function getReplaySnapshot(state: VeilstoneState) {
  return redactState(state, undefined, 'replay')
}
