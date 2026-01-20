import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import {
  createInitialState,
  startRound,
  executeAction,
  MIN_BET,
  MAX_BET
} from '@/lib/game/blackjack'
import {
  generateClientSeed
} from '@/lib/provably-fair'
import {
  getOrCreateCommitment,
  markCommitmentUsed,
  checkAndRefillPool
} from '@/lib/provably-fair/commitment-pool'
import { getExplorerUrl } from '@/lib/provably-fair/blockchain'
import type { BlackjackAction, BlackjackGameState, BlockchainCommitment } from '@/types'

// POST /api/game - Start new game or execute action
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, sessionId, gameId, bet, perfectPairsBet, clientSeed } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
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

    switch (action) {
      case 'start':
        return handleStartGame(session, bet, perfectPairsBet, clientSeed)

      case 'hit':
      case 'stand':
      case 'double':
      case 'split':
        return handleGameAction(session, gameId, action as BlackjackAction)

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
  session: { id: string; balance: number; walletAddress: string },
  mainBet: number,
  perfectPairsBet: number = 0,
  clientSeedInput?: string
) {
  // Validate bet amounts
  if (mainBet < MIN_BET || mainBet > MAX_BET) {
    return NextResponse.json({
      error: `Bet must be between ${MIN_BET} and ${MAX_BET} ZEC`
    }, { status: 400 })
  }

  const totalBet = mainBet + perfectPairsBet
  if (totalBet > session.balance) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
  }

  // Get pre-committed server seed from blockchain commitment pool
  const commitment = await getOrCreateCommitment()
  if (!commitment) {
    return NextResponse.json({
      error: 'Unable to create provably fair commitment. Please try again.'
    }, { status: 503 })
  }

  const { serverSeed, serverSeedHash, txHash, blockHeight, blockTimestamp } = commitment
  const clientSeed = clientSeedInput || generateClientSeed()

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
    mainBet,
    perfectPairsBet,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce
  )

  // Deduct bet from balance
  const newBalance = session.balance - totalBet

  // Save game to database with blockchain commitment data
  const game = await prisma.blackjackGame.create({
    data: {
      sessionId: session.id,
      mainBet,
      perfectPairsBet,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      // Blockchain commitment
      commitmentTxHash: txHash,
      commitmentBlock: blockHeight,
      commitmentTimestamp: blockTimestamp,
      initialState: JSON.stringify({
        deck: gameState.deck.slice(0, 10), // Store first 10 cards for verification
        playerCards: gameState.playerHands[0]?.cards,
        dealerCards: gameState.dealerHand.cards
      }),
      status: gameState.phase === 'complete' ? 'completed' : 'active'
    }
  })

  // Mark commitment as used
  await markCommitmentUsed(commitment.id, game.id)

  // Trigger pool refill check in background (non-blocking)
  checkAndRefillPool().catch(err => console.error('Pool refill error:', err))

  // Update session balance
  await prisma.session.update({
    where: { id: session.id },
    data: {
      balance: newBalance,
      totalWagered: { increment: totalBet }
    }
  })

  // If game completed immediately (blackjack), process payout
  if (gameState.phase === 'complete') {
    await processGameCompletion(game.id, session.id, gameState)
  }

  // Build blockchain commitment info for response
  const blockchainCommitment: BlockchainCommitment = {
    txHash,
    blockHeight,
    blockTimestamp,
    explorerUrl: getExplorerUrl(txHash)
  }

  return NextResponse.json({
    gameId: game.id,
    gameState: sanitizeGameState(gameState),
    balance: newBalance + (gameState.lastPayout || 0),
    commitment: blockchainCommitment
  })
}

