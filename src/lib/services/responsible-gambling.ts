import { roundZec } from '@/lib/wallet'

export type WagerLimitCode = 'LOSS_LIMIT_REACHED' | 'SESSION_LIMIT_REACHED'

interface SessionWagerContext {
  totalWagered: number
  totalWon: number
  lossLimit: number | null
  sessionLimit: number | null
  createdAt: Date
}

export interface WagerCheckResult {
  allowed: boolean
  code?: WagerLimitCode
  message?: string
}

export function checkWagerAllowed(
  session: SessionWagerContext,
  addedExposure: number,
  now: Date = new Date()
): WagerCheckResult {
  const normalizedExposure = roundZec(addedExposure)
  if (normalizedExposure < 0) {
    return {
      allowed: false,
      code: 'LOSS_LIMIT_REACHED',
      message: 'Invalid wager exposure.'
    }
  }

  if (session.sessionLimit && session.sessionLimit > 0) {
    const elapsedMinutes = Math.floor((now.getTime() - session.createdAt.getTime()) / 60000)
    if (elapsedMinutes >= session.sessionLimit) {
      return {
        allowed: false,
        code: 'SESSION_LIMIT_REACHED',
        message: 'Session time limit reached. New wagers are blocked, but withdrawals remain available.'
      }
    }
  }

  if (session.lossLimit !== null && session.lossLimit !== undefined) {
    const netLoss = Math.max(0, roundZec(session.totalWagered - session.totalWon))
    if (roundZec(netLoss + normalizedExposure) > session.lossLimit) {
      return {
        allowed: false,
        code: 'LOSS_LIMIT_REACHED',
        message: 'Loss limit reached. New wagers are blocked for this session.'
      }
    }
  }

  return { allowed: true }
}
