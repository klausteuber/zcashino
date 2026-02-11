import prisma from '@/lib/db'
import { DEFAULT_NETWORK, generateTransparentAddress, checkNodeStatus } from '@/lib/wallet'

/**
 * Create a deposit wallet for a session.
 * Generates a transparent address via zcashd RPC (or demo placeholder on testnet).
 * On mainnet, refuses to generate fake addresses (funds would be permanently lost).
 */
export async function createDepositWalletForSession(sessionId: string) {
  const network = DEFAULT_NETWORK

  let transparentAddr: string

  // Check if we have RPC connection
  const nodeStatus = await checkNodeStatus(network)

  if (nodeStatus.connected) {
    // Generate real address via RPC
    transparentAddr = await generateTransparentAddress(network)
  } else if (network === 'mainnet') {
    // SAFETY: Never generate fake addresses on mainnet — funds sent
    // to a fake address are permanently lost (no private key).
    throw new Error('Cannot generate deposit address: Zcash node not connected')
  } else {
    // Generate demo placeholder address (testnet only)
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    transparentAddr = `tmDemo${timestamp}${random}`.substring(0, 35)
  }

  // Get next address index
  const lastWallet = await prisma.depositWallet.findFirst({
    orderBy: { addressIndex: 'desc' },
  })
  const addressIndex = (lastWallet?.addressIndex ?? -1) + 1

  // Create wallet record
  const wallet = await prisma.depositWallet.create({
    data: {
      sessionId,
      transparentAddr,
      network,
      addressIndex,
    },
  })

  return wallet
}
