# 21z Dual-Brand Reskin Contract

## Immutable Rules

1. Brand IDs are `cypher` and `21z`.
2. Brand selection precedence is:
   - `FORCE_BRAND` override
   - host mapping (`CYPHER_HOSTS`, `BRAND_21Z_HOSTS`)
   - fallback to `cypher`
3. `data-brand` source of truth is server-rendered on `<body>` in `src/app/layout.tsx`.
4. Styling is token-driven and brand-scoped in CSS. React branching is for copy/structure only.
5. `21z.cash` is canonical. Cypher pages remain indexable with canonical URLs targeting 21z equivalent paths.
6. Admin is Cypher-only:
   - `cypher` host: full admin UX and `/api/admin/*`
   - `21z` host: disabled `/admin` notice
   - non-Cypher admin API requests return `404`
7. No API payload, game logic, DB schema, or wallet flow changes.
8. Do not rename existing user session keys/cookies (`zcashino_*` remains unchanged).

## Required Semantic Tokens

- `--accent-primary`
- `--accent-secondary`
- `--bg-base`
- `--bg-surface`
- `--bg-elevated`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--color-success`
- `--color-error`
- `--border-default`
- `--border-active`

## 21z Brand Copy

- Name: `21z`
- Tagline: `Prove Everything. Reveal Nothing.`
