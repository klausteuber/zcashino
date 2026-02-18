/**
 * Role-Based Access Control engine for multi-admin support.
 *
 * Roles:
 *   analyst     — read-only access to dashboards, analytics, players, games, alerts
 *   operator    — analyst + approve/reject withdrawals, dismiss alerts, update player limits
 *   super_admin — operator + kill switch, settings, admin user management
 */

import bcrypt from 'bcryptjs'

export type AdminRole = 'analyst' | 'operator' | 'super_admin'

export type Permission =
  | 'view_overview'
  | 'view_analytics'
  | 'view_players'
  | 'view_games'
  | 'view_alerts'
  | 'view_audit_logs'
  | 'view_withdrawals'
  | 'export_csv'
  | 'approve_withdrawals'
  | 'dismiss_alerts'
  | 'update_player_limits'
  | 'toggle_kill_switch'
  | 'manage_settings'
  | 'manage_admin_users'

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  analyst: [
    'view_overview',
    'view_analytics',
    'view_players',
    'view_games',
    'view_alerts',
    'view_audit_logs',
    'view_withdrawals',
    'export_csv',
  ],
  operator: [
    'view_overview',
    'view_analytics',
    'view_players',
    'view_games',
    'view_alerts',
    'view_audit_logs',
    'view_withdrawals',
    'export_csv',
    'approve_withdrawals',
    'dismiss_alerts',
    'update_player_limits',
  ],
  super_admin: [
    'view_overview',
    'view_analytics',
    'view_players',
    'view_games',
    'view_alerts',
    'view_audit_logs',
    'view_withdrawals',
    'export_csv',
    'approve_withdrawals',
    'dismiss_alerts',
    'update_player_limits',
    'toggle_kill_switch',
    'manage_settings',
    'manage_admin_users',
  ],
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: AdminRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role]
  return perms ? perms.includes(permission) : false
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: AdminRole): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Validate that a string is a valid admin role.
 */
export function isValidRole(role: string): role is AdminRole {
  return role === 'analyst' || role === 'operator' || role === 'super_admin'
}

const BCRYPT_ROUNDS = 12

/**
 * Hash a password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Role display labels.
 */
export const ROLE_LABELS: Record<AdminRole, string> = {
  analyst: 'Analyst',
  operator: 'Operator',
  super_admin: 'Super Admin',
}
