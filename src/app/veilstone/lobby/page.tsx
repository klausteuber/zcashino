import SiteHeader from '@/components/layout/SiteHeader'
import VeilstoneLobbyClient from '@/components/veilstone/VeilstoneLobbyClient'

export default async function VeilstoneLobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ playtest?: string }>
}) {
  const params = await searchParams
  const playtestMode = params.playtest === '1'

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <VeilstoneLobbyClient playtestMode={playtestMode} />
    </main>
  )
}
