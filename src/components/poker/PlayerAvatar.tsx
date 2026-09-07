import { POKER_AVATARS, resolveAvatar } from '@/lib/poker/avatars'
import styles from './poker.module.css'

export default function PlayerAvatar({ avatar, name }: { avatar?: string | null; name: string }) {
  const item = POKER_AVATARS[resolveAvatar(avatar, name)]
  return <span className={styles.playerAvatar} style={{ backgroundColor: item.color }} role="img" aria-label={`${name} — ${item.label} avatar`}>{item.symbol}</span>
}
