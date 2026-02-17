'use client'

import { useState, useEffect, useCallback } from 'react'

interface ZecPriceState {
  zecUsd: number | null
  updatedAt: string | null
  loading: boolean
  error: string | null
}

const POLL_INTERVAL_MS = 60_000 // 60 seconds

export function useZecPrice() {
  const [state, setState] = useState<ZecPriceState>({
    zecUsd: null,
    updatedAt: null,
    loading: true,
    error: null,
  })

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/price', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) return // Not authenticated yet
        throw new Error('Failed to fetch price')
      }
      const data = await res.json()
      setState({
        zecUsd: data.zecUsd,
        updatedAt: data.updatedAt,
        loading: false,
        error: null,
      })
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Price unavailable',
      }))
    }
  }, [])

  useEffect(() => {
    fetchPrice()
    const intervalId = setInterval(fetchPrice, POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [fetchPrice])

  const formatZecWithUsd = useCallback(
    (zecAmount: number): string => {
      const zecStr = `${zecAmount.toFixed(4)} ZEC`
      if (state.zecUsd === null) return zecStr
      const usdValue = zecAmount * state.zecUsd
      return `${zecStr} (~$${usdValue.toFixed(2)})`
    },
    [state.zecUsd]
  )

  return {
    ...state,
    formatZecWithUsd,
  }
}
