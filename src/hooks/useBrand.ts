'use client'

import { useBrandContext } from '@/components/brand/BrandProvider'

export function useBrand() {
  return useBrandContext()
}
