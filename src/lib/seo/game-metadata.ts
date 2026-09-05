import type { Metadata } from 'next'
import { getBrandConfig, getCanonicalUrlForPath } from '@/lib/brand/config'

export function getCasinoGameMetadata(brandId: 'cypher' | '21z', game: 'blackjack' | 'video-poker'): Metadata {
  const brand = getBrandConfig(brandId)
  const blackjack = game === 'blackjack'
  const title = blackjack
    ? brandId === '21z' ? 'Zcash Blackjack: Rules & Hand Verification' : 'Play Zcash Blackjack Online'
    : brandId === 'cypher' ? 'Zcash Video Poker: Jacks or Better & Deuces Wild' : 'Provably Fair Zcash Video Poker'
  const description = blackjack
    ? brandId === '21z'
      ? 'Play Zcash blackjack on 21z. Learn the table rules, inspect seed commitments, and replay your recorded hands after the seed session is revealed.'
      : 'Play blackjack with Zcash at CypherJester. Explore the rules in demo mode, learn how to fund a session, and verify your hands after seed reveal.'
    : brandId === 'cypher'
      ? 'Explore Jacks or Better and Deuces Wild with Zcash. Understand coin counts and paytables, try demo play, and check your hands at CypherJester.'
      : 'Play video poker with Zcash on 21z. Choose Jacks or Better or Deuces Wild, inspect the active paytable, and verify recorded hands after seed reveal.'
  return {
    title,
    description,
    alternates: { canonical: getCanonicalUrlForPath(brandId, `/${game}`) },
    openGraph: { type: 'website', title: `${title} | ${brand.name}`, description, url: getCanonicalUrlForPath(brandId, `/${game}`), images: [brand.ogImagePath] },
    twitter: { card: 'summary_large_image', title: `${title} | ${brand.name}`, description, images: [brand.ogImagePath] },
  }
}
