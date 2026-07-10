import SiteHeader from '@/components/layout/SiteHeader'
import VeilstoneMatchClient from '@/components/veilstone/VeilstoneMatchClient'

export default async function VeilstoneMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>
  searchParams: Promise<{ playtest?: string }>
}) {
  const { matchId } = await params
  const query = await searchParams
  const playtestMode = query.playtest === '1'

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <VeilstoneMatchClient matchId={matchId} playtestMode={playtestMode} />
    </main>
  )
}
