# Poker room presentation
Implemented in zcashino-app and prepared for release in poker-visual-release from origin/main f63870e. The separate poker-release checkout contains unrelated rake work and was not modified.

- Classic poker-room direction: sculpted purple felt and rail, larger player panels, corner-indexed cards, chip stacks, street badge, active-player and low-time indicators.
- Optional four-color deck preserves suit symbols; practice remains labeled in play ZEC.
- Betting slider uses integer zatoshis and server-provided bounds. Presets include Min, half-pot, three-quarter-pot, Pot and All-in (Max for Omaha). Pot sizing includes the call and existing street contribution.
- Real-mode stack and bet estimates use the existing price provider.
- Changes affect presentation and manual bet selection; no engine, custody, settlement or entry-verification changes.
- Validation: 100 poker tests, TypeScript and focused ESLint; browser fixture checks for desktop/mobile and manual preset/slider interaction. Screenshots use mocked practice players, not live funds.
- Release gates: full lint, TypeScript and all 736 tests pass. Deployment is app-only; no migrations. Production Docker build runs the standalone artifact validator before rollout.
