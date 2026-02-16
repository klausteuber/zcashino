import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { hashServerSeed, verifyGame, replayGame, replayVideoPokerGame } from '@/lib/provably-fair'
import type { BlackjackAction, VideoPokerVariant, FairnessVersion } from '@/types'
import { verifyCommitment, getExplorerUrl } from '@/lib/provably-fair/blockchain'
import type {
  GameVerificationData,
  VerificationSteps,
  FullVerificationResult,
  BlockchainCommitment
} from '@/types'
import { parseWithSchema, verifyPostSchema, verifyQuerySchema } from '@/lib/validation/api-schemas'
import { HMAC_FAIRNESS_VERSION, normalizeFairnessVersion } from '@/lib/game/shuffle'
import { LEGACY_PER_GAME_MODE, SESSION_NONCE_MODE } from '@/lib/provably-fair/mode'
import { getRevealableServerSeed } from '@/lib/provably-fair/session-fairness'

function normalizeFairnessMode(mode: string | null | undefined) {
  return mode === SESSION_NONCE_MODE ? SESSION_NONCE_MODE : LEGACY_PER_GAME_MODE
}

async function resolveVerificationSeed(
  fairnessSeedId: string | null,
  fallbackServerSeed: string | null,
  fairnessMode: string | null | undefined
): Promise<{
  mode: typeof LEGACY_PER_GAME_MODE | typeof SESSION_NONCE_MODE
  verificationStatus: 'ready' | 'pending_reveal'
  serverSeed: string | null
  isRevealed: boolean
}> {
  const mode = normalizeFairnessMode(fairnessMode)
  const revealState = await getRevealableServerSeed(fairnessSeedId, fallbackServerSeed)
  const pending = mode === SESSION_NONCE_MODE && !revealState.isRevealed
  return {
    mode,
    verificationStatus: pending ? 'pending_reveal' : 'ready',
    serverSeed: revealState.serverSeed,
    isRevealed: revealState.isRevealed,
  }
}

function buildPendingRevealResponse(data: GameVerificationData) {
  const steps: VerificationSteps = {
    hashMatches: false,
    onChainConfirmed: false,
    timestampValid: false,
    outcomeValid: false,
  }

  return {
    valid: false,
    pendingReveal: true,
    data,
    steps,
    errors: ['This game is waiting for seed rotation. Rotate seed to reveal and verify.'],
  }
}

/**
 * GET /api/verify - Get verification data for a game
 *
 * Query params:
 * - gameId: The game ID to verify
 * - sessionId: Session ID (for access control, optional for public verification)
 */
