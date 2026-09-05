# Security audit lessons — September 4, 2026

These are unresolved audit findings, not completed fixes. See [audit report](/Users/cmmacbook/Code/Zcashino/zcashino-app/reports/security-audit-2026-09-04/report.md).

- A face-down card flag is presentation only. Public game responses must remove concealed card identity and any derived hidden-state flags.
- A timed-out wallet send or failed post-send database write is an unknown payment outcome. Keep funds reserved until reconciled; database rollback cannot undo a chain payment.
- Test cookie enforcement on every player mutation; logging legacy fallback does not enforce authentication.
- Admin account changes must invalidate existing authorization, not only future password logins.
- Atomic balance helpers do not make a whole game action atomic. Claim the game version and persist the charge, state, and settlement together.
- Passing existing unit tests does not validate hidden-information boundaries or concurrency. The audit added three isolated evidence cases and archived them outside normal test discovery.