async function handleGameAction(
  session: { id: string; balance: number },
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
  const actionHistory: BlackjackAction[] = JSON.parse(game.actionHistory || '[]')

  // Reconstruct game state from initial deal
  const initialState = createInitialState(session.balance + game.mainBet + game.perfectPairsBet)

  // Start round to get initial dealt cards (same seeds = same deck order)
  let gameState = startRound(
    initialState,
    game.mainBet,
    game.perfectPairsBet,
    game.serverSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce
  )

  // CRITICAL FIX: Replay all previous actions to restore correct deck position
  // This ensures cards dealt in previous actions aren't lost
  for (const previousAction of actionHistory) {
    gameState = executeAction(gameState, previousAction)
  }

  // Check if action requires additional funds (double, split)
  // Only charge for the NEW action, not replayed ones
  if (action === 'double' || action === 'split') {
    const additionalBet = game.mainBet
    if (additionalBet > session.balance) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Deduct additional bet
    await prisma.session.update({
      where: { id: session.id },
      data: {
        balance: { decrement: additionalBet },
        totalWagered: { increment: additionalBet }
      }
    })
  }

  // Execute the NEW action
  gameState = executeAction(gameState, action)

  // Append new action to history for future replays
  const newActionHistory = [...actionHistory, action]

  // Update game state with action history
  const updateData: Record<string, unknown> = {
    actionHistory: JSON.stringify(newActionHistory),
    finalState: JSON.stringify({
      playerHands: gameState.playerHands,
      dealerHand: gameState.dealerHand,
      phase: gameState.phase,
      message: gameState.message
    })
  }

  if (gameState.phase === 'complete') {
    updateData.status = 'completed'
    updateData.completedAt = new Date()
    updateData.payout = gameState.lastPayout
    updateData.outcome = determineOutcome(gameState)

    // Process payout
    await processGameCompletion(gameId, session.id, gameState)
  }

  await prisma.blackjackGame.update({
    where: { id: gameId },
    data: updateData
  })

  // Get updated balance
  const updatedSession = await prisma.session.findUnique({
    where: { id: session.id }
  })

  return NextResponse.json({
    gameId,
    gameState: sanitizeGameState(gameState),
    balance: updatedSession?.balance || 0
  })
}

async function processGameCompletion(
  gameId: string,
  sessionId: string,
  gameState: BlackjackGameState
) {
  if (gameState.lastPayout > 0) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        balance: { increment: gameState.lastPayout },
        totalWon: { increment: gameState.lastPayout }
      }
    })
  }
}

function determineOutcome(gameState: BlackjackGameState): string {
  if (gameState.playerHands[0]?.isBlackjack) return 'blackjack'
  if (gameState.playerHands[0]?.isBusted) return 'lose'
  if (gameState.dealerHand.isBusted) return 'win'
  if (gameState.lastPayout > 0) return 'win'
  if (gameState.message.includes('Push')) return 'push'
  return 'lose'
}

// Remove sensitive data before sending to client
function sanitizeGameState(state: BlackjackGameState): Partial<BlackjackGameState> {
  return {
    phase: state.phase,
    playerHands: state.playerHands,
    dealerHand: state.dealerHand,
    currentHandIndex: state.currentHandIndex,
    balance: state.balance,
    currentBet: state.currentBet,
    perfectPairsBet: state.perfectPairsBet,
    insuranceBet: state.insuranceBet,
    serverSeedHash: state.serverSeedHash,
    clientSeed: state.clientSeed,
    nonce: state.nonce,
    lastPayout: state.lastPayout,
    message: state.message
    // Note: deck and serverSeed are NOT sent to client
  }
}

// GET /api/game - Get active game or game history
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')
  const gameId = request.nextUrl.searchParams.get('gameId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  if (gameId) {
    // Get specific game
    const game = await prisma.blackjackGame.findUnique({
      where: { id: gameId }
    })

    if (!game || game.sessionId !== sessionId) {
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

    // Only reveal server seed for completed games
    return NextResponse.json({
      id: game.id,
      mainBet: game.mainBet,
      perfectPairsBet: game.perfectPairsBet,
      serverSeed: game.status === 'completed' ? game.serverSeed : undefined,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
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
    where: { sessionId },
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
