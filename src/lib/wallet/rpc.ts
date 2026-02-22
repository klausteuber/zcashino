/**
 * Zcash RPC Client
 *
 * Communicates with a Zcash node (zcashd) via JSON-RPC.
 * Used for:
 * - Address generation
 * - Balance queries
 * - Transaction creation and broadcasting
 * - Deposit monitoring
 */

import type { ZcashNetwork, WalletBalance } from '@/types'
import { NETWORK_CONFIG, DEFAULT_NETWORK } from './index'

// RPC configuration from environment
const RPC_USER = process.env.ZCASH_RPC_USER || 'zcashrpc'
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD || ''
export const DEFAULT_Z_SENDMANY_FEE = 0.0001
const ZIP317_MARGINAL_FEE_ZATS = 5000
const MAX_UNPAID_ACTION_RETRIES = 3

interface RpcResponse<T = unknown> {
  result: T
  error: {
    code: number
    message: string
  } | null
  id: string | number
}

interface ZcashTransaction {
  txid: string
  address?: string
  category: 'send' | 'receive'
  amount: number
  confirmations: number
  time: number
  blocktime?: number
  memo?: string
}

function normalizeZecAmount(amount: number): number {
  return Math.round(amount * 1e8) / 1e8
}

export function nextFeeForUnpaidActionError(currentFee: number, errorMessage: string): number | null {
  if (!errorMessage.toLowerCase().includes('tx unpaid action limit exceeded')) {
    return null
  }

  // Example:
  // "tx unpaid action limit exceeded: 2 action(s) exceeds limit of 0"
  const match = errorMessage.match(/tx unpaid action limit exceeded:\s*(\d+)\s*action\(s\)\s*exceeds limit of\s*(\d+)/i)

  const unpaidActions = match ? Number.parseInt(match[1], 10) : 1
  const limit = match ? Number.parseInt(match[2], 10) : 0
  const additionalPaidActions = Math.max(1, unpaidActions - limit)

  const currentFeeZats = Math.max(0, Math.round(currentFee * 1e8))
  const nextFeeZats = currentFeeZats + (additionalPaidActions * ZIP317_MARGINAL_FEE_ZATS)
  return nextFeeZats / 1e8
}

/**
 * Make an RPC call to the Zcash node
 */
