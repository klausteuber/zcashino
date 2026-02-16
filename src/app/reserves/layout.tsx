import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Proof of Reserves',
  description:
    'Track visible on-chain reserve balances and liabilities. Transparent balances are publicly verifiable; shielded balances remain private.',
  openGraph: {
    title: 'Proof of Reserves | CypherJester',
    description:
      'View transparent reserve balances and platform liabilities with clear visibility limits for private pools.',
    url: 'https://cypherjester.com/reserves',
  },
}

export default function ReservesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
