import type { Metadata } from 'next'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/blackjack')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/blackjack')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Play Blackjack',
    description:
      'Play provably fair blackjack with Zcash. Around 0.5% house edge with basic strategy and re-split aces enabled. Every hand verified on the blockchain. No account required.',
    keywords: [
      'play blackjack online',
      'crypto blackjack',
      'provably fair blackjack',
      'zcash blackjack',
      'no KYC blackjack',
    ],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Play Provably Fair Blackjack | ${brandTitle}`,
      description:
        'Blackjack with around 0.5% house edge and re-split aces enabled. Every hand is blockchain-verified. Play with Zcash for maximum privacy.',
      url: brandUrl,
    },
  }
}

export default function BlackjackLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
