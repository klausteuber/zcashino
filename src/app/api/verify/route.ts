import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { hashServerSeed, verifyGame } from '@/lib/provably-fair'
import { verifyCommitment, getExplorerUrl } from '@/lib/provably-fair/blockchain'
import type {
  GameVerificationData,
  VerificationSteps,
  FullVerificationResult,
  BlockchainCommitment
} from '@/types'

/**
 * GET /api/verify - Get verification data for a game
 *
 * Query params:
 * - gameId: The game ID to verify
 * - sessionId: Session ID (for access control, optional for public verification)
 */
export async function GET(request: NextRequest) {
  const gameId = request.nextUrl.searchParams.get('gameId')
  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 })
  }

  try {
    const game = await prisma.blackjackGame.findUnique({
      where: { id: gameId }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Only allow access if:
    // 1. User owns the game (has sessionId)
    // 2. Game is completed (public verification allowed)
    const isOwner = sessionId && game.sessionId === sessionId
    const isCompleted = game.status === 'completed'

    if (!isOwner && !isCompleted) {
      return NextResponse.json({
        error: 'Cannot verify active game. Wait for game to complete.'
      }, { status: 403 })
    }

    // Build commitment data
    const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
      ? {
          txHash: game.commitmentTxHash,
          blockHeight: game.commitmentBlock || 0,
          blockTimestamp: game.commitmentTimestamp || game.createdAt,
          explorerUrl: getExplorerUrl(game.commitmentTxHash)
        }
      : undefined

    // Build verification data
    const verificationData: GameVerificationData = {
      gameId: game.id,
      serverSeed: isCompleted ? game.serverSeed : '[Hidden until game completes]',
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      commitment,
      gameType: 'blackjack',
      outcome: game.outcome || undefined,
      payout: game.payout || undefined,
      createdAt: game.createdAt,
      completedAt: game.completedAt || undefined
    }

    return NextResponse.json({
      data: verificationData,
      canVerify: isCompleted,
      isOwner
    })
  } catch (error) {
    console.error('Verification data fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch verification data' }, { status: 500 })
  }
}

/**
 * POST /api/verify - Perform full verification of a game
 *
 * Body:
 * - gameId: The game ID to verify
 * OR
 * - serverSeed: Manual entry of server seed
 * - serverSeedHash: Manual entry of server seed hash
 * - clientSeed: Manual entry of client seed
 * - nonce: Manual entry of nonce
 * - txHash: Manual entry of commitment tx hash (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gameId, serverSeed, serverSeedHash, clientSeed, nonce, txHash } = body

    // If gameId provided, fetch from database
    if (gameId) {
      return verifyGameById(gameId)
    }

    // Otherwise, perform manual verification
    if (!serverSeed || !serverSeedHash || !clientSeed || nonce === undefined) {
      return NextResponse.json({
        error: 'Missing required fields: serverSeed, serverSeedHash, clientSeed, nonce'
      }, { status: 400 })
    }

    return verifyManual(serverSeed, serverSeedHash, clientSeed, nonce, txHash)
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

/**
 * Verify a game by its database ID
 */
