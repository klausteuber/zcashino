'use client'

import { useState } from 'react'

export default function ConnectWalletButton() {
  const [walletConnected, setWalletConnected] = useState(false)

  return (
    <button
      onClick={() => setWalletConnected(!walletConnected)}
      className="btn-gold-shimmer text-midnight-black px-4 py-2 rounded-lg font-semibold"
    >
      {walletConnected ? 'Wallet Connected' : 'Connect Wallet'}
    </button>
  )
}
