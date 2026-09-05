import { commitBlackjackAction, BlackjackActionConflict, BlackjackFundsUnavailable } from '@/lib/services/blackjack-action'
import { sanitizeGameState } from '@/lib/game/public-blackjack'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  createInitialState,
  startRound,
  executeAction,
  takeInsurance,
  declineInsurance,
  getAvailableActions,
} from '@/lib/game/blackjack'
import {
  parseBlackjackActionHistory,
  reconstructBlackjackGameState,
} from '@/lib/game/blackjack-replay'
import {
  generateClientSeed
} from '@/lib/provably-fair'
import {
  getOrCreateCommitment,
  markCommitmentUsed,
  releaseClaimedCommitment,
  checkAndRefillPool
} from '@/lib/provably-fair/commitment-pool'
import { getExplorerUrl } from '@/lib/provably-fair/blockchain'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { roundZec } from '@/lib/wallet'
import type {
  BlackjackAction,
  BlackjackGameRules,
  BlackjackGameState,
  BlockchainCommitment,
  FairnessVersion
} from '@/types'
import { requirePlayerSession } from '@/lib/auth/player-session'
import { parseWithSchema, blackjackBodySchema } from '@/lib/validation/api-schemas'
import { reserveFunds, creditFunds } from '@/lib/services/ledger'
import { logPlayerCounterEvent, PLAYER_COUNTER_ACTIONS } from '@/lib/telemetry/player-events'
import { HMAC_FAIRNESS_VERSION, getDefaultFairnessVersion, normalizeFairnessVersion } from '@/lib/game/shuffle'
import { checkWagerAllowed } from '@/lib/services/responsible-gambling'
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

// Check if this is a demo session
function isDemoSession(walletAddress: string): boolean {
  return walletAddress.startsWith('demo_')
}

function createWagerLimitResponse(result: ReturnType<typeof checkWagerAllowed>) {
  return NextResponse.json({
    error: result.message,
    code: result.code,
  }, { status: 403 })
}

