# 2026 Midterms Command Center Design

Portable static election-night dashboard for November 3, 2026. Runs directly from index.html with no server, database, login, or build step. Internet is used only for live external media/news/source links.

## Goals
- OSINT-style homepage with election clock, chamber status, race watch board, news feed, network live feeds, interactive mini-map, source health, notes, and ticker.
- Dedicated interactive state map view with state drill-down and live/manual result coloring.
- Persistent YouTube video workspace supporting user-added URLs, resize, float, dock-right/dock-left, minimize, fullscreen, and persistence across internal pages.
- News/source center with major outlets, official election links, and user-added feeds.
- Data adapter supporting demo/pre-election data, manual per-state updates, JSON import, and optional CORS-enabled JSON URL polling.
- Everything stored in localStorage; no database.

## Constraints
- Plain HTML, CSS, JavaScript only.
- No login.
- No hosting required; open index.html directly.
- Do not claim third-party vote data is live unless a working source is connected.
- External sites may block iframe embedding; provide open-source buttons and graceful errors.

## Architecture
- Single-page app with hash navigation so the persistent video workspace survives page changes.
- data.js holds static 2026 cycle metadata, battlegrounds, source links, channel IDs, and state layout.
- app.js owns state, localStorage persistence, navigation, rendering, feed polling, map interactions, video windows, notes, and imports.
- styles.css provides responsive dark OSINT styling.

## Data approach
- Built-in 2026 structural facts and battleground watchlists are labeled as pre-election reference.
- Election-night results can enter by manual state update, JSON file import, pasted JSON, or a user-configured CORS-enabled endpoint.
- News headlines use a Google News RSS request through a configurable RSS-to-JSON proxy, with static/source-link fallback.
