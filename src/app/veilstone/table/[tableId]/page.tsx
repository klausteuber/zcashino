import SiteHeader from '@/components/layout/SiteHeader'
import VeilstoneTableClient from '@/components/veilstone/VeilstoneTableClient'

export default async function VeilstoneTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ tableId: string }>
  searchParams: Promise<{ playtest?: string }>
}) {
  const { tableId } = await params
  const query = await searchParams
  const playtestMode = query.playtest === '1'

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <VeilstoneTableClient tableId={tableId} playtestMode={playtestMode} />
    </main>
  )
}
