import { getPlayerGuides } from '@/lib/seo/guides'
import type { MetadataRoute } from 'next'
import { getCanonicalOrigin } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const brand = await getServerBrand()
  const canonicalOrigin = getCanonicalOrigin(brand.id)

  // Omit dates when no reliable content-modification timestamp is available.
  const lastModified = brand.id === 'veilstone' ? new Date() : undefined

  return [
    {
      url: canonicalOrigin,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${canonicalOrigin}/blackjack`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${canonicalOrigin}/video-poker`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${canonicalOrigin}/provably-fair`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${canonicalOrigin}/get-zec`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${canonicalOrigin}/why-zcash`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${canonicalOrigin}/verify`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${canonicalOrigin}/reserves`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: `${canonicalOrigin}/responsible-gambling`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${canonicalOrigin}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${canonicalOrigin}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...getPlayerGuides(brand.id).map(guide => ({
      url: `${canonicalOrigin}/guides/${guide.slug}`,
    })),
  ]
}
