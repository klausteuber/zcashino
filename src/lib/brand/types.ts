export type BrandId = 'cypher' | '21z'

export type BrandSource = 'forced' | 'mapped' | 'fallback' | 'single-brand'

export interface BrandSeoConfig {
  canonicalOrigin: string
  robotsIndex: boolean
}

export interface BrandConfig {
  id: BrandId
  name: string
  shortName: string
  tagline: string
  origin: string
  description: string
  ogImagePath: string
  logoPath: string
  themeColor: string
  backgroundColor: string
  adminEnabled: boolean
  seo: BrandSeoConfig
}

export interface ResolvedBrand {
  id: BrandId
  config: BrandConfig
  source: BrandSource
  host: string | null
}
