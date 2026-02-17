'use client'

import { createContext, useContext } from 'react'
import { getBrandConfig } from '@/lib/brand/config'
import { ResolvedBrand } from '@/lib/brand/types'

const BrandContext = createContext<ResolvedBrand | null>(null)

export function BrandProvider({
  brand,
  children,
}: {
  brand: ResolvedBrand
  children: React.ReactNode
}) {
  return (
    <BrandContext.Provider value={brand}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrandContext(): ResolvedBrand {
  const brand = useContext(BrandContext)
  if (brand) return brand
  return {
    id: 'cypher',
    host: null,
    source: 'fallback',
    config: getBrandConfig('cypher'),
  }
}
