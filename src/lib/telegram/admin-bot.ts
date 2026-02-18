import { randomBytes, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

import { ADMIN_SESSION_COOKIE, createAdminSessionToken, getAdminConfigStatus } from '@/lib/admin/auth'
import { sendTelegramMessageToChat } from '@/lib/notifications/telegram'

import { GET as adminOverviewGET } from '@/app/api/admin/overview/route'
import { POST as adminPoolPOST } from '@/app/api/admin/pool/route'

type TelegramUser = {
  id: number
  username?: string
}

type TelegramChat = {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
}

type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

type ParsedCommand = {
  name: string
  args: string[]
}

type InternalAdminResult = {
  ok: boolean
  status: number
  data: unknown
}

type PendingAction = {
  chatId: string
  createdAtMs: number
  expiresAtMs: number
  summary: string
  request: {
    method: 'POST'
    path: '/api/admin/pool'
    body: Record<string, unknown>
  }
}

function parseCsv(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const parts = trimmed.split(/\s+/g)
  const raw = (parts[0] || '').slice(1)
  const name = raw.split('@')[0]?.toLowerCase()
  if (!name) return null
  return { name, args: parts.slice(1) }
}

function formatZec(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return safeString(value)
  return `${Math.round(n * 1e8) / 1e8} ZEC`
}

function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function getTelegramConfig(): {
  token: string | null
  webhookSecret: string | null
  adminChatIds: string[]
  configured: boolean
} {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null
  const adminChatIds = parseCsv(process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_CHAT_ID)

  return {
    token,
    webhookSecret,
    adminChatIds,
    configured: Boolean(token && webhookSecret),
  }
}

function getStore() {
  const globalWithStore = globalThis as typeof globalThis & {
    __ZCASHINO_TELEGRAM_PENDING__?: Map<string, PendingAction>
    __ZCASHINO_TELEGRAM_DEDUP__?: Map<number, number>
  }

  if (!globalWithStore.__ZCASHINO_TELEGRAM_PENDING__) {
    globalWithStore.__ZCASHINO_TELEGRAM_PENDING__ = new Map<string, PendingAction>()
  }
  if (!globalWithStore.__ZCASHINO_TELEGRAM_DEDUP__) {
    globalWithStore.__ZCASHINO_TELEGRAM_DEDUP__ = new Map<number, number>()
  }

  return {
    pending: globalWithStore.__ZCASHINO_TELEGRAM_PENDING__,
    dedup: globalWithStore.__ZCASHINO_TELEGRAM_DEDUP__,
  }
}

function pruneDedupStore(nowMs: number): void {
  const { dedup } = getStore()
  // Keep last ~10 minutes of update_ids.
  const cutoffMs = nowMs - 10 * 60 * 1000
  for (const [updateId, seenAt] of dedup.entries()) {
    if (seenAt < cutoffMs) dedup.delete(updateId)
  }
  // Bound size in case of clock skew or huge traffic.
  if (dedup.size > 5000) {
    const entries = Array.from(dedup.entries()).sort((a, b) => a[1] - b[1])
    for (let i = 0; i < entries.length - 2500; i++) {
      const [id] = entries[i]!
      dedup.delete(id)
    }
  }
}

function prunePendingActions(nowMs: number): void {
  const { pending } = getStore()
  for (const [token, action] of pending.entries()) {
    if (action.expiresAtMs <= nowMs) pending.delete(token)
  }
}

function createPendingAction(action: Omit<PendingAction, 'createdAtMs' | 'expiresAtMs'>): { token: string; expiresInSeconds: number } {
  const { pending } = getStore()
  const nowMs = Date.now()
  prunePendingActions(nowMs)

  const token = randomBytes(6).toString('hex') // 12 hex chars
  const ttlMs = 2 * 60 * 1000
  pending.set(token, {
    ...action,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
  })

  return { token, expiresInSeconds: Math.round(ttlMs / 1000) }
}

function getPendingAction(token: string): PendingAction | null {
  const { pending } = getStore()
  const action = pending.get(token)
  if (!action) return null

  const nowMs = Date.now()
  if (action.expiresAtMs <= nowMs) {
    pending.delete(token)
    return null
  }

  return action
}

function deletePendingAction(token: string): void {
  const { pending } = getStore()
  pending.delete(token)
}

function buildInternalAdminRequest(opts: {
  chatId: string
  method: 'GET' | 'POST'
  path: '/api/admin/overview' | '/api/admin/pool'
  body?: Record<string, unknown>
}): NextRequest {
  const token = createAdminSessionToken('telegram-bot')

  const headers: Record<string, string> = {
    host: 'localhost',
    'user-agent': 'zcashino-telegram-admin-bot',
    // Rate-limit and audit-log per Telegram chat.
    'x-forwarded-for': `tg:${opts.chatId}`,
    cookie: `${ADMIN_SESSION_COOKIE}=${token}`,
  }

  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method: opts.method,
    headers,
  }

  if (opts.method === 'POST') {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(opts.body || {})
  }

  return new NextRequest(`http://localhost${opts.path}`, init)
}

