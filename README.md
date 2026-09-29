# RotundaSim

Precision geometric roundabout alignment & microscopic traffic simulator. Browser-based, GIS-backed, single HTML page + JS.

> **Disclaimer**: not based on real traffic engineering studies or data. It's a simplified what-if visualizer for exploring how a rotunda layout might look/behave at a location — not a validated traffic model.

## Features

- **GIS map base**: Leaflet map, location search. Only Esri Satellite tile layer supported (Carto Light/Dark, OSM Standard buttons present but not supported).
- **Rotunda geometry controls**: outer radius, central island radius, ring lane count (1-3), approach leg count (3-6, T/Y/Cross/Star/Hex), global rotation angle (slider or drag the amber handle on the ring, shown when rotunda selected).
- **Placement**: drag center marker, or "Click map to move" mode to reposition continuously.
- **Driving standard**: toggle Right-Hand (RHT) / Left-Hand (LHT) traffic rules.
- **Per-leg alignment**: per-leg angle offset, width, length, drag-to-resize leg length and width handles (shown when rotunda selected) — dragging the length handle also sets the leg's angle by pointing it at the cursor (hold Shift to adjust length only), global all-legs width slider (shown when rotunda selected), flow mode (one-way / two-way), spawn weight, exit preference.
- **Click-to-highlight**: clicking the outer ring or central island highlights the Global Dimensions settings card; clicking an approach leg highlights that leg's own card — both scroll into view.
- **Guide lines** toggle for alignment overlay.
- **Traffic flow tuning**: global vehicle spawn rate, target free-flow speed, per-leg inflow demand level.
- **Rush hour scenario presets**: AM Rush, PM Rush, Arterial Corridor, Off-Peak Balanced — apply directional demand patterns across legs in one click.
- **Live microscopic simulation**: cars and pedestrians spawn, circulate ring, yield at entries, exit legs. Pause/resume simulation.
- **Live Metrics HUD**: total throughput, avg queue delay, active cars, active pedestrians, ring capacity utilization bar.
- **Save/load library**: save up to 5 named rotunda configurations (geometry + flow) to localStorage, update or save-as-new, delete with confirmation, most-recent-first list.
- **Shareable links**: encode the current rotunda config into a URL parameter to share a specific layout without a backend.
- **Default location** bookmark, reset storage option.
- Built-in preset: McKinley Rd & 5th Ave Junction.

## Stack

Static HTML + vanilla JS (app.js). Tailwind CSS (precompiled static `styles.css`, regenerate with `npx tailwindcss@3 -i ./input.css -o ./styles.css --minify` after changing classes — see `tailwind.config.js`), Leaflet.js (CDN), Font Awesome (CDN). No build step at deploy time, no backend — open [index.html](index.html) in browser, or run `./run.sh` to serve it locally.

## Files

- [index.html](index.html) — markup, UI, styles
- [app.js](app.js) — simulation logic, map, state, storage
- [run.sh](run.sh) — local dev server helper
- [CLAUDE.md](CLAUDE.md) — architecture notes for AI coding agents working in this repo
