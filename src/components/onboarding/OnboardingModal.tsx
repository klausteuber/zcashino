'use client'

import { useState, useCallback, useEffect } from 'react'
import { QRCode, CopyButton } from '@/components/ui/QRCode'
import { useDepositPolling, DepositStatus } from '@/hooks/useDepositPolling'

type OnboardingStep = 'welcome' | 'setup' | 'deposit' | 'confirming' | 'ready'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onDemoSelect: () => void
  onDepositComplete: (balance: number) => void
  sessionId: string | null
  depositAddress: string | null
  onCreateRealSession: () => Promise<{ sessionId: string; depositAddress: string } | null>
  onSetWithdrawalAddress: (address: string) => Promise<boolean>
}

export function OnboardingModal({
  isOpen,
  onClose,
  onDemoSelect,
  onDepositComplete,
  sessionId,
  depositAddress,
  onCreateRealSession,
  onSetWithdrawalAddress
}: OnboardingModalProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [withdrawalAddress, setWithdrawalAddress] = useState('')
  const [addressError, setAddressError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [localDepositAddress, setLocalDepositAddress] = useState<string | null>(depositAddress)
  const [localSessionId, setLocalSessionId] = useState<string | null>(sessionId)

  // Deposit polling
  const depositStatus = useDepositPolling(
    localSessionId,
    step === 'deposit' || step === 'confirming',
    {
      onDeposit: (amount, txHash) => {
        console.log('Deposit detected:', amount, txHash)
        setStep('confirming')
      },
      onConfirmed: (amount) => {
        console.log('Deposit confirmed:', amount)
        setStep('ready')
        setTimeout(() => {
          onDepositComplete(amount)
        }, 2000)
      }
    }
  )

  // Update local state when props change
  useEffect(() => {
    setLocalDepositAddress(depositAddress)
    setLocalSessionId(sessionId)
  }, [depositAddress, sessionId])

  // Handle demo mode selection
  const handleDemoSelect = useCallback(() => {
    onDemoSelect()
    onClose()
  }, [onDemoSelect, onClose])

  // Handle real ZEC selection
  const handleRealSelect = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await onCreateRealSession()
      if (result) {
        setLocalSessionId(result.sessionId)
        setStep('setup')
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setIsLoading(false)
    }
  }, [onCreateRealSession])

  // Validate Zcash address format
  const validateAddress = (address: string): boolean => {
    // Testnet addresses
    if (address.startsWith('tm') && address.length >= 35) return true // t-addr testnet
    if (address.startsWith('ztestsapling') && address.length >= 78) return true // z-addr testnet
    // Mainnet addresses
    if (address.startsWith('t1') && address.length >= 35) return true // t-addr mainnet
    if (address.startsWith('t3') && address.length >= 35) return true // t-addr mainnet (multisig)
    if (address.startsWith('zs') && address.length >= 78) return true // z-addr mainnet
    if (address.startsWith('u1') && address.length >= 78) return true // unified addr mainnet
    return false
  }

  // Handle withdrawal address submission
  const handleAddressSubmit = useCallback(async () => {
    if (!withdrawalAddress.trim()) {
      setAddressError('Please enter your withdrawal address')
      return
    }

    if (!validateAddress(withdrawalAddress.trim())) {
      setAddressError('Invalid Zcash address format')
      return
    }

    setIsLoading(true)
    setAddressError(null)

    try {
      const success = await onSetWithdrawalAddress(withdrawalAddress.trim())
      if (success) {
        setStep('deposit')
      } else {
        setAddressError('Failed to set withdrawal address')
      }
    } catch (err) {
      setAddressError('Failed to set withdrawal address')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [withdrawalAddress, onSetWithdrawalAddress])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-modal-enter">
        {/* Welcome Step */}
        {step === 'welcome' && (
          <WelcomeScreen
            onDemoSelect={handleDemoSelect}
            onRealSelect={handleRealSelect}
            isLoading={isLoading}
          />
        )}

        {/* Setup Step - Enter withdrawal address */}
        {step === 'setup' && (
          <SetupScreen
            withdrawalAddress={withdrawalAddress}
            onAddressChange={setWithdrawalAddress}
            onSubmit={handleAddressSubmit}
            onBack={() => setStep('welcome')}
            error={addressError}
            isLoading={isLoading}
          />
        )}

        {/* Deposit Step - Show QR code and poll */}
        {step === 'deposit' && localDepositAddress && (
          <DepositScreen
            depositAddress={localDepositAddress}
            withdrawalAddress={withdrawalAddress}
            onBack={() => setStep('setup')}
            depositStatus={depositStatus}
          />
        )}

        {/* Confirming Step - Show progress */}
        {step === 'confirming' && (
          <ConfirmingScreen depositStatus={depositStatus} />
        )}

        {/* Ready Step - Success! */}
        {step === 'ready' && (
          <ReadyScreen amount={depositStatus.amount || 0} />
        )}
      </div>
    </div>
  )
}

