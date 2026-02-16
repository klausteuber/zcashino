#!/usr/bin/env node
/**
 * Guarded-live monitor
 *
 * Checks `/api/health`, `/api/admin/overview`, and DB invariants, then appends
 * a JSONL record and optionally sends alerts.
 *
 * Usage:
 *   node scripts/guarded-live-monitor.js
 *   node scripts/guarded-live-monitor.js --alert
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client')

dotenv.config({ path: '.env.monitoring' })
dotenv.config({ path: '.env.mainnet' })
dotenv.config()

const prisma = new PrismaClient()

const TEN_MINUTES_MS = 10 * 60 * 1000
const THIRTY_MINUTES_MS = 30 * 60 * 1000

const ALERT_MODE = process.argv.includes('--alert')
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://127.0.0.1:3000'
const STATE_FILE = process.env.GUARDED_LIVE_STATE_FILE || path.join(process.cwd(), 'ops', 'guarded-live-state.json')
const LOG_FILE = process.env.GUARDED_LIVE_MONITOR_LOG || path.join(process.cwd(), 'ops', 'guarded-live-monitor.jsonl')
const ALERT_SCRIPT = path.join(__dirname, 'send-alert.sh')

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function saveJson(filePath, value) {
  ensureDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  return { response, data }
}

async function loginAdmin(state, nowMs) {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required for admin overview monitoring.')
  }

  const login = await fetch(`${APP_BASE_URL}/api/admin/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!login.ok) {
    const loginText = await login.text()
    throw new Error(`Admin login failed: HTTP ${login.status} ${loginText}`)
  }

  const setCookie = login.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  if (!cookie.includes('=')) {
    throw new Error('Admin login succeeded but no session cookie was returned.')
  }

  // API tokens are valid for 8 hours; refresh one hour early.
  state.adminSessionCookie = cookie
  state.adminSessionExpiresAt = new Date(nowMs + 7 * 60 * 60 * 1000).toISOString()
  return cookie
}

async function getAdminOverview(state, nowMs) {
  let cookie = null
  if (state.adminSessionCookie && state.adminSessionExpiresAt) {
    if (Date.parse(state.adminSessionExpiresAt) > nowMs) {
      cookie = state.adminSessionCookie
    }
  }

  if (!cookie) {
    cookie = await loginAdmin(state, nowMs)
  }

  const overview = await fetchJson(`${APP_BASE_URL}/api/admin/overview`, {
    headers: { cookie },
  })
  if (overview.response.status === 401) {
    cookie = await loginAdmin(state, nowMs)
    const retried = await fetchJson(`${APP_BASE_URL}/api/admin/overview`, {
      headers: { cookie },
    })
    if (!retried.response.ok || !retried.data) {
      throw new Error(`Admin overview request failed after re-login: HTTP ${retried.response.status}`)
    }
    return retried.data
  }

  if (!overview.response.ok || !overview.data) {
    throw new Error(`Admin overview request failed: HTTP ${overview.response.status}`)
  }
  return overview.data
}

function updateConditionWindow(state, key, isActive, nowMs) {
  const windowKey = `${key}Since`
  if (isActive) {
    if (!state[windowKey]) state[windowKey] = new Date(nowMs).toISOString()
    return nowMs - Date.parse(state[windowKey])
  }
  delete state[windowKey]
  return 0
}

function sendAlert(message) {
  if (!ALERT_MODE) return
  const result = spawnSync(ALERT_SCRIPT, [message], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error('[guarded-live-monitor] Alert script failed:', result.stderr || result.stdout)
  }
}

async function main() {
  const now = new Date()
  const nowMs = now.getTime()
  const olderThan30m = new Date(nowMs - THIRTY_MINUTES_MS)
  const state = loadJson(STATE_FILE, {})

  const { response: healthRes, data: health } = await fetchJson(`${APP_BASE_URL}/api/health`)
  if (!health || !healthRes.ok) {
    throw new Error(`Health endpoint failed: HTTP ${healthRes.status}`)
  }

  const overview = await getAdminOverview(state, nowMs)

  const [negativeBalanceCount, pendingWithdrawalsOlderThan30m] = await Promise.all([
    prisma.session.count({
      where: {
        balance: {
          lt: 0,
        },
      },
    }),
    prisma.transaction.count({
      where: {
        type: 'withdrawal',
        status: { in: ['pending', 'pending_approval'] },
        createdAt: { lte: olderThan30m },
      },
    }),
  ])

  const poolAvailable = Number(health?.commitmentPool?.available ?? overview?.pool?.available ?? 0)
  const race24h = Number(overview?.transactions?.raceRejections24h ?? 0)
  const idempotency24h = Number(overview?.transactions?.idempotencyReplays24h ?? 0)

  if (!state.baseline) {
    state.baseline = {
      raceRejections24h: race24h,
      idempotencyReplays24h: idempotency24h,
      createdAt: now.toISOString(),
    }
  }

  const poolZeroMs = updateConditionWindow(state, 'poolZero', poolAvailable === 0, nowMs)
  const poolLowMs = updateConditionWindow(state, 'poolLow', poolAvailable > 0 && poolAvailable < 5, nowMs)

  const baselineRace = Math.max(1, Number(state.baseline.raceRejections24h || 0))
  const baselineIdempotency = Math.max(1, Number(state.baseline.idempotencyReplays24h || 0))
  const raceSpike = race24h > baselineRace * 3
  const idempotencySpike = idempotency24h > baselineIdempotency * 3

  const findings = []
  let severity = 'ok'

  if (negativeBalanceCount > 0) {
    severity = 'critical'
    findings.push(`CRITICAL: ${negativeBalanceCount} sessions have negative balance.`)
  }
  if (poolZeroMs >= TEN_MINUTES_MS) {
    severity = 'critical'
    findings.push(`CRITICAL: commitment pool has been at 0 for ${(poolZeroMs / 60000).toFixed(1)} minutes.`)
  }

  if (severity !== 'critical' && poolLowMs >= THIRTY_MINUTES_MS) {
    severity = 'warning'
    findings.push(`WARNING: commitment pool below 5 for ${(poolLowMs / 60000).toFixed(1)} minutes.`)
  }
  if (pendingWithdrawalsOlderThan30m > 0) {
    if (severity === 'ok') severity = 'warning'
    findings.push(`WARNING: ${pendingWithdrawalsOlderThan30m} pending withdrawals are older than 30 minutes.`)
  }
  if (raceSpike) {
    if (severity === 'ok') severity = 'warning'
    findings.push(`WARNING: raceRejections24h spike (${race24h}) exceeds 3x baseline (${baselineRace}).`)
  }
  if (idempotencySpike) {
    if (severity === 'ok') severity = 'warning'
    findings.push(`WARNING: idempotencyReplays24h spike (${idempotency24h}) exceeds 3x baseline (${baselineIdempotency}).`)
  }

  if (health.status === 'critical' && severity !== 'critical') {
    severity = 'warning'
    findings.push('WARNING: health endpoint reports critical status.')
  }

  const entry = {
    timestamp: now.toISOString(),
    severity,
    health: {
      status: health.status,
      nodeConnected: Boolean(health?.zcashNode?.connected),
      nodeSynced: Boolean(health?.zcashNode?.synced),
      blockHeight: Number(health?.zcashNode?.blockHeight ?? 0),
      poolAvailable,
      houseBalanceConfirmed: Number(health?.houseBalance?.confirmed ?? 0),
      houseBalancePending: Number(health?.houseBalance?.pending ?? 0),
      pendingWithdrawals: Number(health?.pendingWithdrawals ?? 0),
    },
    overview: {
      raceRejections24h: race24h,
      idempotencyReplays24h: idempotency24h,
      legacyAuthFallback24h: Number(overview?.security?.legacyPlayerAuthFallback24h ?? 0),
    },
    invariants: {
      negativeBalanceCount,
      pendingWithdrawalsOlderThan30m,
      poolZeroDurationMinutes: Number((poolZeroMs / 60000).toFixed(2)),
      poolLowDurationMinutes: Number((poolLowMs / 60000).toFixed(2)),
    },
    baseline: state.baseline,
    findings,
  }

  ensureDir(LOG_FILE)
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
  saveJson(STATE_FILE, state)

  console.log(`[guarded-live-monitor] severity=${severity}`)
  for (const finding of findings) {
    console.log(`[guarded-live-monitor] ${finding}`)
  }
  if (findings.length === 0) {
    console.log('[guarded-live-monitor] No alerts. Core guarded-live checks are healthy.')
  }
  console.log(`[guarded-live-monitor] Log file: ${LOG_FILE}`)

  if (findings.length > 0) {
    sendAlert(findings.join('\n'))
  }

  if (severity === 'critical') {
    process.exitCode = 2
  } else if (severity === 'warning') {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('[guarded-live-monitor] Failed:', error)
    sendAlert(`CRITICAL: guarded-live monitor failed: ${error.message}`)
    process.exitCode = 2
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
