import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Zcashino - Provably Fair Privacy Casino',
  description: 'The first provably fair casino with Zcash. True privacy, verifiable fairness, instant payouts.',
  keywords: ['zcash', 'casino', 'provably fair', 'cryptocurrency', 'blackjack', 'privacy'],
  openGraph: {
    title: 'Zcashino - Provably Fair Privacy Casino',
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
        className={`${playfair.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-body antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
