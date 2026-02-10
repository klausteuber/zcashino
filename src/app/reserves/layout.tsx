import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Proof of Reserves',
  description:
    'Verify that all CypherJester player funds are backed 1:1 by on-chain Zcash balances. Every deposit address is publicly auditable.',
  openGraph: {
    title: 'Proof of Reserves | CypherJester',
    description:
      'All player funds backed 1:1 by on-chain balances. Verify any deposit address on the Zcash blockchain.',
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
