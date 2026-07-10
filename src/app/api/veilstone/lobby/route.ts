import { NextResponse } from 'next/server'
import { listVeilstoneTables } from '@/lib/veilstone/service'

export async function GET() {
  const tables = await listVeilstoneTables()
  return NextResponse.json({ tables })
}
