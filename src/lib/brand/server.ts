import { headers } from 'next/headers'
import { resolveBrandFromHeaders } from '@/lib/brand/resolve-host'

export async function getServerBrand() {
  const headerStore = await headers()
  return resolveBrandFromHeaders(headerStore)
}
