import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Play Video Poker',
  description:
    'Play provably fair Video Poker with Zcash. Jacks or Better and Deuces Wild variants. Every hand verified on the blockchain. No account required.',
  keywords: [
    'video poker online',
    'jacks or better',
    'deuces wild',
    'crypto video poker',
    'provably fair video poker',
    'zcash video poker',
    'no KYC video poker',
  ],
  openGraph: {
    title: 'Play Provably Fair Video Poker | CypherJester',
    description:
      'Video Poker with Jacks or Better (0.46% edge) and Deuces Wild (0.76% edge). Every hand is blockchain-verified. Play with Zcash for maximum privacy.',
    url: 'https://cypherjester.com/video-poker',
  },
}

export default function VideoPokerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
