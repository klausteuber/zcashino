/**
 * Alert Generator Service
 *
 * Background service that periodically checks for unusual activity
 * and generates persistent alerts in the AdminAlert table.
 *
 * Runs on a 5-minute interval. Alert checks include:
 * - Large single-hand wins
 * - Players with anomalously high RTP
 * - Rapid deposit→play→withdraw cycles
 * - Unusual withdrawal velocity
 * - Commitment pool health warnings
 *
 * Alerts are deduplicated by type + sessionId + date to avoid spam.
 * UI reads from the AdminAlert table — never generates alerts on poll.
 */

import { generateAlerts } from '@/lib/admin/alerts'

const ALERT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let isRunning = false
let intervalId: ReturnType<typeof setInterval> | null = null
let lastRun: Date | null = null
let lastResult: { total: number } | null = null

export interface AlertServiceStatus {
  isRunning: boolean
  lastRun: Date | null
  lastAlertCount: number | null
}

async function runAlertCheck(): Promise<void> {
  try {
    const result = await generateAlerts()
    lastRun = new Date()
    lastResult = result
  } catch (error) {
    console.error('[alert-generator] Error running alert checks:', error)
  }
}

export function startAlertGenerator(): void {
  if (isRunning) {
    console.log('[alert-generator] Already running')
    return
  }

  isRunning = true
  console.log('[alert-generator] Starting alert generator (interval: 5m)')

  // Run immediately on start
  runAlertCheck()

  // Then run on interval
  intervalId = setInterval(runAlertCheck, ALERT_INTERVAL_MS)
}

export function stopAlertGenerator(): void {
  if (!isRunning) return

  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }

  isRunning = false
  console.log('[alert-generator] Stopped')
}

export function getAlertServiceStatus(): AlertServiceStatus {
  return {
    isRunning,
    lastRun,
    lastAlertCount: lastResult?.total ?? null,
  }
}
