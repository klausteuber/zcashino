import { headers } from 'next/headers'
import PokerTable from '@/components/poker/PokerTable'
import SiteHeader from '@/components/layout/SiteHeader'
export const metadata = { title: 'Six-Max Poker Table', robots: { index: false, follow: false } }
export default async function TablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return <main className="min-h-screen"><SiteHeader /><PokerTable tableId={tableId} nonce={nonce} /></main>
}
