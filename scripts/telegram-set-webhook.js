#!/usr/bin/env node
/**
 * Telegram webhook setup for the admin bot endpoint.
 *
 * Usage:
 *   node scripts/telegram-set-webhook.js --base-url https://cypherjester.com
 *   node scripts/telegram-set-webhook.js --delete
 *
 * Required env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 *
 * Optional env (used if --base-url not provided):
 *   TELEGRAM_WEBHOOK_BASE_URL
 *   NEXT_PUBLIC_URL
 */

const dotenv = require('dotenv')

dotenv.config({ path: '.env.mainnet' })
dotenv.config()

function readArg(flag) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, '')
}

async function main() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  if (!secret) throw new Error('Missing TELEGRAM_WEBHOOK_SECRET')

  if (hasFlag('--delete')) {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: true }),
    })
    const data = await res.json().catch(() => null)
    console.log(JSON.stringify({ ok: res.ok, status: res.status, data }, null, 2))
    if (!res.ok || !data || data.ok !== true) process.exit(1)
    return
  }

  const baseUrl =
    readArg('--base-url') ||
    (process.env.TELEGRAM_WEBHOOK_BASE_URL || '').trim() ||
    (process.env.NEXT_PUBLIC_URL || '').trim()

  if (!baseUrl) {
    throw new Error('Missing --base-url (or TELEGRAM_WEBHOOK_BASE_URL / NEXT_PUBLIC_URL)')
  }
  if (!baseUrl.startsWith('https://')) {
    throw new Error(`Telegram requires an https:// webhook URL. Got: ${baseUrl}`)
  }

  const webhookUrl = `${stripTrailingSlash(baseUrl)}/api/telegram/webhook`
  const body = {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => null)
  console.log(
    JSON.stringify(
      {
        ok: res.ok,
        status: res.status,
        request: { ...body, secret_token: '<redacted>' },
        data,
      },
      null,
      2
    )
  )
  if (!res.ok || !data || data.ok !== true) process.exit(1)
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(1)
})
