# 2026 Midterms Command Center

A portable election-night OSINT dashboard for the **November 3, 2026 U.S. midterms**. It uses plain **HTML + CSS + JavaScript**, has **no database**, no build step, no account/login, and requires no API key and does not require you to supply an election-results datasource.

## Start it

### Windows
Double-click:

`START-MIDTERMS-DASHBOARD.bat`

### Any platform with Node.js 18+

```bash
node local-server.js
```

The dashboard opens at `http://127.0.0.1:8765/`. This is localhost only: it is not externally hosted and is not exposed to the internet.

Use the launcher rather than double-clicking `index.html`. The local launcher is what makes the automatic result feeds, geographic map geometry, caching, and reliable YouTube embeds work together without CORS/API-key problems.

## Automatic election data — no setup required

The dashboard starts with automatic results enabled and refreshes every 60 seconds by default.

### Primary: watch.vote

The local gateway requests the public/keyless 2026 endpoints for:

- Senate: `https://watch.vote/api/elections/2026/results?office=senate`
- House: `https://watch.vote/api/elections/2026/results?office=house`
- Governors: `https://watch.vote/api/elections/2026/results?office=governors`

watch.vote documents these as 2026 election-result routes. Its result presentation is based on counts from official state election authorities, and a race is not treated as won merely because a candidate is leading; the dashboard consumes the provider's call/winner state when present.

### Cross-check: Open America

The local gateway also requests Open America's free, keyless JSON endpoints for House, Senate, and governor results. Open America says its adapters read machine-readable feeds from official state election offices. Coverage is not universal, so this source is used as a secondary/cross-check rather than the sole national backbone.

### AP and Decision Desk HQ

They remain in the Source Center for verification, but the dashboard does **not** scrape undocumented/private API endpoints. AP Elections API access requires an API key, while Decision Desk HQ's results API uses authenticated OAuth/Bearer access. Neither credential is needed for this dashboard.

### Fail-safe behavior

The localhost gateway keeps an in-memory and small disk cache in `.midterms-cache/`. If an upstream service is briefly unavailable, it can serve the last good response and marks provider health as stale rather than replacing results with invented values.

## Actual geographic maps

The old square/cartogram state display has been replaced.

- **States / Senate / Governors / State summary:** actual U.S. state geometry from the U.S. Census Bureau TIGERweb 2026 state layer.
- **House:** actual 2026 congressional-district geometry from the watch.vote national 2026 district snapshot, which is based on Census congressional-district geography and is paired with the election-result feed.

The map is SVG, interactive, zoom-free and dependency-free. Click a state or district to open its race inspector. Available layers are Senate, House districts, Governors, and State summary.

## Race provenance

The interface keeps these concepts separate:

- **Vote counts / reporting:** automatic provider data ultimately sourced from state election authorities.
- **Calls/winners:** only shown when the normalized provider marks the race called/won (or state certification is represented by that provider).
- **Pre-election ratings/watchlists:** reference context only; never rendered as vote results.
- **Manual overrides/imports:** clearly retained as manual/imported records.

Every automatic race can display its primary provider, underlying election authority label, update time, freshness, and source URL when supplied.

## Live news and video

The existing video workflow is preserved:

- Add any YouTube URL or 11-character video ID.
- Use included network live presets.
- Dock players left or right.
- Undock/float them.
- Drag and resize floating players.
- Minimize or fullscreen them.
- Players persist while you switch Dashboard / Map / Races / Sources / Data Control.

The news panel and bottom **LIVE WIRE** attempt a live Google News RSS search through public proxy fallbacks and retain a local/source fallback wire if those services are unavailable.

## Pages

- **Dashboard** — automatic data health, called-race boards, geographic Senate map, news, network streams, poll-close timeline, watchlist, notes.
- **Live Map** — full geographic state/district map with Senate, House, governor and state-summary layers plus race inspector.
- **Race Board** — automatically reporting/called races plus pre-election Senate/governor/House battleground reference lists.
- **Sources** — built-in feed health plus watch.vote, Open America, civicAPI, AP, DDHQ, official directories, forecast sources and news references.
- **Data Control** — automatic refresh settings, optional custom JSON feed, imports/exports and manual emergency overrides.

## Optional custom data

You do **not** need this for normal use. Data Control still supports a custom CORS-enabled JSON endpoint or imported snapshot if you later obtain another source.

A compatible optional payload looks like:

```json
{
  "updatedAt": "2026-11-03T23:15:00Z",
  "chamber": {
    "house": { "dem": 20, "rep": 24, "other": 0, "called": 44 },
    "senate": { "dem": 3, "rep": 4, "other": 0, "called": 7 }
  },
  "results": [
    {
      "state": "GA",
      "leader": "D",
      "demPct": 50.7,
      "repPct": 48.9,
      "reporting": 76.2,
      "called": false,
      "source": "connected"
    }
  ]
}
```

## Important limitations

Free public sources can change their schemas, availability, or terms. The dashboard therefore shows provider health, caches last-good data, preserves source provenance, and never fabricates a result when a provider is unavailable. Open America currently has partial state coverage; watch.vote is the broader national automatic backbone.

The pre-election race ratings, watchlists, and poll-close schedule are reference material assembled before election night and must not be confused with actual reported votes.

## Key files

- `index.html` — application shell
- `styles.css` — dark OSINT/presentation styling + geographic map styles
- `data.js` — reference data, source catalog, poll closes, video presets
- `app-core.js` — validation, YouTube helpers and GeoJSON-to-SVG projection
- `live-sources.js` — watch.vote/Open America normalization and merge layer
- `app.js` — UI, automatic refresh, map rendering, news, ticker and video workspace
- `local-server.js` — localhost static server + automatic election-data/map gateway + cache
- `START-MIDTERMS-DASHBOARD.bat` — Windows one-click launcher
- `START-MIDTERMS-DASHBOARD.command` — macOS/Linux launcher
- `sample-results.json` — optional custom/import schema example

## Test

```bash
npm test
node --check app.js
node --check app-core.js
node --check data.js
node --check live-sources.js
node --check local-server.js
```
