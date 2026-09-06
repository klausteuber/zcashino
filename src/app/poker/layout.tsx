import { PlayerPriceProvider } from '@/components/prices/PlayerPrice'
export default function PokerLayout({ children }: { children: React.ReactNode }) {
  return <PlayerPriceProvider>{children}</PlayerPriceProvider>
}
