'use client'

import { useState, useCallback, useEffect } from 'react'
import { QRCode, CopyButton } from '@/components/ui/QRCode'
import { useDepositPolling, DepositStatus } from '@/hooks/useDepositPolling'
import { useBrand } from '@/hooks/useBrand'
import { SwapWidget } from '@/components/swap/SwapWidget'

type OnboardingStep = 'welcome' | 'setup' | 'deposit' | 'confirming' | 'ready' | 'error'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onDemoSelect: () => void
  onDepositComplete: (balance: number) => void
  sessionId: string | null
  depositAddress: string | null
  onCreateRealSession: () => Promise<{ sessionId: string; depositAddress: string | null; walletError?: string; walletErrorMessage?: string } | null>
  onSetWithdrawalAddress?: (address: string) => Promise<boolean>
  /** Skip welcome screen and go directly to deposit flow */
  initialStep?: 'welcome' | 'deposit'
}

export function OnboardingModal({
  isOpen,
  onClose,
  onDemoSelect,
  onDepositComplete,
  sessionId,
  depositAddress,
  onCreateRealSession,
  onSetWithdrawalAddress,
  initialStep = 'welcome'
}: OnboardingModalProps) {
  const brand = useBrand()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [withdrawalAddress, setWithdrawalAddress] = useState('')
  const [addressError, setAddressError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [localDepositAddress, setLocalDepositAddress] = useState<string | null>(depositAddress)
  const [localSessionId, setLocalSessionId] = useState<string | null>(sessionId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  // Handle modal open/close and initialStep
  useEffect(() => {
    if (isOpen) {
      if (depositAddress && sessionId) {
        // Already have a real session with deposit address — go straight to deposit
        setLocalDepositAddress(depositAddress)
        setLocalSessionId(sessionId)
        setStep('deposit')
      } else if (initialStep === 'deposit') {
        // Caller wants direct-to-deposit — auto-create real session
        handleRealSelect()
      }
      // else: show welcome screen (default)
    }
    if (!isOpen) {
      // Reset to welcome when modal closes so next open starts fresh
      setStep('welcome')
      setErrorMessage(null)
    }
  }, [isOpen, depositAddress, sessionId, initialStep]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle demo mode selection
  const handleDemoSelect = useCallback(() => {
    onDemoSelect()
    onClose()
  }, [onDemoSelect, onClose])

  // Handle real ZEC selection — skip setup, go straight to deposit
  const handleRealSelect = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      // Pre-flight health check — fail fast with a clear message if the node is down
      try {
        const healthRes = await fetch('/api/health', { signal: AbortSignal.timeout(4000) })
        if (healthRes.ok) {
          const health = await healthRes.json()
          if (health.zcashNode && !health.zcashNode.connected) {
            setErrorMessage('The Zcash node is temporarily offline. Please try again in a minute.')
            setStep('error')
            setIsLoading(false)
            return
          }
        }
      } catch {
        // Health check itself failed — proceed anyway, session creation will catch it
        console.warn('[Onboarding] Health check failed, proceeding with session creation')
      }

      const result = await onCreateRealSession()
      if (result && result.depositAddress) {
        setLocalSessionId(result.sessionId)
        setLocalDepositAddress(result.depositAddress)
        setStep('deposit')
      } else if (result) {
        // Session created but no deposit address — check for specific wallet error
        if (result.sessionId) setLocalSessionId(result.sessionId)
        setErrorMessage(result.walletErrorMessage || 'Failed to generate deposit address. Please try again.')
        setStep('error')
      } else {
        setErrorMessage('Failed to create session. Please try again.')
        setStep('error')
      }
    } catch (err) {
      console.error('Failed to create session:', err)
      setErrorMessage('Failed to create session. Please try again.')
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }, [onCreateRealSession])

  // Validate Zcash address format
  const validateAddress = (address: string): boolean => {
    // Testnet addresses
    if (address.startsWith('tm') && address.length >= 35) return true // t-addr testnet
    if (address.startsWith('ztestsapling') && address.length >= 78) return true // z-addr testnet
    if (address.startsWith('utest') && address.length >= 50) return true // unified addr testnet
    // Mainnet addresses
    if (address.startsWith('t1') && address.length >= 35) return true // t-addr mainnet
    if (address.startsWith('t3') && address.length >= 35) return true // t-addr mainnet (multisig)
    if (address.startsWith('zs') && address.length >= 78) return true // z-addr mainnet
    if (address.startsWith('u1') && address.length >= 50) return true // unified addr mainnet
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
      const success = onSetWithdrawalAddress ? await onSetWithdrawalAddress(withdrawalAddress.trim()) : false
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
      <div className="bg-midnight-black border border-masque-gold/30 rounded-2xl cyber-panel shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-modal-enter">
        {/* Welcome Step */}
        {step === 'welcome' && (
          <WelcomeScreen
            onDemoSelect={handleDemoSelect}
            onRealSelect={handleRealSelect}
            isLoading={isLoading}
            brandName={brand.config.name}
            tagline={brand.config.tagline}
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
            withdrawalAddress={withdrawalAddress || null}
            onBack={() => setStep('welcome')}
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

        {/* Error Step */}
        {step === 'error' && (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-display font-bold text-bone-white mb-2">Something Went Wrong</h2>
            <p className="text-sm text-venetian-gold/50 mb-6">
              {errorMessage || 'An unexpected error occurred.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setErrorMessage(null)
                  setStep('welcome')
                }}
                className="px-6 py-3 bg-midnight-black/60 hover:bg-midnight-black border border-masque-gold/30 hover:border-masque-gold/50 text-bone-white rounded-lg transition-all"
              >
                Go Back
              </button>
              <button
                onClick={handleRealSelect}
                disabled={isLoading}
                className="px-6 py-3 btn-gold-shimmer text-midnight-black font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Retrying...' : 'Try Again'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Welcome Screen Component
function WelcomeScreen({
  onDemoSelect,
  onRealSelect,
  isLoading,
  brandName,
  tagline,
}: {
  onDemoSelect: () => void
  onRealSelect: () => void
  isLoading: boolean
  brandName: string
  tagline: string
}) {
  return (
    <div className="p-8 text-center">
      <h1 className="text-3xl font-display font-bold text-bone-white mb-2">Welcome to {brandName}</h1>
      <p className="text-venetian-gold/50 mb-8">{tagline}</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Demo Mode Card */}
        <button
          onClick={onDemoSelect}
          className="group p-6 bg-midnight-black/60 hover:bg-jester-purple-dark/30 border border-masque-gold/20 hover:border-masque-gold/50 rounded-xl cyber-panel transition-all text-left"
        >
          <div className="text-3xl mb-2">🎮</div>
          <div className="text-lg font-semibold text-bone-white mb-1">Try Demo</div>
          <div className="text-2xl font-bold text-masque-gold mb-1">10 ZEC</div>
          <div className="text-sm text-venetian-gold/50">Play Money</div>
        </button>

        {/* Real ZEC Card */}
        <button
          onClick={onRealSelect}
          disabled={isLoading}
          className="group p-6 bg-gradient-to-br from-jester-purple-dark/40 to-jester-purple/20 hover:from-jester-purple-dark/50 hover:to-jester-purple/30 border border-masque-gold/30 hover:border-masque-gold/50 rounded-xl cyber-panel transition-all text-left disabled:opacity-50"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-masque-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="text-3xl mb-2">💰</div>
              <div className="text-lg font-semibold text-bone-white mb-1">Deposit</div>
              <div className="text-2xl font-bold text-masque-gold mb-1">Real ZEC</div>
              <div className="text-sm text-venetian-gold/50">Start Now</div>
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-venetian-gold/50">
        Already have a session?{' '}
        <button className="text-masque-gold hover:text-venetian-gold underline">
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
        className="flex items-center gap-2 text-venetian-gold/50 hover:text-bone-white mb-4 transition-colors"
      >
        <span>←</span>
        <span>Back</span>
      </button>

      <h2 className="text-xl font-display font-bold text-bone-white mb-2">Set Withdrawal Address</h2>
      <p className="text-sm text-venetian-gold/50 mb-6">
        Enter your Zcash address where winnings will be sent
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-venetian-gold mb-2">
          Your Zcash Address
        </label>
        <input
          type="text"
          value={withdrawalAddress}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="zs1... or t1... or tm..."
          className={`w-full px-4 py-3 bg-midnight-black/60 border rounded-lg cyber-panel text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:ring-2 transition-all ${
            error
              ? 'border-blood-ruby focus:ring-blood-ruby/50'
              : 'border-masque-gold/20 focus:ring-masque-gold/50 focus:border-masque-gold'
          }`}
        />
        {error && <p className="mt-2 text-sm text-blood-ruby">{error}</p>}
        <p className="mt-2 text-xs text-venetian-gold/50">
          Supports transparent (t1/tm), shielded (zs), and unified (u1) addresses
        </p>
      </div>

      <button
        onClick={onSubmit}
        disabled={isLoading || !withdrawalAddress.trim()}
        className="w-full py-3 btn-gold-shimmer disabled:bg-midnight-black/40 disabled:cursor-not-allowed text-midnight-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-midnight-black border-t-transparent rounded-full animate-spin" />
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
type DepositTab = 'have-zec' | 'need-zec'

function DepositScreen({
  depositAddress,
  withdrawalAddress,
  onBack,
  depositStatus
}: {
  depositAddress: string
  withdrawalAddress: string | null
  onBack: () => void
  depositStatus: DepositStatus
}) {
  const [activeTab, setActiveTab] = useState<DepositTab>('have-zec')
  const truncatedAddress = withdrawalAddress && withdrawalAddress.length > 20
    ? `${withdrawalAddress.slice(0, 10)}...${withdrawalAddress.slice(-8)}`
    : withdrawalAddress

  const networkLabel = getAddressNetworkLabel(depositAddress)

  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-venetian-gold/50 hover:text-bone-white mb-4 transition-colors"
      >
        <span>←</span>
        <span>Back</span>
      </button>

      <h2 className="text-xl font-display font-bold text-bone-white mb-1">Deposit ZEC</h2>
      <p className="text-sm text-venetian-gold/50 mb-4">
        Send ZEC to start playing
      </p>

      {/* Tab bar */}
      <div className="flex border-b border-masque-gold/20 mb-4">
        <button
          onClick={() => setActiveTab('have-zec')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'have-zec'
              ? 'border-masque-gold text-masque-gold'
              : 'border-transparent text-venetian-gold/50 hover:text-venetian-gold/70'
          }`}
        >
          I Have ZEC
        </button>
        <button
          onClick={() => setActiveTab('need-zec')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'need-zec'
              ? 'border-masque-gold text-masque-gold'
              : 'border-transparent text-venetian-gold/50 hover:text-venetian-gold/70'
          }`}
        >
          Need ZEC?
        </button>
      </div>

      {/* Tab content: I Have ZEC */}
      {activeTab === 'have-zec' && (
        <>
          {/* Withdrawal address confirmation (only shown if already set) */}
          {truncatedAddress && (
            <div className="mb-4 p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
              <div className="text-xs text-venetian-gold/50 mb-1">Withdrawals will go to:</div>
              <div className="text-sm text-masque-gold font-mono">{truncatedAddress}</div>
            </div>
          )}

          {/* QR Code */}
          <div className="flex flex-col items-center mb-4">
            <div className="bg-bone-white p-3 rounded-xl mb-3">
              <QRCode value={depositAddress} size={160} />
            </div>

            {/* Deposit address */}
            <div className="w-full">
              <div className="flex items-center gap-2 p-3 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20">
                <code className="flex-1 text-sm text-venetian-gold font-mono break-all">
                  {depositAddress}
                </code>
                <CopyButton text={depositAddress} />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm text-venetian-gold/50 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-masque-gold">•</span>
              <span>Minimum: 0.001 ZEC</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-masque-gold">•</span>
              <span>3 confirmations required (~10-20 min)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-masque-gold">•</span>
              <span>Network: {networkLabel}</span>
            </div>
          </div>
        </>
      )}

      {/* Tab content: Need ZEC? */}
      {activeTab === 'need-zec' && (
        <SwapWidget depositAddress={depositAddress} />
      )}

      {/* Polling status — always visible on both tabs */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-midnight-black/60 rounded-lg cyber-panel border border-masque-gold/20 mt-4">
        <div className="w-2 h-2 bg-masque-gold rounded-full animate-pulse" />
        <span className="text-sm text-venetian-gold">
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

function getAddressNetworkLabel(address: string): 'mainnet' | 'testnet' | 'unknown' {
  if (
    address.startsWith('t1') ||
    address.startsWith('t3') ||
    address.startsWith('zs') ||
    address.startsWith('u1')
  ) {
    return 'mainnet'
  }

  if (
    address.startsWith('tm') ||
    address.startsWith('ztestsapling') ||
    address.startsWith('utest')
  ) {
    return 'testnet'
  }

  return 'unknown'
}

// Confirming Screen Component
function ConfirmingScreen({ depositStatus }: { depositStatus: DepositStatus }) {
  const { confirmations, requiredConfirmations, amount, txHash } = depositStatus

  return (
    <div className="p-8 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-2xl font-display font-bold text-bone-white mb-2">Deposit Detected!</h2>
      <p className="text-3xl font-bold text-masque-gold mb-6">
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
                  ? 'bg-jester-purple text-bone-white'
                  : 'bg-midnight-black/60 text-venetian-gold/50'
              }`}
            >
              {i < confirmations ? '✓' : i + 1}
            </div>
          ))}
        </div>
        <p className="text-sm text-venetian-gold/50">
          {confirmations}/{requiredConfirmations} confirmations
        </p>
      </div>

      {/* Estimated time */}
      <div className="mb-6 p-4 bg-midnight-black/60 rounded-lg cyber-panel">
        <p className="text-sm text-venetian-gold/50 mb-1">Estimated time remaining</p>
        <p className="text-lg font-semibold text-bone-white">
          ~{Math.max(0, (requiredConfirmations - confirmations) * 5)} minutes
        </p>
      </div>

      {/* While you wait */}
      <div className="text-left p-4 bg-jester-purple-dark/20 rounded-lg cyber-panel border border-masque-gold/20 mb-4">
        <p className="text-sm font-medium text-venetian-gold mb-2">While you wait...</p>
        <ul className="text-sm text-venetian-gold/50 space-y-1">
          <li>• Our games are provably fair</li>
          <li>• View proof of reserves at /reserves</li>
          <li>• Blackjack edge: around 0.5% with basic strategy</li>
        </ul>
      </div>

      {/* Block explorer link */}
      {txHash && (
        <a
          href={`https://explorer.zcha.in/transactions/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-masque-gold hover:text-venetian-gold underline"
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
      <h2 className="text-2xl font-display font-bold text-bone-white mb-2">You&apos;re Ready!</h2>
      <p className="text-lg text-venetian-gold/50 mb-2">Your balance has been credited</p>
      <p className="text-4xl font-bold text-jester-purple-light mb-6">
        +{amount.toFixed(4)} ZEC
      </p>
      <p className="text-sm text-venetian-gold/50">Starting game in a moment...</p>
    </div>
  )
}