// POST /api/game - Start new game or execute action
export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'game-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = parseWithSchema(blackjackBodySchema, body)
    if (!parsed.success) {
      const isInvalidSideBet = body
        && typeof body === 'object'
        && (body as Record<string, unknown>).action === 'start'
        && !!parsed.payload.details.perfectPairsBet

      if (isInvalidSideBet) {
        return NextResponse.json({
          ...parsed.payload,
          code: 'INVALID_SIDE_BET',
        }, { status: 400 })
      }
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const payload = parsed.data
    const sessionId = payload.sessionId

    const playerSession = await requirePlayerSession(request, sessionId)
    if (!playerSession.ok) return playerSession.response
    if (playerSession.legacyFallback) {
      await logPlayerCounterEvent({
        request,
        action: PLAYER_COUNTER_ACTIONS.LEGACY_SESSION_FALLBACK,
        details: 'Compat mode accepted legacy sessionId for blackjack action',
        metadata: {
          sessionId,
          action: payload.action,
        },
      })
    }

    // Get session
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if excluded
    if (session.excludedUntil && session.excludedUntil > new Date()) {
      return NextResponse.json({
        error: 'Self-excluded',
        excludedUntil: session.excludedUntil
      }, { status: 403 })
    }

    // Check authentication (demo sessions are auto-authenticated)
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
        // Kill switch blocks NEW games but allows in-progress games to complete
        if (isKillSwitchActive()) {
          return NextResponse.json({
            error: 'Platform is under maintenance. New games are temporarily paused.',
            maintenanceMode: true,
          }, { status: 503 })
        }
        return handleStartGame(
          request,
          session,
          payload.bet,
          payload.perfectPairsBet,
          payload.clientSeed
        )

      case 'hit':
      case 'stand':
      case 'double':
      case 'split':
      case 'surrender':
        return handleGameAction(request, session, payload.gameId, payload.action as BlackjackAction)

      case 'insurance':
        return handleInsuranceAction(request, session, payload.gameId)

      case 'decline_insurance':
        return handleDeclineInsurance(request, session, payload.gameId)

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Game error:', error)
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
  mainBet: number,
  perfectPairsBet: number = 0,
  clientSeedInput?: string
) {
  const settings = await getAdminSettings()
  const betLimits = {
    minBet: settings.blackjack.minBet,
    maxBet: settings.blackjack.maxBet,
  }

  const normalizedMainBet = roundZec(mainBet)
  const normalizedPerfectPairsBet = roundZec(perfectPairsBet)

  // Validate bet amounts
  if (normalizedMainBet < betLimits.minBet || normalizedMainBet > betLimits.maxBet) {
    return NextResponse.json({
      error: `Bet must be between ${betLimits.minBet} and ${betLimits.maxBet} ZEC`
    }, { status: 400 })
  }

  if (!settings.blackjack.allowPerfectPairs && normalizedPerfectPairsBet > 0) {
    return NextResponse.json({
      error: 'Perfect Pairs side bet is currently disabled.',
      code: 'SIDE_BET_DISABLED',
    }, { status: 400 })
  }

  if (normalizedPerfectPairsBet < 0 || normalizedPerfectPairsBet > normalizedMainBet) {
    return NextResponse.json({
      error: 'Invalid side bet amount. Perfect Pairs must be between 0 and the main bet.',
      code: 'INVALID_SIDE_BET',
    }, { status: 400 })
  }

  const totalBet = roundZec(normalizedMainBet + normalizedPerfectPairsBet)
  if (totalBet > session.balance) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
  }

  const wagerCheck = checkWagerAllowed(session, totalBet)
  if (!wagerCheck.allowed) {
    return createWagerLimitResponse(wagerCheck)
  }

  const gameRules: BlackjackGameRules = {
    deckCount: settings.blackjack.deckCount,
    dealerStandsOn: settings.blackjack.dealerStandsOn,
    blackjackPayout: settings.blackjack.blackjackPayout,
    allowSurrender: settings.blackjack.allowSurrender,
    allowPerfectPairs: settings.blackjack.allowPerfectPairs,
  }

  if (getProvablyFairMode() === SESSION_NONCE_MODE) {
    return handleStartGameSessionNonce(
      request,
      session,
      normalizedMainBet,
      normalizedPerfectPairsBet,
      totalBet,
      betLimits,
      gameRules,
      clientSeedInput
    )
  }

  // Get pre-committed server seed from blockchain commitment pool
  const commitment = await getOrCreateCommitment()
  if (!commitment) {
    // Trigger an immediate background refill so retries recover faster.
    checkAndRefillPool().catch((err) => console.error('Pool refill error after commitment failure:', err))
    return NextResponse.json({
      error: 'Unable to create provably fair commitment. Please try again.'
    }, { status: 503 })
  }

  const { serverSeed, serverSeedHash, txHash, blockHeight, blockTimestamp } = commitment
  const clientSeed = clientSeedInput?.trim() || generateClientSeed()
  const fairnessVersion = getDefaultFairnessVersion()

  // Get next nonce for this session
  const lastGame = await prisma.blackjackGame.findFirst({
    where: { sessionId: session.id },
    orderBy: { nonce: 'desc' }
  })
  const nonce = (lastGame?.nonce ?? -1) + 1

  // Create game state
  const initialState = createInitialState(session.balance)
  const gameState = startRound(
    initialState,
    normalizedMainBet,
    normalizedPerfectPairsBet,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    fairnessVersion,
    betLimits,
    gameRules
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

      const game = await tx.blackjackGame.create({
        data: {
          sessionId: session.id,
          mainBet: normalizedMainBet,
          perfectPairsBet: normalizedPerfectPairsBet,
          serverSeed,
          serverSeedHash,
          clientSeed,
          nonce,
          fairnessVersion,
          commitmentTxHash: txHash,
          commitmentBlock: blockHeight,
          commitmentTimestamp: blockTimestamp,
          initialState: JSON.stringify({
            deck: gameState.deck.slice(0, 10),
            playerCards: gameState.playerHands[0]?.cards,
            dealerCards: gameState.dealerHand.cards,
            gameRules,
          }),
          status: 'active'
        }
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
        action: PLAYER_COUNTER_ACTIONS.BLACKJACK_RESERVE_REJECTED,
        details: 'Conditional game-start reserve rejected',
        metadata: {
          sessionId: session.id,
          totalBet,
        },
      })
      await releaseClaimedCommitment(commitment.id).catch((releaseError) => {
        console.error('[Game] Failed to release claimed commitment:', releaseError)
      })
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    await releaseClaimedCommitment(commitment.id).catch((releaseError) => {
      console.error('[Game] Failed to release claimed commitment:', releaseError)
    })
    throw error
  }

  // Trigger pool refill check in background (non-blocking)
  checkAndRefillPool().catch(err => console.error('Pool refill error:', err))

  // If game completed immediately (blackjack), process payout atomically
  if (gameState.phase === 'complete') {
    await processGameCompletion(request, gameId, session.id, gameState)
  }

  // Build blockchain commitment info for response
  const blockchainCommitment: BlockchainCommitment = {
    txHash,
    blockHeight,
    blockTimestamp,
    explorerUrl: getExplorerUrl(txHash)
  }

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
    select: { balance: true, totalWagered: true, totalWon: true },
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState(gameState),
    balance: roundZec(updatedSession?.balance ?? (updatedSessionForBet as { balance: number } | null)?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? (updatedSessionForBet as { totalWagered: number } | null)?.totalWagered ?? totalBet),
    totalWon: roundZec(updatedSession?.totalWon ?? (updatedSessionForBet as { totalWon: number } | null)?.totalWon ?? 0),
    commitment: blockchainCommitment
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
  normalizedMainBet: number,
  normalizedPerfectPairsBet: number,
  totalBet: number,
  betLimits: { minBet: number; maxBet: number },
  gameRules: BlackjackGameRules,
  clientSeedInput?: string
) {
  const requestedClientSeed = clientSeedInput?.trim()
  let gameId = ''
  let gameState: BlackjackGameState | null = null
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
        error: 'Unable to allocate a session fairness seed. Please try again shortly.'
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

      const initialState = createInitialState(session.balance)
      const startedGameState = startRound(
        initialState,
        normalizedMainBet,
        normalizedPerfectPairsBet,
        allocated.serverSeed,
        allocated.serverSeedHash,
        allocated.clientSeed,
        allocated.nonce,
        HMAC_FAIRNESS_VERSION,
        betLimits,
        gameRules
      )
      gameState = startedGameState

      const game = await tx.blackjackGame.create({
        data: {
          sessionId: session.id,
          mainBet: normalizedMainBet,
          perfectPairsBet: normalizedPerfectPairsBet,
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
            deck: startedGameState.deck.slice(0, 10),
            playerCards: startedGameState.playerHands[0]?.cards,
            dealerCards: startedGameState.dealerHand.cards,
            gameRules,
          }),
          status: 'active'
        }
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
        action: PLAYER_COUNTER_ACTIONS.BLACKJACK_RESERVE_REJECTED,
        details: 'Conditional game-start reserve rejected',
        metadata: {
          sessionId: session.id,
          totalBet,
        },
      })
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    throw error
  }

  const finalizedGameState = gameState as BlackjackGameState | null

  if (!finalizedGameState || !blockchainCommitment) {
    throw new Error('Failed to start game with session fairness state')
  }

  if (finalizedGameState.phase === 'complete') {
    await processGameCompletion(request, gameId, session.id, finalizedGameState)
  }

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id },
    select: { balance: true, totalWagered: true, totalWon: true },
  })

  const fairness = await getPublicFairnessState(session.id).catch(() => null)

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState(finalizedGameState),
    balance: roundZec(updatedSession?.balance ?? (updatedSessionForBet as { balance: number } | null)?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? (updatedSessionForBet as { totalWagered: number } | null)?.totalWagered ?? totalBet),
    totalWon: roundZec(updatedSession?.totalWon ?? (updatedSessionForBet as { totalWon: number } | null)?.totalWon ?? 0),
    commitment: blockchainCommitment,
    fairness,
  })
}

