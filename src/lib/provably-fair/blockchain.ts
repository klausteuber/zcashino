/**
 * Blockchain Commitment Service
 *
 * Handles on-chain commitment of server seed hashes for provably fair gaming.
 * Uses Zcash shielded transactions with memo fields to store commitments.
 *
 * Flow:
 * 1. Generate server seed and hash
 * 2. Send commitment tx (hash in memo) to house address
 * 3. Wait for confirmation
 * 4. Return txHash + blockHeight as proof
 */

import type { ZcashNetwork } from '@/types'
import { sendZec, waitForOperation, getTransaction, checkNodeStatus } from '@/lib/wallet/rpc'
import { DEFAULT_NETWORK, NETWORK_CONFIG } from '@/lib/wallet'

// Configuration
const COMMITMENT_AMOUNT = 0.00001 // Dust amount for commitment tx (10 zatoshi)
const COMMITMENT_MEMO_PREFIX = 'ZCASHINO_COMMIT_V1:' // Prefix for memo parsing

// House wallet addresses (would be from env in production)
const HOUSE_ADDRESSES = {
  mainnet: process.env.HOUSE_ZADDR_MAINNET || '',
  testnet: process.env.HOUSE_ZADDR_TESTNET || 'ztestsapling1...' // Placeholder
}

export interface CommitmentResult {
  success: boolean
  txHash?: string
  blockHeight?: number
  blockTimestamp?: Date
  error?: string
}

export interface CommitmentVerification {
  valid: boolean
  hash?: string
  blockHeight?: number
  blockTimestamp?: Date
  error?: string
}

/**
 * Commit a server seed hash to the Zcash blockchain
 *
 * Creates a shielded transaction with the hash stored in the encrypted memo field.
 * The tx is sent from house wallet to itself (funds cycle back, only fee consumed).
 *
 * SAFETY: On mainnet, mock commitments are NEVER created. If the node is
 * unavailable, this returns { success: false } so games cannot start without
 * real on-chain provably fair proofs.
 */
