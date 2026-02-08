# Zcashino Design System

## Philosophy

"Remove everything that can be removed without losing meaning." - Steve Jobs & Jony Ive

- Every element must earn its place
- Hierarchy guides attention
- Consistency builds trust

---

## Colors

### Primary Palette (Classy Pepe)

| Name | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| Pepe Green | `#3D7A5A` | `--pepe-green` | Main felt color, brand |
| Pepe Green Dark | `#2A5940` | `--pepe-green-dark` | Darker accents, card backs |
| Pepe Green Light | `#5A9E78` | `--pepe-green-light` | Success states, highlights |
| Monaco Gold | `#C9A227` | `--monaco-gold` | Primary accent, CTAs, wins |
| Champagne Gold | `#E8D5A3` | `--champagne-gold` | Secondary accent, text |
| Rich Black | `#0D0D0D` | `--rich-black` | Backgrounds, primary text |
| Ivory White | `#FAF7F0` | `--ivory-white` | Cards, primary text on dark |
| Velvet Purple | `#4A2C5A` | `--velvet-purple` | Split action, special states |
| Burgundy | `#722F37` | `--burgundy` | Errors, loss states |

### DO NOT USE

These colors break the design system and should never appear in component files:

- `amber-*` (use `monaco-gold` or `champagne-gold`)
- `zinc-*` (use `rich-black` + `champagne-gold/opacity`)
- `blue-*` (use `pepe-green-light` for pending/incoming states)
- `gray-*` (use `champagne-gold/opacity`)
- `green-*` (use `pepe-green` variants)
- `red-*` (use `burgundy`)

---

## Typography

### Font Stack

| Type | Font | Usage |
|------|------|-------|
| Display | Playfair Display | Headings, hero text |
| Body | DM Sans | All body text |
| Mono | JetBrains Mono | Addresses, hashes, numbers |

### Size Scale

| Name | Size | Usage |
|------|------|-------|
| xs | 12px | Captions, hints |
| sm | 14px | Secondary body text |
| base | 16px | Primary body text |
| lg | 18px | Emphasized body |
| xl | 20px | H4 headings |
| 2xl | 24px | H3 headings |
| 3xl | 30px | H2, page titles |
| 5xl | 48px | H1, hero secondary |
| 6xl | 60px | Display, hero primary |

### Text Colors (3-Tier System)

Only use these three text color levels:

| Tier | Class | Usage |
|------|-------|-------|
| Primary | `text-ivory-white` | Main headings, primary content |
| Secondary | `text-champagne-gold` | Subheadings, labels, emphasis |
| Tertiary | `text-champagne-gold/50` | Hints, captions, disabled text |

**DO NOT USE:** `text-champagne-gold/40`, `/60`, `/70` - these create visual noise.

---

## Spacing

### Gap Scale

| Name | Value | Class | Usage |
|------|-------|-------|-------|
| Tight | 8px | `gap-2` | Closely related items |
| Standard | 16px | `gap-4` | Default spacing |
| Loose | 32px | `gap-8` | Between components |
| Section | 48px | `gap-12` | Between major sections |

### Padding

| Context | Class | Usage |
|---------|-------|-------|
| Component internal | `p-4` or `p-6` | Inside buttons, badges |
| Card/Panel | `p-6` or `p-8` | Inside cards, modals |
| Section container | `py-12` or `py-16` | Page sections |

---

## Components

### Buttons

| Type | Classes | Usage |
|------|---------|-------|
| Primary | `btn-gold-shimmer text-rich-black` | Main CTAs (Deal, Play Again) |
| Secondary | `bg-pepe-green text-ivory-white` | Secondary actions (Stand, No Thanks) |
| Outline | `bg-transparent border-2 border-monaco-gold text-monaco-gold` | Contextual actions (Double) |
| Subtle | `bg-velvet-purple/50 text-ivory-white` | Rare actions (Split) |
| Danger | `bg-burgundy text-ivory-white` | Destructive actions |

