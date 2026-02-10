import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="min-h-screen felt-texture flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <Image
          src="/images/jester-logo.png"
          alt="CypherJester"
          width={64}
          height={64}
          className="mx-auto mb-6"
        />
        <h1 className="text-6xl font-display font-bold text-masque-gold mb-4">
          404
        </h1>
        <h2 className="text-2xl font-display font-semibold text-bone-white mb-3">
          The Jester Has No Card Here
        </h2>
        <p className="text-venetian-gold/70 mb-8">
          This page does not exist. Perhaps the hand was folded.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="btn-gold-shimmer px-6 py-3 text-midnight-black font-semibold rounded-lg"
          >
            Back to Home
          </a>
          <a
            href="/blackjack"
            className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors"
          >
            Play Blackjack
          </a>
        </div>
      </div>
    </main>
  )
}
