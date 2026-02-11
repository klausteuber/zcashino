import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Platform Kill Switch
 *
 * Global maintenance mode that blocks new games and withdrawals
 * while allowing in-progress games to complete and deposits to process.
 *
 * State is persisted to /app/data/kill-switch.json (survives restarts).
 * Env var KILL_SWITCH takes precedence over file state on startup.
 *
 * Admin can toggle at runtime via POST /api/admin/pool { action: 'toggle-kill-switch' }
 */

// Persistence file path — /app/data/ in Docker, fallback for local dev
const PERSIST_PATH = join(
  process.env.DATABASE_URL?.includes('/app/data/') ? '/app/data' : process.cwd(),
  'kill-switch.json'
)

interface KillSwitchState {
  active: boolean
  activatedAt: string | null
  activatedBy: string | null
}

/**
 * Load persisted state from disk, merging with env var.
 * KILL_SWITCH env var takes precedence over file state.
 */
function loadPersistedState(): { active: boolean; activatedAt: Date | null; activatedBy: string | null } {
  // Env var takes precedence
  if (process.env.KILL_SWITCH === 'true') {
    return { active: true, activatedAt: new Date(), activatedBy: 'env' }
  }
  if (process.env.KILL_SWITCH === 'false') {
    return { active: false, activatedAt: null, activatedBy: null }
  }

  // Try reading from persisted file
  try {
    if (existsSync(PERSIST_PATH)) {
      const raw = readFileSync(PERSIST_PATH, 'utf-8')
      const state: KillSwitchState = JSON.parse(raw)
      return {
        active: state.active,
        activatedAt: state.activatedAt ? new Date(state.activatedAt) : null,
        activatedBy: state.activatedBy,
      }
    }
  } catch {
    // File corrupt or unreadable — default to off
    console.warn('[KillSwitch] Failed to read persisted state, defaulting to off')
  }

  return { active: false, activatedAt: null, activatedBy: null }
}

/**
 * Persist current state to disk.
 */
function persistState(active: boolean, activatedAt: Date | null, activatedBy: string | null): void {
  try {
    const state: KillSwitchState = {
      active,
      activatedAt: activatedAt?.toISOString() ?? null,
      activatedBy,
    }
    writeFileSync(PERSIST_PATH, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[KillSwitch] Failed to persist state:', err)
  }
}

// Initialize from persisted state (env var > file > default off)
const initial = loadPersistedState()
let killSwitchActive: boolean = initial.active
let activatedAt: Date | null = initial.activatedAt
let activatedBy: string | null = initial.activatedBy

/**
 * Check if the kill switch is currently active
 */
export function isKillSwitchActive(): boolean {
  return killSwitchActive
}

/**
 * Toggle the kill switch on or off
 */
export function setKillSwitch(active: boolean, actor: string = 'admin'): void {
  const wasActive = killSwitchActive
  killSwitchActive = active

  if (active && !wasActive) {
    activatedAt = new Date()
    activatedBy = actor
    console.warn(`[KillSwitch] ACTIVATED by ${actor} at ${activatedAt.toISOString()}`)
  } else if (!active && wasActive) {
    console.log(`[KillSwitch] DEACTIVATED by ${actor}`)
    activatedAt = null
    activatedBy = null
  }

  // Persist to disk so state survives restarts
  persistState(killSwitchActive, activatedAt, activatedBy)
}

/**
 * Get full kill switch status for admin dashboard
 */
export function getKillSwitchStatus(): {
  active: boolean
  activatedAt: Date | null
  activatedBy: string | null
} {
  return {
    active: killSwitchActive,
    activatedAt,
    activatedBy,
  }
}
