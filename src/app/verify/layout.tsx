import type { Metadata } from 'next'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/verify')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/verify')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Verify Game Fairness',
    description:
      `Independently verify any ${brandTitle} game outcome. Check blockchain commitments, seed hashes, and game replay to confirm provable fairness.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Verify Game Fairness | ${brandTitle}`,
      description:
        'Independently verify any game was fair using blockchain-committed seeds.',
      url: brandUrl,
    },
  }
}

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
