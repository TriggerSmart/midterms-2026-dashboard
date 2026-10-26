# 2026 Midterms Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable local 2026 midterms election-night dashboard with interactive map, live/news source panels, and persistent dockable YouTube workspace.

**Architecture:** A hash-routed single-page application keeps the video workspace alive across pages. Static cycle metadata lives in `data.js`; `app.js` manages local state, persistence, data adapters, rendering, map interactions and video windows.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, localStorage, YouTube iframe embeds, fetch.

**Spec:** `docs/design.md`

## Global Constraints
- Plain HTML/CSS/JS only; no build step, backend, database, login, or hosting requirement.
- Must work when opened directly as `file://.../index.html`.
- External live data must degrade gracefully when CORS, embed policy, or connectivity blocks it.
- Results must identify connected/manual/demo provenance.

## Review Focus
- Invalid YouTube URLs must not break the workspace.
- localStorage unavailable/corrupt must not prevent startup.
- Remote feed failures must show fallback content rather than blank panels.
- Imported result JSON must reject malformed records and preserve existing good state.
- Video windows must remain usable at narrow viewport widths.

---

### Task 1: Static shell and cycle data
**Files:** Create `index.html`, `styles.css`, `data.js`; Test `tests/core.test.js`
**Interfaces:** Produces `window.MIDTERM_DATA` and DOM anchors consumed by app.js.
- [ ] Write tests for cycle metadata, all 50 states + DC layout, source/channel records.
- [ ] Run tests and verify failure.
- [ ] Implement shell, styles, and data.
- [ ] Run tests and verify pass.

### Task 2: App state, navigation, dashboard and map
**Files:** Create `app.js`; Modify `index.html`; Test `tests/core.test.js`
**Interfaces:** Produces `MidtermsApp` helpers for parsing/import/render state.
- [ ] Add tests for state normalization, seat summaries and JSON validation.
- [ ] Run tests and verify failure.
- [ ] Implement state/persistence/hash navigation/dashboard/map/manual result editing/import/polling.
- [ ] Run tests and verify pass.

### Task 3: Persistent video workspace, news, sources, ticker and notes
**Files:** Modify `app.js`, `styles.css`; Test `tests/core.test.js`
**Interfaces:** Consumes source/channel data; persists videos, notes, feed config.
- [ ] Add tests for YouTube ID parsing and ticker/feed normalization.
- [ ] Run tests and verify failure.
- [ ] Implement video add/dock/float/resize/minimize/fullscreen, network presets, news RSS fallback, source center, notes and ticker.
- [ ] Run tests and verify pass.

### Task 4: Verification and packaging
**Files:** Create `README.md`; optional `tests/smoke.html`
- [ ] Run Node tests and static syntax checks.
- [ ] Launch with a local browser-compatible server only for smoke testing; verify direct-file-safe code paths.
- [ ] Package the folder as ZIP.