async function callInternalAdmin(opts: {
  chatId: string
  method: 'GET' | 'POST'
  path: '/api/admin/overview' | '/api/admin/pool'
  body?: Record<string, unknown>
}): Promise<InternalAdminResult> {
  let res: Response

  const req = buildInternalAdminRequest(opts)

  if (opts.path === '/api/admin/overview' && opts.method === 'GET') {
    res = await adminOverviewGET(req)
  } else if (opts.path === '/api/admin/pool' && opts.method === 'POST') {
    res = await adminPoolPOST(req)
  } else {
    return { ok: false, status: 500, data: { error: 'Unsupported internal admin call' } }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // non-JSON response
    data = await res.text().catch(() => '')
  }

  return { ok: res.ok, status: res.status, data }
}

function helpText(): string {
  return [
    'Zcashino Admin Bot',
    '',
    'Read-only:',
    '/whoami',
    '/status',
    '/withdrawals',
    '',
    'Actions (require confirm):',
    '/kill on|off',
    '/pool refill|cleanup|init',
    '/sweep now|status',
    '/withdrawal approve <txId>',
    '/withdrawal reject <txId> [reason]',
    '/withdrawal poll <txId>',
    '/withdrawal requeue <txId>',
    '',
    'Confirm/cancel:',
    '/confirm <token>',
    '/cancel <token>',
    '/pending',
  ].join('\n')
}

function notAuthorizedText(chatId: string): string {
  return [
    'Unauthorized chat.',
    `chat_id=${chatId}`,
    '',
    'To allow this private chat, set:',
    `TELEGRAM_ADMIN_CHAT_IDS=${chatId}`,
  ].join('\n')
}

