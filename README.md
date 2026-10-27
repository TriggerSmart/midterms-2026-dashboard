# 2026 Midterms Command Center

A GitHub Pages-compatible election-night OSINT dashboard for the **November 3, 2026 U.S. midterms**. The published site is plain **HTML + CSS + JavaScript** with **no database, no API key, no login, and no server process**.

## GitHub Pages deployment

1. Create a GitHub repository and upload/push this entire folder, including `.github/workflows/pages.yml`.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or `master`) or run the workflow manually from **Actions → Deploy Midterms Command Center to GitHub Pages → Run workflow**.
5. GitHub builds and deploys the dashboard. All browser asset/data URLs are repository-relative, so project Pages URLs such as `https://USERNAME.github.io/REPOSITORY/` work without changing paths.

The included workflow runs the tests, refreshes the static election-data mirror and geographic maps, builds `_site`, and deploys it with the official GitHub Pages actions.


## Projection mode — populated before election night

The dashboard now opens in **Projection Map** mode so it is useful before any ballots are reported. Projection data is stored separately from actual vote data and is always labeled as a forecast.

- **House:** 270toWin 2026 House consensus snapshot dated October 23, 2026 — 220 Democratic, 196 Republican, 19 Toss-Up seats; the map includes the 89 non-safe districts from the consensus table and uses a current-member baseline for safe seats.
- **Senate:** Cook Political Report race ratings dated October 20, 2026 on all 35 contests. The chamber balance card separately shows the 270toWin consensus balance (49 Democratic-caucus, 46 Republican, 5 Toss-Up) so the site does not imply that Cook's race-rating categories are a seat-probability model.
- **Governors:** Cook Political Report race ratings dated October 23, 2026 on all 36 contests. The balance card separately shows the 270toWin consensus (23 Democratic, 22 Republican, 5 Toss-Up).

Projection-map colors use the categorical ratings **Solid / Likely / Lean / Toss Up**. The visual strength bar is only a category visualization; it is **not a modeled probability**.

The map has a persistent switch between:

- **Projection Map** — forecast ratings and pre-election context
- **Live Results** — actual vote totals, reporting percentages, leads and calls from the automatic election feeds

The same state/district geography is reused in both modes, so election-night operation is a mode switch rather than a separate page or map.

## Automatic election data — no datasource hookup required

The site uses two complementary free/keyless paths.

### Open America — direct browser polling

Open America's election JSON explicitly allows cross-origin browser requests. The dashboard polls its House, Senate, and governor feeds directly when automatic results are enabled:

- `https://openamerica.io/elections/results.json?year=2026&office=House`
- `https://openamerica.io/elections/results.json?year=2026&office=Senate`
- `https://openamerica.io/elections/results.json?year=2026&office=Governor`

This gives the static GitHub Pages site a direct live-results path without a proxy, key, or database.

### watch.vote — GitHub Actions static mirror

watch.vote provides public/keyless 2026 results, but its result endpoints intentionally do **not** send browser CORS headers. A GitHub Pages browser therefore cannot fetch those endpoints directly.

The included Pages workflow solves that without any user configuration: GitHub Actions fetches watch.vote server-side, normalizes the results, writes `assets/data/live-results.json`, and deploys that JSON with the site. On **November 3–5, 2026**, the scheduled workflow is configured for approximately five-minute refresh attempts. GitHub scheduled workflows may be delayed, so the UI also uses Open America's direct CORS feed between mirror deployments.

Mirrored watch.vote routes:

- Senate: `https://watch.vote/api/elections/2026/results?office=senate`
- House: `https://watch.vote/api/elections/2026/results?office=house`
- Governors: `https://watch.vote/api/elections/2026/results?office=governors`

The site never embeds an AP or Decision Desk HQ credential. AP Elections API and DDHQ's professional results API remain Source Center references because they require authenticated access.

## Geographic maps

The map is a real geographic SVG map, not a square/cartogram layout.

