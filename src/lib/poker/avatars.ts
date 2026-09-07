export const AVATAR_IDS = ['fox', 'wolf', 'owl', 'panda', 'tiger', 'lion', 'frog', 'octopus'] as const
export type PokerAvatarId = typeof AVATAR_IDS[number]
export const POKER_AVATARS: Record<PokerAvatarId, { label: string; symbol: string; color: string }> = {
  fox: { label: 'Fox', symbol: '🦊', color: '#9a4d25' },
  wolf: { label: 'Wolf', symbol: '🐺', color: '#455d79' },
  owl: { label: 'Owl', symbol: '🦉', color: '#746130' },
  panda: { label: 'Panda', symbol: '🐼', color: '#41685b' },
  tiger: { label: 'Tiger', symbol: '🐯', color: '#916621' },
  lion: { label: 'Lion', symbol: '🦁', color: '#895238' },
  frog: { label: 'Frog', symbol: '🐸', color: '#396848' },
  octopus: { label: 'Octopus', symbol: '🐙', color: '#774967' },
}
export function resolveAvatar(value: unknown, identityId = ''): PokerAvatarId {
  if (typeof value === 'string' && AVATAR_IDS.includes(value as PokerAvatarId)) return value as PokerAvatarId
  let hash = 0
  for (const char of identityId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return AVATAR_IDS[hash % AVATAR_IDS.length]
}
