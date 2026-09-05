import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { creditFunds, reserveFunds } from './ledger'
import { checkWagerAllowed } from './responsible-gambling'

export class BlackjackActionConflict extends Error {}
export class BlackjackFundsUnavailable extends Error {}

export interface BlackjackActionCommit {
  gameId: string
  expectedVersion: number
  sessionId: string
  additionalBet: number
  payout: number | null
  data: Prisma.BlackjackGameUpdateManyMutationInput
}

/** The state claim, charge, and settlement either all commit or all roll back. */
export async function commitBlackjackAction(input: BlackjackActionCommit): Promise<void> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new BlackjackActionConflict()
  await prisma.$transaction(async tx => {
    const claimed = await tx.blackjackGame.updateMany({
      where: { id: input.gameId, sessionId: input.sessionId, status: 'active', version: input.expectedVersion },
      data: { version: { increment: 1 } },
    })
    if (claimed.count !== 1) throw new BlackjackActionConflict()

    if (input.additionalBet > 0) {
      const session = await tx.session.findUnique({ where: { id: input.sessionId } })
      if (!session || !checkWagerAllowed(session, input.additionalBet).allowed
        || !await reserveFunds(tx, input.sessionId, input.additionalBet, 'totalWagered')) {
        throw new BlackjackFundsUnavailable()
      }
    }

    await tx.blackjackGame.update({
      where: { id: input.gameId },
      data: {
        ...input.data,
        ...(input.payout !== null ? { status: 'completed', completedAt: new Date(), payout: input.payout } : {}),
      },
    })
    if (input.payout !== null) await creditFunds(tx, input.sessionId, input.payout, 'totalWon')
  })
}
