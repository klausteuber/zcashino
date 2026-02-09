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
  title: 'CypherJester - Play in Private. Verify in Public.',
  description: 'The provably fair crypto casino. True privacy, verifiable fairness, instant payouts.',
  keywords: ['zcash', 'casino', 'provably fair', 'cryptocurrency', 'blackjack', 'privacy', 'cypherjester'],
  openGraph: {
    title: 'CypherJester - Play in Private. Verify in Public.',
    description: 'True privacy, verifiable fairness, instant payouts.',
    type: 'website',
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
        {children}
      </body>
    </html>
  )
}
