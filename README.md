# 2026 Midterms Command Center

A portable, dark OSINT-style election-night dashboard for the **November 3, 2026 U.S. midterms**. The application itself is plain **HTML + CSS + JavaScript**, uses **no database**, has **no build step**, and stores operator settings/results locally in the browser.

## Recommended launch

For the full experience, especially docked YouTube players, run from this folder:

```bash
node local-server.js
```

Then open `http://127.0.0.1:8765/` (the launcher also attempts to open it automatically).

This is **not external hosting**: it is a tiny dependency-free JavaScript server bound only to your own computer (`127.0.0.1`). It exists because YouTube embedded players now expect an HTTP referrer; a page opened directly as `file://.../index.html` may receive YouTube **Error 153**. The dashboard/map/import tools can still be opened directly by double-clicking `index.html`, but YouTube embeds are most reliable through the local launcher.

## What is included

- **Dashboard:** chamber-control cards, election clock/countdown, next poll-close wave, interactive map, headline wire, network live-feed launchers, Senate watch list, producer notes.
- **Live Map:** clickable 50-state + D.C. tile map with state inspector, reporting percentage, leader, call status, source/provenance and manual verification notes.
- **Race Board:** Senate battlegrounds, House tossups and governor battlegrounds preloaded as an election-night reference snapshot.
- **Source Center:** DDHQ, AP, Ballotpedia, Cook Political Report, Sabato, 270toWin, USA.gov, NASS, FEC and major news references.
- **Data Control:** connect a public CORS-enabled JSON endpoint, paste/import a JSON snapshot, export the current snapshot, manually update states and chamber counts, configure headline query/proxies.
- **Persistent Video Workspace:** add any YouTube video ID/URL or network live preset; dock left/right, undock/float, drag, resize, minimize, fullscreen and keep the player visible while switching pages.
- **Bottom LIVE WIRE:** scrolling election-news ticker fed from the current headline list, with live RSS proxy attempts and a local fallback wire.
- **Local persistence:** video layout, settings, producer notes and imported/manual results persist with `localStorage` on that browser/profile.

## Results data model

The dashboard does **not** pretend authenticated professional election APIs are anonymous public feeds. AP Elections API access requires credentials, and Decision Desk HQ's API also uses authenticated access. The app therefore supports a vendor-neutral JSON adapter.

A feed or imported file can use this shape:

```json
{
  "updatedAt": "2026-11-03T23:15:00Z",
  "chamber": {
    "house": { "dem": 220, "rep": 210, "other": 0, "called": 430 },
    "senate": { "dem": 48, "rep": 50, "other": 2, "called": 100 }
  },
  "results": [
    {
      "state": "GA",
      "leader": "D",
      "demPct": 50.7,
      "repPct": 48.9,
      "reporting": 76.2,
      "called": false,
      "source": "connected",
      "note": "Verified feed note"
    }
  ]
}
```

Only supplied state records are merged; omitted states are preserved. `leader` accepts `D`, `R`, `OTHER` or `TOSS`. Reporting values are clamped to 0–100. Every state record retains provenance so a manual/imported/reference status is not visually presented as a live connected result.

`sample-results.json` is included as a safe template.

## Election-night workflow

1. Start with `node local-server.js`.
2. Open **Data Control** and connect your approved CORS-enabled result JSON feed, or import/paste a verified snapshot.
3. Add network feeds from **+ Video**, then dock the most important feed left/right and float secondary feeds.
4. Use **Dashboard** for presentation, **Live Map** for state inspection, and **Sources** to launch primary/secondary references.
5. Use **Export snapshot** periodically if you want timestamped local backups of your manual/connected state.

## Important live-data limitations

This is a client-side command center, not an election-results vendor. Browsers cannot safely hide API keys, defeat a source's CORS policy, or guarantee that third-party RSS/YouTube endpoints remain embeddable. When a remote source blocks direct browser access, the dashboard preserves the last good/local data and provides source launchers rather than inventing values.

The preloaded race ratings, battleground lists and poll-close schedule are a **pre-election reference snapshot** assembled on October 26, 2026. Poll-closing times are for results-monitoring context and should not be used as voter instructions; split-time-zone states are marked with `*`.

## Key reference sources

- Decision Desk HQ results: https://votes.decisiondeskhq.com/elections/2026-11-03
- AP Elections API docs: https://developer.ap.org/ap-elections-api/
- Ballotpedia elections: https://ballotpedia.org/Elections
- Cook Political Report ratings: https://www.cookpolitical.com/ratings
- Sabato's Crystal Ball: https://centerforpolitics.org/crystalball/
- 270toWin: https://www.270towin.com/
- USA.gov midterms: https://www.usa.gov/midterm-elections
- NASS election officials: https://www.nass.org/can-I-vote/election-officials
- FEC election information: https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/

## Files

- `index.html` — static application shell
- `styles.css` — dark OSINT/presentation styling
- `data.js` — pre-election reference data, source catalog, poll-close waves, video presets
- `app-core.js` — validation/parsing/state helpers shared by browser and tests
- `app.js` — routing, dashboard, map, feeds, import/export, ticker and video workspace
- `local-server.js` — optional localhost-only launcher for reliable YouTube embeds
- `sample-results.json` — import/feed schema template
- `tests/core.test.js` — no-dependency Node test suite

## Test

```bash
npm test
node --check app.js
node --check app-core.js
node --check data.js
node --check local-server.js
```