async function handleGameAction(
  _request: NextRequest,
  session: {
    id: string
    balance: number
    totalWagered: number
    totalWon: number
    lossLimit: number | null
    sessionLimit: number | null
    createdAt: Date
  },
  gameId: string,
  action: BlackjackAction
) {
  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 })
  }

  // Get the game
  const game = await prisma.blackjackGame.findUnique({
    where: { id: gameId }
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

  // Parse existing action history
  const actionHistory = parseBlackjackActionHistory(game.actionHistory)

  const resolvedServerSeed = await resolveGameServerSeed(game.serverSeed, game.fairnessSeedId)
  if (!resolvedServerSeed) {
    return NextResponse.json({
      error: 'Server seed unavailable for this game.'
    }, { status: 503 })
  }

  let gameState = reconstructBlackjackGameState({
    game,
    sessionBalance: session.balance,
    resolvedServerSeed,
    replayPersistedProgress: true,
    actionHistory,
  })

  const dealerPeekWillAutoComplete =
    gameState.phase === 'playerTurn' &&
    !gameState.dealerPeeked &&
    gameState.dealerHand.cards[0]?.rank === 'A' &&
    gameState.dealerHand.isBlackjack

  let additionalBet = 0
  // Check if action requires additional funds (double, split)
  // Only charge for the NEW action, not replayed ones
  const canTakeAction = getAvailableActions(gameState).includes(action)
  if ((action === 'double' || action === 'split') && canTakeAction && !dealerPeekWillAutoComplete) {
    additionalBet = roundZec(game.mainBet)
    const wagerCheck = checkWagerAllowed(session, additionalBet)
    if (!wagerCheck.allowed) {
      return createWagerLimitResponse(wagerCheck)
    }
  }

  // Execute the NEW action
  gameState = executeAction(gameState, action)

  // Append new action to history for future replays
  const shouldAppendAction = canTakeAction && !dealerPeekWillAutoComplete
  const newActionHistory = shouldAppendAction ? [...actionHistory, action] : actionHistory

  // Update game state with action history
  const updateData: Record<string, unknown> = {
    actionHistory: JSON.stringify(newActionHistory),
    finalState: JSON.stringify({
      playerHands: gameState.playerHands,
      dealerHand: gameState.dealerHand,
      phase: gameState.phase,
      message: gameState.message,
      insuranceBet: gameState.insuranceBet,
      dealerPeeked: gameState.dealerPeeked,
      settlement: gameState.settlement ?? null,
    })
  }

  const commitError = await persistPlayerAction(game, session.id, gameState, updateData, additionalBet)
  if (commitError) return commitError

  // Get updated balance
  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id }
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState(gameState),
    balance: roundZec(updatedSession?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? 0),
    totalWon: roundZec(updatedSession?.totalWon ?? 0)
  })
}