export async function commitServerSeedHash(
  serverSeedHash: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<CommitmentResult> {
  const isMainnet = network === 'mainnet'

  try {
    // In demo mode, skip RPC entirely and use mock commitments immediately
    // SAFETY: Demo mode is blocked on mainnet by startup validator
    if (process.env.DEMO_MODE === 'true') {
      if (isMainnet) {
        return { success: false, error: 'DEMO_MODE is forbidden on mainnet' }
      }
      console.log('[Blockchain] DEMO_MODE enabled, using mock commitment')
      return createMockCommitment(serverSeedHash)
    }

    // Check node status first
    const nodeStatus = await checkNodeStatus(network)
    if (!nodeStatus.connected) {
      if (isMainnet) {
        console.error('[Blockchain] MAINNET: Node not connected — refusing to create mock commitment')
        return { success: false, error: 'Zcash node not connected. Cannot create on-chain commitment.' }
      }
      console.log('[Blockchain] Node not connected, using mock commitment for development')
      return createMockCommitment(serverSeedHash)
    }

    const houseAddress = HOUSE_ADDRESSES[network]
    if (!houseAddress || houseAddress === 'ztestsapling1...') {
      if (isMainnet) {
        console.error('[Blockchain] MAINNET: House address not configured — refusing to create mock commitment')
        return { success: false, error: 'House wallet address not configured.' }
      }
      console.log('[Blockchain] House address not configured, using mock commitment')
      return createMockCommitment(serverSeedHash)
    }

    // If node is connected but not synced, fail on mainnet
    if (!nodeStatus.synced) {
      if (isMainnet) {
        console.error(`[Blockchain] MAINNET: Node syncing (block ${nodeStatus.blockHeight}) — refusing mock commitment`)
        return { success: false, error: 'Zcash node is still syncing. Cannot create on-chain commitment.' }
      }
      console.log(`[Blockchain] Node syncing (block ${nodeStatus.blockHeight}), using mock commitment`)
      return createMockCommitment(serverSeedHash)
    }

    // Create memo with commitment
    const memo = `${COMMITMENT_MEMO_PREFIX}${serverSeedHash}`

    // Send commitment transaction (to self)
    // Use minconf=1 to avoid Sapling witness failures on unconfirmed/internal change notes.
    const { operationId } = await sendZec(
      houseAddress,
      houseAddress,
      COMMITMENT_AMOUNT,
      memo,
      network,
      1
    )

    // Wait for operation to complete
    const result = await waitForOperation(operationId, 120000, network)

    if (!result.success || !result.txid) {
      return {
        success: false,
        error: result.error || 'Transaction failed'
      }
    }

    // Get transaction details for block info
    const txDetails = await getTransaction(result.txid, network)

    return {
      success: true,
      txHash: result.txid,
      blockHeight: txDetails ? nodeStatus.blockHeight : undefined,
      blockTimestamp: txDetails?.blocktime ? new Date(txDetails.blocktime * 1000) : new Date()
    }
  } catch (error) {
    console.error('Commitment failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Verify that a commitment exists on-chain and matches expected hash
 */
export async function verifyCommitment(
  txHash: string,
  expectedHash: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<CommitmentVerification> {
  try {
    // Check if this is a mock commitment (demo mode)
    if (txHash.startsWith('mock_')) {
      return verifyMockCommitment(txHash, expectedHash)
    }

    const nodeStatus = await checkNodeStatus(network)
    if (!nodeStatus.connected) {
      return {
        valid: false,
        error: 'Cannot verify: Zcash node not connected'
      }
    }

    // Get transaction from blockchain
    const txDetails = await getTransaction(txHash, network)
    if (!txDetails) {
      return {
        valid: false,
        error: 'Transaction not found on blockchain'
      }
    }

    // For shielded txs, we can't read the memo without the viewing key
    // But we can verify the tx exists and was confirmed before the game
    // The hash verification happens locally with the revealed server seed

    return {
      valid: true,
      blockHeight: txDetails.confirmations > 0 ? nodeStatus.blockHeight - txDetails.confirmations + 1 : undefined,
      blockTimestamp: txDetails.blocktime ? new Date(txDetails.blocktime * 1000) : undefined
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed'
    }
  }
}

/**
 * Get the block explorer URL for a transaction
 */
export function getExplorerUrl(txHash: string, network: ZcashNetwork = DEFAULT_NETWORK): string {
  const config = NETWORK_CONFIG[network]
  return `${config.explorerUrl}/tx/${txHash}`
}

/**
 * Check if blockchain commitments are available (node connected)
 */
export async function isBlockchainAvailable(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<boolean> {
  // Always available in demo mode (uses mock)
  if (process.env.DEMO_MODE === 'true') {
    return true
  }

  try {
    const status = await checkNodeStatus(network)
    return status.connected && status.synced
  } catch {
    return false
  }
}

// ============================================================================
// Mock Commitment System (for demo/development)
// ============================================================================

// In-memory store for mock commitments (would not be used in production)
const mockCommitments = new Map<string, { hash: string; timestamp: Date; blockHeight: number }>()
let mockBlockHeight = 2500000 // Starting mock block height

/**
 * Create a mock commitment for demo/development mode
 */
function createMockCommitment(serverSeedHash: string): CommitmentResult {
  const mockTxHash = `mock_${Date.now()}_${serverSeedHash.substring(0, 8)}`
  const timestamp = new Date()
  const blockHeight = mockBlockHeight++

  // Store for later verification
  mockCommitments.set(mockTxHash, {
    hash: serverSeedHash,
    timestamp,
    blockHeight
  })

  console.log(`[DEMO] Created mock commitment: ${mockTxHash} for hash ${serverSeedHash.substring(0, 16)}...`)

  return {
    success: true,
    txHash: mockTxHash,
    blockHeight,
    blockTimestamp: timestamp
  }
}

/**
 * Verify a mock commitment
 */
function verifyMockCommitment(txHash: string, expectedHash: string): CommitmentVerification {
  const commitment = mockCommitments.get(txHash)

  if (!commitment) {
    return {
      valid: false,
      error: 'Mock commitment not found (may have expired or server restarted)'
    }
  }

  if (commitment.hash !== expectedHash) {
    return {
      valid: false,
      error: 'Hash mismatch - commitment does not match expected hash'
    }
  }

  return {
    valid: true,
    hash: commitment.hash,
    blockHeight: commitment.blockHeight,
    blockTimestamp: commitment.timestamp
  }
}

/**
 * Get mock explorer URL (links to explanation page)
 */
export function getMockExplorerUrl(txHash: string): string {
  return `/verify?mock=true&tx=${txHash}`
}

// ============================================================================
// Batch Commitment (future optimization)
// ============================================================================

/**
 * Create multiple commitments in a single transaction
 * Uses Merkle tree to commit many hashes in one tx
 *
 * @future - Not implemented in MVP
 */
export async function batchCommitHashes(
  _hashes: string[],
  _network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{ merkleRoot: string; txHash: string; proofs: Map<string, string[]> }> {
  throw new Error('Batch commitments not yet implemented')
}