// Welcome Screen Component
function WelcomeScreen({
  onDemoSelect,
  onRealSelect,
  isLoading
}: {
  onDemoSelect: () => void
  onRealSelect: () => void
  isLoading: boolean
}) {
  return (
    <div className="p-8 text-center">
      <h1 className="text-3xl font-bold text-white mb-2">Welcome to Zcashino</h1>
      <p className="text-zinc-400 mb-8">Provably Fair ZEC Blackjack</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Demo Mode Card */}
        <button
          onClick={onDemoSelect}
          className="group p-6 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-amber-500/50 rounded-xl transition-all text-left"
        >
          <div className="text-3xl mb-2">🎮</div>
          <div className="text-lg font-semibold text-white mb-1">Try Demo</div>
          <div className="text-2xl font-bold text-amber-400 mb-1">10 ZEC</div>
          <div className="text-sm text-zinc-400">Play Money</div>
        </button>

        {/* Real ZEC Card */}
        <button
          onClick={onRealSelect}
          disabled={isLoading}
          className="group p-6 bg-gradient-to-br from-amber-900/30 to-amber-800/20 hover:from-amber-800/40 hover:to-amber-700/30 border border-amber-500/30 hover:border-amber-400/50 rounded-xl transition-all text-left disabled:opacity-50"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="text-3xl mb-2">💰</div>
              <div className="text-lg font-semibold text-white mb-1">Deposit</div>
              <div className="text-2xl font-bold text-amber-400 mb-1">Real ZEC</div>
              <div className="text-sm text-zinc-400">Start Now</div>
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Already have a session?{' '}
        <button className="text-amber-400 hover:text-amber-300 underline">
          Restore
        </button>
      </p>
    </div>
  )
}

// Setup Screen Component
function SetupScreen({
  withdrawalAddress,
  onAddressChange,
  onSubmit,
  onBack,
  error,
  isLoading
}: {
  withdrawalAddress: string
  onAddressChange: (value: string) => void
  onSubmit: () => void
  onBack: () => void
  error: string | null
  isLoading: boolean
}) {
  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4 transition-colors"
      >
        <span>←</span>
        <span>Back</span>
      </button>

      <h2 className="text-xl font-bold text-white mb-2">Set Withdrawal Address</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Enter your Zcash address where winnings will be sent
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Your Zcash Address
        </label>
        <input
          type="text"
          value={withdrawalAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="zs1... or t1... or tm..."
          className={`w-full px-4 py-3 bg-zinc-800 border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 transition-all ${
            error
              ? 'border-red-500 focus:ring-red-500/50'
              : 'border-zinc-600 focus:ring-amber-500/50 focus:border-amber-500'
          }`}
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <p className="mt-2 text-xs text-zinc-500">
          Supports transparent (t1/tm), shielded (zs), and unified (u1) addresses
        </p>
      </div>

      <button
        onClick={onSubmit}
        disabled={isLoading || !withdrawalAddress.trim()}
        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-600 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            <span>Setting up...</span>
          </>
        ) : (
          <span>Continue to Deposit</span>
        )}
      </button>
    </div>
  )
}

