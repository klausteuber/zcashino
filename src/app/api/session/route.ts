import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { validateAddress, DEFAULT_NETWORK, roundZec } from '@/lib/wallet'
import { createDepositWalletForSession } from '@/lib/wallet/session-wallet'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { requirePlayerSession, setPlayerSessionCookie } from '@/lib/auth/player-session'
import { parseWithSchema, sessionBodySchema } from '@/lib/validation/api-schemas'
import { getProvablyFairMode, LEGACY_PER_GAME_MODE } from '@/lib/provably-fair/mode'
import { getPublicFairnessState } from '@/lib/provably-fair/session-fairness'
import { getAdminSettings } from '@/lib/admin/runtime-settings'

// Demo mode: Generate a fake wallet address for testing
function generateDemoWallet(): string {
  const chars = 'abcdef0123456789'
  let result = 'demo_'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Check if this is a demo session
function isDemoSession(walletAddress: string): boolean {
  return walletAddress.startsWith('demo_')
}

type SessionDepositWallet = {
  transparentAddr: string
  unifiedAddr: string | null
} | null

function getPreferredDepositAddress(wallet: SessionDepositWallet) {
  const depositAddress = wallet?.unifiedAddr ?? wallet?.transparentAddr ?? null
  const depositAddressType = wallet?.unifiedAddr ? 'unified' : wallet ? 'transparent' : null
  const transparentAddress = wallet?.transparentAddr ?? null
  return { depositAddress, depositAddressType, transparentAddress }
}

async function createSessionResponse(session: {
  id: string
  walletAddress: string
  balance: number
  totalWagered: number
  totalWon: number
  depositLimit: number | null
  lossLimit: number | null
  sessionLimit: number | null
  isAuthenticated: boolean
  withdrawalAddress: string | null
  authTxHash: string | null
  wallet: SessionDepositWallet
}) {
  const { depositAddress, depositAddressType, transparentAddress } = getPreferredDepositAddress(session.wallet)
  const fairnessMode = getProvablyFairMode()

  let fairness: {
    mode: string
    serverSeedHash: string | null
    commitmentTxHash: string | null
    commitmentBlock: number | null
    commitmentTimestamp: string | Date | null
    clientSeed: string | null
    nextNonce: number | null
    canEditClientSeed: boolean
    fairnessVersion?: string
  } = {
    mode: LEGACY_PER_GAME_MODE,
    serverSeedHash: null,
    commitmentTxHash: null,
    commitmentBlock: null,
    commitmentTimestamp: null,
    clientSeed: null,
    nextNonce: null,
    canEditClientSeed: false,
  }

  if (fairnessMode === 'session_nonce_v1') {
    try {
      fairness = await getPublicFairnessState(session.id)
    } catch (error) {
      console.error('[SessionAPI] Failed to load session fairness state:', error)
      fairness = {
        mode: fairnessMode,
        serverSeedHash: null,
        commitmentTxHash: null,
        commitmentBlock: null,
        commitmentTimestamp: null,
        clientSeed: null,
        nextNonce: null,
        canEditClientSeed: false,
      }
    }
  }

  const response = NextResponse.json({
    id: session.id,
    walletAddress: session.walletAddress,
    balance: roundZec(session.balance),
    totalWagered: roundZec(session.totalWagered),
    totalWon: roundZec(session.totalWon),
    depositLimit: session.depositLimit,
    lossLimit: session.lossLimit,
    sessionLimit: session.sessionLimit,
    isAuthenticated: session.isAuthenticated,
    withdrawalAddress: session.withdrawalAddress,
    authTxHash: session.authTxHash,
    depositAddress,
    depositAddressType,
    transparentAddress,
    isDemo: isDemoSession(session.walletAddress),
    maintenanceMode: isKillSwitchActive(),
    fairness,
  })

  setPlayerSessionCookie(response, session.id, session.walletAddress)
  return response
}

// GET /api/session - Get or create session
export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'session-create')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    // Try to restore session by ID first (returning user with localStorage)
    const requestedSessionId = request.nextUrl.searchParams.get('sessionId')
    // Also accept wallet address for direct lookups
    const walletAddress = request.headers.get('x-wallet-address') ||
      request.nextUrl.searchParams.get('wallet')

    let session = null

    // Priority 1: Restore by session ID (most common for returning users)
    if (requestedSessionId) {
      session = await prisma.session.findUnique({
        where: { id: requestedSessionId },
        include: { wallet: true }
      })
    }

    // Priority 2: Find by wallet address
    if (!session && walletAddress) {
      session = await prisma.session.findUnique({
        where: { walletAddress },
        include: { wallet: true }
      })
    }

    // Priority 3: Create new demo session
    const address = walletAddress || generateDemoWallet()

    if (!session) {
      const settings = await getAdminSettings()
      // Create new session
      // Demo sessions get instant balance, real sessions need to deposit
      const isDemo = isDemoSession(address)
      session = await prisma.session.create({
        data: {
          walletAddress: address,
          balance: isDemo ? 10 : 0, // Demo gets 10 ZEC, real starts at 0
          totalDeposited: isDemo ? 10 : 0,
          isAuthenticated: isDemo, // Demo sessions are auto-authenticated
          // Defaults can be tightened by the player; admin can override later.
          depositLimit: isDemo ? null : settings.rg.defaultDepositLimit,
          lossLimit: isDemo ? null : settings.rg.defaultLossLimit,
          sessionLimit: isDemo ? null : settings.rg.defaultSessionLimit,
        },
        include: { wallet: true }
      })

      // For real sessions, create deposit wallet immediately so user can deposit right away
      if (!isDemo && !session.wallet) {
        try {
          const wallet = await createDepositWalletForSession(session.id)
          // Re-fetch to include the wallet relation
          session = await prisma.session.findUnique({
            where: { id: session.id },
            include: { wallet: true }
          }) ?? session
          // If re-fetch failed, manually attach wallet for response
          if (!session.wallet && wallet) {
            (session as Record<string, unknown>).wallet = wallet
          }
        } catch (err) {
          console.error('[SessionAPI] Failed to create deposit wallet:', err)
          // Non-fatal: session still works, wallet can be created later
        }
      }
    }

    // Update last active timestamp
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() }
    })

    // Check if excluded
    if (session.excludedUntil && session.excludedUntil > new Date()) {
      return NextResponse.json({
        error: 'Self-excluded',
        excludedUntil: session.excludedUntil
      }, { status: 403 })
    }

    return await createSessionResponse(session)
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/session
 * Actions:
 * - Set withdrawal address (for new sessions)
 * - Update settings (limits, etc.)
 * - Request address change (triggers re-verification)
 */

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'session-create')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = parseWithSchema(sessionBodySchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const {
      action,
      sessionId,
      withdrawalAddress,
      depositLimit,
      lossLimit,
      sessionLimit,
      excludeDuration,
    } = parsed.data

    const playerSession = requirePlayerSession(request, sessionId)
    if (!playerSession.ok) {
      return playerSession.response
    }

    // Get current session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { wallet: true }
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Handle different actions
    switch (action) {
      case 'set-withdrawal-address':
        return handleSetWithdrawalAddress(session, withdrawalAddress)

      case 'change-withdrawal-address':
        return handleChangeWithdrawalAddress(session, withdrawalAddress)

      case 'update-limits':
        return handleUpdateLimits(session, {
          depositLimit,
          lossLimit,
          sessionLimit,
          excludeDuration
        })

      case 'reset-demo-balance':
        return handleResetDemoBalance(session)

      default:
        // Legacy behavior: update limits directly
        return handleUpdateLimits(session, {
          depositLimit,
          lossLimit,
          sessionLimit,
          excludeDuration
        })
    }
  } catch (error) {
    console.error('Session update error:', error)
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    )
  }
}