export async function GET(request: NextRequest) {
  const queryParsed = parseWithSchema(verifyQuerySchema, {
    gameId: request.nextUrl.searchParams.get('gameId') ?? undefined,
    sessionId: request.nextUrl.searchParams.get('sessionId') ?? undefined,
    gameType: request.nextUrl.searchParams.get('gameType') ?? undefined,
  }, 'Invalid query parameters')
  if (!queryParsed.success) {
    return NextResponse.json(queryParsed.payload, { status: 400 })
  }

  const { gameId, sessionId, gameType = 'blackjack' } = queryParsed.data

  try {
    if (gameType === 'video_poker') {
      const game = await prisma.videoPokerGame.findUnique({
        where: { id: gameId }
      })

      if (!game) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      }

      const isOwner = !!sessionId && game.sessionId === sessionId
      const isCompleted = game.status === 'completed'

      if (!isOwner && !isCompleted) {
        return NextResponse.json({
          error: 'Cannot verify active game. Wait for game to complete.'
        }, { status: 403 })
      }

      const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
        ? {
            txHash: game.commitmentTxHash,
            blockHeight: game.commitmentBlock || 0,
            blockTimestamp: game.commitmentTimestamp || game.createdAt,
            explorerUrl: getExplorerUrl(game.commitmentTxHash)
          }
        : undefined

      const revealState = await resolveVerificationSeed(
        game.fairnessSeedId,
        game.serverSeed,
        game.fairnessMode
      )
      const verificationStatus = isCompleted ? revealState.verificationStatus : 'pending_reveal'
      const canVerify = isCompleted && verificationStatus === 'ready'

      const verificationData: GameVerificationData = {
        gameId: game.id,
        serverSeed: canVerify
          ? (revealState.serverSeed || '[Unavailable]')
          : (isCompleted ? '[Hidden until seed rotation]' : '[Hidden until game completes]'),
        serverSeedHash: game.serverSeedHash,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        fairnessVersion: normalizeFairnessVersion(game.fairnessVersion),
        mode: revealState.mode,
        verificationStatus,
        commitment,
        gameType: 'video_poker',
        outcome: game.handRank || undefined,
        payout: game.payout || undefined,
        createdAt: game.createdAt,
        completedAt: game.completedAt || undefined
      }

      return NextResponse.json({
        data: verificationData,
        canVerify,
        isOwner
      })
    }

    const game = await prisma.blackjackGame.findUnique({
      where: { id: gameId }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const isOwner = !!sessionId && game.sessionId === sessionId
    const isCompleted = game.status === 'completed'

    if (!isOwner && !isCompleted) {
      return NextResponse.json({
        error: 'Cannot verify active game. Wait for game to complete.'
      }, { status: 403 })
    }

    const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
      ? {
          txHash: game.commitmentTxHash,
          blockHeight: game.commitmentBlock || 0,
          blockTimestamp: game.commitmentTimestamp || game.createdAt,
          explorerUrl: getExplorerUrl(game.commitmentTxHash)
        }
      : undefined

    const revealState = await resolveVerificationSeed(
      game.fairnessSeedId,
      game.serverSeed,
      game.fairnessMode
    )
    const verificationStatus = isCompleted ? revealState.verificationStatus : 'pending_reveal'
    const canVerify = isCompleted && verificationStatus === 'ready'

    const verificationData: GameVerificationData = {
      gameId: game.id,
      serverSeed: canVerify
        ? (revealState.serverSeed || '[Unavailable]')
        : (isCompleted ? '[Hidden until seed rotation]' : '[Hidden until game completes]'),
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      fairnessVersion: normalizeFairnessVersion(game.fairnessVersion),
      mode: revealState.mode,
      verificationStatus,
      commitment,
      gameType: 'blackjack',
      outcome: game.outcome || undefined,
      payout: game.payout || undefined,
      createdAt: game.createdAt,
      completedAt: game.completedAt || undefined
    }

    return NextResponse.json({
      data: verificationData,
      canVerify,
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
    const parsed = parseWithSchema(verifyPostSchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const payload = parsed.data
    const gameType = payload.gameType ?? 'blackjack'

    if ('gameId' in payload) {
      return verifyGameById(payload.gameId, gameType)
    }

    return verifyManual(
      payload.serverSeed,
      payload.serverSeedHash,
      payload.clientSeed,
      payload.nonce,
      gameType,
      payload.txHash,
      payload.fairnessVersion
    )
  } catch (error) {
    console.error('Verification error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

/**
 * Verify a game by its database ID
 */
async function verifyGameById(gameId: string, gameType: 'blackjack' | 'video_poker' = 'blackjack') {
  if (gameType === 'video_poker') {
    const game = await prisma.videoPokerGame.findUnique({
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

    const revealState = await resolveVerificationSeed(
      game.fairnessSeedId,
      game.serverSeed,
      game.fairnessMode
    )

    const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
      ? {
          txHash: game.commitmentTxHash,
          blockHeight: game.commitmentBlock || 0,
          blockTimestamp: game.commitmentTimestamp || game.createdAt,
          explorerUrl: getExplorerUrl(game.commitmentTxHash)
        }
      : undefined

    const resolvedServerSeed = revealState.serverSeed
    if (revealState.verificationStatus === 'pending_reveal' || !resolvedServerSeed) {
      const pendingData: GameVerificationData = {
        gameId: game.id,
        serverSeed: '[Hidden until seed rotation]',
        serverSeedHash: game.serverSeedHash,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        fairnessVersion: normalizeFairnessVersion(game.fairnessVersion),
        mode: revealState.mode,
        verificationStatus: 'pending_reveal',
        commitment,
        gameType: 'video_poker',
        outcome: game.handRank || undefined,
        payout: game.payout || undefined,
        createdAt: game.createdAt,
        completedAt: game.completedAt || undefined,
      }
      return NextResponse.json(buildPendingRevealResponse(pendingData))
    }

    const errors: string[] = []
    const steps: VerificationSteps = {
      hashMatches: false,
      onChainConfirmed: false,
      timestampValid: false,
      outcomeValid: false
    }

    const computedHash = await hashServerSeed(resolvedServerSeed)
    steps.hashMatches = computedHash === game.serverSeedHash
    if (!steps.hashMatches) {
      errors.push('Server seed hash does not match. The game may have been manipulated.')
    }

    if (game.commitmentTxHash) {
      const commitmentResult = await verifyCommitment(
        game.commitmentTxHash,
        game.serverSeedHash
      )
      steps.onChainConfirmed = commitmentResult.valid

      if (!commitmentResult.valid) {
        errors.push(`Blockchain verification failed: ${commitmentResult.error}`)
      }

      if (commitmentResult.valid && game.commitmentTimestamp) {
        const commitmentTime = new Date(game.commitmentTimestamp).getTime()
        const gameStartTime = new Date(game.createdAt).getTime()
        steps.timestampValid = commitmentTime <= gameStartTime
        if (!steps.timestampValid) {
          errors.push('Commitment timestamp is after game start. This should not happen.')
        }
      }
    } else {
      errors.push('This game does not have a blockchain commitment (pre-blockchain feature).')
    }

    const fairnessVersion = normalizeFairnessVersion(game.fairnessVersion)
    const replayResult = await verifyGame(
      resolvedServerSeed,
      game.serverSeedHash,
      game.clientSeed,
      game.nonce,
      52,
      fairnessVersion
    )
    steps.outcomeValid = replayResult.valid
    if (!replayResult.valid) {
      errors.push(replayResult.message)
    }

    let replayData: ReturnType<typeof replayVideoPokerGame> | undefined
    try {
      const parsedHistory = JSON.parse(game.actionHistory || '[]')
      const heldIndices = Array.isArray(parsedHistory)
        ? parsedHistory.filter((v) => Number.isInteger(v) && v >= 0 && v <= 4)
        : []

      replayData = replayVideoPokerGame({
        serverSeed: resolvedServerSeed,
        serverSeedHash: game.serverSeedHash,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        baseBet: game.baseBet,
        betMultiplier: game.betMultiplier,
        variant: game.variant as VideoPokerVariant,
        heldIndices,
        fairnessVersion,
      })

      if (!replayData.valid) {
        steps.outcomeValid = false
        errors.push('Replay failed: server seed does not match committed hash.')
      }

      const storedPayout = game.payout ?? 0
      if (Math.abs(replayData.payout - storedPayout) > 0.000001) {
        steps.outcomeValid = false
        errors.push(`Payout mismatch: replayed ${replayData.payout}, stored ${storedPayout}`)
      }

      const storedRank = game.handRank ?? null
      if (replayData.handRank !== storedRank) {
        steps.outcomeValid = false
        errors.push(`Hand rank mismatch: replayed ${replayData.handRank}, stored ${storedRank}`)
      }
    } catch (replayError) {
      steps.outcomeValid = false
      errors.push(
        `Game replay failed: ${replayError instanceof Error ? replayError.message : 'Unknown error'}`
      )
    }

    const result: FullVerificationResult = {
      valid: steps.hashMatches && steps.outcomeValid && (steps.onChainConfirmed || !game.commitmentTxHash),
      data: {
        gameId: game.id,
        serverSeed: resolvedServerSeed,
        serverSeedHash: game.serverSeedHash,
        clientSeed: game.clientSeed,
        nonce: game.nonce,
        fairnessVersion,
        mode: revealState.mode,
        verificationStatus: 'ready',
        commitment,
        gameType: 'video_poker',
        outcome: game.handRank || undefined,
        payout: game.payout || undefined,
        createdAt: game.createdAt,
        completedAt: game.completedAt || undefined
      },
      steps,
      errors
    }

    return NextResponse.json({
      ...result,
      replay: replayData ? {
        initialHand: replayData.initialHand,
        finalHand: replayData.finalHand,
        replayedHandRank: replayData.handRank,
        replayedPayout: replayData.payout
      } : undefined
    })
  }

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

  const revealState = await resolveVerificationSeed(
    game.fairnessSeedId,
    game.serverSeed,
    game.fairnessMode
  )

  const commitment: BlockchainCommitment | undefined = game.commitmentTxHash
    ? {
        txHash: game.commitmentTxHash,
        blockHeight: game.commitmentBlock || 0,
        blockTimestamp: game.commitmentTimestamp || game.createdAt,
        explorerUrl: getExplorerUrl(game.commitmentTxHash)
      }
    : undefined

  const resolvedServerSeed = revealState.serverSeed
  if (revealState.verificationStatus === 'pending_reveal' || !resolvedServerSeed) {
    const pendingData: GameVerificationData = {
      gameId: game.id,
      serverSeed: '[Hidden until seed rotation]',
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      fairnessVersion: normalizeFairnessVersion(game.fairnessVersion),
      mode: revealState.mode,
      verificationStatus: 'pending_reveal',
      commitment,
      gameType: 'blackjack',
      outcome: game.outcome || undefined,
      payout: game.payout || undefined,
      createdAt: game.createdAt,
      completedAt: game.completedAt || undefined,
    }
    return NextResponse.json(buildPendingRevealResponse(pendingData))
  }

  const errors: string[] = []
  const steps: VerificationSteps = {
    hashMatches: false,
    onChainConfirmed: false,
    timestampValid: false,
    outcomeValid: false
  }

  const computedHash = await hashServerSeed(resolvedServerSeed)
  steps.hashMatches = computedHash === game.serverSeedHash

  if (!steps.hashMatches) {
    errors.push('Server seed hash does not match. The game may have been manipulated.')
  }

  if (game.commitmentTxHash) {
    const commitmentResult = await verifyCommitment(
      game.commitmentTxHash,
      game.serverSeedHash
    )
    steps.onChainConfirmed = commitmentResult.valid

    if (!commitmentResult.valid) {
      errors.push(`Blockchain verification failed: ${commitmentResult.error}`)
    }

    if (commitmentResult.valid && game.commitmentTimestamp) {
      const commitmentTime = new Date(game.commitmentTimestamp).getTime()
      const gameStartTime = new Date(game.createdAt).getTime()
      steps.timestampValid = commitmentTime <= gameStartTime

      if (!steps.timestampValid) {
        errors.push('Commitment timestamp is after game start. This should not happen.')
      }
    }
  } else {
    errors.push('This game does not have a blockchain commitment (pre-blockchain feature).')
  }

  const deckSize = 312
  const fairnessVersion = normalizeFairnessVersion(game.fairnessVersion)
  const replayResult = await verifyGame(
    resolvedServerSeed,
    game.serverSeedHash,
    game.clientSeed,
    game.nonce,
    deckSize,
    fairnessVersion
  )
  steps.outcomeValid = replayResult.valid

  if (!replayResult.valid) {
    errors.push(replayResult.message)
  }

  let replayData: ReturnType<typeof replayGame> | undefined
  const actionHistory: BlackjackAction[] = JSON.parse(game.actionHistory || '[]')
  try {
    replayData = replayGame({
      serverSeed: resolvedServerSeed,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      mainBet: game.mainBet,
      perfectPairsBet: game.perfectPairsBet,
      insuranceBet: game.insuranceBet,
      actionHistory,
      fairnessVersion,
    })

    const storedPayout = game.payout ?? 0
    if (Math.abs(replayData.payout - storedPayout) > 0.000001) {
      errors.push(
        `Payout mismatch: replayed ${replayData.payout}, stored ${storedPayout}`
      )
      steps.outcomeValid = false
    }
  } catch (replayError) {
    errors.push(
      `Game replay failed: ${replayError instanceof Error ? replayError.message : 'Unknown error'}`
    )
  }

  const result: FullVerificationResult = {
    valid: steps.hashMatches && steps.outcomeValid && (steps.onChainConfirmed || !game.commitmentTxHash),
    data: {
      gameId: game.id,
      serverSeed: resolvedServerSeed,
      serverSeedHash: game.serverSeedHash,
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      fairnessVersion,
      mode: revealState.mode,
      verificationStatus: 'ready',
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

  if (result.valid && game.commitmentTxHash && !game.verifiedOnChain) {
    await prisma.blackjackGame.update({
      where: { id: game.id },
      data: { verifiedOnChain: true }
    })
  }

  return NextResponse.json({
    ...result,
    replay: replayData ? {
      playerCards: replayData.playerCards,
      dealerCards: replayData.dealerCards,
      replayedOutcome: replayData.outcome,
      replayedPayout: replayData.payout
    } : undefined
  })
}

/**
 * Perform manual verification with user-provided data
 */
async function verifyManual(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number,
  gameType: 'blackjack' | 'video_poker',
  txHash?: string,
  fairnessVersionInput?: FairnessVersion
) {
  const errors: string[] = []
  const steps: VerificationSteps = {
    hashMatches: false,
    onChainConfirmed: false,
    timestampValid: false,
    outcomeValid: false
  }

  const fairnessVersion = normalizeFairnessVersion(fairnessVersionInput, HMAC_FAIRNESS_VERSION)

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
  const deckSize = gameType === 'video_poker' ? 52 : 312
  const replayResult = await verifyGame(
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    deckSize,
    fairnessVersion
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
      fairnessVersion,
      commitment: txHash ? {
        txHash,
        blockHeight: 0,
        blockTimestamp: new Date(),
        explorerUrl: getExplorerUrl(txHash)
      } : undefined,
      gameType,
      createdAt: new Date()
    },
    steps,
    errors
  }

  return NextResponse.json(result)
}
