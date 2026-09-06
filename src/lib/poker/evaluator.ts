const LABELS = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']

/** Lexicographic ranking encoded in base 15; aces may also play low in a wheel. */
function rankFive(cards: number[]): number {
  const ranks = cards.map(c => Math.floor(c / 4) + 2).sort((a, b) => b - a)
  const groups = [...new Set(ranks)].map(rank => ({ rank, count: ranks.filter(r => r === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
  const flush = cards.every(c => c % 4 === cards[0] % 4)
  const unique = [...new Set(ranks)]
  const straight = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0]
    : unique.join(',') === '14,5,4,3,2' ? 5 : 0
  let category = 0
  let kickers = ranks
  if (straight && flush) { category = 8; kickers = [straight] }
  else if (groups[0].count === 4) { category = 7; kickers = groups.map(g => g.rank) }
  else if (groups[0].count === 3 && groups[1].count === 2) { category = 6; kickers = groups.map(g => g.rank) }
  else if (flush) { category = 5 }
  else if (straight) { category = 4; kickers = [straight] }
  else if (groups[0].count === 3) { category = 3; kickers = groups.map(g => g.rank) }
  else if (groups[0].count === 2 && groups[1].count === 2) { category = 2; kickers = groups.map(g => g.rank) }
  else if (groups[0].count === 2) { category = 1; kickers = groups.map(g => g.rank) }
  let score = category
  for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] ?? 0)
  return score
}
export function evaluateHand(cards: number[]): { score: number; label: string } {
  if (cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length || cards.some(c => !Number.isInteger(c) || c < 0 || c > 51)) {
    throw new Error('Invalid poker hand')
  }
  let best = -1
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++)
            best = Math.max(best, rankFive([cards[a], cards[b], cards[c], cards[d], cards[e]]))
  return { score: best, label: LABELS[Math.floor(best / 15 ** 5)] }
}

/** Omaha must use exactly two hole cards and exactly three community cards. */
export function evaluateOmaha(hole: number[], board: number[]) {
  const cards = [...hole, ...board]
  if (hole.length !== 4 || board.length !== 5 || new Set(cards).size !== 9 || cards.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error('Invalid Omaha hand')
  let best = -1
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++)
    for (let c = 0; c < 3; c++) for (let d = c + 1; d < 4; d++) for (let e = d + 1; e < 5; e++)
      best = Math.max(best, rankFive([hole[a], hole[b], board[c], board[d], board[e]]))
  return { score: best, label: LABELS[Math.floor(best / 15 ** 5)] }
}

/** Rank only the 1–4 exposed stud cards; suits never decide the high-board opener. */
export function exposedStudScore(cards: number[]) {
  const ranks = cards.slice(2, 6).map(c => Math.floor(c / 4) + 2)
  const groups = [...new Set(ranks)].map(rank => ({ rank, count: ranks.filter(r => r === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
  const category = groups[0].count === 4 ? 7 : groups[0].count === 3 ? 3 : groups[0].count === 2 ? (groups[1]?.count === 2 ? 2 : 1) : 0
  let score = category
  for (let i = 0; i < 4; i++) score = score * 15 + (groups[i]?.rank ?? 0)
  return score
}
