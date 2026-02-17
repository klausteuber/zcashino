'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

type WithdrawalStep = 'set-address' | 'form' | 'confirm' | 'processing' | 'pending_approval' | 'success' | 'error'

interface WithdrawalModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string | null
  balance: number
  withdrawalAddress: string | null
  isDemo: boolean
  onBalanceUpdate: (newBalance: number) => void
  onWithdrawalAddressSet?: (address: string) => void
}

const MIN_WITHDRAWAL = 0.01
const WITHDRAWAL_FEE = 0.0001
const ZATS_PER_ZEC = 100_000_000

const toZats = (zec: number): number => Math.round(zec * ZATS_PER_ZEC)
const fromZats = (zats: number): number => zats / ZATS_PER_ZEC

// Client-side Zcash address validation
function validateZcashAddress(address: string): boolean {
  if (!address || address.trim().length === 0) return false
  const a = address.trim()
  // Testnet
  if (a.startsWith('tm') && a.length >= 35) return true
  if (a.startsWith('ztestsapling') && a.length >= 78) return true
  if (a.startsWith('utest') && a.length >= 50) return true
  // Mainnet
  if (a.startsWith('t1') && a.length >= 35) return true
  if (a.startsWith('t3') && a.length >= 35) return true
  if (a.startsWith('zs') && a.length >= 78) return true
  if (a.startsWith('u1') && a.length >= 50) return true
  return false
}

