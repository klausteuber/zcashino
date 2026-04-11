'use client'

import { useEffect, useMemo, useState } from 'react'
import { CopyButton } from '@/components/ui/QRCode'
import { SUPPORTED_SWAP_RAILS, getSupportedSwapRail, type SupportedSwapRail, type SwapRailId } from '@/lib/swap/rails'

type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED'

interface QuotePayload {
  rail: SupportedSwapRail
  quote: {
    amountIn: string
    amountInFormatted: string
    amountInUsd: string
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
    deadline: string
    refundTo: string
    recipient: string
    appFees?: Array<{ recipient: string; fee: number }>
  }
  configuredAppFeeBps: number
  partnerAuthEnabled: boolean
  correlationId: string
}

interface StatusPayload {
  status: SwapStatus
  updatedAt: string
  correlationId: string
  swapDetails?: {
    depositedAmountFormatted: string | null
    amountInFormatted: string | null
    amountOutFormatted: string | null
    refundReason: string | null
    originChainTxHashes: string[]
    destinationChainTxHashes: string[]
  }
}

interface SwapWidgetProps {
  depositAddress: string
  transparentAddress?: string | null
}

const TERMINAL_STATUSES = new Set<SwapStatus>(['SUCCESS', 'REFUNDED', 'FAILED'])

const STATUS_COPY: Record<SwapStatus, string> = {
  PENDING_DEPOSIT: 'Waiting for your deposit',
  KNOWN_DEPOSIT_TX: 'Deposit detected',
  PROCESSING: 'Swap in progress',
  SUCCESS: 'ZEC delivered',
  INCOMPLETE_DEPOSIT: 'Deposit amount mismatch',
  REFUNDED: 'Refunded',
  FAILED: 'Swap failed',
}

const STATUS_TONE: Record<SwapStatus, string> = {
  PENDING_DEPOSIT: 'border-masque-gold/30 bg-masque-gold/10 text-masque-gold',
  KNOWN_DEPOSIT_TX: 'border-jester-purple/30 bg-jester-purple/10 text-jester-purple-light',
  PROCESSING: 'border-jester-purple/30 bg-jester-purple/10 text-jester-purple-light',
  SUCCESS: 'border-green-500/30 bg-green-500/10 text-green-300',
  INCOMPLETE_DEPOSIT: 'border-blood-ruby/30 bg-blood-ruby/10 text-blood-ruby',
  REFUNDED: 'border-blood-ruby/30 bg-blood-ruby/10 text-blood-ruby',
  FAILED: 'border-blood-ruby/30 bg-blood-ruby/10 text-blood-ruby',
}

