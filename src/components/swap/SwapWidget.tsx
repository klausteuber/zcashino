'use client'

import { useState } from 'react'
import { CopyButton } from '@/components/ui/QRCode'
import { useBrand } from '@/hooks/useBrand'

const CHANGENOW_LINK_ID = process.env.NEXT_PUBLIC_CHANGENOW_LINK_ID ?? ''

const SWAP_COINS = [
  { id: 'btc', label: 'BTC' },
  { id: 'eth', label: 'ETH' },
  { id: 'sol', label: 'SOL' },
  { id: 'usdterc20', label: 'USDT' },
] as const

interface SwapWidgetProps {
  depositAddress: string
}

export function SwapWidget({ depositAddress }: SwapWidgetProps) {
  const brand = useBrand()
  const [selectedCoin, setSelectedCoin] = useState<string>('btc')

  const primaryColor = brand.config.themeColor.replace('#', '')
  const bgColor = brand.config.backgroundColor.replace('#', '')

  const iframeSrc = `https://changenow.io/embeds/exchange-widget/v2/widget.html?FAQ=false&amount=0.005&amountFiat=150&backgroundColor=${bgColor}&darkMode=true&from=${selectedCoin}&fromFiat=usd&horizontal=false&isFiat=false&lang=en-US&link_id=${CHANGENOW_LINK_ID}&locales=false&logo=false&primaryColor=${primaryColor}&to=zec&toTheMoon=false`

  return (
    <div className="space-y-4">
      {/* Coin quick-select */}
      <div>
        <p className="text-xs text-venetian-gold/50 mb-2">Swap from:</p>
        <div className="flex gap-2">
          {SWAP_COINS.map((coin) => (
            <button
              key={coin.id}
              onClick={() => setSelectedCoin(coin.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${
                selectedCoin === coin.id
                  ? 'bg-masque-gold/20 border-masque-gold text-masque-gold'
                  : 'bg-midnight-black/60 border-masque-gold/20 text-venetian-gold/60 hover:border-masque-gold/40 hover:text-venetian-gold'
              }`}
            >
              {coin.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy deposit address instruction */}
      <div className="p-3 bg-jester-purple-dark/20 rounded-lg border border-masque-gold/20">
        <p className="text-xs font-semibold text-masque-gold mb-2">
          Step 1: Copy your ZEC deposit address
        </p>
        <div className="flex items-center gap-2 p-2 bg-midnight-black/60 rounded-lg border border-masque-gold/10">
          <code className="flex-1 text-xs text-venetian-gold font-mono break-all leading-relaxed">
            {depositAddress}
          </code>
          <CopyButton text={depositAddress} />
        </div>
        <p className="text-xs text-venetian-gold/40 mt-2">
          Step 2: Paste it as the receiving address in the widget below
        </p>
      </div>

      {/* ChangeNOW iframe */}
      <div className="rounded-lg overflow-hidden border border-masque-gold/20">
        <iframe
          id="changenow-widget"
          src={iframeSrc}
          width="100%"
          height="356"
          frameBorder="0"
          allow="clipboard-read; clipboard-write"
          style={{ border: 'none', overflow: 'hidden' }}
          title="Swap crypto to ZEC"
        />
      </div>

      {/* Learn more link */}
      <a
        href="/get-zec"
        className="block text-center text-xs text-masque-gold hover:text-venetian-gold transition-colors"
      >
        More ways to get ZEC →
      </a>
    </div>
  )
}
