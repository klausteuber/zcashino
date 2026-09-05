import { getCasinoGameMetadata } from '@/lib/seo/game-metadata'
import type { Metadata } from 'next'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  if (brand.id !== 'veilstone') return getCasinoGameMetadata(brand.id, 'video-poker')
  const brandUrl = getBrandUrlForPath(brand.id, '/video-poker')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/video-poker')
  const brandTitle = brand.config.name

  return {
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
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Play Provably Fair Video Poker | ${brandTitle}`,
      description:
        'Video Poker with Jacks or Better (0.46% edge) and Deuces Wild (0.76% edge). Every hand is blockchain-verified. Play with Zcash for maximum privacy.',
      url: brandUrl,
    },
  }
}

export default function VideoPokerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
