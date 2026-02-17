# CypherJester Design System

## Philosophy

"Remove everything that can be removed without losing meaning." - Steve Jobs & Jony Ive

- Every element must earn its place
- Hierarchy guides attention
- Consistency builds trust

---

## Colors

### Primary Palette (CypherJester)

| Name | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| Jester Green | `#3D7A5A` | `--jester-purple` | Main felt color, brand |
| Jester Green Dark | `#2A5940` | `--jester-purple-dark` | Darker accents, card backs |
| Jester Green Light | `#5A9E78` | `--jester-purple-light` | Success states, highlights |
| Masque Gold | `#C9A227` | `--masque-gold` | Primary accent, CTAs, wins |
| Venetian Gold | `#E8D5A3` | `--venetian-gold` | Secondary accent, text |
| Midnight Black | `#0D0D0D` | `--midnight-black` | Backgrounds, primary text |
| Bone White | `#FAF7F0` | `--bone-white` | Cards, primary text on dark |
| Crimson Mask | `#4A2C5A` | `--crimson-mask` | Split action, special states |
| Blood Ruby | `#722F37` | `--blood-ruby` | Errors, loss states |

### DO NOT USE

These colors break the design system and should never appear in component files:

- `amber-*` (use `masque-gold` or `venetian-gold`)
- `zinc-*` (use `midnight-black` + `venetian-gold/opacity`)
- `blue-*` (use `jester-purple-light` for pending/incoming states)
- `gray-*` (use `venetian-gold/opacity`)
- `green-*` (use `jester-purple-light` for success)
- `red-*` (use `blood-ruby`)
- `purple-*` (use `jester-purple` variants)

---

## Typography

### Font Stack

| Type | Font | Usage |
|------|------|-------|
| Display | Cinzel | Headings, hero text |
| Body | Inter | All body text |
| Mono | IBM Plex Mono | Addresses, hashes, numbers |

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
| Primary | `text-bone-white` | Main headings, primary content |
| Secondary | `text-venetian-gold` | Subheadings, labels, emphasis |
| Tertiary | `text-venetian-gold/50` | Hints, captions, disabled text |

**DO NOT USE:** `text-venetian-gold/40`, `/60`, `/70` - these create visual noise.

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
| Primary | `btn-gold-shimmer text-midnight-black` | Main CTAs (Deal, Play Again) |
| Secondary | `bg-jester-purple text-bone-white` | Secondary actions (Stand, No Thanks) |
| Outline | `bg-transparent border-2 border-masque-gold text-masque-gold` | Contextual actions (Double) |
| Subtle | `bg-crimson-mask/50 text-bone-white` | Rare actions (Split) |
| Danger | `bg-blood-ruby text-bone-white` | Destructive actions |

### Cards/Panels

```
bg-midnight-black/40
border border-masque-gold/20
hover:border-masque-gold/40
rounded-xl
```

### Inputs

```
bg-midnight-black/60
border border-masque-gold/20
focus:border-masque-gold focus:ring-1 focus:ring-masque-gold/30
rounded-lg
text-bone-white
placeholder-venetian-gold/30
```

### Badges

| State | Classes |
|-------|---------|
| Demo | `bg-masque-gold/10 border-masque-gold/30 text-venetian-gold` |
| Verified | `bg-jester-purple/10 border-jester-purple/30 text-jester-purple-light` |
| Pending | `bg-masque-gold/10 border-masque-gold/30 text-venetian-gold animate-pulse` |
| Incoming | `bg-jester-purple-light/10 border-jester-purple-light/30 text-jester-purple-light` |

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
2. **STAND** - Secondary (purple) - ends turn
3. **DOUBLE** - Outline (gold border) - contextual
4. **SPLIT** - Subtle (crimson) - rare action

### Insurance Offer

- **YES** - De-emphasized (outline, smaller text) - statistically poor choice
- **NO** - Emphasized (solid purple) - better for player

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
    ui/              # Reusable primitives (JesterLogo, etc.)
    game/            # Game-specific components
    wallet/          # Wallet components
    onboarding/      # Onboarding flow