async function rpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<T> {
  const config = NETWORK_CONFIG[network]

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: `cypherjester-${Date.now()}`,
    method,
    params,
  })

  const auth = Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64')

  try {
    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body,
      signal: AbortSignal.timeout(5000), // 5s timeout to fail fast when node is down
    })

    // zcashd returns HTTP 500 for JSON-RPC errors but the body still has structured error info
    // Always try to parse the JSON body first for better error messages
    const data = (await response.json()) as RpcResponse<T>

    if (data.error) {
      throw new Error(`RPC error ${data.error.code}: ${data.error.message}`)
    }

    if (!response.ok) {
      throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`)
    }

    return data.result
  } catch (error) {
    console.error(`RPC call failed: ${method}`, error)
    throw error
  }
}

/**
 * Check if the Zcash node is reachable and synced
 */
export async function checkNodeStatus(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  connected: boolean
  synced: boolean
  blockHeight: number
  error?: string
}> {
  try {
    const info = await rpcCall<{
      blocks: number
      headers: number
      verificationprogress: number
      initial_block_download_complete?: boolean
    }>('getblockchaininfo', [], network)

    // Prefer zcashd's IBD-complete signal for operational readiness.
    // Fall back to the legacy heuristic only if the field is unavailable.
    const synced = typeof info.initial_block_download_complete === 'boolean'
      ? info.initial_block_download_complete
      : info.verificationprogress > 0.9999

    return {
      connected: true,
      synced,
      blockHeight: info.blocks,
    }
  } catch (error) {
    return {
      connected: false,
      synced: false,
      blockHeight: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

interface RpcAccountResult {
  account: number
}

interface RpcUnifiedAddressResult {
  address: string
}

function extractAccountIndex(result: number | RpcAccountResult): number {
  if (typeof result === 'number') return result
  if (typeof result === 'object' && result !== null && typeof result.account === 'number') {
    return result.account
  }
  throw new Error('Invalid account response from z_getnewaccount')
}

/**
 * Generate a new deposit address set (unified + transparent companion receiver).
 */
export async function generateDepositAddressSet(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  unifiedAddr: string
  transparentAddr: string
  accountIndex: number
}> {
  const accountResult = await rpcCall<number | RpcAccountResult>('z_getnewaccount', [], network)
  const accountIndex = extractAccountIndex(accountResult)

  const ua = await rpcCall<RpcUnifiedAddressResult>(
    'z_getaddressforaccount',
    [accountIndex, ['p2pkh', 'sapling']],
    network
  )

  const receivers = await rpcCall<{ p2pkh?: string; sapling?: string; orchard?: string }>(
    'z_listunifiedreceivers',
    [ua.address],
    network
  )

  if (!ua.address || !receivers.p2pkh) {
    throw new Error('Failed to generate deposit address set with transparent receiver')
  }

  return {
    unifiedAddr: ua.address,
    transparentAddr: receivers.p2pkh,
    accountIndex,
  }
}

/**
 * Generate a new transparent address via unified account system.
 * zcashd 6.x deprecates getnewaddress — must use z_getaddressforaccount
 * with p2pkh+sapling receivers, then extract the transparent component.
 */
export async function generateTransparentAddress(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<string> {
  const addresses = await generateDepositAddressSet(network)
  return addresses.transparentAddr
}

/**
 * Generate a new shielded (sapling) address
 */
export async function generateSaplingAddress(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<string> {
  return rpcCall<string>('z_getnewaddress', ['sapling'], network)
}

/**
 * Generate a new unified address
 * Note: Requires zcashd with unified address support
 */
export async function generateUnifiedAddress(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<string> {
  try {
    const addresses = await generateDepositAddressSet(network)
    return addresses.unifiedAddr
  } catch {
    // Fallback to sapling address if unified not supported
    console.log('Unified addresses not supported, falling back to sapling')
    return generateSaplingAddress(network)
  }
}

/**
 * Get the balance of a specific address (or entire wallet for z/u addresses).
 *
 * For z/u addresses: Uses z_getbalanceforaccount (account 0) which properly
 * includes all pools (transparent, sapling, orchard). Falls back to
 * z_gettotalbalance if unavailable.
 *
 * IMPORTANT: z_gettotalbalance is deprecated and may not reliably report
 * Orchard pool funds in all zcashd versions. z_getbalanceforaccount is the
 * recommended replacement since zcashd 5.x.
 */
export async function getAddressBalance(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK,
  minConfirmations: number = 3
): Promise<WalletBalance> {
  try {
    if (address.startsWith('z') || address.startsWith('u')) {
      // Primary: z_getbalanceforaccount — gives explicit per-pool breakdown
      try {
        const [confirmedResult, totalResult] = await Promise.all([
          rpcCall<{
            pools: {
              transparent?: { valueZat: number }
              sapling?: { valueZat: number }
              orchard?: { valueZat: number }
            }
          }>('z_getbalanceforaccount', [0, minConfirmations], network),
          rpcCall<{
            pools: {
              transparent?: { valueZat: number }
              sapling?: { valueZat: number }
              orchard?: { valueZat: number }
            }
          }>('z_getbalanceforaccount', [0, 0], network),
        ])

        const zat = (v: number) => v / 1e8
        const transparentConfirmed = zat(confirmedResult.pools.transparent?.valueZat ?? 0)
        const saplingConfirmed = zat(confirmedResult.pools.sapling?.valueZat ?? 0)
        const orchardConfirmed = zat(confirmedResult.pools.orchard?.valueZat ?? 0)
        const confirmed = transparentConfirmed + saplingConfirmed + orchardConfirmed

        const transparentTotal = zat(totalResult.pools.transparent?.valueZat ?? 0)
        const saplingTotal = zat(totalResult.pools.sapling?.valueZat ?? 0)
        const orchardTotal = zat(totalResult.pools.orchard?.valueZat ?? 0)
        const total = transparentTotal + saplingTotal + orchardTotal

        return {
          confirmed,
          pending: total - confirmed,
          total,
          pools: {
            transparent: transparentConfirmed,
            sapling: saplingConfirmed,
            orchard: orchardConfirmed,
          },
        }
      } catch (e) {
        console.warn('[RPC] z_getbalanceforaccount failed, falling back to z_gettotalbalance:', e)
      }

      // Fallback: z_gettotalbalance (deprecated, may miss Orchard pool)
      try {
        const totals = await rpcCall<{ transparent: string; private: string; total: string }>(
          'z_gettotalbalance', [minConfirmations], network
        )
        const confirmed = parseFloat(totals.total)
        const totalsUnconfirmed = await rpcCall<{ transparent: string; private: string; total: string }>(
          'z_gettotalbalance', [0], network
        )
        const total = parseFloat(totalsUnconfirmed.total)
        return {
          confirmed,
          pending: total - confirmed,
          total,
        }
      } catch (e) {
        console.error('[RPC] z_gettotalbalance also failed:', e)
      }

      return { confirmed: 0, pending: 0, total: 0 }
    }

    // For t-addresses, get UTXOs
    const utxos = await rpcCall<Array<{ amount: number; confirmations: number }>>(
      'listunspent',
      [0, 9999999, [address]],
      network
    )

    let confirmed = 0
    let pending = 0

    for (const utxo of utxos) {
      if (utxo.confirmations >= minConfirmations) {
        confirmed += utxo.amount
      } else {
        pending += utxo.amount
      }
    }

    return {
      confirmed,
      pending,
      total: confirmed + pending,
    }
  } catch (error) {
    console.error('Failed to get address balance:', error)
    return { confirmed: 0, pending: 0, total: 0 }
  }
}

/**
 * Get wallet total balance (ALL accounts, ALL pools).
 *
 * Uses z_gettotalbalance which sums across every account and pool in the
 * zcashd wallet.  This is the correct call for the admin "House Balance"
 * because user deposit addresses live in separate accounts (1, 2, 3…) and
 * z_getbalanceforaccount 0 only covers the house account.
 *
 * Optionally returns the house-account-0 per-pool breakdown so the admin
 * can still see Sapling vs Orchard vs Transparent.
 */
export async function getWalletBalance(
  network: ZcashNetwork = DEFAULT_NETWORK,
  minConfirmations: number = 3
): Promise<WalletBalance> {
  try {
    // z_gettotalbalance — sums ALL accounts, ALL pools
    const [confirmed, unconfirmed] = await Promise.all([
      rpcCall<{ transparent: string; private: string; total: string }>(
        'z_gettotalbalance', [minConfirmations], network
      ),
      rpcCall<{ transparent: string; private: string; total: string }>(
        'z_gettotalbalance', [0], network
      ),
    ])

    const confirmedTotal = parseFloat(confirmed.total)
    const allTotal = parseFloat(unconfirmed.total)

    // Also grab per-pool breakdown from house account 0 for admin visibility.
    // This is a best-effort enrichment — failures here don't break the balance.
    let pools: WalletBalance['pools']
    try {
      const acct0 = await rpcCall<{
        pools: {
          transparent?: { valueZat: number }
          sapling?: { valueZat: number }
          orchard?: { valueZat: number }
        }
      }>('z_getbalanceforaccount', [0, minConfirmations], network)

      const zat = (v: number) => v / 1e8
      pools = {
        transparent: zat(acct0.pools.transparent?.valueZat ?? 0),
        sapling: zat(acct0.pools.sapling?.valueZat ?? 0),
        orchard: zat(acct0.pools.orchard?.valueZat ?? 0),
      }
    } catch {
      // Pool breakdown unavailable — non-fatal
    }

    return {
      confirmed: confirmedTotal,
      pending: allTotal - confirmedTotal,
      total: allTotal,
      pools,
    }
  } catch (error) {
    console.error('[RPC] getWalletBalance failed:', error)
    return { confirmed: 0, pending: 0, total: 0 }
  }
}

/**
 * List transactions for a specific address
 */
export async function listAddressTransactions(
  address: string,
  count: number = 100,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<ZcashTransaction[]> {
  try {
    if (address.startsWith('z') || address.startsWith('u')) {
      // Shielded address transactions
      const txs = await rpcCall<Array<{
        txid: string
        amount: number
        confirmations: number
        time: number
        blocktime?: number
        memo?: string
      }>>('z_listreceivedbyaddress', [address], network)

      return txs.map((tx) => ({
        txid: tx.txid,
        address,
        category: 'receive' as const,
        amount: tx.amount,
        confirmations: tx.confirmations,
        time: tx.time,
        blocktime: tx.blocktime,
        memo: tx.memo ? Buffer.from(tx.memo, 'hex').toString('utf8').replace(/\0/g, '') : undefined,
      }))
    }

    // Transparent address - use listtransactions
    const txs = await rpcCall<ZcashTransaction[]>(
      'listtransactions',
      ['*', count, 0, true],
      network
    )

    return txs.filter((tx) => tx.address === address)
  } catch (error) {
    console.error('Failed to list transactions:', error)
    return []
  }
}

/**
 * Get transaction details
 */
export async function getTransaction(
  txid: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  confirmations: number
  amount: number
  fee: number
  time: number
  blocktime?: number
} | null> {
  try {
    const tx = await rpcCall<{
      confirmations: number
      amount?: number
      fee?: number
      time: number
      blocktime?: number
      vout?: Array<{ value: number }>
    }>('gettransaction', [txid], network)

    // Calculate amount from vout if not directly available
    const amount = tx.amount ?? tx.vout?.reduce((sum, out) => sum + out.value, 0) ?? 0

    return {
      confirmations: tx.confirmations,
      amount: Math.abs(amount),
      fee: tx.fee ? Math.abs(tx.fee) : 0,
      time: tx.time,
      blocktime: tx.blocktime,
    }
  } catch (error) {
    console.error('Failed to get transaction:', error)
    return null
  }
}

/**
 * Send ZEC from wallet to an address
 * Uses z_sendmany for flexibility (works with all address types)
 */
export async function sendZec(
  fromAddress: string,
  toAddress: string,
  amount: number,
  memo?: string,
  network: ZcashNetwork = DEFAULT_NETWORK,
  minconf: number = 1,
  fee: number = DEFAULT_Z_SENDMANY_FEE
): Promise<{ operationId: string }> {
  const zatoshi = Math.round(amount * 1e8)
  let normalizedFee = normalizeZecAmount(fee)

  const recipient: { address: string; amount: number; memo?: string } = {
    address: toAddress,
    amount: zatoshi / 1e8,
  }

  // Add memo for shielded transactions
  if (memo && (toAddress.startsWith('z') || toAddress.startsWith('u'))) {
    recipient.memo = Buffer.from(memo).toString('hex')
  }

  // Determine privacy policy based on address types
  // AllowRevealedAmounts: needed when spending transparent funds into Sapling pool
  // AllowFullyTransparent: needed for z→t sends (withdrawals to t-addrs)
  const privacyPolicy = toAddress.startsWith('t')
    ? 'AllowFullyTransparent'
    : 'AllowRevealedAmounts'

  for (let attempt = 0; attempt <= MAX_UNPAID_ACTION_RETRIES; attempt += 1) {
    try {
      const opid = await rpcCall<string>(
        'z_sendmany',
        [fromAddress, [recipient], minconf, normalizedFee, privacyPolicy],
        network
      )

      return { operationId: opid }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const nextFee = nextFeeForUnpaidActionError(normalizedFee, message)

      if (!nextFee || nextFee <= normalizedFee || attempt === MAX_UNPAID_ACTION_RETRIES) {
        throw error
      }

      console.warn(
        `[RPC] z_sendmany unpaid-action policy hit; retrying with higher fee (${normalizedFee} -> ${nextFee})`
      )
      normalizedFee = normalizeZecAmount(nextFee)
    }
  }

  throw new Error('z_sendmany fee retry loop exhausted')
}

/**
 * Check the status of a send operation
 */
export async function getOperationStatus(
  operationId: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  status: 'queued' | 'executing' | 'success' | 'failed'
  txid?: string
  error?: string
}> {
  const results = await rpcCall<Array<{
    id: string
    status: 'queued' | 'executing' | 'success' | 'failed'
    result?: { txid: string }
    error?: { message: string }
  }>>('z_getoperationstatus', [[operationId]], network)

  const op = results.find((r) => r.id === operationId)

  if (!op) {
    return { status: 'failed', error: 'Operation not found' }
  }

  return {
    status: op.status,
    txid: op.result?.txid,
    error: op.error?.message,
  }
}

/**
 * Wait for an operation to complete
 */
export async function waitForOperation(
  operationId: string,
  timeoutMs: number = 60000,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{
  success: boolean
  txid?: string
  error?: string
}> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const status = await getOperationStatus(operationId, network)

    if (status.status === 'success') {
      return { success: true, txid: status.txid }
    }

    if (status.status === 'failed') {
      return { success: false, error: status.error }
    }

    // Wait 1 second before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return { success: false, error: 'Operation timed out' }
}

/**
 * Validate an address via zcashd RPC (checksum + network check).
 * More reliable than prefix-only validation — catches invalid checksums.
 * Falls back to true if RPC is unavailable (testnet) to avoid blocking.
 */
export async function validateAddressViaRPC(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<{ isvalid: boolean; type?: string; error?: string }> {
  try {
    // Use z_validateaddress for shielded addresses, validateaddress for transparent
    const isShielded = address.startsWith('zs') || address.startsWith('ztestsapling') ||
      address.startsWith('u1') || address.startsWith('utest')

    if (isShielded) {
      const result = await rpcCall<{ isvalid: boolean; type?: string }>(
        'z_validateaddress', [address], network
      )
      return { isvalid: result.isvalid, type: result.type }
    } else {
      const result = await rpcCall<{ isvalid: boolean }>(
        'validateaddress', [address], network
      )
      return { isvalid: result.isvalid, type: 'transparent' }
    }
  } catch (err) {
    // If RPC fails, don't block the operation — log and return uncertain
    console.error('[RPC] Address validation failed:', err)
    return { isvalid: true, error: 'RPC validation unavailable' }
  }
}

/**
 * Estimate the fee for a transaction
 * Returns fee in ZEC
 */
export async function estimateFee(
  _fromAddress: string,
  _toAddress: string,
  _amount: number,
  _network: ZcashNetwork = DEFAULT_NETWORK
): Promise<number> {
  // Zcash has a fixed minimum fee
  // For now, return a conservative estimate
  // TODO: Calculate actual fee based on transaction size
  return DEFAULT_Z_SENDMANY_FEE
}