async function handleInsuranceAction(
  _request: NextRequest,
  session: {
    id: string
    balance: number
    totalWagered: number
    totalWon: number
    lossLimit: number | null
    sessionLimit: number | null
    createdAt: Date
  },
  gameId: string
) {
  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 })
  }

  // Get the game
  const game = await prisma.blackjackGame.findUnique({
    where: { id: gameId }
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

  // Calculate insurance amount (half of main bet)
  const insuranceAmount = roundZec(game.mainBet / 2)

  const resolvedServerSeed = await resolveGameServerSeed(game.serverSeed, game.fairnessSeedId)
  if (!resolvedServerSeed) {
    return NextResponse.json({
      error: 'Server seed unavailable for this game.'
    }, { status: 503 })
  }

  let gameState = reconstructBlackjackGameState({
    game,
    sessionBalance: session.balance,
    resolvedServerSeed,
    replayPersistedProgress: true,
    actionHistory: parseBlackjackActionHistory(game.actionHistory),
  })

  // Check if insurance can be taken (dealer showing Ace, no insurance yet)
  if (gameState.dealerHand.cards[0]?.rank !== 'A') {
    return NextResponse.json({ error: 'Insurance not available' }, { status: 400 })
  }

  if (game.insuranceBet > 0 || gameState.dealerPeeked || parseBlackjackActionHistory(game.actionHistory).length > 0) {
    return NextResponse.json({ error: 'Insurance already taken' }, { status: 400 })
  }

  // Apply insurance
  const wagerCheck = checkWagerAllowed(session, insuranceAmount)
  if (!wagerCheck.allowed) {
    return createWagerLimitResponse(wagerCheck)
  }

  gameState = takeInsurance(gameState, insuranceAmount)

  const updateData: Record<string, unknown> = {
    insuranceBet: insuranceAmount,
    finalState: JSON.stringify({
      playerHands: gameState.playerHands,
      dealerHand: gameState.dealerHand,
      phase: gameState.phase,
      message: gameState.message,
      insuranceBet: insuranceAmount,
      dealerPeeked: gameState.dealerPeeked,
      settlement: gameState.settlement ?? null,
    })
  }

  const commitError = await persistPlayerAction(game, session.id, gameState, updateData, insuranceAmount)
  if (commitError) return commitError

  // Get updated balance
  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id }
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState({ ...gameState, insuranceBet: insuranceAmount }),
    balance: roundZec(updatedSession?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? 0),
    totalWon: roundZec(updatedSession?.totalWon ?? 0)
  })
}

