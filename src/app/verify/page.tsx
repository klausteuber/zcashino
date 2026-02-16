'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import JesterLogo from '@/components/ui/JesterLogo'
import type { FullVerificationResult, GameVerificationData, FairnessVersion } from '@/types'

type VerificationMode = 'gameId' | 'manual'
type GameType = 'blackjack' | 'video_poker'

interface VerificationResponse extends FullVerificationResult {
  replay?: {
    playerCards?: string[][]
    dealerCards?: string[]
    replayedOutcome?: string
    replayedPayout?: number
    initialHand?: string[]
    finalHand?: string[]
    replayedHandRank?: string | null
  }
}

// Wrapper component to handle Suspense for useSearchParams
function VerifyPageContent() {
  const searchParams = useSearchParams()
  const initialGameId = searchParams.get('gameId') || ''
  const initialGameType = searchParams.get('gameType') === 'video_poker' ? 'video_poker' : 'blackjack'

  const [mode, setMode] = useState<VerificationMode>(initialGameId ? 'gameId' : 'manual')
  const [gameType, setGameType] = useState<GameType>(initialGameType)
  const [gameId, setGameId] = useState(initialGameId)
  const [serverSeed, setServerSeed] = useState('')
  const [serverSeedHash, setServerSeedHash] = useState('')
  const [clientSeed, setClientSeed] = useState('')
  const [nonce, setNonce] = useState('')
  const [txHash, setTxHash] = useState('')
  const [fairnessVersion, setFairnessVersion] = useState<FairnessVersion>('hmac_sha256_v1')

  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<VerificationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-verify if gameId is in URL
  useEffect(() => {
    if (initialGameId) {
      handleVerify()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async () => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const body = mode === 'gameId'
        ? { gameId, gameType }
        : {
            serverSeed,
            serverSeedHash,
            clientSeed,
            nonce: parseInt(nonce, 10),
            txHash: txHash || undefined,
            gameType,
            fairnessVersion,
          }

      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadGame = async () => {
    if (!gameId) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/verify?gameId=${encodeURIComponent(gameId)}&gameType=${encodeURIComponent(gameType)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load game')
      }

      // Populate manual fields from game data
      const gameData: GameVerificationData = data.data
      setServerSeed(gameData.serverSeed)
      setServerSeedHash(gameData.serverSeedHash)
      setClientSeed(gameData.clientSeed)
      setNonce(gameData.nonce.toString())
      setGameType(gameData.gameType === 'video_poker' ? 'video_poker' : 'blackjack')
      setFairnessVersion(gameData.fairnessVersion === 'legacy_mulberry_v1' ? 'legacy_mulberry_v1' : 'hmac_sha256_v1')
      if (gameData.commitment?.txHash) {
        setTxHash(gameData.commitment.txHash)
      }

      setMode('manual')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-masque-gold">Cypher</span>
              <span className="text-bone-white">Jester</span>
            </span>
          </Link>
          <Link
            href="/blackjack"
            className="text-venetian-gold/60 hover:text-masque-gold transition-colors"
          >
            Back to Game
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-display font-bold text-bone-white mb-2">
          Provably Fair Verification
        </h1>
        <p className="text-venetian-gold/60 mb-8">
          Verify that your game was fair using blockchain-committed seeds.
        </p>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('gameId')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'gameId'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
            }`}
          >
            Verify by Game ID
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'manual'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
            }`}
          >
            Manual Verification
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-venetian-gold/60">Game Type</span>
          <button
            onClick={() => setGameType('blackjack')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              gameType === 'blackjack'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
            }`}
          >
            Blackjack
          </button>
          <button
            onClick={() => setGameType('video_poker')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              gameType === 'video_poker'
                ? 'bg-masque-gold text-midnight-black'
                : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
            }`}
          >
            Video Poker
          </button>
        </div>

        {mode === 'manual' && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-venetian-gold/60">Shuffle Version</span>
            <button
              onClick={() => setFairnessVersion('hmac_sha256_v1')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                fairnessVersion === 'hmac_sha256_v1'
                  ? 'bg-masque-gold text-midnight-black'
                  : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
              }`}
            >
              HMAC-SHA256
            </button>
            <button
              onClick={() => setFairnessVersion('legacy_mulberry_v1')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                fairnessVersion === 'legacy_mulberry_v1'
                  ? 'bg-masque-gold text-midnight-black'
                  : 'bg-midnight-black/40 text-venetian-gold/60 hover:text-bone-white border border-masque-gold/20'
              }`}
            >
              Legacy
            </button>
          </div>
        )}

        {/* Input Form */}
        <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20 mb-8">
          {mode === 'gameId' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-venetian-gold/60 mb-2">Game ID</label>
                <input
                  type="text"
                  value={gameId}
                  onChange={(e) => setGameId(e.target.value)}
                  placeholder="Enter game ID (e.g., clx1234...)"
                  className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleVerify}
                  disabled={isLoading || !gameId}
                  className="btn-gold-shimmer text-midnight-black px-6 py-3 rounded-lg font-bold disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Verify Game'}
                </button>
                <button
                  onClick={handleLoadGame}
                  disabled={isLoading || !gameId}
                  className="bg-midnight-black/60 text-venetian-gold border border-masque-gold/20 px-6 py-3 rounded-lg font-medium hover:border-masque-gold/40 transition-colors disabled:opacity-50"
                >
                  Load for Manual Check
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-venetian-gold/60 mb-2">Server Seed</label>
                  <input
                    type="text"
                    value={serverSeed}
                    onChange={(e) => setServerSeed(e.target.value)}
                    placeholder="64-character hex string"
                    className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-venetian-gold/60 mb-2">Server Seed Hash</label>
                  <input
                    type="text"
                    value={serverSeedHash}
                    onChange={(e) => setServerSeedHash(e.target.value)}
                    placeholder="SHA-256 hash of server seed"
                    className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-venetian-gold/60 mb-2">Client Seed</label>
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    placeholder="Your client seed"
                    className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-venetian-gold/60 mb-2">Nonce</label>
                  <input
                    type="number"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    placeholder="Game number in session"
                    className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-venetian-gold/60 mb-2">
                  Commitment Transaction Hash (Optional)
                </label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Zcash transaction hash for blockchain verification"
                  className="w-full bg-midnight-black/60 border border-masque-gold/20 rounded-lg px-4 py-3 text-bone-white placeholder-venetian-gold/30 focus:outline-none focus:border-masque-gold font-mono text-sm"
                />
              </div>
              <button
                onClick={handleVerify}
                disabled={isLoading || !serverSeed || !serverSeedHash || !clientSeed || !nonce}
                className="btn-gold-shimmer text-midnight-black px-6 py-3 rounded-lg font-bold disabled:opacity-50"
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-blood-ruby/30 border border-blood-ruby text-bone-white px-4 py-3 rounded-lg mb-8">
            {error}
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="space-y-6">
            {/* Overall Status */}
            <div className={`rounded-lg p-6 border ${
              result.valid
                ? 'bg-jester-purple/10 border-jester-purple'
                : 'bg-blood-ruby/10 border-blood-ruby'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  result.valid ? 'bg-jester-purple' : 'bg-blood-ruby'
                }`}>
                  {result.valid ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-bone-white">
                    {result.valid ? 'Verification Successful' : 'Verification Failed'}
                  </h2>
                  <p className="text-venetian-gold/60">
                    {result.valid
                      ? 'This game was provably fair.'
                      : 'Some verification steps failed.'}
                  </p>
                </div>
              </div>

              {/* Verification Steps */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <VerificationStep
                  label="Hash Match"
                  passed={result.steps.hashMatches}
                  description="Server seed hashes to committed hash"
                />
                <VerificationStep
                  label="On-Chain"
                  passed={result.steps.onChainConfirmed}
                  description="Commitment found on Zcash blockchain"
                />
                <VerificationStep
                  label="Timestamp"
                  passed={result.steps.timestampValid}
                  description="Committed before game started"
                />
                <VerificationStep
                  label="Outcome"
                  passed={result.steps.outcomeValid}
                  description="Game replay matches original"
                />
              </div>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="mt-4 p-4 bg-midnight-black/40 rounded-lg">
                  <h3 className="text-sm font-medium text-blood-ruby mb-2">Issues Found:</h3>
                  <ul className="list-disc list-inside text-sm text-venetian-gold/60 space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Game Details */}
            <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
              <h3 className="text-lg font-bold text-bone-white mb-4">Game Details</h3>
              <div className="space-y-3 font-mono text-sm">
                <DetailRow label="Game ID" value={result.data.gameId} />
                <DetailRow label="Game Type" value={result.data.gameType} />
                <DetailRow label="Server Seed" value={result.data.serverSeed} truncate />
                <DetailRow label="Server Seed Hash" value={result.data.serverSeedHash} truncate />
                <DetailRow label="Client Seed" value={result.data.clientSeed} truncate />
                <DetailRow label="Nonce" value={result.data.nonce.toString()} />
                {result.data.outcome && (
                  <DetailRow label="Outcome" value={result.data.outcome} />
                )}
                {result.data.payout !== undefined && (
                  <DetailRow label="Payout" value={`${result.data.payout} ZEC`} />
                )}
              </div>
            </div>

            {/* Blockchain Proof */}
            {result.data.commitment && (
              <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
                <h3 className="text-lg font-bold text-bone-white mb-4">Blockchain Proof</h3>
                <div className="space-y-3 font-mono text-sm">
                  <DetailRow label="Transaction Hash" value={result.data.commitment.txHash} truncate />
                  <DetailRow label="Block Height" value={result.data.commitment.blockHeight.toString()} />
                  <DetailRow
                    label="Block Timestamp"
                    value={new Date(result.data.commitment.blockTimestamp).toLocaleString()}
                  />
                  {result.data.commitment.explorerUrl && (
                    <div className="pt-2">
                      <a
                        href={result.data.commitment.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-masque-gold hover:text-venetian-gold transition-colors"
                      >
                        View on Block Explorer
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.replay && (
              <div className="bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
                <h3 className="text-lg font-bold text-bone-white mb-4">Replay Data</h3>
                <div className="space-y-2 text-sm text-venetian-gold/70 font-mono break-all">
                  {result.replay.playerCards && (
                    <div>Player Cards: {JSON.stringify(result.replay.playerCards)}</div>
                  )}
                  {result.replay.dealerCards && (
                    <div>Dealer Cards: {JSON.stringify(result.replay.dealerCards)}</div>
                  )}
                  {result.replay.initialHand && (
                    <div>Initial Hand: {result.replay.initialHand.join(', ')}</div>
                  )}
                  {result.replay.finalHand && (
                    <div>Final Hand: {result.replay.finalHand.join(', ')}</div>
                  )}
                  {result.replay.replayedOutcome && (
                    <div>Replayed Outcome: {result.replay.replayedOutcome}</div>
                  )}
                  {result.replay.replayedHandRank && (
                    <div>Replayed Hand Rank: {result.replay.replayedHandRank}</div>
                  )}
                  {result.replay.replayedPayout !== undefined && (
                    <div>Replayed Payout: {result.replay.replayedPayout} ZEC</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* How It Works */}
        <div className="mt-12 bg-midnight-black/40 rounded-lg p-6 border border-masque-gold/20">
          <h3 className="text-lg font-bold text-bone-white mb-4">How Provably Fair Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-venetian-gold/70">
            <div>
              <h4 className="text-bone-white font-medium mb-2">1. Pre-Game Commitment</h4>
              <p>
                Before you place your bet, we generate a server seed and commit its SHA-256 hash
                to the Zcash blockchain. This commitment is immutable and timestamped.
              </p>
            </div>
            <div>
              <h4 className="text-bone-white font-medium mb-2">2. Your Contribution</h4>
              <p>
                You provide a client seed (or we generate one for you). This ensures we cannot
                predict the outcome, as the final result depends on your input.
              </p>
            </div>
            <div>
              <h4 className="text-bone-white font-medium mb-2">3. Game Outcome</h4>
              <p>
                The deck is shuffled using SHA256(serverSeed:clientSeed:nonce). The nonce
                increments each game, ensuring uniqueness even with the same seeds.
              </p>
            </div>
            <div>
              <h4 className="text-bone-white font-medium mb-2">4. Verification</h4>
              <p>
                After the game, we reveal the server seed. You can verify: (a) it hashes to the
                pre-committed hash, (b) the commitment is on the blockchain, (c) the outcome matches.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function VerificationStep({
  label,
  passed,
  description
}: {
  label: string
  passed: boolean
  description: string
}) {
  return (
    <div className={`p-3 rounded-lg ${passed ? 'bg-jester-purple/20' : 'bg-blood-ruby/20'}`}>
      <div className="flex items-center gap-2 mb-1">
        {passed ? (
          <svg className="w-4 h-4 text-jester-purple" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-blood-ruby" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )}
        <span className="text-xs font-medium text-bone-white">{label}</span>
      </div>
      <p className="text-xs text-venetian-gold/50">{description}</p>
    </div>
  )
}

function DetailRow({
  label,
  value,
  truncate = false
}: {
  label: string
  value: string
  truncate?: boolean
}) {
  const displayValue = truncate && value.length > 32
    ? `${value.substring(0, 16)}...${value.substring(value.length - 16)}`
    : value

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-venetian-gold/50 min-w-[140px]">{label}:</span>
      <span className="text-bone-white break-all" title={truncate ? value : undefined}>
        {displayValue}
      </span>
    </div>
  )
}

// Loading fallback for Suspense
function VerifyPageLoading() {
  return (
    <main className="min-h-screen felt-texture flex items-center justify-center">
      <div className="text-xl text-venetian-gold/60">Loading verification...</div>
    </main>
  )
}

// Main export with Suspense boundary
export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageLoading />}>
      <VerifyPageContent />
    </Suspense>
  )
}
