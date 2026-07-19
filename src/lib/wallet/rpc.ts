/**
 * Zcash RPC Client
 *
 * Communicates with the configured Zcash wallet service via JSON-RPC.
 * Used for:
 * - Address generation
 * - Balance queries
 * - Transaction creation and broadcasting
 * - Deposit monitoring
 */

import { randomUUID } from 'node:crypto'
import type { ZcashNetwork, WalletBalance } from '@/types'
import { NETWORK_CONFIG, DEFAULT_NETWORK } from './index'

// RPC configuration from environment
const RPC_USER = process.env.ZCASH_RPC_USER || 'zcashrpc'
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD || ''
const WALLET_BACKEND = process.env.ZCASH_WALLET_BACKEND || 'zcashd'
const IS_ZALLET = WALLET_BACKEND === 'zallet'
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

// Bounded timeout for liveness probes (checkNodeStatus), longer for queries
// that may block while zcashd is busy building shielded proofs.
const RPC_LIVENESS_TIMEOUT_MS = 12_000  // 12s for getblockchaininfo on mainnet
const RPC_DEFAULT_TIMEOUT_MS = 30_000   // 30s for balance/send operations

/**
 * Make an RPC call to the Zcash node
 */
async function rpcCall<T = unknown>(
  method: string,
  params: unknown[] = [],
  network: ZcashNetwork = DEFAULT_NETWORK,
  timeoutMs?: number
): Promise<T> {
  const config = NETWORK_CONFIG[network]

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: `cypherjester-${Date.now()}`,
    method,
    params,
  })

  const auth = Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64')

  // Use short timeout for liveness checks, longer for everything else
  const timeout = timeoutMs ?? (method === 'getblockchaininfo' ? RPC_LIVENESS_TIMEOUT_MS : RPC_DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body,
      signal: AbortSignal.timeout(timeout),
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
    if (IS_ZALLET) {
      const status = await rpcCall<{
        node_tip: { height: number }
        wallet_tip?: { height: number }
        fully_synced_height?: number
        sync_work_remaining?: unknown
      }>('getwalletstatus', [], network)

      const walletHeight = status.wallet_tip?.height ?? 0
      const synced = walletHeight === status.node_tip.height &&
        status.fully_synced_height === walletHeight &&
        status.sync_work_remaining === undefined

      return {
        connected: true,
        synced,
        blockHeight: status.node_tip.height,
      }
    }

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
  account?: number
  account_uuid?: string
  zip32_account_index?: number
}

interface RpcUnifiedAddressResult {
  address: string
}

