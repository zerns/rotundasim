# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit rules

- **Never add a `Co-Authored-By` line (or any AI-attribution footer) to git commit messages.**

## What this is

RotundaSim: a browser-only, GIS-backed roundabout geometry & microscopic traffic simulator. Single HTML page + one large vanilla-JS file. Not a validated traffic model — a what-if visualizer.

## Commands

- Run locally: `./run.sh` (serves the folder on `http://localhost:8111` via `python3 -m http.server`), or just open `index.html` directly in a browser. No build step, no backend, no package.json/test suite.
- After changing any Tailwind class in `index.html`/`app.js`, regenerate the precompiled stylesheet: `npx tailwindcss@3 -i ./input.css -o ./styles.css --minify` (config in `tailwind.config.js`). `styles.css` is checked in and must stay in sync — there is no watch/build step at deploy time.
- No lint or test commands exist in this repo.

## Architecture

Everything lives in two files: `index.html` (markup/UI/Tailwind classes) and `app.js` (all logic, ~2450 lines, wrapped in a single closure with module-level `let`/`const` state — no modules, no framework, no classes).

### State model
- `appState` is the single source of truth for the current rotunda: center lat/lng, `outerRadiusMeters`, `islandRadiusMeters`, `ringLanes`, `legCount`, `globalAngleOffset`, `trafficStandard` (RHT/LHT), flow-rate settings, and an `appState.legs` array (each leg: `baseAngle`, `angleOffset`, `widthMeters`, `lengthMeters`, `flowMode`, `spawnWeight`, `exitPreference`).
- Persistence is all `localStorage`, no server: `rotundasim_config` (current working state, autosaved via `saveStateToLocalStorage`), `rotundasim_saved_list` (up to 5 named saved rotundas, `saveSavedRotundasToStorage`/`loadSavedRotundas`). `DEFAULT_PRESET_LIST` at the top of `app.js` seeds a built-in preset (McKinley Rd & 5th Ave) shown alongside user saves.
- Sharing: `encodeShareConfig`/`decodeShareConfig` + `toSharePayload`/`validateSharedState` pack a rotunda config into an XOR-obfuscated base64url URL parameter (`buildShareLink`) so configs can be shared without a backend.

### Map + canvas rendering (two overlapping layers)
- Leaflet (`initMap`) provides the GIS base map, tile layer, geocoding search, and center-marker drag.
- A separate HTML5 `<canvas>` (`initCanvas`/`syncCanvasSizeAndRender`) is drawn on top of the map, positioned in the same container, and redrawn every `render()` call — this canvas is where the rotunda ring, legs, crosswalks, yield markings, drag handles, and vehicle agents are actually drawn. Map pan/zoom (`move resize zoom`) triggers `syncCanvasSizeAndRender` to keep it aligned.
- Coordinate conversion between meters and screen pixels always goes through `getPixelRadius(latLng, radiusMeters)` (projects an offset lat/lng and measures the resulting pixel distance) — never assume a fixed meters-per-pixel constant, since it depends on map zoom/latitude.
- All leg geometry is computed relative to rotated local coordinates: `totalAngleDeg = leg.baseAngle + leg.angleOffset + appState.globalAngleOffset`, then rotate by that angle around the rotunda center. This same rotation math is duplicated across `findLegAtPoint`, `render`'s leg-drawing loop, and drag-handle hit-testing — keep them consistent if you touch the angle formula.
- Hit-testing for interactive elements (leg tips, width handles, rotate handle, leg body) is done by point-in-shape math against points recorded during the last `render()` pass (`legTipPoints`, `widthHandlePoints`, `rotateHandlePoint`), not DOM elements — the canvas has no per-leg DOM nodes.

### UI sync pattern
- The right-hand settings panel is tabbed (`bindUIControls`, tabs: Geometry, Flow, Saved). Per-leg controls are **not static HTML** — `renderPerLegUIControls()` rebuilds `#per-leg-controls-container`'s `innerHTML` from scratch on every call (called from ~7 places whenever legs change: leg count change, rush-hour scenario apply, flow-mode button clicks, etc.). Any UI state tied to a specific leg card (e.g. selection highlighting) must be re-derived from module state inside this function, not set imperatively on the DOM node afterward, or it will be wiped on the next rebuild.
- Global (non-per-leg) sliders/toggles are static HTML elements updated in place via small `updateXUI()` helpers (`updateGlobalAngleUI`, `updateLegLengthUI`, etc.) rather than being rebuilt.
- `rotundaSelected` (whole-rotunda selection, toggled by clicking the rotunda/legs on the map) gates visibility of drag handles and the global leg-width slider (`updateGlobalLegWidthVisibility`).

### Simulation loop
- `animate(now)` runs on `requestAnimationFrame`, calling `updateSimulation(dt)` (vehicle spawning via `spawnVehicle`, movement/yielding logic, ring capacity via `getRingCapacity`/`laneCapacity`) and then `render()`. `appState.simulationRunning` pauses/resumes it. `updateHUD` reflects live throughput/queue/utilization metrics.
- Vehicle path math (`getRingArc`, `computePathMetrics`, `phaseLengthPx`, `getVehiclePosition`) treats each car's journey as phases (entry leg → ring arc → exit leg) parameterized by a 0–1 `progress` value.
