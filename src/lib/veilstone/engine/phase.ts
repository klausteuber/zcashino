import { getPhaseConfig } from './constants'
import type { VeilstoneBalanceConfig, VeilstonePhase } from './types'

const phaseOrder: VeilstonePhase[] = [
  'MATCH_INITIALIZING',
  'EPOCH_1_FORECAST',
  'EPOCH_1_PRODUCTION',
  'EPOCH_1_MARKET',
  'EPOCH_1_CONTRACTS',
  'EPOCH_1_BUILD',
  'EPOCH_1_RESOLUTION',
  'EPOCH_2_FORECAST',
  'EPOCH_2_PRODUCTION',
  'EPOCH_2_MARKET',
  'EPOCH_2_CONTRACTS',
  'EPOCH_2_BUILD',
  'EPOCH_2_RESOLUTION',
  'EPOCH_3_FORECAST',
  'EPOCH_3_PRODUCTION',
  'EPOCH_3_MARKET',
  'EPOCH_3_CONTRACTS',
  'EPOCH_3_BUILD',
  'EPOCH_3_RESOLUTION',
  'EPOCH_4_FORECAST',
  'EPOCH_4_PRODUCTION',
  'EPOCH_4_MARKET',
  'EPOCH_4_CONTRACTS',
  'EPOCH_4_BUILD',
  'EPOCH_4_RESOLUTION',
  'FINAL_RECKONING',
  'MATCH_COMPLETE',
]

export function getNextPhase(phase: VeilstonePhase): VeilstonePhase {
  const index = phaseOrder.indexOf(phase)
  if (index === -1 || index >= phaseOrder.length - 1) return phase
  return phaseOrder[index + 1]
}

export function getEpochForPhase(phase: VeilstonePhase): number {
  const match = phase.match(/^EPOCH_(\d)_/)
  if (!match) return phase === 'MATCH_COMPLETE' || phase === 'FINAL_RECKONING' ? 4 : 1
  return Number.parseInt(match[1], 10)
}

export function calculatePhaseEndsAt(
  phase: VeilstonePhase,
  now: Date,
  balanceConfig?: VeilstoneBalanceConfig
): string {
  const config = getPhaseConfig(phase, balanceConfig)
  return new Date(now.getTime() + config.durationMs).toISOString()
}

export function assertActionAllowed(
  phase: VeilstonePhase,
  actionType: string,
  balanceConfig?: VeilstoneBalanceConfig
): void {
  const config = getPhaseConfig(phase, balanceConfig)
  if (!config.allowedActions.includes(actionType as never)) {
    throw new Error(`${actionType} is not allowed during ${phase}`)
  }
}
