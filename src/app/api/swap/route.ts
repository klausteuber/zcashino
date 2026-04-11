import { NextRequest, NextResponse } from 'next/server'
import { checkPublicRateLimit, createRateLimitResponse } from '@/lib/admin/rate-limit'
import { getNearIntentsStatus, requestNearIntentsQuote, submitNearIntentsDeposit } from '@/lib/services/near-intents'
import type { SwapRailId } from '@/lib/swap/rails'
import { parseWithSchema, swapBodySchema } from '@/lib/validation/api-schemas'

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, 'wallet-action')
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = parseWithSchema(swapBodySchema, body)
    if (!parsed.success) {
      return NextResponse.json(parsed.payload, { status: 400 })
    }

    const payload = parsed.data

    switch (payload.action) {
      case 'quote': {
        const result = await requestNearIntentsQuote({
          railId: payload.railId as SwapRailId,
          amount: payload.amount,
          recipientAddress: payload.recipientAddress,
          refundAddress: payload.refundAddress,
        })

        return NextResponse.json({
          rail: result.rail,
          quote: result.response.quote,
          quoteRequest: result.response.quoteRequest,
          signature: result.response.signature,
          timestamp: result.response.timestamp,
          correlationId: result.response.correlationId,
          configuredAppFeeBps: result.configuredAppFeeBps,
          partnerAuthEnabled: result.partnerAuthEnabled,
        })
      }

      case 'status': {
        const status = await getNearIntentsStatus(payload.depositAddress)
        return NextResponse.json(status)
      }

      case 'submit-deposit': {
        const result = await submitNearIntentsDeposit(payload.depositAddress, payload.txHash)
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Swap route error:', error)
    const message = error instanceof Error ? error.message : 'Swap request failed'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
