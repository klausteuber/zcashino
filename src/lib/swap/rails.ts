export type SwapRailId = 'sol' | 'btc' | 'eth' | 'usdt_eth'

export interface SupportedSwapRail {
  id: SwapRailId
  label: string
  symbol: string
  blockchain: string
  blockchainLabel: string
  assetId: string
  decimals: number
  refundPlaceholder: string
  refundHint: string
}

export const ZEC_DESTINATION_ASSET_ID = 'nep141:zec.omft.near'

export const SUPPORTED_SWAP_RAILS: readonly SupportedSwapRail[] = [
  {
    id: 'sol',
    label: 'SOL',
    symbol: 'SOL',
    blockchain: 'sol',
    blockchainLabel: 'Solana',
    assetId: 'nep141:sol.omft.near',
    decimals: 9,
    refundPlaceholder: 'Your Solana wallet address',
    refundHint: 'Use a self-custody Solana address you control in case the route refunds.',
  },
  {
    id: 'btc',
    label: 'BTC',
    symbol: 'BTC',
    blockchain: 'btc',
    blockchainLabel: 'Bitcoin',
    assetId: 'nep141:btc.omft.near',
    decimals: 8,
    refundPlaceholder: 'Your Bitcoin wallet address',
    refundHint: 'Use a Bitcoin address you control. Exchange deposit addresses are risky for refunds.',
  },
  {
    id: 'eth',
    label: 'ETH',
    symbol: 'ETH',
    blockchain: 'eth',
    blockchainLabel: 'Ethereum',
    assetId: 'nep141:eth.omft.near',
    decimals: 18,
    refundPlaceholder: '0xYourEthereumWallet',
    refundHint: 'Use an Ethereum address you control. You will fund this quote on Ethereum mainnet.',
  },
  {
    id: 'usdt_eth',
    label: 'USDT',
    symbol: 'USDT',
    blockchain: 'eth',
    blockchainLabel: 'Ethereum',
    assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
    decimals: 6,
    refundPlaceholder: '0xYourEthereumWallet',
    refundHint: 'Use an Ethereum address you control. This route expects ERC-20 USDT on Ethereum mainnet.',
  },
] as const

export function getSupportedSwapRail(id: string): SupportedSwapRail | null {
  return SUPPORTED_SWAP_RAILS.find((rail) => rail.id === id) ?? null
}
