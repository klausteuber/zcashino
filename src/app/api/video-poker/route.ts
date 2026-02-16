import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  createInitialState,
  startRound,
  holdAndDraw,
  sanitizeStateForClient,
  MIN_BET,
  MAX_BET,
  MAX_MULTIPLIER,
} from '@/lib/game/video-poker'
import { generateClientSeed } from '@/lib/provably-fair'
import {
  getOrCreateCommitment,
  markCommitmentUsed,
  releaseClaimedCommitment,
  checkAndRefillPool,
} from '@/lib/provably-fair/commitment-pool'
import { getExplorerUrl } from '@/lib/provably-fair/blockchain'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { roundZec } from '@/lib/wallet'
import type { VideoPokerVariant, VideoPokerGameState, BlockchainCommitment } from '@/types'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { parseWithSchema, videoPokerBodySchema } from '@/lib/validation/api-schemas'
import { reserveFunds, creditFunds } from '@/lib/services/ledger'
import { logPlayerCounterEvent, PLAYER_COUNTER_ACTIONS } from '@/lib/telemetry/player-events'

function isDemoSession(walletAddress: string): boolean {
  return walletAddress.startsWith('demo_')
}

const VALID_VARIANTS: VideoPokerVariant[] = ['jacks_or_better', 'deuces_wild']