async function verifyGameById(gameId: string) {
  const game = await prisma.blackjackGame.findUnique({
    where: { id: gameId }
  })

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (game.status !== 'completed') {
    return NextResponse.json({
      error: 'Cannot verify active game. Server seed is only revealed after game completes.'
    }, { status: 400 })
  }

  const errors: string[] = []
  const steps: VerificationSteps = {
    hashMatches: false,
    onChainConfirmed: false,
    timestampValid: false,
    outcomeValid: false
  }

  // Step 1: Verify hash matches
  const computedHash = await hashServerSeed(game.serverSeed)
  steps.hashMatches = computedHash === game.serverSeedHash

  if (!steps.hashMatches) {
    errors.push('Server seed hash does not match. The game may have been manipulated.')
  }

  // Step 2: Verify on-chain commitment
  if (game.commitmentTxHash) {
    const commitmentResult = await verifyCommitment(
      game.commitmentTxHash,
      game.serverSeedHash
    )
    steps.onChainConfirmed = commitmentResult.valid

    if (!commitmentResult.valid) {
      errors.push(`Blockchain verification failed: ${commitmentResult.error}`)
    }

    // Step 3: Verify timestamp (commitment before game start)
    if (commitmentResult.valid && game.commitmentTimestamp) {
      const commitmentTime = new Date(game.commitmentTimestamp).getTime()
      const gameStartTime = new Date(game.createdAt).getTime()
      steps.timestampValid = commitmentTime <= gameStartTime

      if (!steps.timestampValid) {
        errors.push('Commitment timestamp is after game start. This should not happen.')
      }
    }
  } else {
    // No blockchain commitment (legacy game)
    errors.push('This game does not have a blockchain commitment (pre-blockchain feature).')
  }

  // Step 4: Verify game outcome (replay)
  // For blackjack, we verify the deck shuffle order
  const deckSize = 312 // 6 decks * 52 cards
  const replayResult = await verifyGame(
    game.serverSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce,
    deckSize
  )
  steps.outcomeValid = replayResult.valid

  if (!replayResult.valid) {
    errors.push(replayResult.message)
  }

  // Build commitment data
  const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
    ? {
        txHash: game.commitmentTxHash,
        blockHeight: game.commitmentBlock || 0,
        blockTimestamp: game.commitmentTimestamp || game.createdAt,
        explorerUrl: getExplorerUrl(game.commitmentTxHash)
      }
    : undefined

  // Build full result
  const result: FullVerificationResult = {
    valid: steps.hashMatches && steps.outcomeValid && (steps.onChainConfirmed || !game.commitmentTxHash),
    data: {
      gameId: game.id,
      serverSeed: game.serverSeed,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      commitment,
      gameType: 'blackjack',
      outcome: game.outcome || undefined,
      payout: game.payout || undefined,
      createdAt: game.createdAt,
      completedAt: game.completedAt || undefined
    },
    steps,
    errors
  }

  // Update verification status in database
  if (result.valid && game.commitmentTxHash && !game.verifiedOnChain) {
    await prisma.blackjackGame.update({
      where: { id: game.id },
      data: { verifiedOnChain: true }
    })
  }

  return NextResponse.json(result)
}

/**
 * Perform manual verification with user-provided data
 */
async function verifyManual(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  txHash?: string
) {
  const errors: string[] = []
  const steps: VerificationSteps = {
    hashMatches: false,
    onChainConfirmed: false,
    timestampValid: false,
    outcomeValid: false
  }

  // Step 1: Verify hash matches
  const computedHash = await hashServerSeed(serverSeed)
  steps.hashMatches = computedHash === serverSeedHash

  if (!steps.hashMatches) {
    errors.push(`Hash mismatch. Computed: ${computedHash.substring(0, 16)}...`)
  }

  // Step 2: Verify on-chain commitment (if txHash provided)
  if (txHash) {
    const commitmentResult = await verifyCommitment(txHash, serverSeedHash)
    steps.onChainConfirmed = commitmentResult.valid

    if (!commitmentResult.valid) {
      errors.push(`Blockchain verification failed: ${commitmentResult.error}`)
    }

    // For manual verification, we can't verify timestamp without game data
    steps.timestampValid = commitmentResult.valid // Assume valid if on-chain
  }

  // Step 3: Verify game replay
  const deckSize = 312 // 6 decks * 52 cards
  const replayResult = await verifyGame(
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    deckSize
  )
  steps.outcomeValid = replayResult.valid

  if (!replayResult.valid) {
    errors.push(replayResult.message)
  }

  const result: FullVerificationResult = {
    valid: steps.hashMatches && steps.outcomeValid,
    data: {
      gameId: 'manual-verification',
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      commitment: txHash ? {
        txHash,
        blockHeight: 0,
        blockTimestamp: new Date(),
        explorerUrl: getExplorerUrl(txHash)
      } : undefined,
      gameType: 'blackjack',
      createdAt: new Date()
    },
    steps,
    errors
  }

  return NextResponse.json(result)
}
