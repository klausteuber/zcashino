import type { Metadata } from 'next'
import Link from 'next/link'
import { FAQJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { getBrandUrlForPath, getCanonicalUrlForPath } from '@/lib/brand/config'
import { getServerBrand } from '@/lib/brand/server'
import SiteHeader from '@/components/layout/SiteHeader'

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerBrand()
  const brandTitle = brand.id === '21z' ? '21z' : 'CypherJester'
  const brandUrl = getBrandUrlForPath(brand.id, '/get-zec')
  const canonicalUrl = getCanonicalUrlForPath(brand.id, '/get-zec')

  return {
    title: 'Get Zcash (ZEC)',
    description:
      `How to get Zcash to play at ${brandTitle}. Swap BTC, ETH, SOL, or USDT for ZEC — or buy from an exchange.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Get ZEC to Play | ${brandTitle}`,
      description:
        'Three ways to fund your account. Swap crypto, buy from an exchange, or use a wallet you already have.',
      url: brandUrl,
    },
  }
}

const faqItems = [
  {
    question: 'What is the minimum deposit?',
    answer:
      'The minimum deposit is 0.001 ZEC. There is no maximum.',
  },
  {
    question: 'How long do deposits take?',
    answer:
      'Deposits require 3 block confirmations on the Zcash network. This typically takes 10-20 minutes.',
  },
  {
    question: 'Can I use Bitcoin or Ethereum to play?',
    answer:
      'Not directly, but you can swap BTC, ETH, SOL, or USDT for ZEC using the built-in swap widget when you deposit. The swap takes a few minutes and requires no account.',
  },
  {
    question: 'Is there a fee for swapping?',
    answer:
      'The swap service charges a small fee (typically under 1%) which is included in the exchange rate. There are no additional fees from us.',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No. Sessions are anonymous — no email, no password, no KYC. You receive a session token that you can bookmark to return later.',
  },
  {
    question: 'What wallet should I use?',
    answer:
      'We recommend Zashi (by Electric Coin Company) for mobile and desktop, or Ywallet for a feature-rich alternative. Both support shielded transactions.',
  },
]

