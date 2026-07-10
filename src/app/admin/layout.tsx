import type { Metadata } from 'next'
import { getServerBrand } from '@/lib/brand/server'
import AdminLayoutClient from '@/components/admin/AdminLayoutClient'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const title = brand.config.adminEnabled ? 'Admin' : 'Admin Unavailable'

  return {
    title,
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  }
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
