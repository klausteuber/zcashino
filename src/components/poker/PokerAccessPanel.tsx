'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UseGameSessionReturn } from '@/hooks/useGameSession'
import type { PokerAccess } from '@/lib/poker/access-types'
import HumanCheck from './HumanCheck'
import styles from './poker.module.css'

export default function PokerAccessPanel({ game, entry = true, inHand = false, nonce, onAccess }: {
  game: UseGameSessionReturn; entry?: boolean; inHand?: boolean; nonce?: string; onAccess?: (access: PokerAccess | null) => void
}) {
  const [access, setAccess] = useState<PokerAccess | null>(null), [nickname, setNickname] = useState('')
  const [key, setKey] = useState(''), [saved, setSaved] = useState(false), [restore, setRestore] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const verifying = useRef(false)
  const statusAbort = useRef<AbortController | null>(null)
  const sessionId = game.session?.id
  const refresh = useCallback(async () => {
    const abort = statusAbort.current
    const res = await fetch('/api/poker/access', { cache: 'no-store', signal: abort?.signal }), body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Unable to load poker access.')
    if (!abort?.signal.aborted) setAccess(body)
  }, [])
  useEffect(() => {
    setAccess(null); setKey(''); setSaved(false); setError(''); setNickname('')
    statusAbort.current?.abort()
    statusAbort.current = new AbortController()
    if (!sessionId) return
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { await refresh() } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Connection lost.') }
      if (!cancelled) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { cancelled = true; statusAbort.current?.abort(); clearTimeout(timer) }
  }, [refresh, sessionId])
  useEffect(() => { onAccess?.(access) }, [access, onAccess])
  async function post(body: unknown) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/poker/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not complete poker setup.')
      setAccess(data); setKey(''); return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to complete the check.'); await refresh().catch(() => {}); return false }
    finally { setBusy(false) }
  }
  async function verify(token: string) {
    if (!access || verifying.current) return
    verifying.current = true
    try { if (!await post({ kind: 'verify', token, nonce: access.nonce })) setAttempt(n => n + 1) }
    finally { verifying.current = false }
  }
  async function makeKey() {
    setBusy(true); setError('')
    try {
      const result = await game.handleCreateRecoveryKey()
      if (!result) throw new Error('Could not create a recovery key. Open Deposit to check your recovery settings.')
      setKey(result.recoveryKey); setSaved(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create a recovery key.') }
    finally { setBusy(false) }
  }
  async function restoreIdentity() {
    setBusy(true); setError('')
    try {
      const result = await game.handleRestoreSession(restore)
      if (!result.success) throw new Error(result.error || 'Could not restore your identity.')
      setRestore(''); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Restore failed.') }
    finally { setBusy(false) }
  }
  const verified = access?.setupComplete && access.playVerified && (!entry || access.entryVerified) && !access.restricted
  return <section className={styles.accessPanel} aria-label="Poker identity and security check">
    <div className={styles.accessHeading}><strong>{access?.nickname ? `Playing as ${access.nickname}` : 'Your poker identity'}</strong><span>{inHand ? 'Hand in progress' : verified ? 'Ready for poker' : 'Setup & security check'}</span></div>
    <details className={styles.accessDetails} open={!verified && !inHand} key={`${verified}-${inHand}`}><summary>{verified || inHand ? 'Identity & privacy' : 'Complete poker setup'}</summary>
    {access?.nickname && <p className={styles.fine}>Poker ID: {access.identityId}. {game.session?.isDemo ? 'This practice identity stays in this browser. Real ZEC identities can be restored with a wallet recovery key.' : 'Restore your wallet recovery key on either brand to keep this identity.'}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!access && <p className={styles.fine}>Loading poker access…</p>}
    {inHand ? <p className={styles.fine}>Any new security check will wait until this hand finishes. Your action timer and cash-out remain available.</p> : <>
      {access && !access.setupComplete && <div className={styles.accessControls}>
        <p className={styles.fine}>Use one poker identity across 21Z.cash and CypherJester. Your nickname stays the same between tables. Creating another wallet does not make a second poker identity permissible.</p>
        {!access.nickname && <label>Poker nickname<input aria-label="Poker nickname" minLength={2} maxLength={24} value={nickname} onChange={e => setNickname(e.target.value)} autoComplete="nickname" /></label>}
        {access.recoveryRequired && <>
          <p className={styles.fine}>Save your wallet recovery key before entering real ZEC tables. It restores your identity, balance and time bank.</p>
          {!game.session?.recovery?.enabled && !key && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void makeKey()}>Create recovery key</button>}
          {key && <div className={styles.recoverySecret}><strong>Store this key privately. Anyone with it can access your wallet.</strong><code>{key}</code><button type="button" className={styles.secondary} onClick={() => void navigator.clipboard.writeText(key).catch(() => setError('Select and copy the key manually.'))}>Copy recovery key</button></div>}
          <label className={styles.accessCheckbox}><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have stored my recovery key somewhere safe.</label>
        </>}
        <button type="button" className={styles.primary} disabled={busy || (!access.nickname && nickname.trim().length < 2) || (access.recoveryRequired && (!saved || (!key && !game.session?.recovery?.enabled)))} onClick={() => void post({ kind: 'setup', nickname: access.nickname || nickname, recoverySaved: saved })}>Save poker identity</button>
      </div>}
      {access?.restricted && <p className={styles.notice}>New poker hands are restricted for this identity. You can still leave and return your stack.</p>}
      {access?.setupComplete && !verified && !access.restricted && <div className={styles.accessControls}>
        <p className={styles.fine}>{entry ? 'Complete a fresh security check before taking a seat.' : 'Complete a security check, then select Ready to play.'} A routine check lasts up to two hours or 100 dealt hands. Additional checks may be requested between hands.</p>
        {access.provider === 'unavailable' ? <p className={styles.notice}>Security verification is awaiting configuration. New seats are temporarily unavailable.</p> : access.provider === 'local-test' ? <><p className={styles.notice}>Local testing only: this check does not verify a human.</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void verify(`local-test:${access.nonce}`)}>Complete local test check</button></> : <HumanCheck key={`${access.nonce}:${attempt}`} challengeNonce={access.nonce} scriptNonce={nonce} onVerified={() => { void refresh().catch(() => setError('Check completed. Refresh the page to reload your entry status.')) }} />}
        {busy && <p role="status">Verifying…</p>}
      </div>}
      <details className={styles.accessRestore}><summary>Restore an existing poker identity</summary><p className={styles.fine}>Use the same wallet recovery key on either brand. Restoring signs out older browser sessions. Leave your current table before switching identities.</p><label>Wallet recovery key<input aria-label="Wallet recovery key" type="password" autoComplete="off" value={restore} onChange={e => setRestore(e.target.value)} /></label><button type="button" className={styles.secondary} disabled={busy || !restore.trim()} onClick={() => void restoreIdentity()}>Restore identity</button></details>
    </>}
    <p className={styles.fine}>Private poker histories and limited browser/network signals are retained for integrity checks for 30 days. Security checks run on our own servers and do not certify that subsequent decisions are human. <Link href="/privacy#poker-integrity">Poker privacy details</Link>.</p>
    </details>
  </section>
}
