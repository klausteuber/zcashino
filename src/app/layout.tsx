import type { Metadata } from 'next'
import { headers } from 'next/headers'
import {
  Cinzel,
  IBM_Plex_Mono,
  Inter,
  Orbitron,
  Rajdhani,
  Space_Mono,
} from 'next/font/google'
import { BrandProvider } from '@/components/brand/BrandProvider'
import { getBrandConfig, makeAbsoluteUrl } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import './globals.css'

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  preload: false,
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  preload: false,
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  preload: false,
})

const orbitron = Orbitron({
  variable: '--font-orbitron',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  preload: false,
})

const rajdhani = Rajdhani({
  variable: '--font-rajdhani',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  preload: false,
})

const spaceMono = Space_Mono({
  variable: '--font-space-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
  preload: false,
})

export const dynamic = 'force-dynamic'

function getRootMetadataForBrand(brandId: 'cypher' | '21z' | 'veilstone'): Metadata {
  const brand = getBrandConfig(brandId)
  const canonicalUrl = makeAbsoluteUrl(brand.seo.canonicalOrigin, '/')

  const title =
    brandId === 'veilstone'
      ? {
          default: 'Veilstone - City-States of the Shielded Frontier',
          template: '%s | Veilstone',
        }
      : brandId === '21z'
      ? {
          default: '21z - Provably Fair Zcash Blackjack Casino',
          template: '%s | 21z',
        }
      : {
          default: 'CypherJester - Provably Fair Zcash Blackjack Casino',
          template: '%s | CypherJester',
        }

  const keywordCore =
    brandId === 'veilstone'
      ? ['veilstone', 'play zec game', 'economic strategy game', 'cypherpunk board game']
      : brandId === '21z'
      ? ['21z', '21z.cash', 'cyberpunk casino', 'zcash casino']
      : ['cypherjester', 'cypherjester.com', 'privacy casino']

  return {
    metadataBase: new URL(brand.origin),
    title,
    description: brand.description,
    keywords: [
      ...(brandId === 'veilstone'
        ? ['zcash strategy game', 'play zec', 'realtime board game', 'shielded capital']
        : [
            'provably fair blackjack',
            'zcash casino',
            'crypto blackjack',
            'privacy casino',
            'no KYC casino',
            'verifiable casino',
            'blockchain blackjack',
          ]),
      ...keywordCore,
    ],
    authors: [{ name: brand.name }],
    creator: brand.name,
    publisher: brand.name,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: makeAbsoluteUrl(brand.origin, '/'),
      siteName: brand.name,
      title: `${brand.name} - ${
        brandId === 'veilstone'
          ? 'City-States of the Shielded Frontier'
          : brandId === '21z'
            ? 'Prove Everything. Reveal Nothing.'
            : 'Play in Private. Verify in Public.'
      }`,
      description: brand.description,
      images: [
        {
          url: brand.ogImagePath,
          width: 1200,
          height: 630,
          alt: brandId === 'veilstone'
            ? `${brand.name} - City-States of the Shielded Frontier`
            : `${brand.name} - Provably Fair Zcash Blackjack`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: brandId === 'veilstone'
        ? `${brand.name} - City-States of the Shielded Frontier`
        : `${brand.name} - Provably Fair Zcash Blackjack`,
      description: brand.description,
      images: [brand.ogImagePath],
    },
    icons: brandId === 'veilstone'
      ? {
          icon: [
            { url: '/branding/veilstone/icon.svg', type: 'image/svg+xml' },
          ],
          apple: '/branding/veilstone/icon.svg',
        }
      : brandId === '21z'
      ? {
          icon: [
            { url: '/branding/21z/favicon.ico', sizes: '48x48' },
            { url: '/branding/21z/icon.svg', type: 'image/svg+xml' },
          ],
          apple: '/branding/21z/apple-touch-icon.png',
        }
      : {
          icon: [
            { url: '/favicon.ico', sizes: '48x48' },
            { url: '/icon.svg', type: 'image/svg+xml' },
          ],
          apple: '/apple-touch-icon.png',
        },
    manifest: brandId === 'veilstone'
      ? '/branding/veilstone/site.webmanifest'
      : brandId === '21z'
        ? '/branding/21z/site.webmanifest'
        : '/site.webmanifest',
    robots: {
      index: brand.seo.robotsIndex,
      follow: true,
    },
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const resolved = await getServerBrand()
  return getRootMetadataForBrand(resolved.id)
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await getServerBrand()
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.config.name,
    url: brand.config.origin,
    logo: makeAbsoluteUrl(brand.config.origin, brand.config.logoPath),
    description: brand.config.description,
  }

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: brand.id === 'veilstone' ? 'Veilstone' : `${brand.config.name} Blackjack`,
    url: makeAbsoluteUrl(brand.config.origin, brand.id === 'veilstone' ? '/veilstone' : '/blackjack'),
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    description: brand.config.description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free to try with demo mode. Real play uses Zcash (ZEC).',
    },
  }

  return (
    <html lang="en">
      <body
        data-brand={brand.id}
        className={[
          cinzel.variable,
          inter.variable,
          ibmPlexMono.variable,
          orbitron.variable,
          rajdhani.variable,
          spaceMono.variable,
          'font-body antialiased',
        ].join(' ')}
      >
        <a href="#site-content" className="skip-link">
          Skip to main content
        </a>
        <BrandProvider brand={brand}>
          <script
            type="application/ld+json"
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: JSON.stringify([organizationSchema, webAppSchema]),
            }}
          />
          <div id="site-content" tabIndex={-1}>
            {children}
          </div>
        </BrandProvider>
      </body>
    </html>
  )
}
