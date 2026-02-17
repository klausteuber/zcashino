import type { MetadataRoute } from 'next'
import { getCanonicalOrigin } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const brand = await getServerBrand()
  const canonicalOrigin = getCanonicalOrigin(brand.id)

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${canonicalOrigin}/sitemap.xml`,
  }
}