// Deposit Screen Component
function DepositScreen({
  depositAddress,
  withdrawalAddress,
  onBack,
  depositStatus
}: {
  depositAddress: string
  withdrawalAddress: string
  onBack: () => void
  depositStatus: DepositStatus
}) {
  const truncatedAddress = withdrawalAddress.length > 20
    ? `${withdrawalAddress.slice(0, 10)}...${withdrawalAddress.slice(-8)}`
    : withdrawalAddress

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4 transition-colors"
      >
        <span>←</span>
        <span>Back</span>
      </button>

      <h2 className="text-xl font-bold text-white mb-1">Deposit ZEC</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Send ZEC to start playing
      </p>

      {/* Withdrawal address confirmation */}
      <div className="mb-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className="text-xs text-zinc-400 mb-1">Withdrawals will go to:</div>
        <div className="text-sm text-amber-400 font-mono">{truncatedAddress}</div>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center mb-4">
        <div className="bg-white p-3 rounded-xl mb-3">
          <QRCode value={`zcash:${depositAddress}`} size={160} />
        </div>

        {/* Deposit address */}
        <div className="w-full">
          <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg border border-zinc-600">
            <code className="flex-1 text-sm text-zinc-300 font-mono break-all">
              {depositAddress}
            </code>
            <CopyButton text={depositAddress} />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 text-sm text-zinc-400 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">•</span>
          <span>Minimum: 0.001 ZEC</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-400">•</span>
          <span>3 confirmations required (~10-20 min)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-400">•</span>
          <span>Network: testnet</span>
        </div>
      </div>

      {/* Polling status */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
        <span className="text-sm text-zinc-300">
          {depositStatus.status === 'waiting'
            ? 'Checking for deposits...'
            : depositStatus.status === 'error'
            ? 'Error checking deposits'
            : 'Waiting for deposit...'}
        </span>
      </div>
    </div>
  )
}

// Confirming Screen Component
function ConfirmingScreen({ depositStatus }: { depositStatus: DepositStatus }) {
  const { confirmations, requiredConfirmations, amount, txHash } = depositStatus

  return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-white mb-2">Deposit Detected!</h2>
      <p className="text-3xl font-bold text-amber-400 mb-6">
        {amount?.toFixed(4)} ZEC
      </p>

      {/* Confirmation progress */}
      <div className="mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          {Array.from({ length: requiredConfirmations }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < confirmations
                  ? 'bg-green-500 text-white'
                  : 'bg-zinc-700 text-zinc-400'
              }`}
            >
              {i < confirmations ? '✓' : i + 1}
            </div>
          ))}
        </div>
        <p className="text-sm text-zinc-400">
          {confirmations}/{requiredConfirmations} confirmations
        </p>
      </div>

      {/* Estimated time */}
      <div className="mb-6 p-4 bg-zinc-800/50 rounded-lg">
        <p className="text-sm text-zinc-400 mb-1">Estimated time remaining</p>
        <p className="text-lg font-semibold text-white">
          ~{Math.max(0, (requiredConfirmations - confirmations) * 5)} minutes
        </p>
      </div>

      {/* While you wait */}
      <div className="text-left p-4 bg-zinc-800/30 rounded-lg border border-zinc-700 mb-4">
        <p className="text-sm font-medium text-zinc-300 mb-2">While you wait...</p>
        <ul className="text-sm text-zinc-400 space-y-1">
          <li>• Our games are provably fair</li>
          <li>• View proof of reserves at /reserves</li>
          <li>• House edge: only 0.5%</li>
        </ul>
      </div>

      {/* Block explorer link */}
      {txHash && (
        <a
          href={`https://explorer.zcha.in/transactions/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-amber-400 hover:text-amber-300 underline"
        >
          View on Block Explorer →
        </a>
      )}
    </div>
  )
}

// Ready Screen Component
function ReadyScreen({ amount }: { amount: number }) {
  return (
    <div className="p-8 text-center animate-success-bounce">
      <div className="text-6xl mb-4">🎰</div>
      <h2 className="text-2xl font-bold text-white mb-2">You're Ready!</h2>
      <p className="text-lg text-zinc-400 mb-2">Your balance has been credited</p>
      <p className="text-4xl font-bold text-green-400 mb-6">
        +{amount.toFixed(4)} ZEC
      </p>
      <p className="text-sm text-zinc-500">Starting game in a moment...</p>
    </div>
  )
}
