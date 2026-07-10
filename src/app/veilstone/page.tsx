import HomeVeilstone from '@/components/brand/HomeVeilstone'
import SiteHeader from '@/components/layout/SiteHeader'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getBrandUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'

export default async function VeilstonePage() {
  const brand = await getServerBrand()
  const pageUrl = getBrandUrlForPath(brand.id, '/veilstone')

  return (
    <>
      <BreadcrumbJsonLd items={[{ name: 'Veilstone', url: pageUrl }]} />
      <main className="min-h-screen">
        <SiteHeader />
        <HomeVeilstone />
      </main>
    </>
  )
}
