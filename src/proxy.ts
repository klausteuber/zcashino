import { NextRequest, NextResponse } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/security/content-security-policy'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development')
  const requestHeaders = new Headers(request.headers)

  // Next.js reads this request header and attaches the nonce to framework and
  // page scripts. x-nonce is available to explicit application scripts.
  requestHeaders.set('Content-Security-Policy', policy)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
