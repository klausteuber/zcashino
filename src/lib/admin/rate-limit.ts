import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getClientIpAddress } from '@/lib/admin/request'

export type AdminRateLimitBucket = 'auth-login' | 'admin-read' | 'admin-action' | 'admin-write'
export type PublicRateLimitBucket = 'game-action' | 'session-create' | 'wallet-action' | 'wallet-withdraw'

interface BucketConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitState {
  count: number
  windowStart: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
  key: string
}

const DEFAULT_BUCKET_CONFIG: Record<AdminRateLimitBucket | PublicRateLimitBucket, BucketConfig> = {
  'auth-login': {
    maxRequests: Number(process.env.ADMIN_RATE_LIMIT_LOGIN_MAX || 10),
    windowMs: Number(process.env.ADMIN_RATE_LIMIT_LOGIN_WINDOW_MS || 15 * 60 * 1000),
  },
  'admin-read': {
    maxRequests: Number(process.env.ADMIN_RATE_LIMIT_READ_MAX || 180),
    windowMs: Number(process.env.ADMIN_RATE_LIMIT_READ_WINDOW_MS || 60 * 1000),
  },
  'admin-action': {
    maxRequests: Number(process.env.ADMIN_RATE_LIMIT_ACTION_MAX || 30),
    windowMs: Number(process.env.ADMIN_RATE_LIMIT_ACTION_WINDOW_MS || 60 * 1000),
  },
  'admin-write': {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  'game-action': {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },
  'session-create': {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
  'wallet-action': {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  'wallet-withdraw': {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  },
}

const store = (() => {
  const globalWithStore = globalThis as typeof globalThis & {
    __ZCASHINO_ADMIN_RATE_LIMIT__?: Map<string, RateLimitState>
  }

  if (!globalWithStore.__ZCASHINO_ADMIN_RATE_LIMIT__) {
    globalWithStore.__ZCASHINO_ADMIN_RATE_LIMIT__ = new Map<string, RateLimitState>()
  }

  return globalWithStore.__ZCASHINO_ADMIN_RATE_LIMIT__
})()

let cleanupCounter = 0

function maybeCleanupStore(now: number): void {
  cleanupCounter += 1
  if (cleanupCounter % 100 !== 0) {
    return
  }

  const maxWindowMs = Math.max(
    DEFAULT_BUCKET_CONFIG['auth-login'].windowMs,
    DEFAULT_BUCKET_CONFIG['admin-read'].windowMs,
    DEFAULT_BUCKET_CONFIG['admin-action'].windowMs
  )

  for (const [key, state] of store.entries()) {
    if (now - state.windowStart > maxWindowMs * 2) {
      store.delete(key)
    }
  }
}

export function checkAdminRateLimit(
  request: NextRequest,
  bucket: AdminRateLimitBucket | PublicRateLimitBucket
): RateLimitResult {
  const now = Date.now()
  const ip = getClientIpAddress(request)
  const config = DEFAULT_BUCKET_CONFIG[bucket]
  const key = `${bucket}:${ip}`

  maybeCleanupStore(now)

  const current = store.get(key)
  if (!current || now - current.windowStart >= config.windowMs) {
    store.set(key, {
      count: 1,
      windowStart: now,
    })
    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - 1),
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
      key,
    }
  }

  if (current.count >= config.maxRequests) {
    const elapsed = now - current.windowStart
    const retryAfterMs = Math.max(0, config.windowMs - elapsed)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      key,
    }
  }

  current.count += 1
  store.set(key, current)

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - current.count),
    retryAfterSeconds: Math.ceil((config.windowMs - (now - current.windowStart)) / 1000),
    key,
  }
}

export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests. Please wait and try again.',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
      },
    }
  )
}

export function checkPublicRateLimit(
  request: NextRequest,
  bucket: PublicRateLimitBucket
): RateLimitResult {
  return checkAdminRateLimit(request, bucket)
}

