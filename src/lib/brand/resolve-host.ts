import { getBrandConfig } from '@/lib/brand/config'
import { BrandId, ResolvedBrand } from '@/lib/brand/types'

const DEFAULT_CYPHER_HOSTS = [
  'cypherjester.com',
  'www.cypherjester.com',
  'localhost',
  '127.0.0.1',
]
const DEFAULT_21Z_HOSTS = ['21z.cash', 'www.21z.cash']

function parseCsvHosts(value: string | undefined, fallback: string[]): Set<string> {
  if (!value || value.trim().length === 0) return new Set(fallback)
  return new Set(
    value
      .split(',')
      .map((entry) => normalizeHost(entry))
      .filter((entry): entry is string => Boolean(entry))
  )
}

export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null
  const first = value.split(',')[0]?.trim().toLowerCase()
  if (!first) return null

  if (first.startsWith('[')) {
    const closeBracket = first.indexOf(']')
    if (closeBracket !== -1) {
      return first.slice(0, closeBracket + 1)
    }
  }

  return first.replace(/:\d+$/, '')
}

export function readHostFromHeaders(headersLike: { get(name: string): string | null }): string | null {
  const forwarded = headersLike.get('x-forwarded-host')
  const host = headersLike.get('host')
  return normalizeHost(forwarded || host)
}

export function isKnownBrandId(value: string | undefined): value is BrandId {
  return value === 'cypher' || value === '21z'
}

export function resolveBrandIdFromHost(
  host: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): { id: BrandId; source: ResolvedBrand['source']; host: string | null } {
  const normalizedHost = normalizeHost(host)

  const forced = env.FORCE_BRAND?.trim()
  if (isKnownBrandId(forced)) {
    return {
      id: forced,
      source: 'forced',
      host: normalizedHost,
    }
  }

  const multiBrandEnabled = env.MULTI_BRAND_ENABLED === 'true'
  if (!multiBrandEnabled) {
    return {
      id: 'cypher',
      source: 'single-brand',
      host: normalizedHost,
    }
  }

  const cypherHosts = parseCsvHosts(env.CYPHER_HOSTS, DEFAULT_CYPHER_HOSTS)
  const hosts21z = parseCsvHosts(env.BRAND_21Z_HOSTS, DEFAULT_21Z_HOSTS)

  if (normalizedHost && hosts21z.has(normalizedHost)) {
    return {
      id: '21z',
      source: 'mapped',
      host: normalizedHost,
    }
  }

  if (normalizedHost && cypherHosts.has(normalizedHost)) {
    return {
      id: 'cypher',
      source: 'mapped',
      host: normalizedHost,
    }
  }

  return {
    id: 'cypher',
    source: 'fallback',
    host: normalizedHost,
  }
}

export function resolveBrandFromHost(
  host: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): ResolvedBrand {
  const resolved = resolveBrandIdFromHost(host, env)
  return {
    ...resolved,
    config: getBrandConfig(resolved.id),
  }
}

export function resolveBrandFromHeaders(
  headersLike: { get(name: string): string | null },
  env: NodeJS.ProcessEnv = process.env
): ResolvedBrand {
  return resolveBrandFromHost(readHostFromHeaders(headersLike), env)
}

export function isAdminHost(brandId: BrandId): boolean {
  return brandId === 'cypher'
}
