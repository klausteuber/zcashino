# CypherJester and 21z SEO rollout

## Scope and positioning

CypherJester introduces Zcash casino play through blackjack, video poker, and accessible funding/payout explanations. 21z emphasizes blackjack rules and hand verification. These are editorial directions, not claims based on measured keyword demand. Veilstone is outside this change.

Both casino homepages and game pages now have distinct descriptions. Game metadata includes page-specific canonical, Open Graph, and Twitter values. New server-rendered guides are linked from each brand's homepage, both games, funding page, and fairness page. Each guide is served only on its assigned brand; unknown and other-brand guide slugs return not found. Casino sitemaps include the assigned guides and omit unverified modification dates.

| Domain | New guide paths |
| --- | --- |
| cypherjester.com | `/guides/getting-started-with-zcash`, `/guides/video-poker-payouts` |
| 21z.cash | `/guides/blackjack-rules`, `/guides/verify-blackjack-hand` |

## Source and maintenance notes

- `src/lib/seo/guides.ts` contains the guide content and brand assignment.
- Poker payout examples were checked against `getPaytable` and `calculatePayout` in `src/lib/game/video-poker.ts`. Payout is base bet times the selected paytable entry; total stake is base bet times coin count. Do not describe 4,000 base-bet units as 4,000 times a five-coin stake.
- Blackjack controls were checked against `getAvailableActions` and the default runtime settings. Defaults can change; these articles are not a complete optimal-strategy chart.
- Verification instructions distinguish session rotation/reveal, legacy hands, and demo commitments. A pending reveal does not mean a successful or failed verification.
- Keep substantive shared rules accurate across brands. Distinguish content through useful examples and audience focus rather than rewriting factual rules to sound different.

## After deployment: Search Console

Search Console is not connected to this workspace. Ownership, sitemap submission, indexing status, and traffic baselines have not been verified.

1. Verify a Domain property for each domain using the DNS record supplied by Google. Do not invent a verification token or assume source-code tags are required for DNS verification.
2. Submit `https://cypherjester.com/sitemap.xml` and `https://21z.cash/sitemap.xml` to their respective properties.
3. Inspect each homepage, both game pages, and both new guides on each domain. Check crawl access, rendered content, indexing eligibility, and Google's selected canonical. Request indexing for the updated priority pages.
4. Save a 28-day baseline per domain: clicks, impressions, CTR, average position, and indexed priority URLs. Separate branded queries (CypherJester/21z) from non-brand discovery queries. Mark the deployment date.
5. Compare the following 28 days with the baseline, accounting for small samples and seasonality. Review which queries and landing pages changed before writing more guides.

Google's sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap

## First-game measurement

Search Console measures search visibility and clicks; it does not measure gameplay conversion. The current player audit counters are operational events and do not provide a verified organic-search-to-first-game funnel.

Before reporting a conversion rate, define and implement a separate, privacy-conscious attribution flow: organic landing visit → game opened → first successful game start. Separate demo from real play and report by brand and landing path. Count a first game only once per measured session. Do not send recovery keys, session credentials, wallet addresses, seeds, or balances to a third-party analytics service. The provider and attribution implementation remain a follow-up; no analytics integration was silently added in this SEO change.

## Release validation

Run focused SEO/brand tests, TypeScript, and lint. Check both brands in a browser at desktop and mobile widths. Confirm the new guides cannot be served under the other brand and that generated sitemaps only advertise the assigned guides. Follow the existing production release gates before deployment; this change does not deploy itself.

### Validation in this workspace

- 20 focused SEO and brand tests passed; TypeScript and changed-file lint passed.
- Browser checks confirmed home/game/guide metadata and same-brand links; CypherJester and 21z guide layouts were inspected at desktop and 390px width.
- Other-brand guide requests render the branded not-found page with `noindex`. Next.js may stream this response with HTTP 200 after headers have been sent; do not describe this as a guaranteed HTTP 404.
- The original working directory hit a Turbopack worker permission error; the diagnostic Webpack build also exposed browser imports of server game modules. The release extracts browser-safe blackjack limits and poker paytables. In an isolated checkout, the standard production build and standalone artifact validator now pass. All 602 unit tests, full lint, and TypeScript checks pass.
