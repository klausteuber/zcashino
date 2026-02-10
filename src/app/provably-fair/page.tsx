import JesterLogo from '@/components/ui/JesterLogo'

export const metadata = {
  title: 'Provably Fair | CypherJester',
  description: 'Learn how CypherJester ensures every game outcome is verifiably fair using cryptographic commitments and the Zcash blockchain.',
}

export default function ProvablyFairPage() {
  return (
    <main className="min-h-screen felt-texture">
      {/* Header */}
      <header className="border-b border-masque-gold/20 bg-midnight-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-3">
            <JesterLogo size="md" className="text-jester-purple-light" />
            <span className="text-xl font-display font-bold tracking-tight">
              <span className="text-masque-gold">Cypher</span>
              <span className="text-bone-white">Jester</span>
            </span>
          </a>
          <nav className="flex items-center gap-6 text-sm">
            <a href="/blackjack" className="text-venetian-gold/70 hover:text-masque-gold transition-colors">Blackjack</a>
            <a href="/verify" className="text-venetian-gold/70 hover:text-masque-gold transition-colors">Verify a Game</a>
            <a href="/reserves" className="text-venetian-gold/70 hover:text-masque-gold transition-colors">Reserves</a>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-bone-white mb-4">Provably Fair Gaming</h1>
          <p className="text-lg text-venetian-gold/70">
            Every hand is determined by math you can verify &mdash; not trust you have to give.
          </p>
        </div>

        {/* How It Works */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-6">How It Works</h2>

          <div className="space-y-6">
            <Step
              number={1}
              title="We Commit First"
              description="Before you place your bet, the server generates a secret seed and publishes its SHA-256 hash. This hash is your receipt &mdash; it locks the server into a specific outcome before you act."
            />

            <Step
              number={2}
              title="You Add Randomness"
              description="A client seed is generated in your browser. You can customize it at any time. Combined with a nonce (game counter), your input ensures no one &mdash; including us &mdash; can predict the deck order."
            />

            <Step
              number={3}
              title="The Deck Is Shuffled Deterministically"
              description="The combined seed (server seed + client seed + nonce) is fed into a cryptographic hash function that produces a unique, deterministic shuffle order for the deck. Same inputs always produce the same deck."
            />

            <Step
              number={4}
              title="After the Game, We Reveal"
              description="Once the hand is complete, we reveal the server seed. You can now verify that it hashes to the committed value, and that the deck shuffle matches the expected output."
            />
          </div>
        </section>

        {/* Why This Is Fair */}
        <section className="mb-12 p-6 bg-midnight-black/60 rounded-xl border border-masque-gold/20">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">Why This Is Fair</h2>
          <ul className="space-y-3 text-venetian-gold/80">
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Pre-commitment</strong> &mdash; The server seed hash is locked before your bet. We cannot change the outcome retroactively.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Dual-source randomness</strong> &mdash; Both server and player contribute to the final seed, so neither party controls the outcome alone.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Deterministic output</strong> &mdash; Given the same inputs, anyone running the algorithm gets the exact same deck order. No hidden variables.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-masque-gold mt-0.5 shrink-0">&#10003;</span>
              <span><strong className="text-bone-white">Independent verification</strong> &mdash; You don't need to trust our software. The math is open and can be checked with any SHA-256 tool.</span>
            </li>
          </ul>
        </section>

        {/* The Zcash Advantage */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">Why Zcash?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">Player Privacy</h3>
              <p className="text-sm text-venetian-gold/70">
                Shielded transactions keep your deposits, withdrawals, and balances private. Nobody can track your gambling activity on-chain.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">House Transparency</h3>
              <p className="text-sm text-venetian-gold/70">
                Seed commitments are recorded on the Zcash blockchain, creating an immutable audit trail that proves the house played fair.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">No KYC Required</h3>
              <p className="text-sm text-venetian-gold/70">
                Play without handing over personal documents. Your identity is yours to keep.
              </p>
            </div>
            <div className="p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
              <h3 className="text-lg font-semibold text-bone-white mb-2">Proof of Reserves</h3>
              <p className="text-sm text-venetian-gold/70">
                Transparent deposit addresses let anyone verify the house holds enough funds to cover all player balances. <a href="/reserves" className="text-masque-gold hover:text-venetian-gold underline">View reserves</a>.
              </p>
            </div>
          </div>
        </section>

        {/* Technical Details */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-4">Technical Details</h2>
          <div className="p-6 bg-midnight-black/80 rounded-xl border border-masque-gold/20 font-mono text-sm space-y-4">
            <div>
              <div className="text-venetian-gold/50 mb-1">Server Seed Generation</div>
              <code className="text-masque-gold">crypto.randomBytes(32).toString(&apos;hex&apos;)</code>
            </div>
            <div>
              <div className="text-venetian-gold/50 mb-1">Commitment Hash</div>
              <code className="text-masque-gold">SHA-256(serverSeed)</code>
            </div>
            <div>
              <div className="text-venetian-gold/50 mb-1">Combined Seed</div>
              <code className="text-masque-gold">serverSeed:clientSeed:nonce</code>
            </div>
            <div>
              <div className="text-venetian-gold/50 mb-1">Deck Shuffle</div>
              <code className="text-masque-gold">Fisher-Yates shuffle seeded by HMAC-SHA256(combinedSeed)</code>
            </div>
            <div>
              <div className="text-venetian-gold/50 mb-1">Blockchain Commitment</div>
              <code className="text-masque-gold">Zcash shielded tx with hash in encrypted memo field</code>
            </div>
          </div>
        </section>

        {/* Verify CTA */}
        <section className="text-center p-8 bg-midnight-black/60 rounded-xl border border-masque-gold/20">
          <h2 className="text-2xl font-display font-bold text-bone-white mb-3">Verify Any Game</h2>
          <p className="text-venetian-gold/70 mb-6">
            Every completed game gives you the seeds and hash needed to independently verify the outcome.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/verify"
              className="btn-gold-shimmer px-6 py-3 text-midnight-black font-semibold rounded-lg inline-block"
            >
              Verify a Game
            </a>
            <a
              href="/blackjack"
              className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors inline-block"
            >
              Play Blackjack
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12 mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-6">FAQ</h2>
          <div className="space-y-4">
            <FAQ
              question="Can the house change the outcome after I bet?"
              answer="No. The server seed hash is committed before your bet. Changing the seed would produce a different hash, which wouldn't match the commitment. This is mathematically provable."
            />
            <FAQ
              question="What if the server generates a weak seed?"
              answer="Server seeds are generated using Node.js crypto.randomBytes (CSPRNG), producing 32 bytes of cryptographically secure randomness. Additionally, your client seed is mixed in, so even a hypothetically weak server seed cannot solely determine the outcome."
            />
            <FAQ
              question="Can I change my client seed?"
              answer="Yes. You can set a custom client seed before any game. This gives you direct influence over the randomness."
            />
            <FAQ
              question="What happens in demo mode?"
              answer="The provably fair system works identically in demo mode. The only difference is that blockchain commitments use a local mock instead of on-chain transactions. The cryptographic verification is real."
            />
            <FAQ
              question="Where can I see the source code?"
              answer="The shuffle algorithm and verification logic are deterministic and based on standard cryptographic primitives (SHA-256, HMAC, Fisher-Yates). You can verify outcomes using any SHA-256 tool."
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-masque-gold/20 bg-midnight-black/30 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-venetian-gold/50">
          <div className="flex justify-center gap-6 mb-4">
            <a href="/terms" className="hover:text-masque-gold transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-masque-gold transition-colors">Privacy</a>
            <a href="/responsible-gambling" className="hover:text-masque-gold transition-colors">Responsible Gambling</a>
          </div>
          <p>CypherJester &mdash; Play in Private. Verify in Public.</p>
        </div>
      </footer>
    </main>
  )
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-10 h-10 rounded-full bg-masque-gold/20 border border-masque-gold/40 flex items-center justify-center text-masque-gold font-bold font-display">
        {number}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-bone-white mb-1">{title}</h3>
        <p className="text-venetian-gold/70">{description}</p>
      </div>
    </div>
  )
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group p-4 bg-midnight-black/60 rounded-lg border border-masque-gold/20">
      <summary className="cursor-pointer text-bone-white font-medium flex items-center justify-between">
        {question}
        <span className="text-masque-gold group-open:rotate-45 transition-transform text-xl ml-2">+</span>
      </summary>
      <p className="mt-3 text-venetian-gold/70 text-sm">{answer}</p>
    </details>
  )
}
