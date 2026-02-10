import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Play Blackjack',
  description:
    'Play provably fair blackjack with Zcash. 0.5% house edge with basic strategy. Every hand verified on the blockchain. No account required.',
  keywords: [
    'play blackjack online',
    'crypto blackjack',
    'provably fair blackjack',
    'zcash blackjack',
    'no KYC blackjack',
  ],
  openGraph: {
    title: 'Play Provably Fair Blackjack | CypherJester',
    description:
      'Blackjack with 0.5% house edge. Every hand is blockchain-verified. Play with Zcash for maximum privacy.',
    url: 'https://cypherjester.com/blackjack',
  },
}

export default function BlackjackLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
