import { headers } from 'next/headers'
import SiteHeader from '@/components/layout/SiteHeader'
import PokerLobby from '@/components/poker/PokerLobby'
import { getServerBrand } from '@/lib/brand/server'
import { getBrandUrlForPath } from '@/lib/brand/config'

export async function generateMetadata() {
  const brand = await getServerBrand()
  return { title: 'Six-Max Zcash Poker', description: 'Play six-max Hold’em, Omaha and seven-card stud with shared ZEC tables and a replenishing time bank.', alternates: { canonical: getBrandUrlForPath(brand.id, '/poker') } }
}
export default async function PokerPage() { const nonce = (await headers()).get('x-nonce') ?? undefined; return <main className="min-h-screen"><SiteHeader /><PokerLobby nonce={nonce} /></main> }