```

---

## Background Texture

The site uses a **diamond-tufted green felt** SVG pattern as the background texture (`.felt-texture` class in globals.css):
- Diamond shapes in `jester-purple-dark` at 0.2 opacity
- Gold dot at center at 0.1 opacity
- Creates a classic casino felt table aesthetic

---

## 21z Brand Override (Cyberpunk Futurist)

### Philosophy

"A terminal in a quiet, expensive cyberpunk bar."

The void is the canvas. Light is the paint. Every glow must be earned through interaction.
No textures. No patterns. No decoration. Restraint is the aesthetic.

### Background

- Pure void: `#05050a` — no grid, no scanlines, no felt texture
- Subtle radial vignette via `body::before` (darker edges) for cinematic depth
- `.felt-texture` and `.scanline-overlay` are neutralized via `body[data-brand="21z"]`

### Color System

| Role | Value | Token | Notes |
|------|-------|-------|-------|
| Primary Accent | `#00F0FF` | `--accent-primary` | Cyan — interactive elements, borders, glows |
| Secondary Accent | `#F4B728` | `--accent-secondary` | Zcash Gold — sparingly, brand alignment only |
| Success | `#00FFB3` | `--color-success` | Neon green — wins, positive states |
| Error | `#FF2E63` | `--color-error` | Hot pink — losses, errors |
| Surface | `#0F1019` | `--bg-surface` | Cards, panels |
| Elevated | `#161825` | `--bg-elevated` | Modals, dropdowns |
| Text Primary | `#E0E4F0` | `--text-primary` | Cool-tinted white (never pure #FFF) |
| Text Secondary | `#8890A6` | `--text-secondary` | Labels, captions |

### Glow System

Three-layer box-shadow for realistic light falloff:

```css
box-shadow:
  0 0 5px rgba(0, 240, 255, 0.3),     /* tight core */
  0 0 15px rgba(0, 240, 255, 0.15),    /* medium diffuse */
  0 0 30px rgba(0, 240, 255, 0.05);    /* wide ambient */
```

**Rules:**
- Glow at rest: NEVER (exception: active game hand pulse)
- Glow on hover: YES — buttons, panels, interactive elements
- Glow on focus-visible: YES — same as hover (accessibility)
- Glow on active/pressed: TIGHTER, BRIGHTER — energy surge
- Win animation: neon green glow (`#00FFB3`)
- Blackjack animation: cyan glow (`#00F0FF`)

### Shape Language

- `border-radius: 0` everywhere (enforced via CSS overrides)
- Beveled clip-paths replace rounded corners:
  - Panels/modals: 12px bevel
  - Buttons: 10px bevel
  - Cards: 8px bevel
  - Tooltips: 6px bevel

### Typography

| Role | Font | Usage |
|------|------|-------|
| Display | Orbitron | Headlines, balance, bet amounts, brand mark |
| Body | Rajdhani | All UI text, buttons, labels |
| Mono | Space Mono | Addresses, hashes, seeds |

### Shadows (21z overrides)

| Name | Value | Notes |
|------|-------|-------|
| Subtle | `0 2px 8px rgba(0,0,0,0.3)` | Denser than Cypher (darker base) |
| Card | `0 4px 16px rgba(0,0,0,0.4)` | |
| Elevated | `0 8px 32px rgba(0,0,0,0.5)` | |
| Cyan Glow | `0 0 20px rgba(0,240,255,0.2)` | Replaces gold-glow |

### DO NOT (21z brand)

- No grid patterns or background textures
- No scanline overlays
- No rounded corners (use clip-path bevels)
- No pure white `#FFFFFF` or pure black `#000000`
- No gold/warm colors except `--accent-secondary` for Zcash brand tie-in
- No glow effects at rest (only on interaction)

---

## Migration Notes

When updating existing code:

1. Replace `amber-*` with `masque-gold` / `venetian-gold`
2. Replace `zinc-*` with `midnight-black` / `venetian-gold/opacity`
3. Replace `blue-*` with `jester-purple-light`
4. Replace `gray-*` with `venetian-gold/opacity`
5. Consolidate text opacities to only use `/50` for tertiary
6. Replace `green-*` with `jester-purple` variants
7. Replace `red-*` with `blood-ruby`
8. Replace `purple-*` with `jester-purple` variants (not generic Tailwind purple)
