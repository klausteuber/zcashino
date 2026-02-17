import type { Metadata } from 'next'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandUrl = getBrandUrlForPath(brand.id, '/reserves')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/reserves')
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'

  return {
    title: 'Proof of Reserves',
    description:
      'Track visible on-chain reserve balances and liabilities. Transparent balances are publicly verifiable; shielded balances remain private.',
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Proof of Reserves | ${brandTitle}`,
      description:
        'View transparent reserve balances and platform liabilities with clear visibility limits for private pools.',
      url: brandUrl,
    },
  }
}

export default function ReservesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
