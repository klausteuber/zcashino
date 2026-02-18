'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ---------- Types ----------

interface AdminUser {
  id: string
  username: string
  role: string
  roleLabel: string
  isActive: boolean
  totpEnabled: boolean
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
  createdBy: string | null
}

type ModalMode = 'create' | 'edit' | null

const ROLE_OPTIONS = [
  { value: 'analyst', label: 'Analyst', description: 'Read-only access to dashboards and data' },
  { value: 'operator', label: 'Operator', description: 'Analyst + approve withdrawals, dismiss alerts' },
  { value: 'super_admin', label: 'Super Admin', description: 'Full access including settings and user management' },
]

// ---------- Helpers ----------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const ms = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.round(days / 30)}mo ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------- Component ----------

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('analyst')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Password reset
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)

  // 2FA setup
  const [totpSetupUser, setTotpSetupUser] = useState<AdminUser | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpUri, setTotpUri] = useState<string | null>(null)
  const [totpConfirmCode, setTotpConfirmCode] = useState('')
  const [totpSubmitting, setTotpSubmitting] = useState(false)
  const [totpError, setTotpError] = useState<string | null>(null)

  // ---------- Fetch ----------

  const fetchUsers = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setUsers(data.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Clear success message after 4s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(null), 4000)
    return () => clearTimeout(t)
  }, [success])

  // ---------- Create / Edit ----------

  function openCreateModal() {
    setModalMode('create')
    setEditingUser(null)
    setFormUsername('')
    setFormPassword('')
    setFormRole('analyst')
    setFormError(null)
  }

  function openEditModal(user: AdminUser) {
    setModalMode('edit')
    setEditingUser(user)
    setFormUsername(user.username)
    setFormPassword('')
    setFormRole(user.role)
    setFormError(null)
  }

  function closeModal() {
    setModalMode(null)
    setEditingUser(null)
    setFormError(null)
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim(),
          password: formPassword,
          role: formRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess(`User "${data.user.username}" created successfully.`)
      closeModal()
      await fetchUsers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setFormSubmitting(true)
    setFormError(null)

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: formRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess(`Role updated to "${data.user.roleLabel}".`)
      closeModal()
      await fetchUsers()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setFormSubmitting(false)
    }
  }

  // ---------- Toggle Active ----------

  async function toggleActive(user: AdminUser) {
    const action = user.isActive ? 'deactivate' : 'reactivate'
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${user.username}"?`)) return

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: user.isActive ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: user.isActive ? undefined : JSON.stringify({ isActive: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess(`User "${user.username}" ${user.isActive ? 'deactivated' : 'reactivated'}.`)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} user`)
    }
  }

  // ---------- Password Reset ----------

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUserId) return
    setResetSubmitting(true)

    try {
      const res = await fetch(`/api/admin/users/${resetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess('Password updated.')
      setResetUserId(null)
      setResetPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetSubmitting(false)
    }
  }

  // ---------- 2FA Setup ----------

  async function startTotpSetup(user: AdminUser) {
    setTotpSetupUser(user)
    setTotpSecret(null)
    setTotpUri(null)
    setTotpConfirmCode('')
    setTotpError(null)
    setTotpSubmitting(true)

    try {
      const res = await fetch(`/api/admin/users/${user.id}/totp`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setTotpSecret(data.secret)
      setTotpUri(data.uri)
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Failed to start 2FA setup')
    } finally {
      setTotpSubmitting(false)
    }
  }

  async function confirmTotpSetup(e: React.FormEvent) {
    e.preventDefault()
    if (!totpSetupUser) return
    setTotpSubmitting(true)
    setTotpError(null)

    try {
      const res = await fetch(`/api/admin/users/${totpSetupUser.id}/totp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpConfirmCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess(`2FA enabled for "${totpSetupUser.username}".`)
      closeTotpModal()
      await fetchUsers()
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setTotpSubmitting(false)
    }
  }

  async function resetTotp(user: AdminUser) {
    if (!confirm(`Disable 2FA for "${user.username}"? They will need to set it up again.`)) return

    try {
      const res = await fetch(`/api/admin/users/${user.id}/totp`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setSuccess(`2FA disabled for "${user.username}".`)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset 2FA')
    }
  }

  function closeTotpModal() {
    setTotpSetupUser(null)
    setTotpSecret(null)
    setTotpUri(null)
    setTotpConfirmCode('')
    setTotpError(null)
  }

  // ---------- Render ----------

  const activeUsers = users.filter((u) => u.isActive)
  const inactiveUsers = users.filter((u) => !u.isActive)

  return (
    <div className="min-h-screen bg-midnight-black text-bone-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-masque-gold font-[family-name:var(--font-cinzel)]">
              Admin Users
            </h1>
            <p className="text-[11px] text-bone-white/40 mt-0.5">
              {activeUsers.length} active, {inactiveUsers.length} inactive
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openCreateModal}
              className="text-sm px-3 py-1.5 rounded border border-masque-gold/30 text-masque-gold hover:border-masque-gold hover:bg-masque-gold/10 transition-colors"
            >
              + New User
            </button>
            <Link
              href="/admin"
              className="text-sm text-venetian-gold hover:text-masque-gold transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Success banner */}
        {success && (
          <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
            {success}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg text-sm text-blood-ruby">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center text-bone-white/50 py-12">Loading users...</div>
        )}

        {/* Users table */}
        {!loading && (
          <div className="bg-midnight-black/50 border border-masque-gold/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-masque-gold/20">
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">User</th>
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">2FA</th>
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">Last Login</th>
                  <th className="text-left px-4 py-3 text-masque-gold/70 font-medium">Created</th>
                  <th className="text-right px-4 py-3 text-masque-gold/70 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b border-masque-gold/10 ${
                      !user.isActive ? 'opacity-40' : ''
                    }`}
                  >
                    {/* Username */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-bone-white">{user.username}</span>
                    </td>

                    {/* Role badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded border ${
                          user.role === 'super_admin'
                            ? 'bg-masque-gold/15 text-masque-gold border-masque-gold/30'
                            : user.role === 'operator'
                              ? 'bg-jester-purple/15 text-jester-purple-light border-jester-purple/30'
                              : 'bg-bone-white/10 text-bone-white/60 border-bone-white/20'
                        }`}
                      >
                        {user.roleLabel}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          user.isActive ? 'text-emerald-400' : 'text-bone-white/40'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            user.isActive ? 'bg-emerald-400' : 'bg-bone-white/30'
                          }`}
                        />
                        {user.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>

                    {/* 2FA */}
                    <td className="px-4 py-3">
                      {user.totpEnabled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                          On
                        </span>
                      ) : (
                        <span className="text-xs text-bone-white/30">Off</span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="px-4 py-3 text-bone-white/50 text-xs">
                      {timeAgo(user.lastLoginAt)}
                      {user.lastLoginIp && (
                        <span className="block text-bone-white/30 text-[10px]">
                          {user.lastLoginIp}
                        </span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-bone-white/50 text-xs">
                      {formatDate(user.createdAt)}
                      {user.createdBy && (
                        <span className="block text-bone-white/30 text-[10px]">
                          by {user.createdBy}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="px-2 py-1 text-xs rounded border border-masque-gold/20 text-venetian-gold hover:text-masque-gold hover:border-masque-gold/40 transition-colors"
                          title="Edit role"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setResetUserId(user.id)
                            setResetPassword('')
                          }}
                          className="px-2 py-1 text-xs rounded border border-masque-gold/20 text-venetian-gold hover:text-masque-gold hover:border-masque-gold/40 transition-colors"
                          title="Reset password"
                        >
                          Reset PW
                        </button>
                        {user.totpEnabled ? (
                          <button
                            onClick={() => resetTotp(user)}
                            className="px-2 py-1 text-xs rounded border border-blood-ruby/30 text-blood-ruby hover:border-blood-ruby/60 transition-colors"
                            title="Disable 2FA"
                          >
                            Reset 2FA
                          </button>
                        ) : (
                          <button
                            onClick={() => startTotpSetup(user)}
                            className="px-2 py-1 text-xs rounded border border-jester-purple/30 text-jester-purple-light hover:border-jester-purple/60 transition-colors"
                            title="Set up 2FA"
                          >
                            Setup 2FA
                          </button>
                        )}
                        <button
                          onClick={() => toggleActive(user)}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            user.isActive
                              ? 'border-blood-ruby/30 text-blood-ruby hover:border-blood-ruby/60'
                              : 'border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60'
                          }`}
                          title={user.isActive ? 'Deactivate' : 'Reactivate'}
                        >
                          {user.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-bone-white/40">
                      No admin users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Create / Edit Modal ===== */}
        {modalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-black/80 backdrop-blur-sm">
            <div className="bg-midnight-black border border-masque-gold/30 rounded-xl w-full max-w-md p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-masque-gold mb-4 font-[family-name:var(--font-cinzel)]">
                {modalMode === 'create' ? 'Create Admin User' : 'Edit User Role'}
              </h2>

              {formError && (
                <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg text-sm text-blood-ruby">
                  {formError}
                </div>
              )}

              <form onSubmit={modalMode === 'create' ? handleCreateSubmit : handleEditSubmit}>
                {/* Username */}
                <label className="block mb-4">
                  <span className="text-xs text-bone-white/60 mb-1 block">Username</span>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    disabled={modalMode === 'edit'}
                    required
                    minLength={3}
                    className="w-full px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none disabled:opacity-50"
                    placeholder="e.g. jane_ops"
                    autoFocus={modalMode === 'create'}
                  />
                </label>

                {/* Password (create only) */}
                {modalMode === 'create' && (
                  <label className="block mb-4">
                    <span className="text-xs text-bone-white/60 mb-1 block">Password</span>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
                      placeholder="Min 8 characters"
                    />
                  </label>
                )}

                {/* Role selector */}
                <fieldset className="mb-6">
                  <legend className="text-xs text-bone-white/60 mb-2">Role</legend>
                  <div className="space-y-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          formRole === opt.value
                            ? 'border-masque-gold/40 bg-masque-gold/5'
                            : 'border-masque-gold/15 hover:border-masque-gold/25'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={opt.value}
                          checked={formRole === opt.value}
                          onChange={(e) => setFormRole(e.target.value)}
                          className="mt-0.5 accent-masque-gold"
                        />
                        <div>
                          <span className="text-sm font-medium text-bone-white">{opt.label}</span>
                          <p className="text-xs text-bone-white/40 mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-bone-white/60 hover:text-bone-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-4 py-2 text-sm rounded bg-masque-gold text-midnight-black font-medium hover:bg-masque-gold/90 transition-colors disabled:opacity-50"
                  >
                    {formSubmitting
                      ? 'Saving...'
                      : modalMode === 'create'
                        ? 'Create User'
                        : 'Update Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== TOTP Setup Modal ===== */}
        {totpSetupUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-black/80 backdrop-blur-sm">
            <div className="bg-midnight-black border border-masque-gold/30 rounded-xl w-full max-w-md p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-masque-gold mb-4 font-[family-name:var(--font-cinzel)]">
                Set Up 2FA
              </h2>
              <p className="text-xs text-bone-white/50 mb-4">
                For user:{' '}
                <span className="text-bone-white">{totpSetupUser.username}</span>
              </p>

              {totpError && (
                <div className="mb-4 p-3 bg-blood-ruby/20 border border-blood-ruby/40 rounded-lg text-sm text-blood-ruby">
                  {totpError}
                </div>
              )}

              {!totpSecret ? (
                <div className="text-center py-8 text-bone-white/50">
                  {totpSubmitting ? 'Generating secret...' : 'Failed to generate secret.'}
                </div>
              ) : (
                <form onSubmit={confirmTotpSetup}>
                  <div className="mb-4">
                    <p className="text-sm text-bone-white/70 mb-3">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                    </p>

                    {/* QR code via Google Charts API */}
                    <div className="flex justify-center mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUri || '')}`}
                        alt="TOTP QR Code"
                        width={200}
                        height={200}
                        className="rounded-lg border border-masque-gold/20"
                      />
                    </div>

                    <details className="mb-4">
                      <summary className="text-xs text-venetian-gold/50 cursor-pointer hover:text-venetian-gold transition-colors">
                        Can&apos;t scan? Show manual key
                      </summary>
                      <div className="mt-2 p-2 bg-midnight-black/80 border border-masque-gold/20 rounded text-center">
                        <code className="text-sm text-masque-gold font-mono tracking-wider break-all">
                          {totpSecret}
                        </code>
                      </div>
                    </details>
                  </div>

                  <label className="block mb-4">
                    <span className="text-xs text-bone-white/60 mb-1 block">
                      Enter the 6-digit code from your app to confirm:
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpConfirmCode}
                      onChange={(e) => setTotpConfirmCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-center text-2xl tracking-[0.5em] font-mono focus:border-masque-gold focus:outline-none"
                      autoFocus
                      required
                    />
                  </label>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeTotpModal}
                      className="px-4 py-2 text-sm text-bone-white/60 hover:text-bone-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={totpSubmitting || totpConfirmCode.length !== 6}
                      className="px-4 py-2 text-sm rounded bg-masque-gold text-midnight-black font-medium hover:bg-masque-gold/90 transition-colors disabled:opacity-50"
                    >
                      {totpSubmitting ? 'Verifying...' : 'Enable 2FA'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ===== Password Reset Modal ===== */}
        {resetUserId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight-black/80 backdrop-blur-sm">
            <div className="bg-midnight-black border border-masque-gold/30 rounded-xl w-full max-w-sm p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-masque-gold mb-4 font-[family-name:var(--font-cinzel)]">
                Reset Password
              </h2>
              <p className="text-xs text-bone-white/50 mb-4">
                For user:{' '}
                <span className="text-bone-white">
                  {users.find((u) => u.id === resetUserId)?.username}
                </span>
              </p>

              <form onSubmit={handlePasswordReset}>
                <label className="block mb-4">
                  <span className="text-xs text-bone-white/60 mb-1 block">New Password</span>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 bg-midnight-black border border-masque-gold/30 rounded text-bone-white text-sm focus:border-masque-gold focus:outline-none"
                    placeholder="Min 8 characters"
                    autoFocus
                  />
                </label>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResetUserId(null)
                      setResetPassword('')
                    }}
                    className="px-4 py-2 text-sm text-bone-white/60 hover:text-bone-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="px-4 py-2 text-sm rounded bg-masque-gold text-midnight-black font-medium hover:bg-masque-gold/90 transition-colors disabled:opacity-50"
                  >
                    {resetSubmitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
