/**
 * Zcash Wallet Integration
 *
 * This module provides wallet functionality for CypherJester:
 * - Address validation and parsing
 * - Deposit address generation (via HD wallet derivation)
 * - Balance checking (via RPC)
 * - Transaction creation and signing
 *
 * Security Note: Private keys and seeds should NEVER be exposed to the client.
 * All signing operations happen server-side.
 */

import type { ZcashNetwork, AddressType, ZcashAddress } from '@/types'

// Network configuration
export const NETWORK_CONFIG = {
  mainnet: {
    name: 'mainnet',
    rpcUrl: process.env.ZCASH_RPC_URL || 'http://127.0.0.1:8232',
    transparentPrefix: 't1',
    saplingPrefix: 'zs',
    unifiedPrefix: 'u1',
    explorerUrl: 'https://zcashblockexplorer.com',
  },
  testnet: {
    name: 'testnet',
    rpcUrl: process.env.ZCASH_TESTNET_RPC_URL || 'http://127.0.0.1:18232',
    transparentPrefix: 'tm',
    saplingPrefix: 'ztestsapling',
    unifiedPrefix: 'utest',
    explorerUrl: 'https://testnet.zcashblockexplorer.com',
  },
} as const

// Default to testnet for development
export const DEFAULT_NETWORK: ZcashNetwork =
  (process.env.ZCASH_NETWORK as ZcashNetwork) || 'testnet'

// Minimum deposit/withdrawal amounts (in ZEC)
export const MIN_DEPOSIT = 0.001
export const MIN_WITHDRAWAL = 0.01
export const WITHDRAWAL_FEE = 0.0001  // Network fee + margin

// Confirmations required for deposits
export const CONFIRMATIONS_REQUIRED = 3

/**
 * Validate a Zcash address format
 */
export function validateAddress(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): { valid: boolean; type?: AddressType; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address is required' }
  }

  const trimmed = address.trim()
  const config = NETWORK_CONFIG[network]

  // Check transparent address (t-address)
  if (trimmed.startsWith(config.transparentPrefix)) {
    // t1/tm addresses are 35 characters (t1 + 33 chars)
    if (trimmed.length === 35) {
      return { valid: true, type: 'transparent' }
    }
    return { valid: false, error: 'Invalid transparent address length' }
  }

  // Check sapling address (z-address)
  if (trimmed.startsWith(config.saplingPrefix)) {
    // Sapling addresses are 78 characters for mainnet
    if (trimmed.length >= 70 && trimmed.length <= 90) {
      return { valid: true, type: 'sapling' }
    }
    return { valid: false, error: 'Invalid sapling address length' }
  }

  // Check unified address (u-address)
  if (trimmed.startsWith(config.unifiedPrefix)) {
    // Unified addresses vary in length but are typically > 100 chars
    if (trimmed.length >= 50) {
      return { valid: true, type: 'unified' }
    }
    return { valid: false, error: 'Invalid unified address length' }
  }

  return {
    valid: false,
    error: `Address must start with ${config.transparentPrefix}, ${config.saplingPrefix}, or ${config.unifiedPrefix} for ${network}`,
  }
}

/**
 * Parse a Zcash address and return its components
 */
export function parseAddress(
  address: string,
  network: ZcashNetwork = DEFAULT_NETWORK
): ZcashAddress | null {
  const validation = validateAddress(address, network)

  if (!validation.valid || !validation.type) {
    return null
  }

  return {
    type: validation.type,
    address: address.trim(),
    network,
  }
}

/**
 * Check if address is shielded (z or u address)
 */
export function isShieldedAddress(address: string, network: ZcashNetwork = DEFAULT_NETWORK): boolean {
  const parsed = parseAddress(address, network)
  return parsed !== null && (parsed.type === 'sapling' || parsed.type === 'unified')
}

/**
 * Format ZEC amount for display
 */
export function formatZec(amount: number, decimals: number = 8): string {
  return amount.toFixed(decimals).replace(/\.?0+$/, '')
}

/**
 * Parse ZEC amount from string
 */
export function parseZec(value: string): number | null {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0) {
    return null
  }
  // Round to 8 decimal places (ZEC precision)
  return Math.round(parsed * 1e8) / 1e8
}

/**
 * Convert ZEC to zatoshi (smallest unit)
 */
export function zecToZatoshi(zec: number): bigint {
  return BigInt(Math.round(zec * 1e8))
}

/**
 * Convert zatoshi to ZEC
 */
export function zatoshiToZec(zatoshi: bigint): number {
  return Number(zatoshi) / 1e8
}

// Re-export sub-modules
export * from './addresses'
export * from './rpc'
