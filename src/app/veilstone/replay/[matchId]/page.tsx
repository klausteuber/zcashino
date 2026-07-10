import SiteHeader from '@/components/layout/SiteHeader'
import VeilstoneReplayClient from '@/components/veilstone/VeilstoneReplayClient'

export default async function VeilstoneReplayPage({
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
      <VeilstoneReplayClient matchId={matchId} playtestMode={playtestMode} />
    </main>
  )
}
