'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import JesterLogo from '@/components/ui/JesterLogo'
import { useBrand } from '@/hooks/useBrand'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const brand = useBrand()
  const is21z = brand.id === '21z'

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen felt-texture scanline-overlay flex items-center justify-center px-4">
      <div className="text-center max-w-md rounded-xl cyber-panel bg-midnight-black/40 border border-masque-gold/20 p-8">
        <JesterLogo size="lg" className="text-masque-gold mx-auto mb-6" />
        <h1 className="text-3xl font-display font-bold text-bone-white mb-3">
          {is21z ? 'Signal Interference' : 'Something Went Wrong'}
        </h1>
        <p className="text-venetian-gold/70 mb-6">
          {is21z
            ? 'A transient fault interrupted this screen. Session and balance remain intact.'
            : 'An unexpected error occurred. Your balance and session are safe.'}
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
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
