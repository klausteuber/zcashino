'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useGameSession } from '@/hooks/useGameSession'
import { formatZec, parseZec, stakesLabel, studAnte, studBringIn, POKER_VARIANTS, VARIANT_NAMES, type LobbyTable, type PokerMode, type PokerVariant } from '@/lib/poker/types'
import PokerAccessPanel from './PokerAccessPanel'
import type { PokerAccess } from '@/lib/poker/access-types'
import PokerWallet from './PokerWallet'
import styles from './poker.module.css'

export default function PokerLobby({ nonce }: { nonce?: string }) {
  const game = useGameSession()
  const router = useRouter()
  const [tables, setTables] = useState<LobbyTable[]>([])
  const [mode, setMode] = useState<PokerMode>('real')
  const [variant, setVariant] = useState<PokerVariant>('holdem')
  const [filter, setFilter] = useState<PokerVariant | 'all'>('all')
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [access, setAccess] = useState<PokerAccess | null>(null)
  const updateAccess = useCallback((value: PokerAccess | null) => { setAccess(value); setName(value?.nickname ?? '') }, [])
  const [tableName, setTableName] = useState('Midnight Table')
  const [blind, setBlind] = useState(10_000)
  const [buyIn, setBuyIn] = useState('0.01')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sessionId = game.session?.id
  const load = useCallback(async () => {
    const res = await fetch('/api/poker/tables', { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Unable to load tables.')
    setTables(body.tables); setEnabled(body.realMoneyEnabled); setLoaded(true)
  }, [])
  useEffect(() => { setName(localStorage.getItem('poker_display_name') || '') }, [])
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { await load() } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Connection lost.') }
      if (!cancelled) timer = setTimeout(poll, 5_000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load, sessionId])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!access?.setupComplete || !access.entryVerified || !access.playVerified) { setError('Complete your poker identity and security check first.'); return }
    setBusy(true); setError('')
    try {
      const amount = parseZec(buyIn)
      if (amount === null || amount < blind * 20 || amount > blind * 100) throw new Error(`Choose a buy-in between 20 and 100 ${variant === 'stud' ? 'small bets' : 'big blinds'}.`)
      const res = await fetch('/api/poker/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tableName, playerName: name, mode, variant, bigBlind: blind, buyIn: amount, requestId: crypto.randomUUID() }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not create table.')
      localStorage.setItem('poker_display_name', name)
      router.push(`/poker/table/${body.tableId}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create table.') }
    finally { setBusy(false) }
  }
  const mine = tables.find(t => t.myTable)
  const wrongWallet = !!game.session && (mode === 'practice') !== !!game.session.isDemo
  const visible = tables.filter(t => t.mode === mode && (filter === 'all' || t.variant === filter))
  return <div className={styles.page}>
    <div className={styles.topline}><Link href="/" className={styles.back}>← Casino</Link><PokerWallet game={game} /></div>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>HOLD’EM · OMAHA · SEVEN-CARD STUD</p><h1>Six seats.<br /><em>Every move matters.</em></h1>
        <p className={styles.intro}>Bring your friends. Pick your game. Share a six-player table with a balance in ZEC.</p>
        <div className={styles.facts}><span>2–6 players</span><span>30s + time bank</span><span>No rake</span></div>
      </div>
      <div className={styles.heroArt} aria-hidden="true"><div className={styles.artRing}><span>6</span><small>MAX</small></div><div className={styles.artCard}>A<span>♠</span></div><div className={styles.artCardSecond}>K<span>♦</span></div><div className={styles.artCaption}>A SEAT AT THE TABLE</div></div>
    </section>
    {(error || game.error) && <div role="alert" className={styles.error}>{error || game.error}</div>}
    {mine && <Link href={`/poker/table/${mine.id}`} className={styles.returnBanner}>Your stack is at {mine.name}. Return to your table →</Link>}
    <PokerAccessPanel game={game} entry={!mine} nonce={nonce} onAccess={updateAccess} />
    <div className={styles.lobbyGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><h2>Open tables</h2><div className={styles.switcher} aria-label="Table currency">
          <button aria-pressed={mode === 'real'} onClick={() => setMode('real')}>Real ZEC</button><button aria-pressed={mode === 'practice'} onClick={() => setMode('practice')}>Practice</button>
        </div></div>
        <label className={styles.gameFilter}>Game<select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">All games</option>{POKER_VARIANTS.map(v => <option key={v} value={v}>{VARIANT_NAMES[v]}</option>)}</select></label>
        <div className={styles.tableList}>
          {!loaded ? <p className={styles.empty}>Connecting to the poker room…</p> : visible.length === 0 ? <div className={styles.empty}><span className={styles.emptySuit}>♠</span><h3>The first seat is yours.</h3><p>Create a table and share its link with your friends.</p></div> : visible.map(table => <Link key={table.id} href={`/poker/table/${table.id}`} className={styles.lobbyRow}>
            <div><strong>{table.name}</strong><small className={styles.variantLabel}>{VARIANT_NAMES[table.variant]}</small><small>{stakesLabel(table.variant, table.bigBlind)} · {table.mode === 'real' ? 'ZEC' : 'play ZEC'}</small></div>
            <div className={styles.seatDots} aria-label={`${table.players} of 6 seats occupied`}>{Array.from({ length: 6 }, (_, i) => <i key={i} data-filled={i < table.players} />)}</div>
            <span>{table.players}/6</span><span className={styles.rowCta}>{table.myTable ? 'Return' : table.players === 6 ? 'Watch' : 'Open'} →</span>
          </Link>)}
        </div>
        <p className={styles.panelFoot}>Players stay seated between hands. Share a table link to invite someone.</p>
      </section>
      <form className={styles.panel} onSubmit={create}>
        <div className={styles.panelHeading}><h2>Start a table</h2><span className={styles.badge}>{mode === 'real' ? 'ZEC' : 'PRACTICE'}</span></div>
        <div className={styles.form}>
          <label>Poker game<select value={variant} onChange={e => setVariant(e.target.value as PokerVariant)}>{POKER_VARIANTS.map(v => <option key={v} value={v}>{VARIANT_NAMES[v]}</option>)}</select></label>
          <label>Your nickname<input required minLength={2} maxLength={24} value={name} readOnly placeholder="Set up your poker identity above" autoComplete="nickname" /></label>
          <label>Room name<input required minLength={2} maxLength={24} value={tableName} onChange={e => setTableName(e.target.value)} /></label>
          <label>{variant === 'stud' ? 'Betting limits' : 'Blinds'}<select value={blind} onChange={e => { const value = Number(e.target.value); setBlind(value); setBuyIn(formatZec(value * 100)) }}>
            {[10_000, 100_000, 1_000_000].map(value => <option key={value} value={value}>{stakesLabel(variant, value)} · {mode === 'real' ? 'ZEC' : 'play ZEC'}</option>)}
          </select></label>
          <label>Buy-in ({mode === 'real' ? 'ZEC' : 'play ZEC'})<input required inputMode="decimal" value={buyIn} onChange={e => setBuyIn(e.target.value)} /><small>{formatZec(blind * 20)}–{formatZec(blind * 100)} · 20–100 {variant === 'stud' ? 'small bets' : 'big blinds'}</small></label>
          <p className={styles.fine}>{variant === 'omaha' ? 'Four hole cards. Use exactly two with three board cards. Raises are capped by the pot.' : variant === 'stud' ? `Fixed limit, high hand wins. Ante ${formatZec(studAnte(blind))}, bring-in ${formatZec(studBringIn(blind))}. Four bets per street, including heads-up. An open pair on fourth street allows the bigger bet.` : 'Two hole cards. No-limit betting. New and returning players post a big blind after the opening hand.'}</p>
          {mode === 'real' && !enabled && loaded && <p className={styles.notice}>Real ZEC tables are awaiting activation.</p>}
          {wrongWallet && <p className={styles.notice}>{mode === 'real' ? 'Use “Fund with ZEC” above to set up and fund your real balance.' : 'Your current wallet is a real ZEC session. Practice tables require a separate demo session.'}</p>}
          <button className={styles.primary} disabled={!access?.setupComplete || !access?.entryVerified || !access?.playVerified || access?.restricted || busy || !loaded || !!mine || wrongWallet || (mode === 'real' && !enabled)}>{busy ? 'Reserving your seat…' : 'Create table & buy in →'}</button>
          <p className={styles.fine}>Your buy-in moves from your available balance to your table stack. Leave the table to return your remaining stack.</p>
        </div>
      </form>
    </div>
    <section className={styles.rules}><div><span className={styles.eyebrow}>THE FIRST DEAL</span><h2>Simple to join.<br />Plenty to play for.</h2></div>
      <ol><li><strong>Choose your game</strong><p>No-limit Hold’em, pot-limit Omaha, or fixed-limit seven-card stud. Each table keeps its game and stakes.</p></li><li><strong>Mark yourself ready</strong><p>The deal begins when at least two players are ready. You stay ready for the next hand.</p></li><li><strong>Take a little extra time</strong><p>30 seconds per decision, plus a 30-second time bank. Activate it before your timer expires. Earn 5 seconds every 10 hands dealt to you, up to 30 seconds.</p></li></ol>
    </section>
    <p className={styles.disclosure}>Server-dealt poker. The operator holds table funds and can see the deck. Poker hands currently have no public cryptographic shuffle proof. Shielded payments protect blockchain payment details; they do not hide your table stack or actions from other players.</p>
  </div>
}
