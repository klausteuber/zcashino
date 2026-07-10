import { NextResponse } from 'next/server'
import { getVeilstoneTable, VeilstoneValidationError } from '@/lib/veilstone/service'

export async function GET(
  _request: Request,
  context: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await context.params
    const table = await getVeilstoneTable(tableId)
    return NextResponse.json({ table })
  } catch (error) {
    if (error instanceof VeilstoneValidationError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[Veilstone] Read table failed:', error)
    return NextResponse.json({ error: 'Failed to load Veilstone table' }, { status: 500 })
  }
}
