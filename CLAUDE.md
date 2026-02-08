# Zcashino Project Guidelines

## Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 with custom @theme colors
- **Database:** SQLite with Prisma 7 (LibSQL adapter)
- **Testing:** Vitest 4 + React Testing Library

## Design System Colors
**Always use these - NEVER use zinc/amber/blue/gray:**
- `pepe-green`, `pepe-green-light`, `pepe-green-dark`
- `monaco-gold`, `champagne-gold`
- `rich-black`, `ivory-white`
- `velvet-purple`, `burgundy`

## Mistakes to Avoid

### [2025-02-04] React useEffect Timer/Interval Bug
**Problem:** Timer stuck, countdown never completes
**Root Cause:** Capturing local variables in setInterval closures creates stale closures on re-renders

```javascript
// ❌ BAD - stale closure captures countdown variable
let countdown = 2
setInterval(() => {
  countdown -= 1  // This captures stale value!
  setAutoBetCountdown(countdown)
}, 1000)

// ✅ GOOD - functional state update
setInterval(() => {
  setAutoBetCountdown(prev => {
    if (prev === null || prev <= 1) {
      clearInterval(intervalId)
      return null
    }
    return prev - 1
  })
}, 1000)
```

**Also required:**
1. Always add cleanup function to useEffect with timers
2. Clear old timers before creating new ones
3. Use refs for re-entry guards (`isAutoBettingRef.current`)

### [2025-02-04] Tailwind CSS v4 PostCSS Config
**Problem:** Massive blue SVG covering the page
**Root Cause:** Missing postcss.config.mjs for Tailwind v4
**Fix:** Create `postcss.config.mjs` with `@tailwindcss/postcss` plugin

## Code Patterns

### Auto-bet Feature Pattern
Location: `src/app/blackjack/page.tsx`

Key state:
```typescript
const [isAutoBetEnabled, setIsAutoBetEnabled] = useState<boolean>(true)
const [isAutoBetting, setIsAutoBetting] = useState<boolean>(false)
const [autoBetCountdown, setAutoBetCountdown] = useState<number | null>(null)
const isAutoBettingRef = useRef<boolean>(false)  // Re-entry guard
```

localStorage persistence for user preference: `zcashino_auto_bet`

### Sound Toggle Pattern
```typescript
const { playSound, isMuted, toggleMute } = useGameSounds(true)
```

### Session/Bet Refs Pattern
Use refs to capture values for timer closures:
```typescript
const sessionRef = useRef<SessionData | null>(null)
const selectedBetRef = useRef<number>(0.1)

// Keep refs in sync with state
useEffect(() => { sessionRef.current = session }, [session])
```

## Testing
- 249 tests across 8 files
- Run: `npm test` or `npx vitest run`
- Game is at: http://localhost:3000/blackjack

## API Endpoints
- `POST /api/session` - Create/get session
- `POST /api/game` - Game actions (start, hit, stand, double, split)
- `POST /api/wallet` - Deposits/withdrawals
- `GET /api/verify` - Game verification

## Build Commands
```bash
npm run dev      # Development
npm run build    # Production build
npm test         # Run tests
```