### Cards/Panels

```
bg-rich-black/40
border border-monaco-gold/20
hover:border-monaco-gold/40
rounded-xl
```

### Inputs

```
bg-rich-black/60
border border-monaco-gold/20
focus:border-monaco-gold focus:ring-1 focus:ring-monaco-gold/30
rounded-lg
text-ivory-white
placeholder-champagne-gold/30
```

### Badges

| State | Classes |
|-------|---------|
| Demo | `bg-monaco-gold/10 border-monaco-gold/30 text-champagne-gold` |
| Verified | `bg-pepe-green/10 border-pepe-green/30 text-pepe-green-light` |
| Pending | `bg-monaco-gold/10 border-monaco-gold/30 text-champagne-gold animate-pulse` |
| Incoming | `bg-pepe-green-light/10 border-pepe-green-light/30 text-pepe-green-light` |

---

## Shadows

| Name | CSS Variable | Usage |
|------|--------------|-------|
| Subtle | `--shadow-subtle` | Buttons, chips |
| Card | `--shadow-card` | Panels, cards |
| Elevated | `--shadow-elevated` | Modals, popovers |
| Gold Glow | `--shadow-gold-glow` | Interactive highlights, wins |

---

## Border Radius

| Element | Class |
|---------|-------|
| Badges, chips | `rounded-full` or `rounded-lg` |
| Cards, panels | `rounded-xl` |
| Modals | `rounded-2xl` |
| Buttons | `rounded-lg` |
| Inputs | `rounded-lg` |

---

## Animation

### Timing

| Duration | Value | Usage |
|----------|-------|-------|
| Instant | 150ms | Button press, hover |
| Quick | 300ms | Transitions, fades |
| Standard | 400ms | Card deal, modal enter |
| Slow | 600ms | Celebrations |

### Easing

| Name | Value | Usage |
|------|-------|-------|
| Default | `ease-out` | Most transitions |
| Bounce | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Card deal, celebrations |
| Smooth | `ease-in-out` | Continuous animations |

### Available Animations

| Class | Usage |
|-------|-------|
| `.card-deal` | Card entering from shoe |
| `.card-flip-3d` | Card flipping to reveal face |
| `.win-glow` | Winner hand pulsing |
| `.loss-shake` | Loser feedback |
| `.blackjack-glow` | Blackjack celebration |
| `.active-hand` | Current player hand |
| `.chip-select` | Chip selection bounce |
| `.btn-gold-shimmer` | Primary button shimmer |
| `.animate-pulse` | Pending state indicator |

---

## Hierarchy Rules

### Button Hierarchy (Blackjack Actions)

1. **HIT** - Primary (gold) - most used action
2. **STAND** - Secondary (green) - ends turn
3. **DOUBLE** - Outline (gold border) - contextual
4. **SPLIT** - Subtle (purple) - rare action

### Insurance Offer

- **YES** - De-emphasized (outline, smaller text) - statistically poor choice
- **NO** - Emphasized (solid green) - better for player

This design choice builds trust by not pushing bad bets.

---

## Accessibility

- All interactive elements must have visible focus states
- Color contrast must meet WCAG AA standards
- Text should never be below 12px
- Touch targets minimum 44x44px on mobile

---

## File Structure

```
src/
  app/
    globals.css      # Design tokens, animations, utilities
    layout.tsx       # Font loading
  components/
    ui/              # Reusable primitives
    game/            # Game-specific components
    wallet/          # Wallet components
    onboarding/      # Onboarding flow
```

---

## Migration Notes

When updating existing code:

1. Replace `amber-*` with `monaco-gold` / `champagne-gold`
2. Replace `zinc-*` with `rich-black` / `champagne-gold/opacity`
3. Replace `blue-*` with `pepe-green-light`
4. Replace `gray-*` with `champagne-gold/opacity`
5. Consolidate text opacities to only use `/50` for tertiary
6. Replace `green-*` with `pepe-green` variants
7. Replace `red-*` with `burgundy`
