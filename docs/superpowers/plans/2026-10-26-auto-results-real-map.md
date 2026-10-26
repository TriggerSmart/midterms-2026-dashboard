# Automatic Results + Geographic Map Implementation Plan

**Goal:** Make the 2026 Midterms Command Center work with zero datasource configuration by automatically consuming keyless election feeds, while replacing the tile grid with a true geographic U.S. map.

**Architecture:** Keep the browser app static and database-free. Extend the localhost Node launcher into a small same-origin gateway that fetches/caches public election JSON and Census GeoJSON, normalizes it into a stable local contract, and serves it to the existing UI. Manual/imported results remain as fallback/override and the current persistent YouTube workspace is preserved.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js built-ins only.

## Global Constraints
- No database, account, API key, build step, or external hosting.
- Default path must auto-connect to free public sources.
- Preserve manual JSON import and manual state overrides.
- Preserve add/dock/float/resize/fullscreen YouTube behavior.
- Results must retain source/provenance and stale/error status.
- Geographic state map must use real boundary geometry, not a tile/cartogram.

### Task 1: Normalize keyless election feeds
- Add pure/tested normalization for watch.vote office results and Open America results.
- Produce stable race records, state summaries, chamber called counts, provenance and freshness.

### Task 2: Local automatic data gateway
- Add `/api/live/results`, `/api/live/status`, and `/api/map/states` routes to `local-server.js`.
- Fetch watch.vote Senate/House/governors and Open America House/Senate/Governor.
- Fetch 2026 Census state GeoJSON.
- Cache last good responses in memory and on disk; preserve stale data on provider failure.
- No credentials.

### Task 3: Geographic SVG map
- Fetch `/api/map/states` automatically.
- Render Census GeoJSON as clickable SVG state polygons using a local projection helper with Alaska/Hawaii insets.
- Color states by current loaded result, preserve battleground outlines, tooltips, state inspector, and manual overrides.

### Task 4: Zero-configuration automatic mode
- Default polling to `/api/live/results` every 60 seconds while using localhost.
- Show provider health and pre-election armed state before November 3 results begin.
- Keep custom JSON endpoint as an Advanced option rather than required setup.

### Task 5: Source center and docs
- Add civicAPI, watch.vote and Open America to source catalog with exact roles/limitations.
- Explain AP/DDHQ credential limitations and built-in automatic sources.
- Update README and sample workflow.

### Task 6: Verification
- Run Node tests, syntax checks, local server smoke tests, route fixture tests, and ZIP integrity.