export function WithdrawalModal({
  isOpen,
  onClose,
  sessionId,
  balance,
  withdrawalAddress,
  isDemo,
  onBalanceUpdate,
  onWithdrawalAddressSet,
}: WithdrawalModalProps) {
  const [step, setStep] = useState<WithdrawalStep>(withdrawalAddress ? 'form' : 'set-address')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [addressInput, setAddressInput] = useState('')
  const [addressError, setAddressError] = useState<string | null>(null)
  const [isSettingAddress, setIsSettingAddress] = useState(false)
  const [localWithdrawalAddress, setLocalWithdrawalAddress] = useState<string | null>(withdrawalAddress)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(withdrawalAddress ? 'form' : 'set-address')
      setLocalWithdrawalAddress(withdrawalAddress)
      setAmount('')
      setError(null)
      setTxHash(null)
      setTransactionId(null)
      setIsSubmitting(false)
      setAddressInput('')
      setAddressError(null)
      setIsSettingAddress(false)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isOpen, withdrawalAddress])

  const feeZats = toZats(WITHDRAWAL_FEE)
  const minWithdrawalZats = toZats(MIN_WITHDRAWAL)
  const balanceZats = toZats(balance)
  const maxWithdrawalZats = Math.max(0, balanceZats - feeZats)
  const maxWithdrawal = fromZats(maxWithdrawalZats)
  const rawParsedAmount = parseFloat(amount)
  const parsedAmount = Number.isFinite(rawParsedAmount) ? rawParsedAmount : 0
  const parsedAmountZats = toZats(parsedAmount)
  const totalDeductedZats = parsedAmountZats + feeZats
  const totalDeducted = fromZats(totalDeductedZats)
  const isValidAmount = parsedAmountZats >= minWithdrawalZats && totalDeductedZats <= balanceZats

  const handleMax = useCallback(() => {
    if (maxWithdrawal >= MIN_WITHDRAWAL) {
      setAmount(maxWithdrawal.toFixed(8).replace(/\.?0+$/, ''))
    }
  }, [maxWithdrawal])

  const handleSetAddress = useCallback(async () => {
    if (!sessionId) return
    const trimmed = addressInput.trim()
    if (!trimmed) {
      setAddressError('Please enter your Zcash address')
      return
    }
    if (!validateZcashAddress(trimmed)) {
      setAddressError('Invalid Zcash address format')
      return
    }
    setIsSettingAddress(true)
    setAddressError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-withdrawal-address',
          sessionId,
          withdrawalAddress: trimmed,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddressError(data.error || 'Failed to set address')
        return
      }
      setLocalWithdrawalAddress(trimmed)
      onWithdrawalAddressSet?.(trimmed)
      setStep('form')
    } catch {
      setAddressError('Failed to set address. Please try again.')
    } finally {
      setIsSettingAddress(false)
    }
  }, [sessionId, addressInput, onWithdrawalAddressSet])

  const handleConfirm = useCallback(() => {
    if (!isValidAmount) return
    setStep('confirm')
  }, [isValidAmount])

  const handleSubmit = async () => {
    if (!sessionId || !isValidAmount) return

    setIsSubmitting(true)
    setError(null)

    try {
      const idempotencyKey = `wd-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          sessionId,
          amount: fromZats(parsedAmountZats),
          idempotencyKey,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Withdrawal failed')
        setStep('error')
        return
      }

      if (data.transaction?.status === 'confirmed') {
        // Demo mode — instant
        setTxHash(data.transaction.txHash)
        setStep('success')
        onBalanceUpdate(fromZats(Math.max(0, balanceZats - totalDeductedZats)))
      } else if (data.transaction?.status === 'pending_approval') {
        // Large withdrawal — held for admin approval
        setTransactionId(data.transaction.id)
        onBalanceUpdate(fromZats(Math.max(0, balanceZats - totalDeductedZats)))
        setStep('pending_approval')
      } else {
        // Real mode — poll for status
        setTransactionId(data.transaction.id)
        onBalanceUpdate(fromZats(Math.max(0, balanceZats - totalDeductedZats)))
        setStep('processing')
        startPolling(data.transaction.id)
      }
    } catch {
      setError('Network error. Please try again.')
      setStep('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startPolling = useCallback((txId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'withdrawal-status',
            sessionId,
            transactionId: txId,
          }),
        })

        const data = await res.json()
        const tx = data.transaction

        if (tx?.status === 'confirmed') {
          setTxHash(tx.txHash)
          setStep('success')
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        } else if (tx?.status === 'pending_approval') {
          setStep('pending_approval')
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        } else if (tx?.status === 'failed') {
          setError(tx.failReason || 'Withdrawal failed on-chain')
          setStep('error')
          // Balance was refunded server-side
          onBalanceUpdate(balance)
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      } catch {
        // Silently retry on network error
      }
    }, 5000)
  }, [sessionId, balance, onBalanceUpdate])

  if (!isOpen) return null

  const effectiveAddress = localWithdrawalAddress
  const truncatedAddress = effectiveAddress
    ? effectiveAddress.length > 24
      ? `${effectiveAddress.slice(0, 12)}...${effectiveAddress.slice(-10)}`
      : effectiveAddress
    : 'Not set'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-midnight-black border border-masque-gold/30 rounded-2xl cyber-panel shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-modal-enter">
        {/* Set withdrawal address step */}
        {step === 'set-address' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-bone-white">Set Withdrawal Address</h2>
              <button
                onClick={onClose}
                className="text-venetian-gold/50 hover:text-bone-white transition-colors text-xl"
              >
                &times;
              </button>
            </div>

            <p className="text-sm text-venetian-gold/50 mb-4">
              Enter your Zcash address where winnings will be sent
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-venetian-gold mb-2">
                Your Zcash Address
              </label>
              <input
                type="text"
                value={addressInput}
                onChange={(e) => { setAddressInput(e.target.value); setAddressError(null) }}
                placeholder="zs1... or u1... or t1..."
                className={`w-full px-4 py-3 bg-midnight-black/60 border rounded-lg cyber-panel text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:ring-2 transition-all font-mono text-sm ${
                  addressError
                    ? 'border-blood-ruby focus:ring-blood-ruby/50'
                    : 'border-masque-gold/20 focus:ring-masque-gold/50 focus:border-masque-gold'
                }`}
              />
              {addressError && <p className="mt-2 text-sm text-blood-ruby">{addressError}</p>}
              <p className="mt-2 text-xs text-venetian-gold/40">
                Supports transparent (t1), shielded (zs), and unified (u1) addresses
              </p>
            </div>

            <button
              onClick={handleSetAddress}
              disabled={isSettingAddress || !addressInput.trim()}
              className="w-full py-3 btn-gold-shimmer disabled:bg-midnight-black/40 disabled:cursor-not-allowed text-midnight-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSettingAddress ? (
                <>
                  <div className="w-5 h-5 border-2 border-midnight-black border-t-transparent rounded-full animate-spin" />
                  <span>Setting up...</span>
                </>
              ) : (
                <span>Continue to Withdrawal</span>
              )}
            </button>
          </div>
        )}

        {step === 'form' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-bone-white">Withdraw ZEC</h2>
              <button
                onClick={onClose}
                className="text-venetian-gold/50 hover:text-bone-white transition-colors text-xl"
              >
                &times;
              </button>
            </div>

            {/* Balance display */}
            <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
              <div className="text-xs text-venetian-gold/50 mb-1">Available Balance</div>
              <div className="text-2xl font-bold text-masque-gold font-mono">{balance.toFixed(4)} ZEC</div>
            </div>

            {/* Destination address */}
            <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
              <div className="text-xs text-venetian-gold/50 mb-1">Withdrawal Address</div>
              <div className="text-sm text-venetian-gold font-mono">{truncatedAddress}</div>
            </div>

            {!effectiveAddress && (
              <div className="mb-4 p-3 bg-masque-gold/10 border border-masque-gold/30 rounded-lg cyber-panel">
                <p className="text-sm text-venetian-gold mb-2">No withdrawal address set yet.</p>
                <button
                  onClick={() => setStep('set-address')}
                  className="text-sm text-masque-gold hover:text-venetian-gold underline transition-colors"
                >
                  Set withdrawal address →
                </button>
              </div>
            )}

            {/* Amount input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-venetian-gold mb-2">
                Amount to Withdraw
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setError(null)
                  }}
                  placeholder={`Min: ${MIN_WITHDRAWAL} ZEC`}
                  step="0.0001"
                  min={MIN_WITHDRAWAL}
                  max={maxWithdrawal}
                  className="flex-1 px-4 py-3 bg-midnight-black/60 border border-masque-gold/20 rounded-lg cyber-panel text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:ring-2 focus:ring-masque-gold/50 focus:border-masque-gold font-mono"
                />
                <button
                  onClick={handleMax}
                  disabled={maxWithdrawal < MIN_WITHDRAWAL}
                  className="px-4 py-3 bg-masque-gold/10 border border-masque-gold/30 rounded-lg cyber-panel text-masque-gold text-sm font-semibold hover:bg-masque-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Fee breakdown */}
            {parsedAmount > 0 && (
              <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20 space-y-1 text-sm font-mono">
                <div className="flex justify-between text-venetian-gold/70">
                  <span>Withdrawal</span>
                  <span>{parsedAmount.toFixed(4)} ZEC</span>
                </div>
                <div className="flex justify-between text-venetian-gold/50">
                  <span>Network fee</span>
                  <span>{WITHDRAWAL_FEE} ZEC</span>
                </div>
                <div className="border-t border-masque-gold/20 pt-1 flex justify-between text-bone-white font-semibold">
                  <span>Total deducted</span>
                  <span>{totalDeducted.toFixed(4)} ZEC</span>
                </div>
              </div>
            )}

            {/* Validation errors */}
            {parsedAmount > 0 && !isValidAmount && (
              <div className="mb-4 text-sm text-blood-ruby">
                {parsedAmount < MIN_WITHDRAWAL
                  ? `Minimum withdrawal is ${MIN_WITHDRAWAL} ZEC`
                  : `Insufficient balance (need ${totalDeducted.toFixed(4)} ZEC including fee)`}
              </div>
            )}

            {isDemo && (
              <div className="mb-4 p-3 bg-masque-gold/10 border border-masque-gold/30 rounded-lg cyber-panel">
                <p className="text-sm text-venetian-gold">Demo mode: withdrawal is simulated instantly.</p>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!isValidAmount || !effectiveAddress}
              className="w-full py-3 btn-gold-shimmer disabled:bg-midnight-black/40 disabled:text-venetian-gold/30 disabled:cursor-not-allowed text-midnight-black font-semibold rounded-lg transition-colors"
            >
              Review Withdrawal
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="p-6">
            <h2 className="text-xl font-display font-bold text-bone-white mb-6">Confirm Withdrawal</h2>

            <div className="space-y-3 mb-6">
              <div className="p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">Sending</div>
                <div className="text-2xl font-bold text-masque-gold font-mono">{parsedAmount.toFixed(4)} ZEC</div>
              </div>

              <div className="p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">To</div>
                <div className="text-sm text-venetian-gold font-mono break-all">{effectiveAddress}</div>
              </div>

              <div className="p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">Network Fee</div>
                <div className="text-sm text-venetian-gold font-mono">{WITHDRAWAL_FEE} ZEC</div>
              </div>

              <div className="p-3 bg-masque-gold/10 rounded-lg cyber-panel border border-masque-gold/30">
                <div className="text-xs text-venetian-gold/50 mb-1">Total Deducted from Balance</div>
                <div className="text-lg font-bold text-bone-white font-mono">{totalDeducted.toFixed(4)} ZEC</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('form')}
                disabled={isSubmitting}
                className="flex-1 py-3 border border-masque-gold/30 text-venetian-gold rounded-lg hover:bg-masque-gold/10 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 btn-gold-shimmer text-midnight-black font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-midnight-black border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Confirm Withdrawal'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-masque-gold border-t-transparent rounded-full animate-spin" />
            <h2 className="text-xl font-display font-bold text-bone-white mb-2">Processing Withdrawal</h2>
            <p className="text-venetian-gold/50 mb-4">
              Your withdrawal is being processed on the Zcash network.
            </p>
            <p className="text-sm text-venetian-gold/50">
              This may take a few minutes for shielded transactions.
            </p>
          </div>
        )}

        {step === 'pending_approval' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">&#9200;</div>
            <h2 className="text-xl font-display font-bold text-bone-white mb-2">Awaiting Admin Approval</h2>
            <p className="text-3xl font-bold text-masque-gold mb-4 font-mono">
              {parsedAmount.toFixed(4)} ZEC
            </p>
            <p className="text-sm text-venetian-gold/50 mb-4">
              Your withdrawal requires manual approval due to its size. Your balance has been reserved.
            </p>
            <p className="text-xs text-venetian-gold/40 mb-6">
              You will receive funds once an admin approves the withdrawal. If rejected, your balance will be refunded.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 btn-gold-shimmer text-midnight-black font-semibold rounded-lg"
            >
              Close
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">&#10003;</div>
            <h2 className="text-2xl font-display font-bold text-bone-white mb-2">Withdrawal Sent!</h2>
            <p className="text-3xl font-bold text-masque-gold mb-4 font-mono">
              {parsedAmount.toFixed(4)} ZEC
            </p>

            {txHash && (
              <div className="mb-6 p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">Transaction Hash</div>
                <div className="text-xs text-venetian-gold font-mono break-all">{txHash}</div>
              </div>
            )}

            <p className="text-sm text-venetian-gold/50 mb-6">
              Funds are on their way to your withdrawal address.
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 btn-gold-shimmer text-midnight-black font-semibold rounded-lg"
            >
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">&#10007;</div>
            <h2 className="text-2xl font-display font-bold text-bone-white mb-2">Withdrawal Failed</h2>
            <p className="text-blood-ruby mb-6">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-masque-gold/30 text-venetian-gold rounded-lg hover:bg-masque-gold/10 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setError(null)
                  setStep('form')
                }}
                className="flex-1 py-3 btn-gold-shimmer text-midnight-black font-semibold rounded-lg"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
