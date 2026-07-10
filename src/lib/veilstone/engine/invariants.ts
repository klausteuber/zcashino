import { DEFAULT_VEILSTONE_BALANCE_CONFIG } from './constants'
import type { VeilstoneBalanceConfig, VeilstoneLedgerMove, VeilstoneState } from './types'
import { parseZats } from './zats'

export function assertMatchPoolConserved(
  state: VeilstoneState,
  balanceConfig: VeilstoneBalanceConfig = DEFAULT_VEILSTONE_BALANCE_CONFIG
): void {
  const total = Object.values(state.accounts).reduce(
    (sum, account) => sum + parseZats(account.balanceZats),
    0n
  )
  if (total !== balanceConfig.totalPoolZats) {
    throw new Error(`Veilstone pool invariant failed: ${total} !== ${balanceConfig.totalPoolZats}`)
  }
}

export function assertNoNegativeAccounts(state: VeilstoneState): void {
  for (const account of Object.values(state.accounts)) {
    if (parseZats(account.balanceZats) < 0n) {
      throw new Error(`Negative Veilstone account balance: ${account.id}`)
    }
  }
}

export function assertLedgerMovesBalanced(moves: VeilstoneLedgerMove[]): void {
  for (const move of moves) {
    if (parseZats(move.amountZats) <= 0n) {
      throw new Error(`Invalid ledger move amount for ${move.reason}`)
    }
  }
}