// POST /api/video-poker — Start new game or draw
export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = parseWithSchema(videoPokerBodySchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const payload = parsed.data
    const sessionId = payload.sessionId

    const playerSession = requirePlayerSession(request, sessionId)
    if (!playerSession.ok) return playerSession.response

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.excludedUntil && session.excludedUntil > new Date()) {
      return NextResponse.json({
        error: 'Self-excluded',
        excludedUntil: session.excludedUntil,
      }, { status: 403 })
    }

    const isDemo = isDemoSession(session.walletAddress)
    if (!isDemo && !session.isAuthenticated) {
      return NextResponse.json({
        error: 'Authentication required',
        message: 'Please deposit ZEC to authenticate your session before playing.',
        requiresAuth: true,
      }, { status: 403 })
    }

    switch (payload.action) {
      case 'start':
        if (isKillSwitchActive()) {
          return NextResponse.json({
            error: 'Platform is under maintenance. New games are temporarily paused.',
            maintenanceMode: true,
          }, { status: 503 })
        }
        return handleStartGame(
          request,
          session,
          payload.variant,
          payload.baseBet,
          payload.betMultiplier,
          payload.clientSeed
        )

      case 'draw':
        return handleDraw(request, session, payload.gameId, payload.heldIndices)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Video poker error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Game error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

async function handleStartGame(
  request: NextRequest,
  session: { id: string; balance: number; walletAddress: string },
  variant: string,
  baseBet: number,
  betMultiplier: number,
  clientSeedInput?: string
) {
  // Validate variant
  if (!VALID_VARIANTS.includes(variant as VideoPokerVariant)) {
    return NextResponse.json({ error: 'Invalid variant. Use jacks_or_better or deuces_wild' }, { status: 400 })
  }

  // Validate bet
  if (baseBet < MIN_BET || baseBet > MAX_BET) {
    return NextResponse.json({
      error: `Bet must be between ${MIN_BET} and ${MAX_BET} ZEC`,
    }, { status: 400 })
  }

  if (betMultiplier < 1 || betMultiplier > MAX_MULTIPLIER) {
    return NextResponse.json({
      error: `Coin multiplier must be between 1 and ${MAX_MULTIPLIER}`,
    }, { status: 400 })
  }

  const totalBet = roundZec(baseBet * betMultiplier)
  if (totalBet > session.balance) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
  }

  // Get pre-committed server seed
  const commitment = await getOrCreateCommitment()
  if (!commitment) {
    return NextResponse.json({
      error: 'Unable to create provably fair commitment. Please try again.',
    }, { status: 503 })
  }

  const { serverSeed, serverSeedHash, txHash, blockHeight, blockTimestamp } = commitment
  const clientSeed = clientSeedInput || generateClientSeed()

  // Get next nonce for this session (video poker games)
  const lastGame = await prisma.videoPokerGame.findFirst({
    where: { sessionId: session.id },
    orderBy: { nonce: 'desc' },
  })
  const nonce = (lastGame?.nonce ?? -1) + 1

  // Create game state
  const initialState = createInitialState(session.balance, variant as VideoPokerVariant)
  const gameState = startRound(
    initialState,
    baseBet,
    betMultiplier,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce
  )

  let gameId = ''
  let updatedSessionForBet: {
    balance: number
    totalWagered: number
    totalWon: number
  } | null = null

  try {
    await prisma.$transaction(async (tx) => {
      const reserved = await reserveFunds(tx, session.id, totalBet, 'totalWagered')
      if (!reserved) {
        throw new Error('INSUFFICIENT_BALANCE')
      }

      const game = await tx.videoPokerGame.create({
        data: {
          sessionId: session.id,
          variant,
          baseBet,
          betMultiplier,
          totalBet,
          serverSeed,
          serverSeedHash,
          clientSeed,
          nonce,
          commitmentTxHash: txHash,
          commitmentBlock: blockHeight,
          commitmentTimestamp: blockTimestamp,
          initialState: JSON.stringify({
            hand: gameState.hand.map(c => ({ rank: c.rank, suit: c.suit })),
          }),
          status: 'active',
        },
      })

      const marked = await markCommitmentUsed(commitment.id, game.id, tx)
      if (!marked) {
        throw new Error('COMMITMENT_MARK_FAILED')
      }

      gameId = game.id
      updatedSessionForBet = await tx.session.findUnique({
        where: { id: session.id },
        select: {
          balance: true,
          totalWagered: true,
          totalWon: true,
        },
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      await logPlayerCounterEvent({
        request,
        action: PLAYER_COUNTER_ACTIONS.VIDEO_POKER_RESERVE_REJECTED,
        details: 'Conditional video-poker reserve rejected',
        metadata: {
          sessionId: session.id,
          totalBet,
        },
      })
      await releaseClaimedCommitment(commitment.id).catch((releaseError) => {
        console.error('[VideoPoker] Failed to release claimed commitment:', releaseError)
      })
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    await releaseClaimedCommitment(commitment.id).catch((releaseError) => {
      console.error('[VideoPoker] Failed to release claimed commitment:', releaseError)
    })
    throw error
  }

  // Trigger pool refill in background
  checkAndRefillPool().catch(err => console.error('Pool refill error:', err))

  const blockchainCommitment: BlockchainCommitment = {
    txHash,
    blockHeight,
    blockTimestamp,
    explorerUrl: getExplorerUrl(txHash),
  }

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeStateForClient(gameState),
    balance: updatedSession?.balance ?? (updatedSessionForBet as { balance: number } | null)?.balance ?? 0,
    totalWagered: updatedSession?.totalWagered ?? (updatedSessionForBet as { totalWagered: number } | null)?.totalWagered ?? totalBet,
    totalWon: updatedSession?.totalWon ?? (updatedSessionForBet as { totalWon: number } | null)?.totalWon ?? 0,
    commitment: blockchainCommitment,
  })
}

async function handleDraw(
  request: NextRequest,
  session: { id: string; balance: number },
  gameId: string,
  heldIndices: number[]
) {
  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 })
  }

  if (!Array.isArray(heldIndices)) {
    return NextResponse.json({ error: 'heldIndices must be an array' }, { status: 400 })
  }

  // Validate held indices
  for (const idx of heldIndices) {
    if (typeof idx !== 'number' || idx < 0 || idx > 4) {
      return NextResponse.json({ error: 'Invalid held index (must be 0-4)' }, { status: 400 })
    }
  }

  const game = await prisma.videoPokerGame.findUnique({
    where: { id: gameId },
  })

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (game.sessionId !== session.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game already completed' }, { status: 400 })
  }

  // Reconstruct game state from seeds (action replay pattern)
  const initialState = createInitialState(
    session.balance + game.totalBet,
    game.variant as VideoPokerVariant
  )
  const holdState = startRound(
    initialState,
    game.baseBet,
    game.betMultiplier,
    game.serverSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce
  )

  // Execute draw with held cards
  const gameState = holdAndDraw(holdState, heldIndices)

  const payout = roundZec(gameState.lastPayout)
  let duplicateBlocked = false
  const completed = await prisma.$transaction(async (tx) => {
    const result = await tx.videoPokerGame.updateMany({
      where: { id: gameId, status: 'active' },
      data: {
        status: 'completed',
        completedAt: new Date(),
        payout,
        handRank: gameState.handRank,
        multiplier: gameState.multiplier,
        actionHistory: JSON.stringify(heldIndices),
        finalState: JSON.stringify({
          hand: gameState.hand.map(c => ({ rank: c.rank, suit: c.suit })),
          handRank: gameState.handRank,
          multiplier: gameState.multiplier,
        }),
      },
    })

    if (result.count === 0) {
      duplicateBlocked = true
      return false
    }
    await creditFunds(tx, session.id, payout, 'totalWon')
    return true
  })

  if (duplicateBlocked) {
    await logPlayerCounterEvent({
      request,
      action: PLAYER_COUNTER_ACTIONS.VIDEO_POKER_DUPLICATE_COMPLETION,
      details: 'Duplicate draw completion blocked by active->completed guard',
      metadata: {
        sessionId: session.id,
        gameId,
      },
    })
  }

  if (!completed) {
    return NextResponse.json({ error: 'Game already completed' }, { status: 400 })
  }

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeStateForClient(gameState),
    balance: updatedSession?.balance ?? session.balance,
    totalWagered: updatedSession?.totalWagered ?? 0,
    totalWon: updatedSession?.totalWon ?? 0,
  })
}

// GET /api/video-poker — Game details or history
export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId')
  const gameId = request.nextUrl.searchParams.get('gameId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  if (gameId) {
    const game = await prisma.videoPokerGame.findUnique({
      where: { id: gameId },
    })

    if (!game || game.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
      ? {
          txHash: game.commitmentTxHash,
          blockHeight: game.commitmentBlock || 0,
          blockTimestamp: game.commitmentTimestamp || game.createdAt,
          explorerUrl: getExplorerUrl(game.commitmentTxHash),
        }
      : undefined

    return NextResponse.json({
      id: game.id,
      variant: game.variant,
      baseBet: game.baseBet,
      betMultiplier: game.betMultiplier,
      totalBet: game.totalBet,
      serverSeed: game.status === 'completed' ? game.serverSeed : undefined,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      status: game.status,
      handRank: game.handRank,
      multiplier: game.multiplier,
      payout: game.payout,
      createdAt: game.createdAt,
      completedAt: game.completedAt,
      commitment,
    })
  }

  // Game history
  const games = await prisma.videoPokerGame.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      variant: true,
      totalBet: true,
      status: true,
      handRank: true,
      payout: true,
      serverSeedHash: true,
      nonce: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ games })
}