/**
 * Set withdrawal address for a new session
 * This is the first step in authentication - user provides their withdrawal address
 * Also creates a deposit wallet if one doesn't exist
 */
async function handleSetWithdrawalAddress(
  session: { id: string; withdrawalAddress: string | null; isAuthenticated: boolean; walletAddress: string; wallet: unknown | null },
  withdrawalAddress?: string
) {
  if (!withdrawalAddress || withdrawalAddress.trim().length === 0) {
    return NextResponse.json({
      error: 'Invalid request payload',
      details: { withdrawalAddress: ['Withdrawal address is required'] },
    }, { status: 400 })
  }

  // Don't allow changing if already authenticated (use change-withdrawal-address instead)
  if (session.isAuthenticated && session.withdrawalAddress) {
    return NextResponse.json({
      error: 'Session already authenticated. Use change-withdrawal-address to update.',
    }, { status: 400 })
  }

  // Validate the withdrawal address
  const validation = validateAddress(withdrawalAddress, DEFAULT_NETWORK)
  if (!validation.valid) {
    return NextResponse.json({
      error: `Invalid withdrawal address: ${validation.error}`,
    }, { status: 400 })
  }

  // Create deposit wallet if one doesn't exist
  let wallet = session.wallet as { transparentAddr: string; unifiedAddr: string | null } | null
  if (!wallet) {
    wallet = await createDepositWalletForSession(session.id)
  }

  // Update session with withdrawal address
  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: { withdrawalAddress },
    include: { wallet: true }
  })

  return NextResponse.json({
    success: true,
    id: updatedSession.id,
    withdrawalAddress: updatedSession.withdrawalAddress,
    depositAddress: wallet.unifiedAddr ?? wallet.transparentAddr,
    depositAddressType: wallet.unifiedAddr ? 'unified' : 'transparent',
    transparentAddress: wallet.transparentAddr,
    isAuthenticated: updatedSession.isAuthenticated,
    message: 'Withdrawal address set. Send ZEC to your deposit address to authenticate.',
  })
}

