import prisma from '@/lib/db'
import { DEFAULT_NETWORK, generateDepositAddressSet, checkNodeStatus } from '@/lib/wallet'

/**
 * Create a deposit wallet for a session.
 * Generates a unified deposit address plus transparent companion receiver via zcashd RPC
 * (or demo placeholders on testnet).
 * On mainnet, refuses to generate fake addresses (funds would be permanently lost).
 */
export async function createDepositWalletForSession(sessionId: string) {
  const network = DEFAULT_NETWORK

  let unifiedAddr: string | null
  let transparentAddr: string
  let accountIndex = 0

  // Check if we have RPC connection — retry once after 2s if the first check fails
  let nodeStatus = await checkNodeStatus(network)
  if (!nodeStatus.connected) {
    console.warn('[SessionWallet] Node unreachable, retrying in 2s...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    nodeStatus = await checkNodeStatus(network)
  }

  if (nodeStatus.connected) {
    // Generate both unified (user-facing) and transparent companion address
    const addressSet = await generateDepositAddressSet(network)
    unifiedAddr = addressSet.unifiedAddr
    transparentAddr = addressSet.transparentAddr
    accountIndex = addressSet.accountIndex
  } else if (network === 'mainnet') {
    // SAFETY: Never generate fake addresses on mainnet — funds sent
    // to a fake address are permanently lost (no private key).
    throw new Error('Cannot generate deposit address: Zcash node not connected')
  } else {
    // Generate demo placeholder addresses (testnet only)
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    const seed = `${timestamp}${random}`
    transparentAddr = `tm${seed.padEnd(33, 'x').slice(0, 33)}`
    unifiedAddr = `utest${seed}${seed}${seed}`.slice(0, 60)
  }

  // Atomically get next address index and create wallet in a transaction
  // to prevent race conditions from concurrent session creation
  const wallet = await prisma.$transaction(async (tx) => {
    const lastWallet = await tx.depositWallet.findFirst({
      orderBy: { addressIndex: 'desc' },
    })
    const addressIndex = (lastWallet?.addressIndex ?? -1) + 1

    return tx.depositWallet.create({
      data: {
        sessionId,
        unifiedAddr,
        transparentAddr,
        network,
        accountIndex,
        addressIndex,
      },
    })
  })

  return wallet
}
