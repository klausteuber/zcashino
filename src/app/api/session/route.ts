import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Demo mode: Generate a fake wallet address for testing
function generateDemoWallet(): string {
  const chars = 'abcdef0123456789'
  let result = 'demo_'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
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
      where: { walletAddress: address }
    })

    if (!session) {
      // Create new session with demo balance
      session = await prisma.session.create({
        data: {
          walletAddress: address,
          balance: 10, // 10 ZEC demo balance
          totalDeposited: 10, // Record as deposited
        }
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
    })
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    )
  }
}

// POST /api/session - Update session settings (limits, etc.)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, depositLimit, lossLimit, sessionLimit, excludeDuration } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // Handle limit changes (can decrease immediately, increase requires 24h)
    // For MVP, we'll allow immediate changes
    if (depositLimit !== undefined) updateData.depositLimit = depositLimit
    if (lossLimit !== undefined) updateData.lossLimit = lossLimit
    if (sessionLimit !== undefined) updateData.sessionLimit = sessionLimit

    // Handle self-exclusion
    if (excludeDuration) {
      const excludeUntil = new Date()
      switch (excludeDuration) {
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

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: updateData
    })

    return NextResponse.json({
      id: session.id,
      balance: session.balance,
      depositLimit: session.depositLimit,
      lossLimit: session.lossLimit,
      sessionLimit: session.sessionLimit,
      excludedUntil: session.excludedUntil,
    })
  } catch (error) {
    console.error('Session update error:', error)
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    )
  }
}
