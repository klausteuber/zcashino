import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import JesterLogo from '@/components/ui/JesterLogo'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import VerifiedHandsFeed from '@/components/feed/VerifiedHandsFeed'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/feed')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/feed')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Verified Hands',
    description:
      `Live feed of recently verified game hands at ${brandTitle}. Every outcome is provably fair and verifiable on-chain.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Verified Hands | ${brandTitle}`,
      url: brandUrl,
    },
  }
}

export default function FeedPage() {
  return (
    <main className="min-h-screen felt-texture">
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <BrandWordmark />
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/blackjack" className="hover:text-masque-gold transition-colors">
              Blackjack
            </Link>
            <Link href="/video-poker" className="hover:text-masque-gold transition-colors">
              Video Poker
            </Link>
            <Link href="/provably-fair" className="hover:text-masque-gold transition-colors">
              Provably Fair
            </Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-display font-bold mb-2 text-bone-white">
          Verified Hands
        </h1>
        <p className="text-venetian-gold/70 mb-8">
          Every game played here is provably fair. This feed shows recent completed hands
          &mdash; click &ldquo;verify&rdquo; on any entry to independently confirm the outcome.
        </p>

        <div className="bg-midnight-black/40 backdrop-blur-sm rounded-xl p-6 border border-masque-gold/20">
          <VerifiedHandsFeed limit={50} />
        </div>

        <div className="mt-8 bg-midnight-black/30 rounded-xl p-5 border border-masque-gold/10">
          <h2 className="text-lg font-display font-semibold text-bone-white mb-2">
            Privacy Notice
          </h2>
          <p className="text-venetian-gold/60 text-sm">
            This feed is delayed by 5 minutes and shows bet ranges instead of exact amounts
            to protect player privacy. No session identifiers, wallet addresses, or personal
            data are exposed. During low-activity periods, the feed may be temporarily hidden
            to prevent statistical inference.
          </p>
        </div>
      </div>
    </main>
  )
}
