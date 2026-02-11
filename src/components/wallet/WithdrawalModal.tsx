'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

type WithdrawalStep = 'form' | 'confirm' | 'processing' | 'pending_approval' | 'success' | 'error'

interface WithdrawalModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string | null
  balance: number
  withdrawalAddress: string | null
  isDemo: boolean
  onBalanceUpdate: (newBalance: number) => void
}

const MIN_WITHDRAWAL = 0.01
const WITHDRAWAL_FEE = 0.0001

export function WithdrawalModal({
  isOpen,
  onClose,
  sessionId,
  balance,
  withdrawalAddress,
  isDemo,
  onBalanceUpdate,
}: WithdrawalModalProps) {
  const [step, setStep] = useState<WithdrawalStep>('form')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('form')
      setAmount('')
      setError(null)
      setTxHash(null)
      setTransactionId(null)
      setIsSubmitting(false)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isOpen])

  const maxWithdrawal = Math.max(0, balance - WITHDRAWAL_FEE)
  const parsedAmount = parseFloat(amount) || 0
  const totalDeducted = parsedAmount + WITHDRAWAL_FEE
  const isValidAmount = parsedAmount >= MIN_WITHDRAWAL && totalDeducted <= balance

  const handleMax = useCallback(() => {
    if (maxWithdrawal >= MIN_WITHDRAWAL) {
      setAmount(maxWithdrawal.toFixed(8).replace(/\.?0+$/, ''))
    }
  }, [maxWithdrawal])

  const handleConfirm = useCallback(() => {
    if (!isValidAmount) return
    setStep('confirm')
  }, [isValidAmount])

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !isValidAmount) return

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          sessionId,
          amount: parsedAmount,
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
        onBalanceUpdate(balance - totalDeducted)
      } else if (data.transaction?.status === 'pending_approval') {
        // Large withdrawal — held for admin approval
        setTransactionId(data.transaction.id)
        onBalanceUpdate(balance - totalDeducted)
        setStep('pending_approval')
      } else {
        // Real mode — poll for status
        setTransactionId(data.transaction.id)
        onBalanceUpdate(balance - totalDeducted)
        setStep('processing')
        startPolling(data.transaction.id)
      }
    } catch {
      setError('Network error. Please try again.')
      setStep('error')
    } finally {
      setIsSubmitting(false)
    }
  }, [sessionId, isValidAmount, parsedAmount, balance, totalDeducted, onBalanceUpdate])

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

  const truncatedAddress = withdrawalAddress
    ? withdrawalAddress.length > 24
      ? `${withdrawalAddress.slice(0, 12)}...${withdrawalAddress.slice(-10)}`
      : withdrawalAddress
    : 'Not set'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-midnight-black border border-masque-gold/30 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-modal-enter">
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
            <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <div className="text-xs text-venetian-gold/50 mb-1">Available Balance</div>
              <div className="text-2xl font-bold text-masque-gold font-mono">{balance.toFixed(4)} ZEC</div>
            </div>

            {/* Destination address */}
            <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <div className="text-xs text-venetian-gold/50 mb-1">Withdrawal Address</div>
              <div className="text-sm text-venetian-gold font-mono">{truncatedAddress}</div>
            </div>

            {!withdrawalAddress && (
              <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/30 rounded-lg">
                <p className="text-sm text-blood-ruby">No withdrawal address set. Set one during the deposit flow first.</p>
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
                  className="flex-1 px-4 py-3 bg-midnight-black/60 border border-masque-gold/20 rounded-lg text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:ring-2 focus:ring-masque-gold/50 focus:border-masque-gold font-mono"
                />
                <button
                  onClick={handleMax}
                  disabled={maxWithdrawal < MIN_WITHDRAWAL}
                  className="px-4 py-3 bg-masque-gold/10 border border-masque-gold/30 rounded-lg text-masque-gold text-sm font-semibold hover:bg-masque-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Fee breakdown */}
            {parsedAmount > 0 && (
              <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20 space-y-1 text-sm font-mono">
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
              <div className="mb-4 p-3 bg-masque-gold/10 border border-masque-gold/30 rounded-lg">
                <p className="text-sm text-venetian-gold">Demo mode: withdrawal is simulated instantly.</p>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!isValidAmount || !withdrawalAddress}
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
              <div className="p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">Sending</div>
                <div className="text-2xl font-bold text-masque-gold font-mono">{parsedAmount.toFixed(4)} ZEC</div>
              </div>

              <div className="p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">To</div>
                <div className="text-sm text-venetian-gold font-mono break-all">{withdrawalAddress}</div>
              </div>

              <div className="p-3 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
                <div className="text-xs text-venetian-gold/50 mb-1">Network Fee</div>
                <div className="text-sm text-venetian-gold font-mono">{WITHDRAWAL_FEE} ZEC</div>
              </div>

              <div className="p-3 bg-masque-gold/10 rounded-lg border border-masque-gold/30">
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
