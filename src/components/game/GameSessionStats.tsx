import type { SessionData } from '@/hooks/useGameSession'

export function GameSessionStats({
  session,
  showNet = false,
}: {
  session: SessionData
  showNet?: boolean
}) {
  const net = session.totalWon - session.totalWagered

  if (showNet) {
    return (
      <div
        className="flex flex-wrap justify-center gap-6 border-t border-masque-gold/10 pt-3 text-sm text-venetian-gold/60"
        aria-label="Session statistics"
      >
        <span>Wagered: {session.totalWagered.toFixed(4)} ZEC</span>
        <span>Won: {session.totalWon.toFixed(4)} ZEC</span>
        <span className={net >= 0 ? 'text-green-400' : 'text-blood-ruby'}>
          Net: {net >= 0 ? '+' : ''}{net.toFixed(4)} ZEC
        </span>
      </div>
    )
  }

  return (
    <div className="mt-8 text-center" aria-label="Session statistics">
      <div className="inline-block rounded-lg border border-masque-gold/10 bg-midnight-black/30 px-6 py-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-venetian-gold/40">Session Stats</div>
        <div className="flex flex-wrap justify-center gap-6 text-sm">
          <span>
            <span className="text-venetian-gold/60">Wagered: </span>
            <span className="text-bone-white">{session.totalWagered.toFixed(4)} ZEC</span>
          </span>
          <span>
            <span className="text-venetian-gold/60">Won: </span>
            <span className="text-masque-gold">{session.totalWon.toFixed(4)} ZEC</span>
          </span>
        </div>
      </div>
    </div>
  )
}
