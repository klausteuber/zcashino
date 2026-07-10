import Link from 'next/link'

const frontierSignals = [
  { label: 'Energy', value: 'powers compute' },
  { label: 'Data', value: 'trains models' },
  { label: 'Trust', value: 'earns credit' },
  { label: 'ZEC', value: 'settles value' },
]

export default function HomeVeilstone() {
  return (
    <div className="min-h-screen">
      <section className="container mx-auto grid min-h-[calc(100vh-72px)] grid-cols-1 items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="mb-4 font-mono text-sm uppercase text-accent-primary">
            Play-ZEC Prototype
          </p>
          <h1 className="max-w-4xl font-display text-5xl font-bold leading-tight text-accent-secondary md:text-7xl">
            Veilstone
          </h1>
          <p className="mt-3 max-w-2xl font-display text-2xl text-accent-primary md:text-3xl">
            City-States of the Shielded Frontier
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
            A 4-player economic strategy game where AI city-states build public trust,
            hide shielded capital, and settle the frontier economy in Play-ZEC.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/veilstone/lobby"
              className="rounded-lg bg-accent-primary px-6 py-3 font-bold text-bg-base transition hover:bg-accent-secondary"
            >
              Enter Lobby
            </Link>
            <Link
              href="#rules"
              className="rounded-lg border border-accent-primary/45 px-6 py-3 font-bold text-accent-secondary transition hover:border-accent-primary hover:bg-accent-primary/10"
            >
              View Rules
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="grid aspect-square max-h-[620px] rounded-2xl border border-accent-primary/30 bg-bg-surface/70 p-4 shadow-2xl">
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 16 }).map((_, index) => {
                const active = [1, 4, 6, 9, 11, 14].includes(index)
                return (
                  <div
                    key={index}
                    className={[
                      'rounded-lg border p-3 transition',
                      active
                        ? 'border-accent-primary/55 bg-accent-primary/10'
                        : 'border-text-muted/20 bg-bg-elevated/60',
                    ].join(' ')}
                  >
                    <div className="h-full rounded-md border border-text-muted/15 bg-bg-base-alt/40" />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {frontierSignals.map((signal) => (
              <div key={signal.label} className="rounded-lg border border-accent-primary/20 bg-bg-surface/80 p-3">
                <div className="font-display text-lg text-accent-primary">{signal.label}</div>
                <div className="text-sm text-text-secondary">{signal.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="rules" className="border-y border-accent-primary/20 bg-bg-surface/55">
        <div className="container mx-auto grid gap-5 px-4 py-12 md:grid-cols-3">
          <div>
            <h2 className="font-display text-3xl text-accent-secondary">MVP-Zero Loop</h2>
            <p className="mt-3 text-text-secondary">
              Create a Play-ZEC table, seat four Houses, choose public versus shielded capital,
              advance through epochs, then settle final net worth.
            </p>
          </div>
          <div className="rounded-lg border border-accent-primary/20 bg-bg-elevated/60 p-5">
            <h3 className="font-display text-xl text-accent-primary">Public Treasury</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Visible capital improves Trust, funds infrastructure, and signals strength.
            </p>
          </div>
          <div className="rounded-lg border border-accent-primary/20 bg-bg-elevated/60 p-5">
            <h3 className="font-display text-xl text-accent-primary">Shielded Vault</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Hidden capital enables sealed bids and surprise leverage with commitment hashes.
            </p>
          </div>
        </div>
      </section>

      <section id="frontier" className="container mx-auto px-4 py-12">
        <div className="grid gap-5 md:grid-cols-4">
          {['Forecast', 'Production', 'Market', 'Contracts'].map((phase) => (
            <div key={phase} className="rounded-lg border border-accent-primary/20 bg-bg-surface/65 p-5">
              <div className="font-display text-xl text-accent-secondary">{phase}</div>
              <div className="mt-2 text-sm text-text-secondary">
                {phase === 'Forecast' && 'Read public pressure bands and scout with Data.'}
                {phase === 'Production' && 'Generate Energy, Compute, Data, Materials, and Talent.'}
                {phase === 'Market' && 'Place public orders and reveal market intent.'}
                {phase === 'Contracts' && 'Commit public or shielded stakes into model pots.'}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
