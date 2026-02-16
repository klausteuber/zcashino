import type { Prisma } from '@prisma/client'
import { roundZec } from '@/lib/wallet'

export type ReserveField = 'totalWagered' | 'totalWithdrawn'
export type CreditField = 'totalWon' | 'totalDeposited'

type TxClient = Prisma.TransactionClient
const FLOAT_TOLERANCE = 1e-10

async function normalizeSessionAmounts(tx: TxClient, sessionId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Session"
    SET
      "balance" = ROUND("balance", 8),
      "totalWagered" = ROUND("totalWagered", 8),
      "totalWon" = ROUND("totalWon", 8),
      "totalDeposited" = ROUND("totalDeposited", 8),
      "totalWithdrawn" = ROUND("totalWithdrawn", 8)
    WHERE "id" = ${sessionId}
  `
}

/**
 * Atomically reserve funds only when sufficient balance exists.
 */
export async function reserveFunds(
  tx: TxClient,
  sessionId: string,
  amount: number,
  reserveField: ReserveField,
  counterAmount?: number
): Promise<boolean> {
  const normalizedAmount = roundZec(amount)
  const normalizedCounter = roundZec(counterAmount ?? amount)
  if (normalizedAmount < 0) return false
  if (normalizedAmount === 0) return true
  const minimumRequiredBalance = normalizedAmount - FLOAT_TOLERANCE

  const data: Prisma.SessionUpdateManyMutationInput = {
    balance: { decrement: normalizedAmount },
  }

  if (reserveField === 'totalWagered') {
    data.totalWagered = { increment: normalizedCounter }
  } else {
    data.totalWithdrawn = { increment: normalizedCounter }
  }

  const result = await tx.session.updateMany({
    where: {
      id: sessionId,
      // Allow tiny IEEE754 dust while still rejecting any meaningful shortfall.
      balance: { gte: minimumRequiredBalance },
    },
    data,
  })

  if (result.count === 1) {
    await normalizeSessionAmounts(tx, sessionId)
  }

  return result.count === 1
}

/**
 * Atomically credit funds.
 */
export async function creditFunds(
  tx: TxClient,
  sessionId: string,
  amount: number,
  creditField: CreditField
): Promise<void> {
  const normalizedAmount = roundZec(amount)
  if (normalizedAmount <= 0) return

  const data: Prisma.SessionUpdateInput = {
    balance: { increment: normalizedAmount },
  }

  if (creditField === 'totalWon') {
    data.totalWon = { increment: normalizedAmount }
  } else {
    data.totalDeposited = { increment: normalizedAmount }
  }

  await tx.session.update({
    where: { id: sessionId },
    data,
  })

  await normalizeSessionAmounts(tx, sessionId)
}

/**
 * Undo a previous reserve (used for compensating failed withdrawals).
 */
export async function releaseFunds(
  tx: TxClient,
  sessionId: string,
  amount: number,
  reserveField: ReserveField,
  counterAmount?: number
): Promise<void> {
  const normalizedAmount = roundZec(amount)
  const normalizedCounter = roundZec(counterAmount ?? amount)
  if (normalizedAmount <= 0) return

  const data: Prisma.SessionUpdateInput = {
    balance: { increment: normalizedAmount },
  }

  if (reserveField === 'totalWagered') {
    data.totalWagered = { decrement: normalizedCounter }
  } else {
    data.totalWithdrawn = { decrement: normalizedCounter }
  }

  await tx.session.update({
    where: { id: sessionId },
    data,
  })

  await normalizeSessionAmounts(tx, sessionId)
}
