import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBrandConfig } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import sitemap from '@/app/sitemap'
import PlayerGuidePage, { generateMetadata as guideMetadata } from '@/app/guides/[slug]/page'
import { generateMetadata as blackjackMetadata } from '@/app/blackjack/layout'
import { generateMetadata as pokerMetadata } from '@/app/video-poker/layout'

vi.mock('@/lib/brand/server', () => ({ getServerBrand: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404') } }))

function useBrand(id: 'cypher' | '21z' | 'veilstone') {
  vi.mocked(getServerBrand).mockResolvedValue({ id, config: getBrandConfig(id), host: null, source: 'mapped' })
}

beforeEach(() => vi.clearAllMocks())

describe('Casino SEO brand boundaries', () => {
  it.each(['cypher', '21z'] as const)('advertises only reachable %s guides on its own canonical domain', async id => {
    useBrand(id)
    const urls = await sitemap()
    const origin = getBrandConfig(id).seo.canonicalOrigin
    expect(urls.every(entry => entry.url.startsWith(`${origin}/`) || entry.url === origin)).toBe(true)
    expect(urls.every(entry => entry.lastModified === undefined)).toBe(true)
    const guides = urls.filter(entry => entry.url.includes('/guides/'))
    expect(guides).toHaveLength(2)
    for (const guide of guides) {
      const slug = guide.url.split('/').pop()!
      const metadata = await guideMetadata({ params: Promise.resolve({ slug }) })
      expect(metadata.alternates?.canonical).toBe(guide.url)
      expect(metadata.openGraph).toMatchObject({ url: guide.url })
      expect(await PlayerGuidePage({ params: Promise.resolve({ slug }) })).toBeTruthy()
    }
  })

  it.each([
    ['cypher', 'verify-blackjack-hand'],
    ['21z', 'video-poker-payouts'],
    ['veilstone', 'getting-started-with-zcash'],
    ['cypher', 'missing-guide'],
  ] as const)('returns not found for %s requesting %s', async (id, slug) => {
    useBrand(id)
    const props = { params: Promise.resolve({ slug }) }
    await expect(guideMetadata(props)).rejects.toThrow('404')
    await expect(PlayerGuidePage(props)).rejects.toThrow('404')
  })

  it('does not add casino guides to Veilstone', async () => {
    useBrand('veilstone')
    expect((await sitemap()).some(entry => entry.url.includes('/guides/'))).toBe(false)
  })

  it.each(['cypher', '21z'] as const)('uses page-specific canonical and sharing metadata for %s games', async id => {
    useBrand(id)
    for (const [path, generate] of [['blackjack', blackjackMetadata], ['video-poker', pokerMetadata]] as const) {
      const metadata = await generate()
      const canonical = `${getBrandConfig(id).seo.canonicalOrigin}/${path}`
      expect(metadata.alternates?.canonical).toBe(canonical)
      expect(metadata.openGraph).toMatchObject({ url: canonical, images: [getBrandConfig(id).ogImagePath] })
      expect(metadata.twitter).toMatchObject({ description: metadata.description })
    }
  })
})
