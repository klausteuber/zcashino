# Gotchas & Bugs

## React useEffect Timer Bugs

### Stale Closure in setInterval (2025-02-04)

**Symptom:** Auto-bet countdown shows "2..." but never decrements or completes.

**Root Cause:**
When using `setInterval` inside `useEffect`, capturing a local variable in the closure creates a stale reference:

```javascript
// The problem:
let countdown = 2
const intervalId = setInterval(() => {
  countdown -= 1  // ← This references the ORIGINAL countdown, not updated value
  setAutoBetCountdown(countdown)
}, 1000)
```

When React re-renders (due to state changes, strict mode, etc.):
1. The effect may run again
2. A new interval is created with a fresh `countdown = 2`
3. The old interval still references its stale `countdown`
4. Multiple intervals compete, causing erratic behavior

**The Fix:**

1. **Use functional state updates:**
```javascript
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

2. **Always add cleanup function:**
```javascript
useEffect(() => {
  // ... create timer
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }
}, [deps])
```

3. **Clear old timers before creating new ones:**
```javascript
if (timerRef.current) clearTimeout(timerRef.current)
if (intervalRef.current) clearInterval(intervalRef.current)
// THEN create new ones
```

4. **Use a ref for re-entry guard:**
```javascript
const isRunningRef = useRef(false)

useEffect(() => {
  if (isRunningRef.current) return  // Already running
  isRunningRef.current = true
  // ... rest of effect
}, [deps])
```

### React Strict Mode Double-Renders

**Symptom:** Effects run twice in development, timers behave erratically.

**Cause:** React Strict Mode intentionally double-invokes effects to help find bugs.

**Fix:** Always write effects that work correctly even when run multiple times. This means:
- Proper cleanup functions
- Idempotent setup code
- Not relying on "run exactly once" behavior

---

## Tailwind CSS v4

### Missing PostCSS Config (2025-02-04)

**Symptom:** Massive colored SVG covering the entire page, styles broken.

**Cause:** Tailwind CSS v4 requires explicit PostCSS configuration.

**Fix:** Create `postcss.config.mjs`:
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

---

## Prisma / Database

### LibSQL Adapter
This project uses Prisma 7 with LibSQL adapter for SQLite.

**Config file:** `prisma.config.ts`

**Key commands:**
```bash
npx prisma db push    # Apply schema changes
npx prisma generate   # Regenerate client
```

---

## Admin Security

### In-Memory Rate Limiter Scope

**Symptom:** Rate-limit behavior resets after server restart or differs across multiple app instances.

**Cause:** Current admin rate limiter uses in-memory process state.

**Impact:**
- Works well for local dev and single-instance deployments.
- Not globally consistent across horizontally scaled nodes.

**Fix (when scaling):**
- Move rate-limit state to Redis (or another shared store).
- Keep the same bucket structure (`auth-login`, `admin-read`, `admin-action`).

### Production Credential Length Enforcement

**Symptom:** Admin dashboard shows "not configured" in production even when variables are set.

**Cause:** In production mode:
- `ADMIN_PASSWORD` must be at least 12 chars
- `ADMIN_SESSION_SECRET` must be at least 32 chars

**Fix:**
- Rotate to stronger credentials before production deploy.

---

## Next.js Build Environment

### Remote Google Fonts Fetch

**Symptom:** `next build` fails in restricted/offline environments.

**Cause:** `next/font/google` fetches font CSS during build.

**Fix options:**
- Build in an environment with outbound network access, or
- switch to local/self-hosted fonts for fully offline builds.