async function handleDeclineInsurance(
  _request: NextRequest,
  session: {
    id: string
    balance: number
    totalWagered: number
    totalWon: number
    lossLimit: number | null
    sessionLimit: number | null
    createdAt: Date
  },
  gameId: string
) {
  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 })
  }

  const game = await prisma.blackjackGame.findUnique({
    where: { id: gameId }
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

  const resolvedServerSeed = await resolveGameServerSeed(game.serverSeed, game.fairnessSeedId)
  if (!resolvedServerSeed) {
    return NextResponse.json({
      error: 'Server seed unavailable for this game.'
    }, { status: 503 })
  }

  let gameState = reconstructBlackjackGameState({
    game,
    sessionBalance: session.balance,
    resolvedServerSeed,
    replayPersistedProgress: true,
    actionHistory: parseBlackjackActionHistory(game.actionHistory),
  })

  // Insurance should not have been taken yet if declining
  if (game.insuranceBet > 0) {
    return NextResponse.json({ error: 'Insurance already taken' }, { status: 400 })
  }

  if (gameState.dealerHand.cards[0]?.rank !== 'A') {
    return NextResponse.json({ error: 'No insurance to decline' }, { status: 400 })
  }

  if (gameState.dealerPeeked) {
    return NextResponse.json({ error: 'Dealer already peeked' }, { status: 400 })
  }

  gameState = declineInsurance(gameState)

  const updateData: Record<string, unknown> = {
    finalState: JSON.stringify({
      playerHands: gameState.playerHands,
      dealerHand: gameState.dealerHand,
      phase: gameState.phase,
      message: gameState.message,
      insuranceBet: 0,
      dealerPeeked: gameState.dealerPeeked,
      settlement: gameState.settlement ?? null,
    })
  }

  const commitError = await persistPlayerAction(game, session.id, gameState, updateData, 0)
  if (commitError) return commitError

  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id }
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState(gameState),
    balance: roundZec(updatedSession?.balance ?? 0),
    totalWagered: roundZec(updatedSession?.totalWagered ?? 0),
    totalWon: roundZec(updatedSession?.totalWon ?? 0)
  })
}

async function persistPlayerAction(
  game: { id: string; version: number },
  sessionId: string,
  state: BlackjackGameState,
  data: Record<string, unknown>,
  additionalBet: number
): Promise<NextResponse | null> {
  try {
    await commitBlackjackAction({
      gameId: game.id, expectedVersion: game.version, sessionId, additionalBet,
      payout: state.phase === 'complete' ? roundZec(state.lastPayout) : null,
      data: { ...data, ...(state.phase === 'complete' ? { outcome: determineOutcome(state) } : {}) },
    })
    return null
  } catch (error) {
    if (error instanceof BlackjackActionConflict || (error instanceof Error && /SQLITE_BUSY|database is locked/.test(error.message))) {
      return NextResponse.json({ error: 'This hand changed. Refresh before taking another action.' }, { status: 409 })
    }
    if (error instanceof BlackjackFundsUnavailable) {
      return NextResponse.json({ error: 'Insufficient balance or wagering limit reached.' }, { status: 400 })
    }
    throw error
  }
}