function formatStatus(overview: any): string {
  const ts = safeString(overview?.timestamp)
  const network = safeString(overview?.network)
  const kill = overview?.killSwitch?.active ? 'ON' : 'OFF'

  const node = overview?.nodeStatus
  const nodeLine = node
    ? `Node: ${node.connected ? 'connected' : 'down'}, ${node.synced ? 'synced' : 'not synced'} (height=${safeString(node.blockHeight)})`
    : 'Node: unknown'

  const pool = overview?.pool
  const poolLine = pool
    ? `Pool: available=${safeString(pool.available)} used=${safeString(pool.used)} expired=${safeString(pool.expired)} healthy=${safeString(pool.isHealthy)}`
    : 'Pool: unknown'

  const tx = overview?.transactions
  const txLine = tx
    ? `Withdrawals: pending=${safeString(tx.pendingWithdrawalCount)} failed=${safeString(tx.failedWithdrawalCount)}`
    : 'Withdrawals: unknown'

  const treasury = overview?.treasury
  const house = treasury?.houseBalance
  const houseLine = house
    ? `House: confirmed=${formatZec(house.confirmed)} pending=${formatZec(house.pending)}`
    : 'House: unknown'

  const liabilities = treasury?.liabilities
  const cov = treasury?.coverageRatio
  const covLine = Number.isFinite(cov)
    ? `Coverage: ratio=${safeString(cov)} liabilities=${formatZec(liabilities)}`
    : `Coverage: liabilities=${formatZec(liabilities)}`

  return [
    `Status (${network})`,
    ts ? `Time: ${ts}` : '',
    `Kill switch: ${kill}`,
    nodeLine,
    houseLine,
    covLine,
    poolLine,
    txLine,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatWithdrawals(overview: any): string {
  const pending: any[] = Array.isArray(overview?.pendingWithdrawals) ? overview.pendingWithdrawals : []
  const count = pending.length
  if (count === 0) return 'No pending withdrawals (pending or pending_approval).'

  const lines = pending.slice(0, 15).map((w) => {
    const id = safeString(w?.id)
    const status = safeString(w?.status)
    const amount = formatZec(w?.amount)
    const fee = formatZec(w?.fee)
    const createdAt = safeString(w?.createdAt)
    const to = safeString(w?.address)
    return `- ${truncateMiddle(id, 10, 6)} ${status} amount=${amount} fee=${fee} to=${truncateMiddle(to, 10, 6)} at=${createdAt}`
  })

  return [
    `Pending withdrawals: ${count} (showing ${Math.min(15, count)})`,
    ...lines,
  ].join('\n')
}

function summarizePoolActionResult(result: InternalAdminResult, summary: string): string {
  const data = result.data as any
  if (result.ok) {
    const action = typeof data?.action === 'string' ? data.action : null

    if (action === 'toggle-kill-switch' && data?.killSwitch) {
      const active = data.killSwitch.active ? 'ON' : 'OFF'
      const by = data.killSwitch.activatedBy ? ` by ${data.killSwitch.activatedBy}` : ''
      return `${summary}\nOK: kill switch ${active}${by}`
    }

    if (action === 'approve-withdrawal') {
      const opid = typeof data?.operationId === 'string' ? data.operationId : null
      const amount = data?.amount
      return `${summary}\nOK: approved ${formatZec(amount)}${opid ? ` (opid=${truncateMiddle(opid, 12, 6)})` : ''}`
    }

    if (action === 'reject-withdrawal') {
      const refunded = data?.refundedAmount
      return `${summary}\nOK: rejected (refunded=${formatZec(refunded)})`
    }

    if (action === 'poll-withdrawal') {
      const op = data?.operationStatus
      const status = typeof op?.status === 'string' ? op.status : 'unknown'
      return `${summary}\nOK: poll status=${status}`
    }

    if (action === 'requeue-withdrawal') {
      const newId = typeof data?.newTransactionId === 'string' ? data.newTransactionId : null
      return `${summary}\nOK: requeued${newId ? ` (newTx=${truncateMiddle(newId, 10, 6)})` : ''}`
    }

    if (action === 'process-withdrawals') {
      const processed: Array<{ id: string; result: string }> = Array.isArray(data?.processed) ? data.processed : []
      const total = typeof data?.total === 'number' ? data.total : processed.length
      const confirmed = processed.filter((p) => p.result === 'confirmed').length
      const failedRefunded = processed.filter((p) => p.result === 'failed-refunded').length
      const stillPending = processed.filter((p) => p.result === 'still-pending').length
      return `${summary}\nOK: total=${total} confirmed=${confirmed} failed+refunded=${failedRefunded} stillPending=${stillPending}`
    }

    if (action === 'sweep') {
      const swept = typeof data?.swept === 'number' ? data.swept : null
      const skipped = typeof data?.skipped === 'number' ? data.skipped : null
      const errors = typeof data?.errors === 'number' ? data.errors : null
      const parts = [
        swept !== null ? `swept=${swept}` : null,
        skipped !== null ? `skipped=${skipped}` : null,
        errors !== null ? `errors=${errors}` : null,
      ].filter(Boolean)
      return `${summary}\nOK${parts.length ? `: ${parts.join(' ')}` : ''}`
    }

    if (action === 'sweep-status') {
      const confirmed = typeof data?.confirmed === 'number' ? data.confirmed : null
      const failed = typeof data?.failed === 'number' ? data.failed : null
      const stillPending = typeof data?.stillPending === 'number' ? data.stillPending : null
      const parts = [
        confirmed !== null ? `confirmed=${confirmed}` : null,
        failed !== null ? `failed=${failed}` : null,
        stillPending !== null ? `stillPending=${stillPending}` : null,
      ].filter(Boolean)
      return `${summary}\nOK${parts.length ? `: ${parts.join(' ')}` : ''}`
    }

    return `${summary}\nOK${action ? `: ${action}` : ''}`
  }

  const err = data?.error
  const msg = typeof err === 'string' && err.trim().length > 0
    ? err
    : `HTTP ${result.status}`
  return `${summary}\nFAILED: ${msg}`
}

export async function handleTelegramWebhook(request: NextRequest): Promise<NextResponse> {
  const nowMs = Date.now()
  pruneDedupStore(nowMs)
  prunePendingActions(nowMs)

  const cfg = getTelegramConfig()
  if (!cfg.configured || !cfg.token || !cfg.webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Telegram bot not configured' }, { status: 503 })
  }

  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token') || ''
  if (!safeEqual(secretHeader, cfg.webhookSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: TelegramUpdate | null = null
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const updateId = typeof update?.update_id === 'number' ? update.update_id : null
  if (updateId === null) {
    return NextResponse.json({ ok: true })
  }

  const { dedup } = getStore()
  if (dedup.has(updateId)) {
    return NextResponse.json({ ok: true })
  }
  dedup.set(updateId, nowMs)

  const message = update.message || update.edited_message
  const chatIdNum = message?.chat?.id
  if (typeof chatIdNum !== 'number') {
    return NextResponse.json({ ok: true })
  }
  // This bot is intended for a private admin chat only.
  if (message?.chat?.type && message.chat.type !== 'private') {
    return NextResponse.json({ ok: true })
  }

  const chatId = String(chatIdNum)
  const userId = typeof message?.from?.id === 'number' ? String(message?.from?.id) : null
  const text = typeof message?.text === 'string' ? message.text : ''
  const cmd = parseCommand(text)
  if (!cmd) {
    return NextResponse.json({ ok: true })
  }

  const isAuthorized = cfg.adminChatIds.includes(chatId)
  const adminConfigured = getAdminConfigStatus().configured

  const reply = async (body: string) => {
    await sendTelegramMessageToChat(chatId, body, { disableWebPagePreview: true })
  }

  // Always-allowed bootstrap commands (for setup).
  if (cmd.name === 'help' || cmd.name === 'start') {
    await reply(helpText())
    return NextResponse.json({ ok: true })
  }
  if (cmd.name === 'whoami') {
    await reply(
      [
        'Telegram IDs',
        `chat_id=${chatId}`,
        userId ? `user_id=${userId}` : '',
        '',
        'To allow this private chat:',
        `TELEGRAM_ADMIN_CHAT_IDS=${chatId}`,
      ].filter(Boolean).join('\n')
    )
    return NextResponse.json({ ok: true })
  }

  if (!isAuthorized) {
    await reply(notAuthorizedText(chatId))
    return NextResponse.json({ ok: true })
  }

  if (!adminConfigured) {
    await reply('Admin is not configured (missing ADMIN_PASSWORD / ADMIN_SESSION_SECRET).')
    return NextResponse.json({ ok: true })
  }

  // --- Read-only commands ---
  if (cmd.name === 'status') {
    const result = await callInternalAdmin({ chatId, method: 'GET', path: '/api/admin/overview' })
    if (!result.ok) {
      await reply(summarizePoolActionResult(result, 'Status'))
      return NextResponse.json({ ok: true })
    }
    await reply(formatStatus(result.data))
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'withdrawals') {
    const result = await callInternalAdmin({ chatId, method: 'GET', path: '/api/admin/overview' })
    if (!result.ok) {
      await reply(summarizePoolActionResult(result, 'Withdrawals'))
      return NextResponse.json({ ok: true })
    }
    await reply(formatWithdrawals(result.data))
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'pending') {
    const { pending } = getStore()
    const mine = Array.from(pending.entries())
      .filter(([, a]) => a.chatId === chatId)
      .sort((a, b) => a[1].expiresAtMs - b[1].expiresAtMs)
      .slice(0, 10)

    if (mine.length === 0) {
      await reply('No pending confirmations.')
      return NextResponse.json({ ok: true })
    }

    const lines = mine.map(([token, a]) => {
      const secs = Math.max(0, Math.round((a.expiresAtMs - Date.now()) / 1000))
      return `- ${token} (expires in ${secs}s): ${a.summary}`
    })

    await reply(['Pending confirmations:', ...lines].join('\n'))
    return NextResponse.json({ ok: true })
  }

  // --- Confirm / cancel ---
  if (cmd.name === 'confirm') {
    const token = (cmd.args[0] || '').trim()
    if (!token) {
      await reply('Usage: /confirm <token>')
      return NextResponse.json({ ok: true })
    }

    const action = getPendingAction(token)
    if (!action) {
      await reply('Unknown or expired token.')
      return NextResponse.json({ ok: true })
    }

    if (action.chatId !== chatId) {
      await reply('Token does not belong to this chat.')
      return NextResponse.json({ ok: true })
    }

    deletePendingAction(token)
    const result = await callInternalAdmin({
      chatId,
      method: action.request.method,
      path: action.request.path,
      body: action.request.body,
    })

    await reply(summarizePoolActionResult(result, `Executed: ${action.summary}`))
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'cancel') {
    const token = (cmd.args[0] || '').trim()
    if (!token) {
      await reply('Usage: /cancel <token>')
      return NextResponse.json({ ok: true })
    }

    const action = getPendingAction(token)
    if (!action) {
      await reply('Unknown or expired token.')
      return NextResponse.json({ ok: true })
    }

    if (action.chatId !== chatId) {
      await reply('Token does not belong to this chat.')
      return NextResponse.json({ ok: true })
    }

    deletePendingAction(token)
    await reply(`Cancelled: ${action.summary}`)
    return NextResponse.json({ ok: true })
  }

  // --- Action commands (confirm required) ---
  if (cmd.name === 'kill') {
    const arg = (cmd.args[0] || '').toLowerCase()
    if (arg !== 'on' && arg !== 'off') {
      await reply('Usage: /kill on|off')
      return NextResponse.json({ ok: true })
    }

    const enabled = arg === 'on'
    const { token, expiresInSeconds } = createPendingAction({
      chatId,
      summary: `Kill switch ${enabled ? 'ON' : 'OFF'}`,
      request: {
        method: 'POST',
        path: '/api/admin/pool',
        body: { action: 'toggle-kill-switch', enabled },
      },
    })

    await reply(`Confirm: /confirm ${token} (expires in ${expiresInSeconds}s)\nAction: kill switch ${enabled ? 'ON' : 'OFF'}`)
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'pool') {
    const sub = (cmd.args[0] || '').toLowerCase()
    const valid = sub === 'refill' || sub === 'cleanup' || sub === 'init' || sub === 'process-withdrawals'
    if (!valid) {
      await reply('Usage: /pool refill|cleanup|init|process-withdrawals')
      return NextResponse.json({ ok: true })
    }

    const { token, expiresInSeconds } = createPendingAction({
      chatId,
      summary: `Pool action: ${sub}`,
      request: {
        method: 'POST',
        path: '/api/admin/pool',
        body: { action: sub },
      },
    })

    await reply(`Confirm: /confirm ${token} (expires in ${expiresInSeconds}s)\nAction: pool ${sub}`)
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'sweep') {
    const sub = (cmd.args[0] || '').toLowerCase()
    if (sub === 'status') {
      const result = await callInternalAdmin({
        chatId,
        method: 'POST',
        path: '/api/admin/pool',
        body: { action: 'sweep-status' },
      })

      await reply(summarizePoolActionResult(result, 'Sweep status'))
      return NextResponse.json({ ok: true })
    }

    if (sub !== 'now') {
      await reply('Usage: /sweep now|status')
      return NextResponse.json({ ok: true })
    }

    const { token, expiresInSeconds } = createPendingAction({
      chatId,
      summary: 'Sweep deposits now',
      request: {
        method: 'POST',
        path: '/api/admin/pool',
        body: { action: 'sweep' },
      },
    })

    await reply(`Confirm: /confirm ${token} (expires in ${expiresInSeconds}s)\nAction: sweep now`)
    return NextResponse.json({ ok: true })
  }

  if (cmd.name === 'withdrawal') {
    const sub = (cmd.args[0] || '').toLowerCase()
    const txId = (cmd.args[1] || '').trim()
    const reason = cmd.args.slice(2).join(' ').trim()

    const actionMap: Record<string, string> = {
      approve: 'approve-withdrawal',
      reject: 'reject-withdrawal',
      poll: 'poll-withdrawal',
      requeue: 'requeue-withdrawal',
    }

    const adminAction = actionMap[sub]
    if (!adminAction) {
      await reply('Usage: /withdrawal approve|reject|poll|requeue <txId> [reason]')
      return NextResponse.json({ ok: true })
    }
    if (!txId) {
      await reply('Missing txId.')
      return NextResponse.json({ ok: true })
    }

    const body: Record<string, unknown> = { action: adminAction, transactionId: txId }
    if (adminAction === 'reject-withdrawal' && reason) {
      body.reason = reason
    }

    const { token, expiresInSeconds } = createPendingAction({
      chatId,
      summary: `Withdrawal ${sub} ${truncateMiddle(txId, 10, 6)}`,
      request: {
        method: 'POST',
        path: '/api/admin/pool',
        body,
      },
    })

    await reply(`Confirm: /confirm ${token} (expires in ${expiresInSeconds}s)\nAction: withdrawal ${sub} ${txId}${reason ? `\nReason: ${reason}` : ''}`)
    return NextResponse.json({ ok: true })
  }

  await reply(helpText())
  return NextResponse.json({ ok: true })
}
