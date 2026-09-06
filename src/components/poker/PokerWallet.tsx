'use client'
import { useState } from 'react'
import type { UseGameSessionReturn } from '@/hooks/useGameSession'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'
import { WithdrawalModal } from '@/components/wallet/WithdrawalModal'
import { formatZec } from '@/lib/poker/types'
import styles from './poker.module.css'

export default function PokerWallet({ game }: { game: UseGameSessionReturn }) {
  const [withdraw, setWithdraw] = useState(false)
  const { session } = game
  return <>
    <div className={styles.wallet}>
      <div><span className={styles.eyebrow}>{session?.isDemo ? 'Practice balance' : 'Available balance'}</span><strong>{formatZec(Math.round((session?.balance ?? 0) * 100_000_000))} <small>{session?.isDemo ? 'play ZEC' : 'ZEC'}</small></strong></div>
      <button className={styles.primary} onClick={game.handleSwitchToReal}>{session?.isDemo ? 'Fund with ZEC' : 'Deposit'}</button>
      {!session?.isDemo && <button className={styles.secondary} onClick={() => setWithdraw(true)}>Withdraw</button>}
    </div>
    <OnboardingModal isOpen={game.showOnboarding} onClose={() => game.setShowOnboarding(false)}
      onDemoSelect={game.handleDemoSelect} onDepositComplete={game.handleDepositComplete}
      sessionId={session?.id ?? null} depositAddress={game.depositAddress} transparentAddress={session?.transparentAddress}
      onCreateRealSession={game.handleCreateRealSession} onSetWithdrawalAddress={game.handleSetWithdrawalAddress}
      recovery={session?.recovery} onCreateRecoveryKey={game.handleCreateRecoveryKey} onRegenerateRecoveryKey={game.handleRegenerateRecoveryKey}
      onRestoreSession={game.handleRestoreSession} restoreNotice={game.restoreNotice}
      initialStep={game.onboardingMode === 'restore' ? 'restore' : game.onboardingMode === 'deposit' ? 'deposit' : 'welcome'} />
    <WithdrawalModal isOpen={withdraw} onClose={() => setWithdraw(false)} sessionId={session?.id ?? null}
      balance={session?.balance ?? 0} withdrawalAddress={session?.withdrawalAddress ?? null} isDemo={!!session?.isDemo}
      onBalanceUpdate={balance => game.setSession(s => s ? { ...s, balance } : s)}
      onWithdrawalAddressSet={withdrawalAddress => game.setSession(s => s ? { ...s, withdrawalAddress } : s)} />
  </>
}