async function processGameCompletion(
  request: NextRequest,
  gameId: string,
  sessionId: string,
  gameState: BlackjackGameState
) {
  const payout = roundZec(gameState.lastPayout)
  let duplicateBlocked = false

  await prisma.$transaction(async (tx) => {
    const result = await tx.blackjackGame.updateMany({
      where: { id: gameId, status: 'active' },
      data: { status: 'completed', completedAt: new Date(), payout }
    })

    if (result.count === 0) {
      duplicateBlocked = true
      return
    }
    await creditFunds(tx, sessionId, payout, 'totalWon')
  })

  if (duplicateBlocked) {
    await logPlayerCounterEvent({
      request,
      action: PLAYER_COUNTER_ACTIONS.BLACKJACK_DUPLICATE_COMPLETION,
      details: 'Duplicate completion blocked by active->completed guard',
      metadata: {
        sessionId,
        gameId,
      },
    })
  }
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

function determineOutcome(gameState: BlackjackGameState): string {
  if (gameState.playerHands.length > 0 && gameState.playerHands.every(hand => hand.isSurrendered)) {
    return 'surrender'
  }
  const hasNaturalPlayerBlackjack = gameState.playerHands.some(h => h.isBlackjack && !h.isSplit)
  if (hasNaturalPlayerBlackjack && !gameState.dealerHand.isBlackjack) return 'blackjack'

  const net = roundZec(gameState.settlement?.net ?? 0)
  if (net === 0) return 'push'
  if (net > 0) return 'win'
  return 'lose'
}

// GET /api/game - Get active game or game history
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

  const playerSession = await requirePlayerSession(request, sessionId)
  if (!playerSession.ok) return playerSession.response
  if (playerSession.legacyFallback) {
    return NextResponse.json(
      { error: 'Player session expired. Please refresh your session.' },
      { status: 401 }
    )
  }

  const trustedSessionId = playerSession.session.sessionId

  if (gameId) {
    // Get specific game
    const game = await prisma.blackjackGame.findUnique({
      where: { id: gameId }
    })

    if (!game || game.sessionId !== trustedSessionId) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Build blockchain commitment info
    const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
      ? {
          txHash: game.commitmentTxHash,
          blockHeight: game.commitmentBlock || 0,
          blockTimestamp: game.commitmentTimestamp || game.createdAt,
          explorerUrl: getExplorerUrl(game.commitmentTxHash)
        }
      : undefined

    const revealState = await getRevealableServerSeed(game.fairnessSeedId, game.serverSeed)
    const canRevealServerSeed = game.fairnessMode === SESSION_NONCE_MODE
      ? revealState.isRevealed
      : game.status === 'completed'

    // Only reveal server seed for completed games
    return NextResponse.json({
      id: game.id,
      mainBet: game.mainBet,
      perfectPairsBet: game.perfectPairsBet,
      serverSeed: canRevealServerSeed ? revealState.serverSeed : undefined,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      fairnessVersion: normalizeFairnessVersion(game.fairnessVersion) as FairnessVersion,
      fairnessMode: game.fairnessMode ?? null,
      verificationStatus: canRevealServerSeed ? 'ready' : 'pending_reveal',
      status: game.status,
      outcome: game.outcome,
      payout: game.payout,
      createdAt: game.createdAt,
      completedAt: game.completedAt,
      // Blockchain proof
      commitment,
      verifiedOnChain: game.verifiedOnChain
    })
  }

  // Get game history
  const games = await prisma.blackjackGame.findMany({
    where: { sessionId: trustedSessionId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      mainBet: true,
      status: true,
      outcome: true,
      payout: true,
      serverSeedHash: true,
      nonce: true,
      createdAt: true
    }
  })

  return NextResponse.json({ games })
}