export default async function GetZecPage() {
  const brand = await getServerBrand()
  const homeUrl = getBrandUrlForPath(brand.id, '/')
  const pageUrl = getBrandUrlForPath(brand.id, '/get-zec')

  return (
    <>
      <FAQJsonLd questions={faqItems} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: homeUrl },
          { name: 'Get ZEC', url: pageUrl },
        ]}
      />
    <main className="min-h-screen felt-texture">
      <SiteHeader />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-display font-bold text-bone-white mb-4">Get Zcash to Play</h1>
          <p className="text-lg text-venetian-gold/70">
            Three ways to fund your account &mdash; no account or KYC required.
          </p>
        </div>

        {/* Three Paths */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Path 1: Swap */}
            <div className="p-6 bg-midnight-black/60 rounded-xl border border-masque-gold/30 flex flex-col">
              <div className="text-3xl mb-3">&#x21C4;</div>
              <h2 className="text-lg font-display font-bold text-bone-white mb-2">Swap Crypto</h2>
              <p className="text-sm text-venetian-gold/70 mb-4 flex-1">
                Already hold BTC, ETH, SOL, or USDT? Swap to ZEC directly from the deposit screen.
                No account needed &mdash; the swap happens in minutes.
              </p>
              <Link
                href="/blackjack"
                className="btn-gold-shimmer px-4 py-2 text-midnight-black text-sm font-semibold rounded-lg text-center"
              >
                Play &amp; Swap →
              </Link>
            </div>

            {/* Path 2: Exchange */}
            <div className="p-6 bg-midnight-black/60 rounded-xl border border-masque-gold/20 flex flex-col">
              <div className="text-3xl mb-3">&#x1F3E6;</div>
              <h2 className="text-lg font-display font-bold text-bone-white mb-2">Buy from an Exchange</h2>
              <p className="text-sm text-venetian-gold/70 mb-4 flex-1">
                Purchase ZEC on any major crypto exchange. Most require identity verification.
                Once purchased, withdraw ZEC to your personal wallet.
              </p>
              <div className="text-xs text-venetian-gold/50">
                <p className="font-semibold text-venetian-gold/70 mb-1">Steps:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Sign up on a crypto exchange</li>
                  <li>Buy ZEC with fiat or another crypto</li>
                  <li>Withdraw to your Zcash wallet</li>
                  <li>Deposit to {brand.config.name}</li>
                </ol>
              </div>
            </div>

            {/* Path 3: Wallet */}
            <div className="p-6 bg-midnight-black/60 rounded-xl border border-masque-gold/20 flex flex-col">
              <div className="text-3xl mb-3">&#x1F4B0;</div>
              <h2 className="text-lg font-display font-bold text-bone-white mb-2">Get a ZEC Wallet</h2>
              <p className="text-sm text-venetian-gold/70 mb-4 flex-1">
                A Zcash wallet lets you send, receive, and hold ZEC with full privacy.
                We recommend these two:
              </p>
              <div className="space-y-3">
                <a
                  href="https://electriccoin.co/zashi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-masque-gold hover:text-venetian-gold transition-colors"
                >
                  <span className="font-semibold">Zashi</span>
                  <span className="text-venetian-gold/50">&mdash; by Electric Coin Co.</span>
                </a>
                <a
                  href="https://ywallet.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-masque-gold hover:text-venetian-gold transition-colors"
                >
                  <span className="font-semibold">Ywallet</span>
                  <span className="text-venetian-gold/50">&mdash; feature-rich, multi-platform</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Solana note */}
        <section className="mb-12 p-4 bg-midnight-black/60 rounded-xl border border-masque-gold/20">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">&#9889;</span>
            <div>
              <h3 className="text-sm font-semibold text-bone-white mb-1">ZEC on Solana</h3>
              <p className="text-sm text-venetian-gold/70">
                Wrapped ZEC (wZEC/zenZEC) is available on Solana via bridges like Zolana and Zenrock.
                Direct bridge deposits are coming soon &mdash; for now, you can swap SOL to native ZEC using the in-app swap.
              </p>
            </div>
          </div>
        </section>

        {/* Step-by-step deposit guide */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-6">How to Deposit</h2>
          <div className="space-y-4">
            <Step number={1} title="Get ZEC" description="Use any method above — swap crypto, buy from an exchange, or receive from a friend." />
            <Step number={2} title="Go to a game" description="Visit Blackjack or Video Poker. You can try demo mode first with 10 ZEC play money." />
            <Step number={3} title='Click "Deposit Real ZEC"' description="This creates a private session and generates your unique deposit address." />
            <Step number={4} title="Copy the deposit address" description="You'll see a unified address (starts with u1...) and a QR code. Copy it to your wallet." />
            <Step number={5} title="Send ZEC from your wallet" description="Paste the address in your wallet and send any amount (minimum 0.001 ZEC)." />
            <Step number={6} title="Wait for confirmations" description="3 block confirmations are required. This takes about 10-20 minutes." />
            <Step number={7} title="Play" description="Your balance is credited automatically. You're ready to go." />
          </div>
        </section>

        {/* Why Zcash CTA */}
        <section className="mb-12 text-center p-8 bg-jester-purple-dark/20 rounded-xl border border-masque-gold/20">
          <h2 className="text-xl font-display font-bold text-bone-white mb-3">Why Zcash?</h2>
          <p className="text-venetian-gold/70 mb-6">
            Curious why we built on Zcash instead of Bitcoin or Ethereum? Privacy matters.
          </p>
          <Link
            href="/why-zcash"
            className="px-6 py-3 border border-masque-gold/30 text-venetian-gold font-semibold rounded-lg hover:bg-masque-gold/10 transition-colors inline-block"
          >
            Learn Why Zcash →
          </Link>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-masque-gold mb-6">FAQ</h2>
          <div className="space-y-4">
            {faqItems.map((item) => (
              <FAQ key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-masque-gold/20 bg-midnight-black/30 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-venetian-gold/50">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/terms" className="hover:text-masque-gold transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-masque-gold transition-colors">Privacy</Link>
            <Link href="/responsible-gambling" className="hover:text-masque-gold transition-colors">Responsible Gambling</Link>
          </div>
          <p>{brand.config.name} &mdash; {brand.config.tagline}</p>
        </div>
      </footer>
    </main>
    </>
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