/**
 * Request a withdrawal address change (for authenticated sessions)
 * This requires re-verification via a new deposit
 */
async function handleChangeWithdrawalAddress(
  session: { id: string; isAuthenticated: boolean },
  newWithdrawalAddress?: string
) {
  if (!newWithdrawalAddress || newWithdrawalAddress.trim().length === 0) {
    return NextResponse.json({
      error: 'Invalid request payload',
      details: { withdrawalAddress: ['Withdrawal address is required'] },
    }, { status: 400 })
  }

  if (!session.isAuthenticated) {
    return NextResponse.json({
      error: 'Session not authenticated. Use set-withdrawal-address first.',
    }, { status: 400 })
  }

  // Validate the new withdrawal address
  const validation = validateAddress(newWithdrawalAddress, DEFAULT_NETWORK)
  if (!validation.valid) {
    return NextResponse.json({
      error: `Invalid withdrawal address: ${validation.error}`,
    }, { status: 400 })
  }

  // For address change, we need to create a new deposit address for re-verification
  // The user must send a deposit from their new address to prove ownership
  // Store the pending new address - it will be confirmed on next deposit

  // Update session with pending address change
  // Note: We store as withdrawalAddress but set isAuthenticated to false
  // This forces re-verification
  await prisma.session.update({
    where: { id: session.id },
    data: {
      withdrawalAddress: newWithdrawalAddress,
      isAuthenticated: false, // Require re-verification
      authTxHash: null,
      authConfirmedAt: null,
    },
  })

  return NextResponse.json({
    success: true,
    message: 'Address change requested. Send any deposit to re-verify ownership.',
    newWithdrawalAddress,
    requiresReVerification: true,
  })
}

/**
 * Update session limits (deposit, loss, session time)
 */
async function handleUpdateLimits(
  session: { id: string },
  limits: {
    depositLimit?: number
    lossLimit?: number
    sessionLimit?: number
    excludeDuration?: string
  }
) {
  const updateData: Record<string, unknown> = {}

  // Handle limit changes
  if (limits.depositLimit !== undefined) updateData.depositLimit = limits.depositLimit
  if (limits.lossLimit !== undefined) updateData.lossLimit = limits.lossLimit
  if (limits.sessionLimit !== undefined) updateData.sessionLimit = limits.sessionLimit

  // Handle self-exclusion
  if (limits.excludeDuration) {
    const excludeUntil = new Date()
    switch (limits.excludeDuration) {
      case '24h':
        excludeUntil.setHours(excludeUntil.getHours() + 24)
        break
      case '1w':
        excludeUntil.setDate(excludeUntil.getDate() + 7)
        break
      case '1m':
        excludeUntil.setMonth(excludeUntil.getMonth() + 1)
        break
      case '6m':
        excludeUntil.setMonth(excludeUntil.getMonth() + 6)
        break
      case '1y':
        excludeUntil.setFullYear(excludeUntil.getFullYear() + 1)
        break
      case 'permanent':
        excludeUntil.setFullYear(excludeUntil.getFullYear() + 100)
        break
    }
    updateData.excludedUntil = excludeUntil
  }

  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: updateData
  })

  return NextResponse.json({
    id: updatedSession.id,
    balance: updatedSession.balance,
    depositLimit: updatedSession.depositLimit,
    lossLimit: updatedSession.lossLimit,
    sessionLimit: updatedSession.sessionLimit,
    excludedUntil: updatedSession.excludedUntil,
  })
}

/**
 * Reset demo session balance back to 10 ZEC
 * Only works for demo sessions (wallet starts with 'demo_')
 */
async function handleResetDemoBalance(
  session: { id: string; walletAddress: string }
) {
  if (!isDemoSession(session.walletAddress)) {
    return NextResponse.json(
      { error: 'Only demo sessions can be reset' },
      { status: 400 }
    )
  }

  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: { balance: 10 }
  })

  return NextResponse.json({
    id: updatedSession.id,
    balance: roundZec(updatedSession.balance),
  })
}
