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
import { NETWORK_CONFIG, DEFAULT_NETWORK, zatoshiToZec } from './index'

// RPC configuration from environment
const RPC_USER = process.env.ZCASH_RPC_USER || 'zcashrpc'
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD || ''

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
    }>('getblockchaininfo', [], network)

    const synced = info.verificationprogress > 0.9999
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

/**
 * Generate a new transparent address via unified account system.
 * zcashd 6.x deprecates getnewaddress — must use z_getaddressforaccount
 * with p2pkh+sapling receivers, then extract the transparent component.
 */
export async function generateTransparentAddress(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<string> {
  // Use account 0 for all deposit addresses (created once on first call)
  let account = 0
  try {
    const accounts = await rpcCall<{ account: number }[]>('z_listaccounts', [], network)
    if (accounts.length === 0) {
      const newAccount = await rpcCall<{ account: number }>('z_getnewaccount', [], network)
      account = newAccount.account
    } else {
      account = accounts[0].account
    }
  } catch {
    // If z_listaccounts fails, try creating account 0
    const newAccount = await rpcCall<{ account: number }>('z_getnewaccount', [], network)
    account = newAccount.account
  }

  // Generate unified address with p2pkh (transparent) + sapling receivers
  const ua = await rpcCall<{ address: string }>(
    'z_getaddressforaccount',
    [account, ['p2pkh', 'sapling']],
    network
  )

  // Extract the raw transparent (p2pkh) address from the unified address
  const receivers = await rpcCall<{ p2pkh?: string; sapling?: string }>(
    'z_listunifiedreceivers',
    [ua.address],
    network
  )

  if (!receivers.p2pkh) {
    throw new Error('Failed to extract transparent address from unified address')
  }

  return receivers.p2pkh
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
    // Try to create unified address (zcashd 5.0+)
    const account = await rpcCall<number>('z_getnewaccount', [], network)
    const ua = await rpcCall<{ address: string }>(
      'z_getaddressforaccount',
      [account, ['sapling', 'orchard']],
      network
    )
    return ua.address
  } catch {
    // Fallback to sapling address if unified not supported
    console.log('Unified addresses not supported, falling back to sapling')
    return generateSaplingAddress(network)
  }
}

/**
 * Get the balance of a specific address
 */
export async function getAddressBalance(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<WalletBalance> {
  try {
    // For z-addresses, use z_gettotalbalance (z_getbalance is deprecated in zcashd 6.x)
    // z_gettotalbalance returns the entire wallet balance, which is correct since
    // the zcashd wallet IS the house wallet
    if (address.startsWith('z') || address.startsWith('u')) {
      try {
        const totals = await rpcCall<{ transparent: string; private: string; total: string }>(
          'z_gettotalbalance', [3], network
        )
        const confirmed = parseFloat(totals.private) + parseFloat(totals.transparent)
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
        console.error('[RPC] z_gettotalbalance failed, trying deprecated z_getbalance:', e)
        // Fallback to z_getbalance with -allowdeprecated flag
        const confirmed = await rpcCall<number>('z_getbalance', [address, 3], network)
        const total = await rpcCall<number>('z_getbalance', [address, 0], network)
        return {
          confirmed,
          pending: total - confirmed,
          total,
        }
      }
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
      if (utxo.confirmations >= 3) {
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
 * Get wallet total balance (all addresses)
 */
export async function getWalletBalance(
  network: ZcashNetwork = DEFAULT_NETWORK
): Promise<WalletBalance> {
  try {
    const balances = await rpcCall<{
      transparent: number
      private: number
      total: number
    }>('z_gettotalbalance', [], network)

    // Get unconfirmed separately
    const unconfirmed = await rpcCall<{
      transparent: number
      private: number
      total: number
    }>('z_gettotalbalance', [0], network)

    const confirmed = balances.total
    const total = unconfirmed.total
    const pending = total - confirmed

    return { confirmed, pending, total }
  } catch (error) {
    console.error('Failed to get wallet balance:', error)
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
  minconf: number = 1
): Promise<{ operationId: string }> {
  const zatoshi = Math.round(amount * 1e8)

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

  const opid = await rpcCall<string>(
    'z_sendmany',
    [fromAddress, [recipient], minconf, null, privacyPolicy],
    network
  )

  return { operationId: opid }
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
  return 0.0001
}
