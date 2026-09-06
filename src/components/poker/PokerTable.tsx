'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameSession } from '@/hooks/useGameSession'
import { formatZec, parseZec, stakesLabel, studAnte, studBringIn, VARIANT_NAMES, TIME_BANK_REFILL_HANDS, type PublicTable } from '@/lib/poker/types'
import type { TableCommand } from '@/lib/poker/service'
import PokerAccessPanel from './PokerAccessPanel'
import type { PokerAccess } from '@/lib/poker/access-types'
import PokerWallet from './PokerWallet'
import styles from './poker.module.css'

function Card({ card, small = false, exposed = false }: { card: number | null; small?: boolean; exposed?: boolean }) {
  const rank = card === null ? '' : ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][Math.floor(card / 4)]
  const suit = card === null ? '' : ['♣', '♦', '♥', '♠'][card % 4]
  return <div className={`${styles.card} ${small ? styles.smallCard : ''} ${card === null ? styles.cardBack : ''}`} data-red={suit === '♦' || suit === '♥'} data-exposed={exposed} aria-label={card === null ? 'Hidden card' : `${rank}${suit}${exposed ? ' · face up' : ''}`} title={exposed ? 'Visible to everyone' : undefined}>
    {card !== null && <><strong>{rank}</strong><span>{suit}</span></>}
  </div>
}
export default function PokerTable({ tableId, nonce }: { tableId: string; nonce?: string }) {
  const game = useGameSession()
  const [table, setTable] = useState<PublicTable | null>(null)
  const latest = useRef<PublicTable | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [clockOffset, setClockOffset] = useState(0)
  const [seat, setSeat] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [access, setAccess] = useState<PokerAccess | null>(null)
  const updateAccess = useCallback((value: PokerAccess | null) => { setAccess(value); setName(value?.nickname ?? '') }, [])
  const [buyIn, setBuyIn] = useState('')
  const [raise, setRaise] = useState('')
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const sessionId = game.session?.id
  const setSession = game.setSession
  const apply = useCallback((value: PublicTable) => {
    if (latest.current && (value.version < latest.current.version || (value.version === latest.current.version && value.serverTime < latest.current.serverTime))) return
    latest.current = value; setTable(value); setConnected(true)
    setClockOffset(value.serverTime - Date.now())
    setSession(s => s && s.balance !== value.balanceZats / 100_000_000 ? { ...s, balance: value.balanceZats / 100_000_000 } : s)
  }, [setSession])
  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`/api/poker/tables/${tableId}`, { cache: 'no-store', signal })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Unable to load the table.')
    if (!signal?.aborted) apply(body)
  }, [apply, tableId])
  useEffect(() => {
    if (!sessionId) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    latest.current = null
    const poll = async () => {
      try { await load(abort.signal) }
      catch (e) { if (!abort.signal.aborted) { setConnected(false); if (!latest.current) setError(e instanceof Error ? e.message : 'Connection lost.') } }
      if (!abort.signal.aborted) timer = setTimeout(poll, 1_000)
    }
    void poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [load, sessionId])
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 250); return () => clearInterval(timer) }, [])
  useEffect(() => { setName(localStorage.getItem('poker_display_name') || '') }, [])
  useEffect(() => {
    if (seat === null) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && dialogRef.current?.getAttribute('aria-busy') !== 'true') setSeat(null)
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); returnFocus.current?.focus() }
  }, [seat])
  const minRaise = table?.legal?.minRaiseTo
  useEffect(() => { setRaise(minRaise ? formatZec(minRaise) : '') }, [minRaise, table?.state.handNumber, table?.state.phase])
  async function send(command: TableCommand) {
    if (busy || !latest.current) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/poker/tables/${tableId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, version: latest.current.version, requestId: crypto.randomUUID() }) })
      const body = await res.json()
      if (!res.ok) { await load(); throw new Error(body.error || 'Action could not be saved.') }
      apply(body)
      if (command.kind === 'join') { localStorage.setItem('poker_display_name', name); setSeat(null) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection lost. Refresh the table before trying again.') }
    finally { setBusy(false) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true) }
    catch { setError('Copy the address from your browser to invite a friend.') }
  }
  const state = table?.state
  const me = table?.viewerSeat === null || table?.viewerSeat === undefined ? null : state?.seats[table.viewerSeat]
  const pot = state?.seats.reduce((sum, p) => sum + (p?.contribution ?? 0), 0) ?? 0
  const seconds = Math.max(0, Math.ceil(((state?.deadline ?? 0) - clock - clockOffset) / 1000))
  const nextSeconds = Math.max(0, Math.ceil(((state?.nextHandAt ?? 0) - clock - clockOffset) / 1000))
  const units = table?.mode === 'practice' ? 'play ZEC' : 'ZEC'
  const canJoin = !!table && (table.mode === 'practice' ? !!game.session?.isDemo : !game.session?.isDemo && table.realMoneyEnabled)
  const variant = state?.variant ?? 'holdem'
  const isStud = variant === 'stud'
  const bringInDue = table?.legal?.bringIn !== null && table?.legal?.bringIn !== undefined
  const bankActive = !!table?.legal && state?.timeBankStartsAt !== null
  const bankRemaining = Math.max(0, (me?.timeBankMs ?? 0) - (bankActive ? Math.max(0, clock + clockOffset - (state?.timeBankStartsAt ?? 0)) : 0))
  const betLabel = state?.currentBet === 0 ? 'Bet' : isStud && state?.phase === 'third' && state.currentBet < state.bigBlind ? 'Complete' : 'Raise'
  const actionDisabled = busy || !connected || !table?.legal || seconds === 0
  return <div className={`${styles.page} ${styles.tablePage}`} data-variant={variant}>
    <div className={styles.topline}><Link href="/poker" className={styles.back}>← Poker lobby</Link><PokerWallet game={game} /></div>
    <div className={styles.tableHeading}><div><p className={styles.eyebrow}>SIX-MAX · {VARIANT_NAMES[variant]}</p><h1>{table?.name ?? 'Opening table…'}</h1><p>{state ? `${stakesLabel(variant, state.bigBlind)} · ${units} · No rake · Hand #${state.handNumber}` : 'Connecting to the room'}</p></div>
      <div className={styles.tableTools}><span className={styles.connection} data-connected={connected}>{connected ? 'Connected' : 'Reconnecting…'}</span><button className={styles.secondary} onClick={copyLink}>{copied ? 'Link copied' : 'Invite friends ↗'}</button></div>
    </div>
    {(error || game.error) && <div role="alert" className={styles.error}>{error || game.error}<button onClick={() => { setError(''); game.setError(null) }} aria-label="Dismiss error">×</button></div>}
    {!connected && table && <p role="status" className={styles.notice}>Connection interrupted. Your saved stack is safe. Controls resume when the table reconnects; the turn timer continues.</p>}
    <div className={styles.gameLayout}>
      <section className={styles.playArea} aria-label="Six-player poker table">
        <div className={styles.felt}>
          <div className={styles.tableBrand}>SIX MAX <span>♠</span></div>
          {isStud ? <div className={styles.studStreet}><strong>{state?.phase === 'waiting' ? 'SEVEN-CARD STUD' : state?.phase === 'complete' ? 'SHOWDOWN' : `${state?.phase.toUpperCase()} STREET`}</strong><span>Fixed limit · High hand wins</span></div> : <div className={styles.board} aria-label="Community cards">{Array.from({ length: 5 }, (_, i) => state?.board[i] !== undefined ? <Card key={i} card={state.board[i]} /> : <div key={i} className={styles.cardSlot} />)}</div>}
          <div className={styles.pot}>{state?.phase === 'complete' ? 'HAND COMPLETE' : 'TOTAL POT'}<strong>{formatZec(pot)} <small>{units}</small></strong></div>
          <div className={styles.tableStatus} role="status">{state?.phase === 'waiting' ? state.nextHandAt ? `Dealing in ${nextSeconds}s` : 'Waiting for two ready players' : state?.phase === 'complete' ? `Next hand in ${nextSeconds}s` : state?.actor !== null && state?.actor !== undefined ? `${state.seats[state.actor]?.name} to act · ${seconds}s` : ''}</div>
        </div>
        {Array.from({ length: 6 }, (_, i) => {
          const player = state?.seats[i]
          const position = (i - (table?.viewerSeat ?? 0) + 6) % 6
          const isMe = table?.viewerSeat === i
          const winner = state?.phase === 'complete' && state.awards.some(a => a.seat === i && !a.refund)
          return <div key={i} className={`${styles.seat} ${styles[`seat${position}`]}`} data-testid={`seat-${i}`} data-acting={state?.actor === i} data-folded={player?.folded} data-winner={winner}>
            {player ? <>
              <div className={`${styles.holeCards} ${isStud ? styles.studCards : ''}`}>
                {isStud ? <><div>{player.cards.map((card, j) => !player.exposed[j] && <Card key={j} card={card} small />)}</div><div>{player.cards.map((card, j) => player.exposed[j] && <Card key={j} card={card} small exposed />)}</div></> : player.cards.map((card, j) => <Card key={j} card={card} small />)}
              </div>
              <div className={styles.seatBody}><div className={styles.seatName}><span className={styles.avatar}>{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}{isMe ? ' (you)' : ''}</strong>{!isStud && state?.dealer === i && <span className={styles.dealer} title="Dealer button">D</span>}</div>
                <div className={styles.stack}>{formatZec(player.stack)} <small>{units}</small></div>
                <small className={styles.seatAction}>{player.leaving ? 'Leaving after hand' : winner ? 'Winner' : player.lastAction || (player.ready ? 'Ready' : 'Sitting out')}</small>
                {state?.actor === i && <div className={styles.timerTrack}><div style={{ width: `${Math.min(100, seconds / 30 * 100)}%` }} /></div>}
              </div>
              {player.streetBet > 0 && <div className={styles.betChip}>◉ {formatZec(player.streetBet)}</div>}
            </> : <button className={styles.emptySeat} disabled={!!me || busy || !table} onClick={event => { returnFocus.current = event.currentTarget; setError(''); setSeat(i); setBuyIn(formatZec(table!.buyInMax)) }}><span>＋</span>Seat {i + 1}</button>}
          </div>
        })}
      </section>
    {state?.phase === 'complete' && state.awards.some(a => !a.refund) && <div className={styles.result} role="status">{state.awards.filter(a => !a.refund).map((award, i) => <span key={i}><strong>{state.seats[award.seat]?.name ?? `Seat ${award.seat + 1}`}</strong> wins {formatZec(award.amount)} {units} · {award.label}</span>)}</div>}
    {me && <section className={styles.actionBar} aria-label="Poker actions">
      {me.cards.length > 0 && <div className={styles.yourCards}><span className={styles.eyebrow}>YOUR CARDS</span><div>{me.cards.map((card, i) => <Card key={i} card={card} exposed={me.exposed[i]} />)}</div>{isStud && <small>Outlined cards are face up for everyone.</small>}{variant === 'omaha' && <small>Use exactly two of these cards and three from the board.</small>}</div>}
      <div className={styles.turnLabel}><span className={styles.eyebrow}>{bankActive ? 'TIME BANK ACTIVATED' : table?.legal ? 'YOUR MOVE' : 'AT THE TABLE'}</span><strong>{table?.legal ? `${seconds} seconds` : me.leaving ? 'Leaving after hand' : state?.phase === 'waiting' ? 'Ready when you are' : 'Waiting for your turn'}</strong></div>
      <div className={styles.actionButtons}><button className={styles.foldButton} disabled={actionDisabled || bringInDue} onClick={() => void send({ kind: 'act', action: { type: 'fold' } })}>Fold</button>
        <button className={styles.callButton} disabled={actionDisabled} onClick={() => void send({ kind: 'act', action: { type: bringInDue ? 'bring-in' : table?.legal?.canCheck ? 'check' : 'call' } })}>{bringInDue ? `Bring in ${formatZec(table?.legal?.bringIn ?? 0)}` : table?.legal?.canCheck ? 'Check' : `Call ${formatZec(table?.legal?.call ?? 0)}`}</button>
      </div>
      {isStud ? <div className={styles.limitControls}>{(table?.legal?.raiseOptions?.length ? table.legal.raiseOptions : [state?.limitUnit ?? 0]).map(amount => <button key={amount} className={styles.primary} disabled={actionDisabled || !table?.legal?.canRaise} onClick={() => void send({ kind: 'act', action: { type: 'raise', to: amount } })}>{betLabel} to {formatZec(amount)}</button>)}</div> : <div className={styles.raiseControls}><div className={styles.raiseRow}><label className={styles.raiseInput}>Raise to<input aria-label={`Raise total in ${units}`} inputMode="decimal" value={raise} disabled={actionDisabled || !table?.legal?.canRaise} onChange={e => setRaise(e.target.value)} /></label>
        <button className={styles.primary} disabled={actionDisabled || !table?.legal?.canRaise || parseZec(raise) === null || parseZec(raise)! < (table?.legal?.minRaiseTo ?? 0) || parseZec(raise)! > (table?.legal?.maxRaiseTo ?? 0)} onClick={() => void send({ kind: 'act', action: { type: 'raise', to: parseZec(raise)! } })}>{betLabel}</button></div>
        <div className={styles.quickBets}>{[['Min', table?.legal?.minRaiseTo], ['½ pot', Math.max(table?.legal?.minRaiseTo ?? 0, (me.streetBet + (table?.legal?.call ?? 0)) + Math.floor((pot + (table?.legal?.call ?? 0)) / 2))], ['Pot', Math.max(table?.legal?.minRaiseTo ?? 0, me.streetBet + (table?.legal?.call ?? 0) + pot + (table?.legal?.call ?? 0))], [variant === 'omaha' ? 'Max' : 'All-in', table?.legal?.maxRaiseTo]].map(([label, amount]) => <button key={label} disabled={actionDisabled || !table?.legal?.canRaise} onClick={() => setRaise(formatZec(Math.min(Number(amount), table!.legal!.maxRaiseTo)))}>{label}</button>)}</div>
      </div>}
      <div className={styles.timeBank}><div><strong>Time bank · {Math.ceil(bankRemaining / 1000)}s</strong><small>+5s in {TIME_BANK_REFILL_HANDS - me.handsDealt % TIME_BANK_REFILL_HANDS} hands dealt to you · 30s maximum</small></div><button className={styles.secondary} disabled={actionDisabled || bankActive || bankRemaining <= 0 || me.leaving} onClick={() => void send({ kind: 'time-bank' })}>{bankActive ? 'Activated for this turn' : 'Use time bank'}</button><p>Only time beyond your normal 30 seconds uses the bank. Leaving or reconnecting keeps your remaining time.</p></div>
    </section>}
      <aside className={styles.rail}>
        <div className={styles.panelHeading}><h2>At the table</h2><span className={styles.badge}>{state?.seats.filter(Boolean).length ?? 0}/6</span></div>
        {me ? <div className={styles.playerTools}>
          <span className={styles.eyebrow}>YOUR TABLE STACK</span><strong>{formatZec(me.stack)} <small>{units}</small></strong>
          <button className={me.ready ? styles.secondary : styles.primary} disabled={busy || !connected || me.leaving} onClick={() => void send({ kind: 'ready', ready: !me.ready })}>{me.ready ? 'Sit out next hand' : 'Ready to play'}</button>
          <button className={styles.textButton} disabled={busy || !connected || me.leaving} onClick={() => void send({ kind: 'leave' })}>{me.leaving ? 'Cash-out queued' : me.inHand && state?.phase !== 'complete' && state?.phase !== 'waiting' ? 'Leave after this hand' : 'Leave & return stack'}</button>
          <p className={styles.fine}>{me.leaving ? 'Required bring-ins are posted; other turns check or fold automatically. Your remaining stack returns after this hand.' : 'Sitting out keeps your seat. Leaving returns your remaining stack to your available balance.'}</p>
        </div> : <div className={styles.playerTools}><p>Choose an open seat to join.</p><p className={styles.fine}>Your down cards stay private until showdown. Folded down cards remain hidden. Stud’s face-up cards are visible to everyone.</p>{!canJoin && <p className={styles.notice}>{table?.mode === 'real' && game.session?.isDemo ? 'Fund your real ZEC balance to join this table.' : 'This table is currently available to watch.'}</p>}</div>}
        {isStud && state && <p className={styles.studRules}>Ante {formatZec(studAnte(state.bigBlind))} · Bring-in {formatZec(studBringIn(state.bigBlind))} {units}. Four bets per street, including heads-up. An open pair on fourth street permits the big bet.</p>}
        <PokerAccessPanel game={game} nonce={nonce} entry={!me} inHand={!!me?.inHand && state?.phase !== 'complete' && state?.phase !== 'waiting'} onAccess={updateAccess} />
        <div className={styles.history}><h3>Hand activity</h3><ol>{state?.log.slice().reverse().map((entry, i) => <li key={`${state.handNumber}-${i}`}>{entry}</li>)}</ol></div>
      </aside>
    </div>
    <p className={styles.disclosure}>Server-dealt poker · No rake · 30-second turns plus a manually activated time bank · On timeout, required bring-ins are posted; otherwise you check or fold, then sit out next hand. The operator holds table funds; this version does not offer a public shuffle proof.</p>
    {seat !== null && table && <div className={styles.modalBackdrop} onClick={() => !busy && setSeat(null)}><section ref={dialogRef} className={styles.joinDialog} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="join-heading" onClick={e => e.stopPropagation()}>
      <div className={styles.panelHeading}><h2 id="join-heading">Take seat {seat + 1}</h2><button className={styles.textButton} aria-label="Close seat dialog" disabled={busy} onClick={() => setSeat(null)}>×</button></div>
      <form className={styles.form} onSubmit={e => { e.preventDefault(); const amount = parseZec(buyIn); if (amount === null) { setError('Enter a valid buy-in.'); return } void send({ kind: 'join', seat, buyIn: amount, name }) }}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <label>Your nickname<input autoFocus required minLength={2} maxLength={24} value={name} readOnly placeholder="Set up your poker identity first" autoComplete="nickname" /></label>
        <label>Buy-in ({units})<input required inputMode="decimal" value={buyIn} onChange={e => setBuyIn(e.target.value)} /><small>{formatZec(table.buyInMin)}–{formatZec(table.buyInMax)} {units}</small></label>
        {(!access?.setupComplete || !access?.entryVerified) && <p className={styles.notice}>Close this dialog and complete your poker identity and human check in the table sidebar first.</p>}
        <p className={styles.fine}>Available: {formatZec(table.balanceZats)} {game.session?.isDemo ? 'play ZEC' : 'ZEC'}. Your buy-in stays at this table until you leave. {isStud ? 'Each hand posts an ante. The lowest exposed card posts the bring-in or completes the bet.' : 'Joining after the first hand posts one big blind.'}</p>
        {!canJoin && <p className={styles.notice}>Use the matching wallet balance before joining. Real tables require a funded real ZEC session.</p>}
        <button className={styles.primary} disabled={busy || !canJoin || !access?.entryVerified || !access?.playVerified || !access?.setupComplete || access?.restricted}>{busy ? 'Reserving seat…' : 'Buy in & take seat'}</button>
      </form>
    </section></div>}
  </div>
}
