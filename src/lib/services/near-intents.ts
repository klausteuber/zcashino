import { getSupportedSwapRail, type SupportedSwapRail, type SwapRailId, ZEC_DESTINATION_ASSET_ID } from '@/lib/swap/rails'

const DEFAULT_BASE_URL = 'https://1click.chaindefuser.com'
const DEFAULT_SLIPPAGE_BPS = 100
const DEFAULT_QUOTE_TTL_MINUTES = 15

export interface NearIntentsAppFee {
  recipient: string
  fee: number
}

export interface NearIntentsQuoteResponse {
  quote: {
    amountIn: string
    amountInFormatted: string
    amountInUsd: string
    minAmountIn: string
    amountOut: string
    amountOutFormatted: string
    amountOutUsd: string
    minAmountOut: string
    timeEstimate: number
    deadline: string
    timeWhenInactive: string
    depositAddress: string
  }
  quoteRequest: {
    dry: boolean
    depositMode?: string
    swapType: 'EXACT_INPUT'
    slippageTolerance: number
    originAsset: string
    depositType: 'ORIGIN_CHAIN'
    destinationAsset: string
    amount: string
    refundTo: string
    refundType: 'ORIGIN_CHAIN'
    recipient: string
    recipientType: 'DESTINATION_CHAIN'
    deadline: string
    quoteWaitingTimeMs?: number
    appFees?: NearIntentsAppFee[]
  }
  signature: string
  timestamp: string
  correlationId: string
}

export interface NearIntentsStatusResponse {
  status:
    | 'PENDING_DEPOSIT'
    | 'KNOWN_DEPOSIT_TX'
    | 'PROCESSING'
    | 'SUCCESS'
    | 'INCOMPLETE_DEPOSIT'
    | 'REFUNDED'
    | 'FAILED'
  updatedAt: string
  correlationId: string
  swapDetails?: {
    depositedAmount: string | null
    depositedAmountUsd: string | null
    depositedAmountFormatted: string | null
    intentHashes: string[]
    nearTxHashes: string[]
    amountIn: string | null
    amountInFormatted: string | null
    amountInUsd: string | null
    amountOut: string | null
    amountOutFormatted: string | null
    amountOutUsd: string | null
    slippage: string | null
    refundedAmount: string | null
    refundedAmountFormatted: string | null
    refundedAmountUsd: string | null
    refundReason: string | null
    refundFee: string | null
    originChainTxHashes: string[]
    destinationChainTxHashes: string[]
  }
  quoteResponse?: NearIntentsQuoteResponse
}

export interface NearIntentsSubmitDepositResponse {
  success?: boolean
  correlationId?: string
  message?: string
}

export interface RequestNearIntentsQuoteInput {
  railId: SwapRailId
  amount: string
  recipientAddress: string
  refundAddress: string
}

export interface RequestNearIntentsQuoteResult {
  rail: SupportedSwapRail
  response: NearIntentsQuoteResponse
  configuredAppFeeBps: number
  partnerAuthEnabled: boolean
}

function getBaseUrl(): string {
  return (process.env.NEAR_INTENTS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function getApiKey(): string | null {
  const apiKey = process.env.NEAR_INTENTS_API_KEY?.trim()
  return apiKey ? apiKey : null
}

function getConfiguredAppFeeBps(): number {
  const raw = process.env.NEAR_INTENTS_APP_FEE_BPS?.trim()
  if (!raw) return 0

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('NEAR_INTENTS_APP_FEE_BPS must be a non-negative integer.')
  }
  if (parsed > 500) {
    throw new Error('NEAR_INTENTS_APP_FEE_BPS must be 500 bps (5%) or less.')
  }

  return parsed
}

function getConfiguredAppFees(): NearIntentsAppFee[] {
  const feeBps = getConfiguredAppFeeBps()
  if (feeBps <= 0) return []

  const recipient = process.env.NEAR_INTENTS_APP_FEE_RECIPIENT?.trim()
  if (!recipient) {
    console.warn('[NearIntents] NEAR_INTENTS_APP_FEE_BPS is set but NEAR_INTENTS_APP_FEE_RECIPIENT is missing. Skipping app fee.')
    return []
  }

  return [{ recipient, fee: feeBps }]
}

function buildHeaders(): HeadersInit {
  const apiKey = getApiKey()

  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

function createQuoteDeadline(minutesFromNow: number = DEFAULT_QUOTE_TTL_MINUTES): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

function parseAmountToAtomic(amount: string, decimals: number): string {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount.')
  }

  const [wholePartRaw, fractionalPartRaw = ''] = trimmed.split('.')
  const wholePart = wholePartRaw.replace(/^0+(?=\d)/, '') || '0'
  if (fractionalPartRaw.length > decimals) {
    throw new Error(`This asset supports up to ${decimals} decimal places.`)
  }

  const paddedFraction = fractionalPartRaw.padEnd(decimals, '0')
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '') || '0'
  const atomic = BigInt(combined)

  if (atomic <= BigInt(0)) {
    throw new Error('Enter an amount greater than zero.')
  }

  return atomic.toString()
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof payload.message === 'string' &&
        payload.message) ||
      `NEAR Intents request failed with status ${response.status}`

    throw new Error(message)
  }

  return payload as T
}

export async function requestNearIntentsQuote({
  railId,
  amount,
  recipientAddress,
  refundAddress,
}: RequestNearIntentsQuoteInput): Promise<RequestNearIntentsQuoteResult> {
  const rail = getSupportedSwapRail(railId)
  if (!rail) {
    throw new Error('Unsupported source asset.')
  }

  const atomicAmount = parseAmountToAtomic(amount, rail.decimals)
  const appFees = getConfiguredAppFees()

  const body = {
    dry: false,
    swapType: 'EXACT_INPUT' as const,
    slippageTolerance: DEFAULT_SLIPPAGE_BPS,
    originAsset: rail.assetId,
    depositType: 'ORIGIN_CHAIN' as const,
    destinationAsset: ZEC_DESTINATION_ASSET_ID,
    amount: atomicAmount,
    recipient: recipientAddress.trim(),
    recipientType: 'DESTINATION_CHAIN' as const,
    refundTo: refundAddress.trim(),
    refundType: 'ORIGIN_CHAIN' as const,
    deadline: createQuoteDeadline(),
    ...(appFees.length > 0 ? { appFees } : {}),
  }

  const response = await fetch(`${getBaseUrl()}/v0/quote`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const payload = await parseJsonResponse<NearIntentsQuoteResponse>(response)

  if (!payload?.quote?.depositAddress) {
    throw new Error('Quote did not include a deposit address.')
  }

  return {
    rail,
    response: payload,
    configuredAppFeeBps: appFees[0]?.fee ?? 0,
    partnerAuthEnabled: !!getApiKey(),
  }
}

export async function getNearIntentsStatus(depositAddress: string): Promise<NearIntentsStatusResponse> {
  const response = await fetch(
    `${getBaseUrl()}/v0/status?depositAddress=${encodeURIComponent(depositAddress.trim())}`,
    {
      headers: buildHeaders(),
      cache: 'no-store',
    }
  )

  return parseJsonResponse<NearIntentsStatusResponse>(response)
}

export async function submitNearIntentsDeposit(
  depositAddress: string,
  txHash: string
): Promise<NearIntentsSubmitDepositResponse> {
  const response = await fetch(`${getBaseUrl()}/v0/deposit/submit`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      depositAddress: depositAddress.trim(),
      txHash: txHash.trim(),
    }),
    cache: 'no-store',
  })

  return parseJsonResponse<NearIntentsSubmitDepositResponse>(response)
}
