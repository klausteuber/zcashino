import { sendTelegramMessage } from '@/lib/notifications/telegram'

function truncateMiddle(value: string | null | undefined, visible = 10): string {
  if (!value) return 'n/a'
  if (value.length <= visible * 2 + 3) return value
  return `${value.slice(0, visible)}...${value.slice(-visible)}`
}

function formatZec(amount: number): string {
  return `${amount.toFixed(8).replace(/\.?0+$/, '')} ZEC`
}

function getAdminPlayerUrl(sessionId: string): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '')
  if (!baseUrl) return null
  return `${baseUrl}/admin/players/${encodeURIComponent(sessionId)}`
}

export async function sendPlayerSessionStartedAlert(input: {
  sessionId: string
  walletAddress: string
  isDemo: boolean
  depositAddress?: string | null
  depositAddressType?: string | null
}): Promise<void> {
  const adminUrl = getAdminPlayerUrl(input.sessionId)
  const lines = [
    `[PLAYER SESSION] New ${input.isDemo ? 'demo' : 'real'} session`,
    `Session: ${truncateMiddle(input.sessionId, 8)}`,
    `Wallet: ${truncateMiddle(input.walletAddress, 12)}`,
  ]

  if (!input.isDemo && input.depositAddress) {
    lines.push(
      `Deposit address: ${truncateMiddle(input.depositAddress, 12)} (${input.depositAddressType ?? 'unknown'})`
    )
  }

  if (adminUrl) {
    lines.push(adminUrl)
  }

  await sendTelegramMessage(lines.join('\n'))
}

export async function sendPlayerDepositAlert(input: {
  sessionId: string
  amount: number
  txHash: string
  confirmations: number
  address: string
  isAuthDeposit: boolean
  credited: boolean
}): Promise<void> {
  const adminUrl = getAdminPlayerUrl(input.sessionId)
  const lines = [
    '[PLAYER DEPOSIT] Confirmed deposit',
    `Amount: ${formatZec(input.amount)}`,
    `Session: ${truncateMiddle(input.sessionId, 8)}`,
    `Tx: ${truncateMiddle(input.txHash, 12)}`,
    `Confirmations: ${input.confirmations}`,
    `Credited: ${input.credited ? 'yes' : 'no'}`,
    `Authenticated: ${input.isAuthDeposit ? 'yes' : 'no'}`,
    `Address: ${truncateMiddle(input.address, 12)}`,
  ]

  if (adminUrl) {
    lines.push(adminUrl)
  }

  await sendTelegramMessage(lines.join('\n'))
}
