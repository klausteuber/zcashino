export default function Loading() {
  return (
    <div className="min-h-screen felt-texture flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-masque-gold/30 border-t-masque-gold rounded-full animate-spin" />
        <div className="text-venetian-gold/50 font-display">Loading...</div>
      </div>
    </div>
  )
}
