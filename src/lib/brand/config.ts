import { BrandConfig, BrandId } from '@/lib/brand/types'

export const BRAND_CONFIGS: Record<BrandId, BrandConfig> = {
  cypher: {
    id: 'cypher',
    name: 'CypherJester',
    shortName: 'Cypher',
    tagline: 'Play in Private. Verify in Public.',
    origin: 'https://cypherjester.com',
    description:
      'Provably fair Zcash blackjack and video poker. Play in private, verify in public.',
    ogImagePath: '/images/og-image.png',
    logoPath: '/images/jester-logo.png',
    themeColor: '#C9A227',
    backgroundColor: '#0D0D0D',
    adminEnabled: true,
    seo: {
      canonicalOrigin: 'https://21z.cash',
      robotsIndex: true,
    },
  },
  '21z': {
    id: '21z',
    name: '21z',
    shortName: '21z',
    tagline: 'Prove Everything. Reveal Nothing.',
    origin: 'https://21z.cash',
    description:
      'Provably fair Zcash blackjack and video poker. Verify every outcome without sacrificing privacy.',
    ogImagePath: '/branding/21z/og-image.png',
    logoPath: '/branding/21z/icon.svg',
    themeColor: '#00F0FF',
    backgroundColor: '#05050A',
    adminEnabled: false,
    seo: {
      canonicalOrigin: 'https://21z.cash',
      robotsIndex: true,
    },
  },
}

export function getBrandConfig(brandId: BrandId): BrandConfig {
  return BRAND_CONFIGS[brandId]
}

export function getCanonicalOrigin(brandId: BrandId): string {
  return BRAND_CONFIGS[brandId].seo.canonicalOrigin
}

export function makeAbsoluteUrl(origin: string, pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${origin}${normalizedPath}`
}

export function getCanonicalUrlForPath(brandId: BrandId, pathname: string): string {
  return makeAbsoluteUrl(getCanonicalOrigin(brandId), pathname)
}

export function getBrandUrlForPath(brandId: BrandId, pathname: string): string {
  return makeAbsoluteUrl(BRAND_CONFIGS[brandId].origin, pathname)
}
