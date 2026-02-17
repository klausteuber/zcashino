import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const finiteNumber = z.number().finite()
const nonNegativeNumber = z.number().finite().min(0)
const nonNegativeInt = z.number().int().min(0)

const gameTypeSchema = z.enum(['blackjack', 'video_poker'])
const fairnessVersionSchema = z.enum(['legacy_mulberry_v1', 'hmac_sha256_v1'])
const provablyFairModeSchema = z.enum(['legacy_per_game_v1', 'session_nonce_v1'])

export const blackjackBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    sessionId: nonEmptyString,
    bet: finiteNumber,
    perfectPairsBet: nonNegativeNumber.optional(),
    clientSeed: nonEmptyString.max(128).optional(),
  }).strict(),
  z.object({
    action: z.literal('hit'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('stand'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('double'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('split'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('surrender'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('insurance'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
  }).strict(),
])

export const videoPokerBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    sessionId: nonEmptyString,
    variant: z.enum(['jacks_or_better', 'deuces_wild']),
    baseBet: finiteNumber,
    betMultiplier: z.number().int(),
    clientSeed: nonEmptyString.max(128).optional(),
  }).strict(),
  z.object({
    action: z.literal('draw'),
    sessionId: nonEmptyString,
    gameId: nonEmptyString,
    heldIndices: z.array(z.number().int().min(0).max(4)).max(5),
  }).strict(),
])

export const walletBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    sessionId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('check-deposits'),
    sessionId: nonEmptyString,
  }).strict(),
  z.object({
    action: z.literal('withdraw'),
    sessionId: nonEmptyString,
    amount: finiteNumber,
    memo: z.string().max(512).optional(),
    idempotencyKey: nonEmptyString.max(128),
  }).strict(),
  z.object({
    action: z.literal('withdrawal-status'),
    sessionId: nonEmptyString,
    transactionId: nonEmptyString,
  }).strict(),
])

export const sessionBodySchema = z.object({
  action: z.enum(['set-withdrawal-address', 'change-withdrawal-address', 'update-limits']).optional(),
  sessionId: nonEmptyString,
  withdrawalAddress: z.string().trim().optional(),
  depositLimit: finiteNumber.optional(),
  lossLimit: finiteNumber.optional(),
  sessionLimit: z.number().int().min(1).optional(),
  excludeDuration: z.enum(['24h', '1w', '1m', '6m', '1y', 'permanent']).optional(),
}).strict()

export const verifyPostSchema = z.union([
  z.object({
    gameId: nonEmptyString,
    gameType: gameTypeSchema.optional(),
  }).strict(),
  z.object({
    serverSeed: nonEmptyString,
    serverSeedHash: nonEmptyString,
    clientSeed: nonEmptyString,
    nonce: nonNegativeInt,
    txHash: nonEmptyString.optional(),
    gameType: gameTypeSchema.optional(),
    fairnessVersion: fairnessVersionSchema.optional(),
  }).strict(),
])

export const verifyQuerySchema = z.object({
  gameId: nonEmptyString,
  sessionId: z.string().trim().optional(),
  gameType: gameTypeSchema.optional(),
})

export const fairnessQuerySchema = z.object({
  sessionId: z.string().trim().optional(),
})

export const fairnessPostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set-client-seed'),
    sessionId: nonEmptyString,
    clientSeed: nonEmptyString.max(128),
  }).strict(),
  z.object({
    action: z.literal('rotate-seed'),
    sessionId: nonEmptyString,
    nextClientSeed: z.string().trim().min(1).max(128).optional(),
  }).strict(),
])

export const verifyGameTypeSchema = gameTypeSchema
export const provablyFairModeEnumSchema = provablyFairModeSchema

export type BlackjackBody = z.infer<typeof blackjackBodySchema>
export type VideoPokerBody = z.infer<typeof videoPokerBodySchema>
export type WalletBody = z.infer<typeof walletBodySchema>
export type SessionBody = z.infer<typeof sessionBodySchema>
export type VerifyPostBody = z.infer<typeof verifyPostSchema>
export type FairnessPostBody = z.infer<typeof fairnessPostSchema>

export interface ValidationErrorPayload {
  error: string
  details: Record<string, string[]>
}

export function formatZodError(error: z.ZodError, message: string = 'Invalid request payload'): ValidationErrorPayload {
  const details: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    if (!details[path]) details[path] = []
    details[path].push(issue.message)
  }

  return {
    error: message,
    details,
  }
}

export function parseWithSchema<T>(
  schema: z.ZodSchema<T>,
  value: unknown,
  message?: string
): { success: true; data: T } | { success: false; payload: ValidationErrorPayload } {
  const parsed = schema.safeParse(value)
  if (parsed.success) {
    return { success: true, data: parsed.data }
  }

  return {
    success: false,
    payload: formatZodError(parsed.error, message),
  }
}
