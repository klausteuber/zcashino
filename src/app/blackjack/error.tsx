'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import JesterLogo from '@/components/ui/JesterLogo'

export default function BlackjackError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen felt-texture flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <JesterLogo size="lg" className="text-blood-ruby mx-auto mb-6" />
        <h1 className="text-3xl font-display font-bold text-bone-white mb-3">Game Interrupted</h1>
        <p className="text-venetian-gold/70 mb-2">
          Something went wrong during the game. Your balance has not been affected.
        </p>
        <p className="text-sm text-venetian-gold/50 mb-6">
          If you were mid-hand, the game state is preserved server-side and will resume on reload.
        </p>
        {error.digest && (
          <p className="text-xs text-venetian-gold/40 font-mono mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="btn-gold-shimmer px-6 py-3 text-midnight-black font-semibold rounded-lg"
          >
            Resume Game
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors"
          >
            Return to Lobby
          </Link>
        </div>
      </div>
    </div>
  )
}
