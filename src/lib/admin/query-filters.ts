/**
 * Shared Prisma where-clause fragments for filtering out demo sessions.
 * Demo sessions have walletAddress starting with 'demo_'.
 */

/** Filter for direct Session table queries */
export const REAL_SESSIONS_WHERE = {
  walletAddress: { not: { startsWith: 'demo_' } },
} as const

/** Filter for game/transaction queries that JOIN through session relation */
export const REAL_SESSION_RELATION = {
  session: { walletAddress: { not: { startsWith: 'demo_' } } },
} as const
