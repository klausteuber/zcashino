import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { validateAddress, DEFAULT_NETWORK } from '@/lib/wallet'

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

// GET /api/session - Get or create session
export async function GET(request: NextRequest) {
  try {
    // Get wallet address from header or query param
    const walletAddress = request.headers.get('x-wallet-address') ||
      request.nextUrl.searchParams.get('wallet')

    // If no wallet provided, create a demo session
    const address = walletAddress || generateDemoWallet()

    // Find or create session
    let session = await prisma.session.findUnique({
      where: { walletAddress: address },
      include: { wallet: true }
    })

    if (!session) {
      // Create new session
      // Demo sessions get instant balance, real sessions need to deposit
      const isDemo = isDemoSession(address)
      session = await prisma.session.create({
        data: {
          walletAddress: address,
          balance: isDemo ? 10 : 0, // Demo gets 10 ZEC, real starts at 0
          totalDeposited: isDemo ? 10 : 0,
          isAuthenticated: isDemo, // Demo sessions are auto-authenticated
        },
        include: { wallet: true }
      })
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

    return NextResponse.json({
      id: session.id,
      walletAddress: session.walletAddress,
      balance: session.balance,
      totalWagered: session.totalWagered,
      totalWon: session.totalWon,
      depositLimit: session.depositLimit,
      lossLimit: session.lossLimit,
      sessionLimit: session.sessionLimit,
      // Authentication status
      isAuthenticated: session.isAuthenticated,
      withdrawalAddress: session.withdrawalAddress,
      authTxHash: session.authTxHash,
      // Deposit address (if wallet exists)
      depositAddress: session.wallet?.transparentAddr,
      isDemo: isDemoSession(session.walletAddress),
    })
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
  try {
    const body = await request.json()
    const {
      action,
      sessionId,
      withdrawalAddress,
      depositLimit,
      lossLimit,
      sessionLimit,
      excludeDuration
    } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      )
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
 */
async function handleSetWithdrawalAddress(
  session: { id: string; withdrawalAddress: string | null; isAuthenticated: boolean; walletAddress: string },
  withdrawalAddress: string
) {
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
    depositAddress: updatedSession.wallet?.transparentAddr,
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
  newWithdrawalAddress: string
) {
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
