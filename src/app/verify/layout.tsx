import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Verify Game Fairness',
  description:
    'Independently verify any CypherJester game outcome. Check blockchain commitments, seed hashes, and game replay to confirm provable fairness.',
  openGraph: {
    title: 'Verify Game Fairness | CypherJester',
    description:
      'Independently verify any game was fair using blockchain-committed seeds.',
    url: 'https://cypherjester.com/verify',
  },
}

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