function extractAccountIndex(result: number | RpcAccountResult): number {
  if (typeof result === 'number') return result
  if (typeof result === 'object' && result !== null && typeof result.account === 'number') {
    return result.account
  }
  return -1
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
  accountUuid: string | null
}> {
  const accountName = `cypherjester-deposit-${Date.now()}-${randomUUID().slice(0, 8)}`
  const accountResult = await rpcCall<number | RpcAccountResult>(
    'z_getnewaccount',
    IS_ZALLET ? [accountName] : [],
    network
  )
  let accountIndex = extractAccountIndex(accountResult)
  const accountUuid = typeof accountResult === 'object' && accountResult !== null
    ? accountResult.account_uuid ?? null
    : null
  const accountRef = accountUuid ?? accountIndex

  if (accountRef === -1) {
    throw new Error('Invalid account response from z_getnewaccount')
  }

  // Zallet beta returns the stable UUID from z_getnewaccount but omits the
  // legacy numeric account field. Keep the ZIP-32 index too so existing DB
  // records and recovery tooling retain a useful deterministic reference.
  if (IS_ZALLET && accountUuid && accountIndex < 0) {
    const account = await rpcCall<RpcAccountResult>('z_getaccount', [accountUuid], network)
    accountIndex = account.zip32_account_index ?? -1
  }

  const ua = await rpcCall<RpcUnifiedAddressResult>(
    'z_getaddressforaccount',
    [accountRef, ['p2pkh', 'sapling']],
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
    accountUuid,
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
 * Requires a wallet service with unified address support.
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
 * Get the balance of the account that owns a specific address.
 *
 * Zallet resolves the owning UUID account and never falls back to the whole
 * wallet for an account-scoped lookup. Legacy zcashd retains its historical
 * z_gettotalbalance compatibility fallback.
 *
 * IMPORTANT: z_gettotalbalance is deprecated and may not reliably report
 * Orchard pool funds in all zcashd versions. z_getbalanceforaccount is the
 * recommended replacement since zcashd 5.x.
 */
export async function getAddressBalance(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK,
  minConfirmations: number = 3,
  accountRef?: number | string | null
): Promise<WalletBalance> {
  try {
    if (IS_ZALLET || address.startsWith('z') || address.startsWith('u')) {
      // Primary: z_getbalanceforaccount — gives explicit per-pool breakdown
      try {
        const balanceAccount = IS_ZALLET
          ? await resolveZalletAccountUuid(accountRef, address, network)
          : accountRef ?? 0
        if (balanceAccount === null) {
          throw new Error(`Unable to resolve Zallet account for ${address.slice(0, 16)}...`)
        }
        const [confirmedResult, totalResult] = await Promise.all([
          rpcCall<{
            pools: {
              transparent?: { valueZat: number }
              sapling?: { valueZat: number }
              orchard?: { valueZat: number }
              ironwood?: { valueZat: number }
            }
          }>('z_getbalanceforaccount', [balanceAccount, minConfirmations], network),
          rpcCall<{
            pools: {
              transparent?: { valueZat: number }
              sapling?: { valueZat: number }
              orchard?: { valueZat: number }
              ironwood?: { valueZat: number }
            }
          }>('z_getbalanceforaccount', [balanceAccount, 0], network),
        ])

        const zat = (v: number) => v / 1e8
        const transparentConfirmed = zat(confirmedResult.pools.transparent?.valueZat ?? 0)
        const saplingConfirmed = zat(confirmedResult.pools.sapling?.valueZat ?? 0)
        const orchardConfirmed = zat(confirmedResult.pools.orchard?.valueZat ?? 0)
        const ironwoodConfirmed = zat(confirmedResult.pools.ironwood?.valueZat ?? 0)
        const confirmed = transparentConfirmed + saplingConfirmed + orchardConfirmed + ironwoodConfirmed

        const transparentTotal = zat(totalResult.pools.transparent?.valueZat ?? 0)
        const saplingTotal = zat(totalResult.pools.sapling?.valueZat ?? 0)
        const orchardTotal = zat(totalResult.pools.orchard?.valueZat ?? 0)
        const ironwoodTotal = zat(totalResult.pools.ironwood?.valueZat ?? 0)
        const total = transparentTotal + saplingTotal + orchardTotal + ironwoodTotal

        return {
          confirmed,
          pending: normalizeZecAmount(total - confirmed),
          total,
          pools: {
            transparent: transparentConfirmed,
            sapling: saplingConfirmed,
            orchard: orchardConfirmed,
            ironwood: ironwoodConfirmed,
          },
        }
      } catch (e) {
        if (IS_ZALLET) {
          // Never substitute the entire casino wallet balance for one account.
          // Doing so could make a player deposit address appear funded when it is not.
          console.error('[RPC] Zallet account balance lookup failed:', e)
          return { confirmed: 0, pending: 0, total: 0 }
        }
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
          pending: normalizeZecAmount(total - confirmed),
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
interface WalletBalanceOptions {
  timeoutMs?: number
  includePools?: boolean
  throwOnError?: boolean
}

export async function getWalletBalance(
  network: ZcashNetwork = DEFAULT_NETWORK,
  minConfirmations: number = 3,
  options: WalletBalanceOptions = {}
): Promise<WalletBalance> {
  try {
    // z_gettotalbalance — sums ALL accounts, ALL pools
    const [confirmed, unconfirmed] = await Promise.all([
      rpcCall<{ transparent: string; private: string; total: string }>(
        'z_gettotalbalance', IS_ZALLET ? [minConfirmations, true] : [minConfirmations], network, options.timeoutMs
      ),
      rpcCall<{ transparent: string; private: string; total: string }>(
        'z_gettotalbalance', IS_ZALLET ? [0, true] : [0], network, options.timeoutMs
      ),
    ])

    const confirmedTotal = parseFloat(confirmed.total)
    const allTotal = parseFloat(unconfirmed.total)

    // Also grab per-pool breakdown from house account 0 for admin visibility.
    // This is a best-effort enrichment — failures here don't break the balance.
    let pools: WalletBalance['pools']
    if (options.includePools !== false) {
      try {
        const acct0 = await rpcCall<{
          pools: {
            transparent?: { valueZat: number }
            sapling?: { valueZat: number }
            orchard?: { valueZat: number }
            ironwood?: { valueZat: number }
          }
        }>('z_getbalanceforaccount', [0, minConfirmations], network, options.timeoutMs)

        const zat = (v: number) => v / 1e8
        pools = {
          transparent: zat(acct0.pools.transparent?.valueZat ?? 0),
          sapling: zat(acct0.pools.sapling?.valueZat ?? 0),
          orchard: zat(acct0.pools.orchard?.valueZat ?? 0),
          ironwood: zat(acct0.pools.ironwood?.valueZat ?? 0),
        }
      } catch {
        // Pool breakdown unavailable — non-fatal
      }
    }

    return {
      confirmed: confirmedTotal,
      pending: normalizeZecAmount(allTotal - confirmedTotal),
      total: allTotal,
      pools,
    }
  } catch (error) {
    console.error('[RPC] getWalletBalance failed:', error)
    if (options.throwOnError) throw error
    return { confirmed: 0, pending: 0, total: 0 }
  }
}

/**
 * Cached, single-flight wrapper around getWalletBalance().
 *
 * z_gettotalbalance holds zcashd's wallet lock for 10-20s on a wallet with
 * many shielded notes.  Because that lock also serializes the cheap
 * getblockchaininfo liveness probe, firing a fresh balance scan on every
 * /api/health (Docker healthcheck hits it every 30s) and /api/admin/overview
 * request kept a scan permanently in flight — which made the node look
 * "Disconnected" on the dashboard even though it was healthy and synced.
 *
 * This wrapper computes the balance at most once per TTL and coalesces
 * concurrent callers onto a single in-flight scan, so the wallet lock is
 * released and cheap RPC stays fast.  On refresh failure it serves the last
 * known value instead of flickering to zero.
 *
 * Display-only — withdrawal reserve checks use their own balance path, so a
 * slightly stale cached value here can never affect funds movement.
 *
 * NOTE: single-slot cache — every caller uses mainnet + minConfirmations=3.
 */
const BALANCE_CACHE_TTL_MS = Number(process.env.HOUSE_BALANCE_CACHE_TTL_MS) || 90_000
const BALANCE_REFRESH_TIMEOUT_MS = 30_000

let cachedWalletBalance: { value: WalletBalance; fetchedAt: number } | null = null
let walletBalanceInFlight: Promise<WalletBalance> | null = null

export async function getWalletBalanceCached(
  network: ZcashNetwork = DEFAULT_NETWORK,
  minConfirmations: number = 3,
  options: WalletBalanceOptions = {}
): Promise<WalletBalance> {
  // Fresh cache hit — return immediately, no RPC.
  if (cachedWalletBalance && Date.now() - cachedWalletBalance.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return cachedWalletBalance.value
  }

  // Coalesce concurrent callers onto a single scan.
  if (!walletBalanceInFlight) {
    walletBalanceInFlight = (async () => {
      try {
        const value = await getWalletBalance(network, minConfirmations, {
          // Always include pools so the admin per-pool view stays populated,
          // and use a generous timeout because this runs at most once per TTL.
          includePools: true,
          timeoutMs: BALANCE_REFRESH_TIMEOUT_MS,
          throwOnError: true,
        })
        cachedWalletBalance = { value, fetchedAt: Date.now() }
        return value
      } finally {
        walletBalanceInFlight = null
      }
    })()
  }

  try {
    return await walletBalanceInFlight
  } catch (error) {
    if (cachedWalletBalance) {
      console.warn(
        '[RPC] balance refresh failed; serving cached value:',
        error instanceof Error ? error.message : String(error)
      )
      return cachedWalletBalance.value
    }
    if (options.throwOnError) throw error
    return { confirmed: 0, pending: 0, total: 0 }
  }
}

/**
 * List transactions for a specific address
 */
interface ZalletAccount {
  account_uuid: string
  account?: number
  zip32_account_index?: number
  addresses?: Array<{
    ua?: string
    sapling?: string
    transparent?: string
  }>
}

let zalletAccountsCache: { accounts: ZalletAccount[]; fetchedAt: number } | null = null

async function resolveZalletAccountUuid(
  accountRef: number | string | null | undefined,
  address: string,
  network: ZcashNetwork
): Promise<string | null> {
  if (typeof accountRef === 'string' && accountRef.length > 0) return accountRef

  if (!zalletAccountsCache || Date.now() - zalletAccountsCache.fetchedAt > 60_000) {
    zalletAccountsCache = {
      accounts: await rpcCall<ZalletAccount[]>('z_listaccounts', [true], network),
      fetchedAt: Date.now(),
    }
  }

  const match = zalletAccountsCache.accounts.find((account) =>
    account.account === accountRef ||
    account.zip32_account_index === accountRef ||
    account.addresses?.some((candidate) =>
      candidate.ua === address ||
      candidate.sapling === address ||
      candidate.transparent === address
    )
  )

  return match?.account_uuid ?? null
}

export async function listAddressTransactions(
  address: string,
  count: number = 100,
  network: ZcashNetwork = DEFAULT_NETWORK,
  accountRef?: number | string | null
): Promise<ZcashTransaction[]> {
  try {
    if (IS_ZALLET) {
      const accountUuid = await resolveZalletAccountUuid(accountRef, address, network)
      if (!accountUuid) {
        throw new Error(`Unable to resolve Zallet account for ${address.slice(0, 16)}...`)
      }

      const [txs, status] = await Promise.all([
        rpcCall<Array<{
          txid: string
          mined_height?: number
          account_balance_delta: number
          block_time?: number
          outputs: Array<{
            to_account?: string
            to_address?: string
            value: number
            is_change: boolean
            memo?: string
          }>
        }>>('z_listtransactions', [accountUuid, null, null, 0, count], network),
        rpcCall<{ node_tip: { height: number } }>('getwalletstatus', [], network),
      ])

      return txs.flatMap((tx) => {
        const receivedOutputs = tx.outputs.filter((output) =>
          output.to_account === accountUuid && !output.is_change
        )
        const receivedZats = receivedOutputs.reduce((sum, output) => sum + output.value, 0)
        const fallbackZats = Math.max(0, tx.account_balance_delta)
        const amountZats = receivedZats || fallbackZats
        if (amountZats <= 0) return []

        const confirmations = tx.mined_height === undefined
          ? 0
          : Math.max(0, status.node_tip.height - tx.mined_height + 1)
        const blocktime = tx.block_time

        return [{
          txid: tx.txid,
          address,
          category: 'receive' as const,
          amount: amountZats / 1e8,
          confirmations,
          time: blocktime ?? Math.floor(Date.now() / 1000),
          blocktime,
          memo: receivedOutputs.find((output) => output.memo)?.memo,
        }]
      })
    }

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
    if (IS_ZALLET) {
      const tx = await rpcCall<{
        confirmations: number
        fee?: number
        blocktime?: number
        outputs: Array<{ value: number; outgoing?: boolean }>
      }>('z_viewtransaction', [txid], network)
      const amount = tx.outputs
        .filter((output) => output.outgoing !== false)
        .reduce((sum, output) => sum + Number(output.value), 0)

      return {
        confirmations: tx.confirmations,
        amount: Math.abs(amount),
        fee: Math.abs(Number(tx.fee ?? 0)),
        time: tx.blocktime ?? Math.floor(Date.now() / 1000),
        blocktime: tx.blocktime,
      }
    }

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
        [fromAddress, [recipient], minconf, IS_ZALLET ? null : normalizedFee, privacyPolicy],
        network
      )

      return { operationId: opid }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (IS_ZALLET) throw error
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
    status: 'queued' | 'executing' | 'success' | 'failed' | 'cancelled'
    result?: { txid?: string; txids?: string[] }
    error?: { message: string }
  }>>('z_getoperationstatus', [[operationId]], network)

  const op = results.find((r) => r.id === operationId)

  if (!op) {
    return { status: 'failed', error: 'Operation not found' }
  }

  return {
    status: op.status === 'cancelled' ? 'failed' : op.status,
    txid: op.result?.txid ?? op.result?.txids?.[0],
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
 * Validate an address via wallet RPC (checksum + network check).
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

    if (isShielded && !IS_ZALLET) {
      const result = await rpcCall<{ isvalid: boolean; type?: string }>(
        'z_validateaddress', [address], network
      )
      return { isvalid: result.isvalid, type: result.type }
    } else {
      const result = await rpcCall<{ isvalid: boolean; type?: string; address_type?: string }>(
        'validateaddress', [address], network
      )
      return {
        isvalid: result.isvalid,
        type: result.type ?? result.address_type ?? (isShielded ? 'shielded' : 'transparent'),
      }
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
