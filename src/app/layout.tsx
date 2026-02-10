import type { Metadata } from 'next'
import { Cinzel, Inter, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://cypherjester.com'),
  title: {
    default: 'CypherJester - Provably Fair Zcash Blackjack Casino',
    template: '%s | CypherJester',
  },
  description:
    'Play provably fair blackjack with Zcash. Every hand is verifiable on-chain. No KYC, no accounts, instant payouts. Play in private, verify in public.',
  keywords: [
    'provably fair blackjack',
    'zcash casino',
    'crypto blackjack',
    'privacy casino',
    'no KYC casino',
    'verifiable casino',
    'cryptocurrency gambling',
    'blockchain blackjack',
    'anonymous casino',
    'ZEC gambling',
    'cypherjester',
  ],
  authors: [{ name: 'CypherJester' }],
  creator: 'CypherJester',
  publisher: 'CypherJester',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cypherjester.com',
    siteName: 'CypherJester',
    title: 'CypherJester - Play in Private. Verify in Public.',
    description:
      'Provably fair Zcash blackjack. Every game outcome verified on the blockchain. No accounts, no KYC, instant payouts.',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CypherJester - Provably Fair Zcash Blackjack',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CypherJester - Provably Fair Zcash Blackjack',
    description:
      'Play in private. Verify in public. Provably fair blackjack powered by Zcash.',
    images: ['/images/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'CypherJester',
  url: 'https://cypherjester.com',
  logo: 'https://cypherjester.com/images/jester-logo.png',
  description:
    'Provably fair Zcash blackjack casino. Play in private, verify in public.',
}

const webAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'CypherJester Blackjack',
  url: 'https://cypherjester.com/blackjack',
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web',
  description:
    'Provably fair blackjack game powered by Zcash cryptocurrency with blockchain-verified outcomes.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to try with demo mode. Real play uses Zcash (ZEC).',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${cinzel.variable} ${inter.variable} ${ibmPlexMono.variable} font-body antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationSchema, webAppSchema]),
          }}
        />
        {children}
      </body>
    </html>
  )
}
