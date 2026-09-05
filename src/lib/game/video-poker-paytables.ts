// Browser-safe paytables and labels shared by the UI and server game engine.
import type { VideoPokerVariant, JacksOrBetterHandRank, DeucesWildHandRank } from '@/types'

// Jacks or Better 9/6 Full Pay (~0.46% house edge)
// Maps hand rank → [1-coin, 2-coin, 3-coin, 4-coin, 5-coin] multipliers
const JOB_9_6: Record<JacksOrBetterHandRank, number[]> = {
  royal_flush:      [250, 500, 750, 1000, 4000],
  straight_flush:   [50, 100, 150, 200, 250],
  four_of_a_kind:   [25, 50, 75, 100, 125],
  full_house:       [9, 18, 27, 36, 45],
  flush:            [6, 12, 18, 24, 30],
  straight:         [4, 8, 12, 16, 20],
  three_of_a_kind:  [3, 6, 9, 12, 15],
  two_pair:         [2, 4, 6, 8, 10],
  jacks_or_better:  [1, 2, 3, 4, 5],
  nothing:          [0, 0, 0, 0, 0],
}

// Jacks or Better 8/5 (~2.7% house edge)
const JOB_8_5: Record<JacksOrBetterHandRank, number[]> = {
  royal_flush:      [250, 500, 750, 1000, 4000],
  straight_flush:   [50, 100, 150, 200, 250],
  four_of_a_kind:   [25, 50, 75, 100, 125],
  full_house:       [8, 16, 24, 32, 40],
  flush:            [5, 10, 15, 20, 25],
  straight:         [4, 8, 12, 16, 20],
  three_of_a_kind:  [3, 6, 9, 12, 15],
  two_pair:         [2, 4, 6, 8, 10],
  jacks_or_better:  [1, 2, 3, 4, 5],
  nothing:          [0, 0, 0, 0, 0],
}

// Jacks or Better 7/5 (~3.8% house edge)
const JOB_7_5: Record<JacksOrBetterHandRank, number[]> = {
  royal_flush:      [250, 500, 750, 1000, 4000],
  straight_flush:   [50, 100, 150, 200, 250],
  four_of_a_kind:   [25, 50, 75, 100, 125],
  full_house:       [7, 14, 21, 28, 35],
  flush:            [5, 10, 15, 20, 25],
  straight:         [4, 8, 12, 16, 20],
  three_of_a_kind:  [3, 6, 9, 12, 15],
  two_pair:         [2, 4, 6, 8, 10],
  jacks_or_better:  [1, 2, 3, 4, 5],
  nothing:          [0, 0, 0, 0, 0],
}

// Lookup for JoB paytable variants by key
const JOB_PAYTABLES: Record<string, Record<JacksOrBetterHandRank, number[]>> = {
  '9/6': JOB_9_6,
  '8/5': JOB_8_5,
  '7/5': JOB_7_5,
}

// Deuces Wild Full Pay (~0.76% house edge)
const DEUCES_WILD_PAYTABLE: Record<DeucesWildHandRank, number[]> = {
  natural_royal_flush: [250, 500, 750, 1000, 4000],
  four_deuces:         [200, 400, 600, 800, 1000],
  wild_royal_flush:    [25, 50, 75, 100, 125],
  five_of_a_kind:      [15, 30, 45, 60, 75],
  straight_flush:      [9, 18, 27, 36, 45],
  four_of_a_kind:      [5, 10, 15, 20, 25],
  full_house:          [3, 6, 9, 12, 15],
  flush:               [2, 4, 6, 8, 10],
  straight:            [2, 4, 6, 8, 10],
  three_of_a_kind:     [1, 2, 3, 4, 5],
  nothing:             [0, 0, 0, 0, 0],
}

export function getPaytable(variant: VideoPokerVariant, paytableKey?: string): Record<string, number[]> {
  if (variant === 'jacks_or_better') {
    return (paytableKey && JOB_PAYTABLES[paytableKey]) || JOB_9_6
  }
  return DEUCES_WILD_PAYTABLE
}

/**
 * Get hand rank display names for paytable
 */
export function getHandRankDisplayNames(variant: VideoPokerVariant): { rank: string; display: string }[] {
  if (variant === 'jacks_or_better') {
    return [
      { rank: 'royal_flush', display: 'Royal Flush' },
      { rank: 'straight_flush', display: 'Straight Flush' },
      { rank: 'four_of_a_kind', display: 'Four of a Kind' },
      { rank: 'full_house', display: 'Full House' },
      { rank: 'flush', display: 'Flush' },
      { rank: 'straight', display: 'Straight' },
      { rank: 'three_of_a_kind', display: 'Three of a Kind' },
      { rank: 'two_pair', display: 'Two Pair' },
      { rank: 'jacks_or_better', display: 'Jacks or Better' },
    ]
  }

  return [
    { rank: 'natural_royal_flush', display: 'Natural Royal Flush' },
    { rank: 'four_deuces', display: 'Four Deuces' },
    { rank: 'wild_royal_flush', display: 'Wild Royal Flush' },
    { rank: 'five_of_a_kind', display: 'Five of a Kind' },
    { rank: 'straight_flush', display: 'Straight Flush' },
    { rank: 'four_of_a_kind', display: 'Four of a Kind' },
    { rank: 'full_house', display: 'Full House' },
    { rank: 'flush', display: 'Flush' },
    { rank: 'straight', display: 'Straight' },
    { rank: 'three_of_a_kind', display: 'Three of a Kind' },
  ]
}
