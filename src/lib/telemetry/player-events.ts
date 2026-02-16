import type { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { getClientIpAddress, getUserAgent } from '@/lib/admin/request'

export const PLAYER_COUNTER_ACTIONS = {
  WITHDRAW_IDEMPOTENCY_REPLAY: 'player.withdraw.idempotency_replay',
  WITHDRAW_RESERVE_REJECTED: 'player.withdraw.reserve_rejected',
  BLACKJACK_RESERVE_REJECTED: 'player.game.reserve_rejected',
  BLACKJACK_DUPLICATE_COMPLETION: 'player.game.duplicate_completion_blocked',
  VIDEO_POKER_RESERVE_REJECTED: 'player.video_poker.reserve_rejected',
  VIDEO_POKER_DUPLICATE_COMPLETION: 'player.video_poker.duplicate_completion_blocked',
  LEGACY_SESSION_FALLBACK: 'player.auth.legacy_fallback',
} as const

type PlayerCounterAction =
  (typeof PLAYER_COUNTER_ACTIONS)[keyof typeof PLAYER_COUNTER_ACTIONS]

interface LogPlayerCounterEventInput {
  request: NextRequest
  action: PlayerCounterAction
  details?: string
  metadata?: Record<string, unknown>
}

export async function logPlayerCounterEvent({
  request,
  action,
  details,
  metadata,
}: LogPlayerCounterEventInput): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        action,
        actor: 'player',
        success: true,
        route: request.nextUrl.pathname,
        method: request.method,
        ipAddress: getClientIpAddress(request),
        userAgent: getUserAgent(request),
        details,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })
  } catch (error) {
    console.error('[PlayerTelemetry] Failed to write player counter event:', error)
  }
}