- State/Senate/Governor layers use U.S. Census geography.
- House uses 120th Congressional District geography for the 2026 election cycle.
- The deployment workflow downloads the current geometry into `assets/data/` before publishing.
- If a fresh repository still contains the intentionally tiny placeholder geometry files before the first successful workflow refresh, the browser automatically falls back to the committed Census-derived `states.json` / `cd120.json` geography from the open-source `seifertben/election-map` repository through jsDelivr. No setup or URL entry is required.
- All local map reads are repository-relative, so project Pages URLs work from a subdirectory.

Available projection layers:

- U.S. House districts
- Senate
- Governors

Available live-results layers:

- U.S. House districts
- Senate
- Governors
- State summary

Click a state or district in Projection mode to inspect its rating, forecast direction, current/incumbent context, poll-close wave, source and state news. Click the same geography in Live Results mode to inspect candidate totals, reporting percentage, race status, source authority, provider and update time.

## Live video workspace

The custom video system remains fully browser-side and works on GitHub Pages:

- Add any YouTube URL or 11-character video ID.
- Use built-in network live presets.
- Dock left or right.
- Undock/floating mode.
- Drag and resize floating players.
- Minimize or fullscreen.
- Players remain mounted while switching Dashboard / Live Map / Race Board / Sources / Data Control.
- Layout persists in that browser using `localStorage`.

GitHub Pages is served over HTTPS and supplies the HTTP referrer YouTube embeds expect, making it preferable to opening `index.html` directly with `file://`.

## News and ticker

The dashboard includes a headline panel and bottom **LIVE WIRE** ticker. It attempts a live Google News RSS search using browser-accessible proxy fallbacks, with a built-in source wire if those services are unavailable.

## Failure behavior

The system is designed not to turn an upstream outage into fake data:

- A failed GitHub Actions refresh does not replace the already deployed Pages site, so the last successful watch.vote snapshot remains online.
- Open America direct polling is independent of the mirrored watch.vote snapshot.
- Every automatic race retains provider/source provenance and update time.
- Manual/imported overrides are labeled separately.
- Pre-election ratings/watchlists are displayed as reference context, not vote results.

## GitHub Actions schedule

`.github/workflows/pages.yml` deploys on:

- pushes to `main` or `master`
- manual `workflow_dispatch`
- an election-night cron window on November 3–5

The scheduled job contains a 2026 year gate, so the election-night cron will not continue deploying in later years unless you intentionally change it.

GitHub's scheduler is not a hard real-time service and can delay cron jobs. The direct Open America browser feed is therefore important for faster state-count updates during the gaps between static watch.vote mirror deployments.

## Optional local development

GitHub Pages is the primary deployment target. `local-server.js` and the starter files are retained only as an optional local development/test path.

```bash
node local-server.js
```

They are **not required** by the published GitHub Pages dashboard.

## Optional custom/manual data

Data Control still supports an optional CORS-enabled JSON URL, pasted JSON, file import, and manual overrides. None are required for the built-in automatic sources.

## Key files

- `index.html` — static application shell
- `styles.css` — dashboard/map styling
- `data.js` — election reference data, poll closes, source catalog, video presets
- `projections.js` — pre-election House/Senate/Governor projection snapshot and source metadata
- `app-core.js` — validation, YouTube helpers, map projection helpers
- `live-sources.js` — browser + Node election-source normalization/merge layer
- `app.js` — dashboard UI, maps, polling, ticker, news and video workspace
- `assets/data/live-results.json` — static mirrored results read by GitHub Pages
- `assets/data/states.geojson` — deployed state map geometry
- `assets/data/house-districts.geojson` — deployed House district geometry
- `scripts/update-live-data.js` — server-side GitHub Actions fetch/normalize step
- `scripts/build-pages.js` — builds the `_site` Pages artifact
- `.github/workflows/pages.yml` — automatic refresh/test/deploy workflow
- `.nojekyll` — prevents Jekyll processing
- `local-server.js` — optional local development server only

## Local verification

```bash
npm test
npm run verify
node scripts/build-pages.js
```

`npm run refresh:data` performs real network requests and is primarily intended for GitHub Actions or a machine with internet access.
