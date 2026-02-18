import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  createInitialState,
  startRound,
  holdAndDraw,
  sanitizeStateForClient,
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
import { checkWagerAllowed } from '@/lib/services/responsible-gambling'
import { HMAC_FAIRNESS_VERSION, getDefaultFairnessVersion, normalizeFairnessVersion } from '@/lib/game/shuffle'
import { getProvablyFairMode, SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'
import { getAdminSettings } from '@/lib/admin/runtime-settings'
import {
  allocateNonce,
  ClientSeedLockedError,
  ensureActiveFairnessState,
  getFairnessSeedById,
  getPublicFairnessState,
  getRevealableServerSeed,
  SessionFairnessUnavailableError,
  setClientSeed,
} from '@/lib/provably-fair/session-fairness'

function isDemoSession(walletAddress: string): boolean {
  return walletAddress.startsWith('demo_')
}

function createWagerLimitResponse(result: ReturnType<typeof checkWagerAllowed>) {
  return NextResponse.json({
    error: result.message,
    code: result.code,
  }, { status: 403 })
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
    if (playerSession.legacyFallback) {
      await logPlayerCounterEvent({
        request,
        action: PLAYER_COUNTER_ACTIONS.LEGACY_SESSION_FALLBACK,
        details: 'Compat mode accepted legacy sessionId for video poker action',
        metadata: {
          sessionId,
          action: payload.action,
        },
      })
    }

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
  session: {
    id: string
    balance: number
    walletAddress: string
    totalWagered: number
    totalWon: number
    lossLimit: number | null
    sessionLimit: number | null
    createdAt: Date
  },
  variant: string,
  baseBet: number,
  betMultiplier: number,
  clientSeedInput?: string
) {
  const settings = await getAdminSettings()
  const betLimits = {
    minBet: settings.videoPoker.minBet,
    maxBet: settings.videoPoker.maxBet,
  }

  // Validate variant
  if (!VALID_VARIANTS.includes(variant as VideoPokerVariant)) {
    return NextResponse.json({ error: 'Invalid variant. Use jacks_or_better or deuces_wild' }, { status: 400 })
  }

  // Validate bet
  if (baseBet < betLimits.minBet || baseBet > betLimits.maxBet) {
    return NextResponse.json({
      error: `Bet must be between ${betLimits.minBet} and ${betLimits.maxBet} ZEC`,
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

  const wagerCheck = checkWagerAllowed(session, totalBet)
  if (!wagerCheck.allowed) {
    return createWagerLimitResponse(wagerCheck)
  }

  if (getProvablyFairMode() === SESSION_NONCE_MODE) {
    return handleStartGameSessionNonce(
      request,
      session,
      variant as VideoPokerVariant,
      baseBet,
      betMultiplier,
      totalBet,
      betLimits,
      clientSeedInput
    )
  }

  // Get pre-committed server seed
  const commitment = await getOrCreateCommitment()
  if (!commitment) {
    // Trigger an immediate background refill so retries recover faster.
    checkAndRefillPool().catch((err) => console.error('Pool refill error after commitment failure:', err))
    return NextResponse.json({
      error: 'Unable to create provably fair commitment. Please try again.',
    }, { status: 503 })
  }

  const { serverSeed, serverSeedHash, txHash, blockHeight, blockTimestamp } = commitment
  const clientSeed = clientSeedInput?.trim() || generateClientSeed()
  const fairnessVersion = getDefaultFairnessVersion()

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
    nonce,
    fairnessVersion,
    betLimits
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
          fairnessVersion,
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
    balance: roundZec(updatedSession?.balance ?? (updatedSessionForBet as { balance: number } | null)?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? (updatedSessionForBet as { totalWagered: number } | null)?.totalWagered ?? totalBet),
    totalWon: roundZec(updatedSession?.totalWon ?? (updatedSessionForBet as { totalWon: number } | null)?.totalWon ?? 0),
    commitment: blockchainCommitment,
  })
}

async function handleStartGameSessionNonce(
  request: NextRequest,
  session: {
    id: string
    balance: number
    walletAddress: string
    totalWagered: number
    totalWon: number
    lossLimit: number | null
    sessionLimit: number | null
    createdAt: Date
  },
  variant: VideoPokerVariant,
  baseBet: number,
  betMultiplier: number,
  totalBet: number,
  betLimits: { minBet: number; maxBet: number },
  clientSeedInput?: string
) {
  const requestedClientSeed = clientSeedInput?.trim()
  let gameId = ''
  let gameState: VideoPokerGameState | null = null
  let blockchainCommitment: BlockchainCommitment | null = null
  let updatedSessionForBet: {
    balance: number
    totalWagered: number
    totalWon: number
  } | null = null

  try {
    await ensureActiveFairnessState(session.id)
  } catch (error) {
    if (error instanceof SessionFairnessUnavailableError) {
      return NextResponse.json({
        error: 'Unable to allocate a session fairness seed. Please try again shortly.',
      }, { status: 503 })
    }
    throw error
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reserved = await reserveFunds(tx, session.id, totalBet, 'totalWagered')
      if (!reserved) {
        throw new Error('INSUFFICIENT_BALANCE')
      }

      await ensureActiveFairnessState(session.id, tx)

      if (requestedClientSeed) {
        await setClientSeed(session.id, requestedClientSeed, tx)
      }

      const allocated = await allocateNonce(session.id, tx)

      const initialState = createInitialState(session.balance, variant)
      const startedGameState = startRound(
        initialState,
        baseBet,
        betMultiplier,
        allocated.serverSeed,
        allocated.serverSeedHash,
        allocated.clientSeed,
        allocated.nonce,
        HMAC_FAIRNESS_VERSION,
        betLimits
      )
      gameState = startedGameState

      const game = await tx.videoPokerGame.create({
        data: {
          sessionId: session.id,
          variant,
          baseBet,
          betMultiplier,
          totalBet,
          serverSeed: null,
          serverSeedHash: allocated.serverSeedHash,
          clientSeed: allocated.clientSeed,
          nonce: allocated.nonce,
          fairnessVersion: HMAC_FAIRNESS_VERSION,
          fairnessSeedId: allocated.seedId,
          fairnessMode: SESSION_NONCE_MODE,
          commitmentTxHash: allocated.commitmentTxHash,
          commitmentBlock: allocated.commitmentBlock,
          commitmentTimestamp: allocated.commitmentTimestamp,
          initialState: JSON.stringify({
            hand: startedGameState.hand.map(c => ({ rank: c.rank, suit: c.suit })),
          }),
          status: 'active',
        },
      })

      gameId = game.id
      blockchainCommitment = {
        txHash: allocated.commitmentTxHash,
        blockHeight: allocated.commitmentBlock ?? 0,
        blockTimestamp: allocated.commitmentTimestamp ?? new Date(),
        explorerUrl: getExplorerUrl(allocated.commitmentTxHash),
      }

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
    if (error instanceof ClientSeedLockedError) {
      return NextResponse.json({
        error: 'Client seed can only be changed before the first hand in the active seed stream.',
        code: 'CLIENT_SEED_LOCKED',
      }, { status: 409 })
    }

    if (error instanceof SessionFairnessUnavailableError) {
      return NextResponse.json({
        error: 'No replacement fairness seed available. Please try again shortly.',
      }, { status: 503 })
    }

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
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    throw error
  }

  if (!gameState || !blockchainCommitment) {
    throw new Error('Failed to start video poker game with session fairness state')
  }

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
  })
  const fairness = await getPublicFairnessState(session.id).catch(() => null)

  return NextResponse.json({
    gameId,
    gameState: sanitizeStateForClient(gameState),
    balance: roundZec(updatedSession?.balance ?? (updatedSessionForBet as { balance: number } | null)?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? (updatedSessionForBet as { totalWagered: number } | null)?.totalWagered ?? totalBet),
    totalWon: roundZec(updatedSession?.totalWon ?? (updatedSessionForBet as { totalWon: number } | null)?.totalWon ?? 0),
    commitment: blockchainCommitment,
    fairness,
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
  const resolvedServerSeed = await resolveGameServerSeed(game.serverSeed, game.fairnessSeedId)
  if (!resolvedServerSeed) {
    return NextResponse.json({ error: 'Server seed unavailable for this game.' }, { status: 503 })
  }

  const initialState = createInitialState(
    session.balance + game.totalBet,
    game.variant as VideoPokerVariant
  )
  const holdState = startRound(
    initialState,
    game.baseBet,
    game.betMultiplier,
    resolvedServerSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce,
    normalizeFairnessVersion(game.fairnessVersion),
    // Use a permissive range so admin bet-limit changes don't break in-flight games.
    { minBet: 0, maxBet: Math.max(game.baseBet, 1) }
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
    balance: roundZec(updatedSession?.balance ?? session.balance),
    totalWagered: roundZec(updatedSession?.totalWagered ?? 0),
    totalWon: roundZec(updatedSession?.totalWon ?? 0),
  })
}

async function resolveGameServerSeed(
  serverSeed: string | null,
  fairnessSeedId: string | null
): Promise<string | null> {
  if (serverSeed) {
    return serverSeed
  }

  if (!fairnessSeedId) {
    return null
  }

  const fairnessSeed = await getFairnessSeedById(fairnessSeedId)
  return fairnessSeed?.seed ?? null
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

    const revealState = await getRevealableServerSeed(game.fairnessSeedId, game.serverSeed)
    const canRevealServerSeed = game.fairnessMode === SESSION_NONCE_MODE
      ? revealState.isRevealed
      : game.status === 'completed'

    return NextResponse.json({
      id: game.id,
      variant: game.variant,
      baseBet: game.baseBet,
      betMultiplier: game.betMultiplier,
      totalBet: game.totalBet,
      serverSeed: canRevealServerSeed ? revealState.serverSeed : undefined,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      fairnessMode: game.fairnessMode ?? null,
      verificationStatus: canRevealServerSeed ? 'ready' : 'pending_reveal',
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
