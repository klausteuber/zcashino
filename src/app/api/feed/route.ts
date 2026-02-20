import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'

/**
 * Public verified hands feed with privacy hardening.
 *
 * Privacy model:
 * - 5-minute delay: only games completed >5 min ago
 * - Coarse timestamps: bucketed to nearest minute
 * - Bet size bucketing: ranges instead of exact amounts
 * - Minimum volume floor: suppress entries when <3 games/hour
 * - No session IDs, wallet addresses, or identifying data
 * - Feature flag: FEED_ENABLED env var
 */

export const dynamic = 'force-dynamic'

// ── Bet bucketing ──────────────────────────────────────────────
function bucketBet(amount: number): string {
  if (amount < 0.05) return '< 0.05'
  if (amount < 0.25) return '0.05 – 0.25'
  if (amount < 1) return '0.25 – 1'
  return '1+'
}

// ── Timestamp coarsening ───────────────────────────────────────
function coarsenTimestamp(date: Date): string {
  const d = new Date(date)
  d.setSeconds(0, 0) // strip seconds and milliseconds
  return d.toISOString()
}

// ── Response cache (in-memory, 30s TTL) ────────────────────────
let cachedResponse: { data: unknown; expiry: number } | null = null
const CACHE_TTL_MS = 30_000

export async function GET(request: NextRequest) {
  // Feature flag
  if (process.env.FEED_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Feed not available' }, { status: 404 })
  }

  // Rate limit: 10 req/min per IP
  const rateLimit = checkPublicRateLimit(request, 'feed-read')
  if (!rateLimit.allowed) return createRateLimitResponse(rateLimit)

  // Parse query params
  const { searchParams } = request.nextUrl
  const limitParam = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 50)
  const gameType = searchParams.get('type') // 'blackjack' | 'video_poker' | null (both)

  // Serve from cache if valid
  if (cachedResponse && Date.now() < cachedResponse.expiry) {
    return NextResponse.json(cachedResponse.data)
  }

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // ── Volume floor check: need ≥3 completed games in last hour ──
    const [bjCount, vpCount] = await Promise.all([
      prisma.blackjackGame.count({
        where: { status: 'completed', completedAt: { gte: oneHourAgo, lte: fiveMinAgo } },
      }),
      prisma.videoPokerGame.count({
        where: { status: 'completed', completedAt: { gte: oneHourAgo, lte: fiveMinAgo } },
      }),
    ])

    const totalRecentGames = bjCount + vpCount
    if (totalRecentGames < 3) {
      const response = {
        hands: [],
        total: 0,
        volumeFloor: true,
        message: 'Feed temporarily unavailable during low-activity periods.',
        lastUpdated: new Date().toISOString(),
      }
      cachedResponse = { data: response, expiry: Date.now() + CACHE_TTL_MS }
      return NextResponse.json(response)
    }

    // ── Fetch games with 5-minute delay ──
    const includeBlackjack = !gameType || gameType === 'blackjack'
    const includVideoPoker = !gameType || gameType === 'video_poker'

    const [bjGames, vpGames] = await Promise.all([
      includeBlackjack
        ? prisma.blackjackGame.findMany({
            where: {
              status: 'completed',
              completedAt: { lte: fiveMinAgo },
            },
            orderBy: { completedAt: 'desc' },
            take: limitParam,
            select: {
              id: true,
              outcome: true,
              payout: true,
              mainBet: true,
              perfectPairsBet: true,
              completedAt: true,
              commitmentTxHash: true,
              fairnessMode: true,
            },
          })
        : [],
      includVideoPoker
        ? prisma.videoPokerGame.findMany({
            where: {
              status: 'completed',
              completedAt: { lte: fiveMinAgo },
            },
            orderBy: { completedAt: 'desc' },
            take: limitParam,
            select: {
              id: true,
              handRank: true,
              payout: true,
              totalBet: true,
              completedAt: true,
              commitmentTxHash: true,
              fairnessMode: true,
              variant: true,
            },
          })
        : [],
    ])

    // ── Transform with privacy hardening ──
    type FeedHand = {
      id: string
      gameType: 'blackjack' | 'video_poker'
      outcome: string
      betRange: string
      payoutRange: string
      timestamp: string
      commitmentTxHash: string | null
      fairnessMode: string | null
      variant?: string
    }

    const hands: FeedHand[] = []

    for (const g of bjGames) {
      const totalBet = (g.mainBet ?? 0) + (g.perfectPairsBet ?? 0)
      hands.push({
        id: g.id,
        gameType: 'blackjack',
        outcome: g.outcome ?? 'unknown',
        betRange: bucketBet(totalBet),
        payoutRange: bucketBet(g.payout ?? 0),
        timestamp: coarsenTimestamp(g.completedAt!),
        commitmentTxHash: g.commitmentTxHash,
        fairnessMode: g.fairnessMode,
      })
    }

    for (const g of vpGames) {
      hands.push({
        id: g.id,
        gameType: 'video_poker',
        outcome: g.handRank ?? 'unknown',
        betRange: bucketBet(g.totalBet ?? 0),
        payoutRange: bucketBet(g.payout ?? 0),
        timestamp: coarsenTimestamp(g.completedAt!),
        commitmentTxHash: g.commitmentTxHash,
        fairnessMode: g.fairnessMode,
        variant: g.variant ?? undefined,
      })
    }

    // Sort combined results by timestamp descending, take limit
    hands.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const trimmed = hands.slice(0, limitParam)

    const response = {
      hands: trimmed,
      total: totalRecentGames,
      volumeFloor: false,
      lastUpdated: new Date().toISOString(),
    }

    cachedResponse = { data: response, expiry: Date.now() + CACHE_TTL_MS }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Feed] Error fetching verified hands:', error)
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 })
  }
}