export function SwapWidget({ depositAddress, transparentAddress }: SwapWidgetProps) {
  const [selectedRailId, setSelectedRailId] = useState<SwapRailId>('sol')
  const [amount, setAmount] = useState('')
  const [refundAddress, setRefundAddress] = useState('')
  const [quote, setQuote] = useState<QuotePayload | null>(null)
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [txHash, setTxHash] = useState('')
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [isRequestingQuote, setIsRequestingQuote] = useState(false)
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false)

  const selectedRail = useMemo(
    () => getSupportedSwapRail(selectedRailId) ?? SUPPORTED_SWAP_RAILS[0],
    [selectedRailId]
  )

  const zecRecipient = transparentAddress || depositAddress
  const hasFreshQuote = !!quote && selectedRail.id === quote.rail.id

  useEffect(() => {
    setQuote(null)
    setStatus(null)
    setQuoteError(null)
    setStatusError(null)
    setSubmitError(null)
    setSubmitMessage(null)
    setTxHash('')
  }, [amount, refundAddress, selectedRailId, zecRecipient])

  useEffect(() => {
    if (!quote?.quote.depositAddress) return
    const currentStatus = status?.status
    if (currentStatus && TERMINAL_STATUSES.has(currentStatus)) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const refresh = async (showSpinner: boolean = false) => {
      if (showSpinner) {
        setIsRefreshingStatus(true)
      }

      try {
        const response = await fetch('/api/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'status',
            depositAddress: quote.quote.depositAddress,
          }),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || 'Failed to refresh swap status')
        }

        if (!cancelled) {
          setStatus(data as StatusPayload)
          setStatusError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setStatusError(error instanceof Error ? error.message : 'Failed to refresh status')
        }
      } finally {
        if (!cancelled && showSpinner) {
          setIsRefreshingStatus(false)
        }
      }
    }

    refresh()
    intervalId = setInterval(() => {
      refresh()
    }, 10_000)

    return () => {
      cancelled = true
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [quote?.quote.depositAddress, status?.status])

  async function handleGetQuote() {
    setQuoteError(null)
    setStatusError(null)
    setSubmitError(null)
    setSubmitMessage(null)

    if (!amount.trim()) {
      setQuoteError(`Enter how much ${selectedRail.symbol} you want to swap.`)
      return
    }

    if (!refundAddress.trim()) {
      setQuoteError(`Enter the ${selectedRail.blockchainLabel} refund address you control.`)
      return
    }

    setIsRequestingQuote(true)

    try {
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quote',
          railId: selectedRail.id,
          amount,
          recipientAddress: zecRecipient,
          refundAddress,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Quote request failed')
      }

      setQuote(data as QuotePayload)
      setStatus(null)
    } catch (error) {
      setQuote(null)
      setStatus(null)
      setQuoteError(error instanceof Error ? error.message : 'Quote request failed')
    } finally {
      setIsRequestingQuote(false)
    }
  }

  async function handleRefreshStatus() {
    if (!quote?.quote.depositAddress) return

    setIsRefreshingStatus(true)
    setStatusError(null)

    try {
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'status',
          depositAddress: quote.quote.depositAddress,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh swap status')
      }

      setStatus(data as StatusPayload)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to refresh status')
    } finally {
      setIsRefreshingStatus(false)
    }
  }

  async function handleSubmitDeposit() {
    if (!quote?.quote.depositAddress) return
    if (!txHash.trim()) {
      setSubmitError('Paste your source-chain transaction hash first.')
      return
    }

    setIsSubmittingDeposit(true)
    setSubmitError(null)
    setSubmitMessage(null)

    try {
      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit-deposit',
          depositAddress: quote.quote.depositAddress,
          txHash,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit deposit hash')
      }

      setSubmitMessage(data.message || 'Deposit hash submitted. Status checks will keep running.')
      await handleRefreshStatus()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit deposit hash')
    } finally {
      setIsSubmittingDeposit(false)
    }
  }

  const quoteIsExpired = quote ? new Date(quote.quoteRequest?.deadline || quote.quote.deadline).getTime() <= Date.now() : false
  const currentStatus = status?.status ?? 'PENDING_DEPOSIT'

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-masque-gold/20 bg-midnight-black/60 p-4 cyber-panel">
        <h3 className="text-sm font-semibold text-bone-white">Swap into your Zcash deposit address</h3>
        <p className="mt-2 text-xs leading-relaxed text-venetian-gold/60">
          We generate a route through NEAR Intents, then you send funds from your own wallet.
          Use a self-custody wallet for the source asset so refunds can return to you if the route fails.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs text-venetian-gold/50">Swap from:</p>
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_SWAP_RAILS.map((rail) => (
            <button
              key={rail.id}
              onClick={() => setSelectedRailId(rail.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${
                selectedRail.id === rail.id
                  ? 'border-masque-gold bg-masque-gold/20 text-masque-gold'
                  : 'border-masque-gold/20 bg-midnight-black/60 text-venetian-gold/60 hover:border-masque-gold/40 hover:text-venetian-gold'
              }`}
            >
              {rail.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-masque-gold">
            Amount on {selectedRail.blockchainLabel}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={`0.10 ${selectedRail.symbol}`}
            className="w-full rounded-lg border border-masque-gold/20 bg-midnight-black/70 px-4 py-3 text-bone-white placeholder:text-venetian-gold/30 focus:outline-none focus:ring-2 focus:ring-masque-gold/50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-masque-gold">
            Refund address on {selectedRail.blockchainLabel}
          </span>
          <input
            type="text"
            value={refundAddress}
            onChange={(event) => setRefundAddress(event.target.value)}
            placeholder={selectedRail.refundPlaceholder}
            className="w-full rounded-lg border border-masque-gold/20 bg-midnight-black/70 px-4 py-3 text-bone-white placeholder:text-venetian-gold/30 focus:outline-none focus:ring-2 focus:ring-masque-gold/50"
          />
          <p className="mt-2 text-xs text-venetian-gold/50">{selectedRail.refundHint}</p>
        </label>
      </div>

      <div className="rounded-lg border border-jester-purple/20 bg-jester-purple-dark/20 p-3">
        <p className="mb-2 text-xs font-semibold text-masque-gold">ZEC delivery address</p>
        <div className="flex items-center gap-2 rounded-lg border border-masque-gold/10 bg-midnight-black/60 p-2">
          <code className="flex-1 break-all text-xs leading-relaxed text-venetian-gold">{zecRecipient}</code>
          <CopyButton text={zecRecipient} />
        </div>
        {transparentAddress && transparentAddress !== depositAddress && (
          <p className="mt-2 text-xs text-venetian-gold/40">
            Using your transparent fallback address for swap delivery so the route stays compatible.
          </p>
        )}
      </div>

      {quoteError && (
        <div className="rounded-lg border border-blood-ruby/30 bg-blood-ruby/10 px-4 py-3 text-sm text-blood-ruby">
          {quoteError}
        </div>
      )}

      <button
        onClick={handleGetQuote}
        disabled={isRequestingQuote}
        className="btn-gold-shimmer w-full rounded-lg px-4 py-3 text-sm font-semibold text-midnight-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRequestingQuote ? 'Requesting quote...' : `Get ${selectedRail.symbol} → ZEC quote`}
      </button>

      {hasFreshQuote && quote && (
        <div className="space-y-4 rounded-lg border border-masque-gold/20 bg-midnight-black/60 p-4 cyber-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-bone-white">Quote ready</h4>
              <p className="mt-1 text-xs text-venetian-gold/60">
                Send exactly {quote.quote.amountInFormatted} {quote.rail.symbol} on {quote.rail.blockchainLabel}.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE[currentStatus]}`}>
              {STATUS_COPY[currentStatus]}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3">
              <div className="text-xs text-venetian-gold/50">Estimated receive</div>
              <div className="mt-1 text-lg font-semibold text-masque-gold">{quote.quote.amountOutFormatted} ZEC</div>
              <div className="text-xs text-venetian-gold/50">Approx. ${quote.quote.amountOutUsd}</div>
            </div>
            <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3">
              <div className="text-xs text-venetian-gold/50">Estimated route time</div>
              <div className="mt-1 text-lg font-semibold text-bone-white">
                {Math.max(1, Math.round(quote.quote.timeEstimate / 60))} min
              </div>
              <div className="text-xs text-venetian-gold/50">
                Quote expires {formatRelativeTime(quote.quoteRequest.deadline)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-masque-gold/20 bg-midnight-black/70 p-3">
            <p className="mb-2 text-xs font-semibold text-masque-gold">
              Send {quote.rail.symbol} here on {quote.rail.blockchainLabel}
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-masque-gold/10 bg-midnight-black/80 p-2">
              <code className="flex-1 break-all text-xs leading-relaxed text-bone-white">{quote.quote.depositAddress}</code>
              <CopyButton text={quote.quote.depositAddress} />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-venetian-gold/50">
              <span>Refunds return to: {quote.quoteRequest.refundTo}</span>
              <span>Correlation ID: {quote.correlationId.slice(0, 12)}...</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3 text-xs text-venetian-gold/60">
              Route, bridge, and network costs are baked into this quote before you send.
              {quote.configuredAppFeeBps > 0 && (
                <span className="block pt-2 text-masque-gold">
                  Includes a Zcashino fee of {(quote.configuredAppFeeBps / 100).toFixed(2)}%.
                </span>
              )}
            </div>
            <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3 text-xs text-venetian-gold/60">
              {quote.partnerAuthEnabled
                ? 'Partner-authenticated quotes are enabled.'
                : 'Public quotes are enabled. A partner key can reduce the default 1Click fee later.'}
            </div>
          </div>

          {quoteIsExpired && (
            <div className="rounded-lg border border-blood-ruby/30 bg-blood-ruby/10 px-4 py-3 text-sm text-blood-ruby">
              This quote has expired. Request a fresh quote before sending funds.
            </div>
          )}

          {status && (
            <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-bone-white">Swap status</div>
                  <div className="text-xs text-venetian-gold/50">Last updated {formatRelativeTime(status.updatedAt)}</div>
                </div>
                <button
                  onClick={handleRefreshStatus}
                  disabled={isRefreshingStatus}
                  className="rounded-lg border border-masque-gold/30 px-3 py-2 text-xs font-semibold text-venetian-gold hover:bg-masque-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRefreshingStatus ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <p className="mt-3 text-sm text-venetian-gold">
                {renderStatusMessage(status, quote.rail.symbol)}
              </p>

              {(status.swapDetails?.originChainTxHashes?.[0] || status.swapDetails?.destinationChainTxHashes?.[0]) && (
                <div className="mt-3 space-y-1 text-xs text-venetian-gold/60">
                  {status.swapDetails?.originChainTxHashes?.[0] && (
                    <p>Origin tx: {status.swapDetails.originChainTxHashes[0]}</p>
                  )}
                  {status.swapDetails?.destinationChainTxHashes?.[0] && (
                    <p>ZEC tx: {status.swapDetails.destinationChainTxHashes[0]}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {statusError && (
            <div className="rounded-lg border border-blood-ruby/30 bg-blood-ruby/10 px-4 py-3 text-sm text-blood-ruby">
              {statusError}
            </div>
          )}

          <div className="rounded-lg border border-masque-gold/10 bg-midnight-black/70 p-3">
            <p className="text-xs font-semibold text-bone-white">Optional: paste your deposit tx hash</p>
            <p className="mt-1 text-xs text-venetian-gold/50">
              This can help 1Click detect your payment faster after you send it.
            </p>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <input
                type="text"
                value={txHash}
                onChange={(event) => setTxHash(event.target.value)}
                placeholder={`Your ${quote.rail.blockchainLabel} transaction hash`}
                className="flex-1 rounded-lg border border-masque-gold/20 bg-midnight-black/80 px-4 py-3 text-sm text-bone-white placeholder:text-venetian-gold/30 focus:outline-none focus:ring-2 focus:ring-masque-gold/50"
              />
              <button
                onClick={handleSubmitDeposit}
                disabled={isSubmittingDeposit}
                className="rounded-lg border border-masque-gold/30 px-4 py-3 text-sm font-semibold text-venetian-gold hover:bg-masque-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingDeposit ? 'Submitting...' : 'Submit hash'}
              </button>
            </div>
            {submitError && <p className="mt-2 text-sm text-blood-ruby">{submitError}</p>}
            {submitMessage && <p className="mt-2 text-sm text-jester-purple-light">{submitMessage}</p>}
          </div>
        </div>
      )}

      <a
        href="/get-zec"
        className="block text-center text-xs text-masque-gold transition-colors hover:text-venetian-gold"
      >
        More ways to get ZEC →
      </a>
    </div>
  )
}

function renderStatusMessage(status: StatusPayload, symbol: string): string {
  switch (status.status) {
    case 'PENDING_DEPOSIT':
      return `We are waiting for your ${symbol} deposit to hit the quote address.`
    case 'KNOWN_DEPOSIT_TX':
      return 'Your deposit has been detected. The route is preparing settlement.'
    case 'PROCESSING':
      return 'Your swap is processing. ZEC delivery usually finishes within a few minutes.'
    case 'SUCCESS':
      return `Swap complete. ${status.swapDetails?.amountOutFormatted || 'Your ZEC'} has been delivered to your deposit address.`
    case 'INCOMPLETE_DEPOSIT':
      return 'The amount received did not match the quote. Request a new quote before trying again.'
    case 'REFUNDED':
      return status.swapDetails?.refundReason
        ? `The route refunded your deposit: ${status.swapDetails.refundReason}`
        : 'The route refunded your deposit to the refund address you provided.'
    case 'FAILED':
      return 'The swap failed. No more funds should be sent to this quote address.'
    default:
      return 'Status unavailable.'
  }
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60_000)

  if (!Number.isFinite(diffMinutes)) {
    return value
  }

  if (Math.abs(diffMinutes) < 1) {
    return 'just now'
  }

  if (diffMinutes > 0) {
    return `in ${diffMinutes} min`
  }

  return `${Math.abs(diffMinutes)} min ago`
}
