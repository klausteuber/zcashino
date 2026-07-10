import { NextRequest } from 'next/server'
import { getVeilstoneEvents } from '@/lib/veilstone/service'

export const dynamic = 'force-dynamic'

function encodeSse(event: string, data: unknown, id?: string) {
  return [
    id ? `id: ${id}` : null,
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    '',
  ].filter(Boolean).join('\n')
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params
  const encoder = new TextEncoder()
  let lastEventId = request.headers.get('last-event-id') || request.nextUrl.searchParams.get('afterEventId')
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      async function pushEvents() {
        if (closed) return
        const events = await getVeilstoneEvents(matchId, lastEventId)
        for (const event of events) {
          lastEventId = event.eventId
          controller.enqueue(encoder.encode(encodeSse('veilstone-event', event, event.eventId)))
        }
      }

      await pushEvents()
      const heartbeat = setInterval(() => {
        if (closed) return
        controller.enqueue(encoder.encode(encodeSse('heartbeat', { serverTime: new Date().toISOString() })))
      }, 20_000)
      const poller = setInterval(() => {
        pushEvents().catch((error) => {
          controller.enqueue(encoder.encode(encodeSse('error', { error: 'Event stream poll failed' })))
          console.error('[Veilstone] SSE poll failed:', error)
        })
      }, 2_000)

      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(heartbeat)
        clearInterval(poller)
        controller.close()
      })
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
