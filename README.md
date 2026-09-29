# RotundaSim

Precision geometric roundabout alignment & microscopic traffic simulator. Browser-based, GIS-backed, single HTML page + JS.

## Features

- **GIS map base**: Leaflet map, location search, switchable tile layers (Carto Light, Esri Satellite, Carto Dark, OSM Standard).
- **Rotunda geometry controls**: outer radius, central island radius, ring lane count (1-3), approach leg count (3-6, T/Y/Cross/Star/Hex), global rotation angle.
- **Placement**: drag center marker, or "Click map to move" mode to reposition continuously.
- **Driving standard**: toggle Right-Hand (RHT) / Left-Hand (LHT) traffic rules.
- **Per-leg alignment**: per-leg angle offset, width, length, drag-to-resize leg length and width handles (shown when rotunda selected), global all-legs width slider (shown when rotunda selected), flow mode (one-way / two-way), spawn weight, exit preference.
- **Guide lines** toggle for alignment overlay.
- **Traffic flow tuning**: global vehicle spawn rate, target free-flow speed, per-leg inflow demand level.
- **Rush hour scenario presets**: AM Rush, PM Rush, Arterial Corridor, Off-Peak Balanced — apply directional demand patterns across legs in one click.
- **Live microscopic simulation**: cars and pedestrians spawn, circulate ring, yield at entries, exit legs. Pause/resume simulation.
- **Live Metrics HUD**: total throughput, avg queue delay, active cars, active pedestrians, ring capacity utilization bar.
- **Save/load library**: save up to 5 named rotunda configurations (geometry + flow) to localStorage, update or save-as-new, delete with confirmation, most-recent-first list.
- **Default location** bookmark, reset storage option.
- Built-in preset: McKinley Rd & 5th Ave Junction.

## Stack

Static HTML + vanilla JS (app.js). Tailwind CSS (CDN), Leaflet.js (CDN), Font Awesome (CDN). No build step, no backend — open [index.html](index.html) in browser.

## Files

- [index.html](index.html) — markup, UI, styles
- [app.js](app.js) — simulation logic, map, state, storage
