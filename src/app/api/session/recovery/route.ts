import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { isKillSwitchActive } from '@/lib/kill-switch'
import { requirePlayerSession, setPlayerSessionCookie } from '@/lib/auth/player-session'
import { generateRecoveryKey, hashRecoveryKey } from '@/lib/auth/session-recovery'
import { parseWithSchema, sessionRecoveryBodySchema } from '@/lib/validation/api-schemas'
import { roundZec } from '@/lib/wallet'
import { getProvablyFairMode, LEGACY_PER_GAME_MODE } from '@/lib/provably-fair/mode'
import { getPublicFairnessStateIfExists } from '@/lib/provably-fair/session-fairness'

type SessionDepositWallet = {
  transparentAddr: string
  unifiedAddr: string | null
} | null

type SessionRecoveryCredential = {
  lastUsedAt: Date | string | null
} | null

function isDemoSession(walletAddress: string): boolean {
  return walletAddress.startsWith('demo_')
}

function getPreferredDepositAddress(wallet: SessionDepositWallet) {
  const depositAddress = wallet?.unifiedAddr ?? wallet?.transparentAddr ?? null
  const depositAddressType = wallet?.unifiedAddr ? 'unified' : wallet ? 'transparent' : null
  const transparentAddress = wallet?.transparentAddr ?? null
  return { depositAddress, depositAddressType, transparentAddress }
}

async function createSessionResponse(session: {
  id: string
  walletAddress: string
  playerAuthVersion: number
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
  recoveryCredential?: SessionRecoveryCredential
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
      const existing = await getPublicFairnessStateIfExists(session.id)
      if (existing) {
        fairness = existing
      } else {
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
    } catch (error) {
      console.error('[SessionRecoveryAPI] Failed to load session fairness state:', error)
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
    isDemo: false,
    maintenanceMode: isKillSwitchActive(),
    recovery: {
      enabled: !!session.recoveryCredential,
      lastUsedAt: session.recoveryCredential?.lastUsedAt ?? null,
    },
    fairness,
  })

  setPlayerSessionCookie(response, session.id, session.walletAddress, session.playerAuthVersion)
  return response
}

function invalidRecoveryResponse() {
  return NextResponse.json(
    { error: 'Recovery key invalid or expired.' },
    { status: 401 }
  )
}

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'session-create')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = parseWithSchema(sessionRecoveryBodySchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    switch (parsed.data.action) {
      case 'create':
        return handleCreateRecoveryKey(request)
      case 'regenerate':
        return handleRegenerateRecoveryKey(request)
      case 'restore':
        return handleRestoreRecoveryKey(parsed.data.recoveryKey)
      default:
        return NextResponse.json({ error: 'Unsupported recovery action.' }, { status: 400 })
    }
  } catch (error) {
    console.error('[SessionRecoveryAPI] Request failed:', error)
    return NextResponse.json(
      { error: 'Failed to process session recovery request.' },
      { status: 500 }
    )
  }
}

async function getOwnedRealMoneySession(request: NextRequest) {
  const playerSession = await requirePlayerSession(request)
  if (!playerSession.ok) {
    return { ok: false as const, response: playerSession.response }
  }

  const session = await prisma.session.findUnique({
    where: { id: playerSession.session.sessionId },
    include: {
      wallet: true,
      recoveryCredential: true,
    },
  })

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Session not found.' }, { status: 404 }),
    }
  }

  if (isDemoSession(session.walletAddress)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Recovery keys are only available for real-money sessions.' },
        { status: 400 }
      ),
    }
  }

  return { ok: true as const, session }
}

async function handleCreateRecoveryKey(request: NextRequest) {
  const result = await getOwnedRealMoneySession(request)
  if (!result.ok) return result.response

  if (result.session.recoveryCredential) {
    return NextResponse.json(
      { error: 'Recovery key already exists. Regenerate it to replace the current key.' },
      { status: 409 }
    )
  }

  const recoveryKey = generateRecoveryKey()
  const keyHash = hashRecoveryKey(recoveryKey)
  const created = await prisma.sessionRecoveryCredential.create({
    data: {
      sessionId: result.session.id,
      keyHash,
    },
  })

  return NextResponse.json({
    success: true,
    recoveryKey,
    recovery: {
      enabled: true,
      lastUsedAt: created.lastUsedAt,
    },
  })
}

async function handleRegenerateRecoveryKey(request: NextRequest) {
  const result = await getOwnedRealMoneySession(request)
  if (!result.ok) return result.response

  const recoveryKey = generateRecoveryKey()
  const keyHash = hashRecoveryKey(recoveryKey)
  const now = new Date()

  const credential = result.session.recoveryCredential
    ? await prisma.sessionRecoveryCredential.update({
        where: { sessionId: result.session.id },
        data: {
          keyHash,
          rotatedAt: now,
          lastUsedAt: null,
        },
      })
    : await prisma.sessionRecoveryCredential.create({
        data: {
          sessionId: result.session.id,
          keyHash,
          rotatedAt: now,
        },
      })

  return NextResponse.json({
    success: true,
    recoveryKey,
    recovery: {
      enabled: true,
      lastUsedAt: credential.lastUsedAt,
    },
  })
}

async function handleRestoreRecoveryKey(recoveryKey: string) {
  const keyHash = hashRecoveryKey(recoveryKey)

  const restoredSession = await prisma.$transaction(async (tx) => {
    const credential = await tx.sessionRecoveryCredential.findUnique({
      where: { keyHash },
      include: {
        session: {
          include: {
            wallet: true,
            recoveryCredential: true,
          },
        },
      },
    })

    if (!credential || isDemoSession(credential.session.walletAddress)) {
      return null
    }

    const now = new Date()
    await tx.session.update({
      where: { id: credential.sessionId },
      data: {
        playerAuthVersion: { increment: 1 },
        lastActiveAt: now,
      },
    })

    await tx.sessionRecoveryCredential.update({
      where: { sessionId: credential.sessionId },
      data: { lastUsedAt: now },
    })

    return tx.session.findUnique({
      where: { id: credential.sessionId },
      include: {
        wallet: true,
        recoveryCredential: true,
      },
    })
  })

  if (!restoredSession) {
    return invalidRecoveryResponse()
  }

  return createSessionResponse(restoredSession)
}
