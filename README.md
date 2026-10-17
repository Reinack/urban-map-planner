# Urban Map Planner

> 2D urban planning tool built on a real interactive map. Draw buildings, roads, and green areas over live OpenStreetMap data — with automatic collision detection against existing streets via the Overpass API.

---

## Features

- **5 construction types** — Tower, Building, Green Area, Parking Lot, Proposed Road
- **Real road data** — Queries the Overpass API to fetch actual streets for the visible area
- **Collision detection** — Warns immediately if a new construction overlaps an existing road
- **Geolocation** — Auto-centers on your current location on first load
- **30-step undo stack** — Full undo support for all placement actions
- **Vertex snapping** — Snap to close polygons with a single click near the first vertex
- **Save / Load** — Persists your project in localStorage across sessions
- **No build step** — Pure ES6 modules, no bundler required

---

## How It Works

### Drawing

Select a construction type from the sidebar, then click the map to place polygon vertices. Double-click or press `Enter` to close the shape. Press `Escape` to cancel. Roads are drawn as open polylines (multi-point paths).

### Collision Detection with Real Streets

When you finish drawing a construction, the app queries the **Overpass API** for actual road data in the current viewport. It then runs computational geometry to check whether your polygon overlaps any existing road:

- **Segment intersection** — cross product method to detect edge crossings
- **Point-in-polygon** — ray casting algorithm to detect containment

If a collision is found, the construction is rejected with a visual warning.

The `OsmRoadsService` is optimized to avoid unnecessary network requests:
- **~1 km grid cache** — tiles the map into ~1 km cells; a cache hit is returned instantly
- **In-flight deduplication** — concurrent requests for the same cell share a single fetch
- **300 m buffer expansion** — bounds are padded before caching to cover nearby pans

---

## Construction Types

| Icon | Type | Description |
|------|------|-------------|
| 🏢 | **Torre** | High-rise building with perimeter garden |
| 🏗 | **Edificio** | General building with garden setback |
| 🌳 | **Área Verde** | Park, plaza, or green space |
| 🅿 | **Estacionamiento** | Parking lot with internal lanes |
| 🛣 | **Vía propuesta** | New street or avenue (free polygon) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Map | [Leaflet 1.9.4](https://leafletjs.com/) + OpenStreetMap tiles |
| Road data | [Overpass API](https://overpass-api.de/) |
| Frontend | Vanilla JavaScript (ES6 modules) |
| Server | Node.js 18 + Express (static file server only) |
| Persistence | `localStorage` |

No database. No authentication. No external UI framework.

---

## Project Structure

```
urban-map-planner/
├── server.js                      # Express static server
├── package.json
└── public/
    ├── index.html                 # Single-page app shell
    ├── css/style.css
    └── js/
        ├── app.js                 # Entry point — wires up all managers
        ├── MapManager.js          # Leaflet init, OSM tiles, geolocation
        ├── ConstructionManager.js # Polygon drawing, undo stack, collision checks, CRUD
        ├── UIManager.js           # Toolbar, sidebar, toast notifications
        ├── constructions/
        │   ├── registry.js        # Central type registry
        │   ├── BaseConstruction.js
        │   ├── Building.js
        │   ├── Tower.js
        │   ├── GreenArea.js
        │   ├── ParkingLot.js
        │   └── Road.js
        └── services/
            └── OsmRoadsService.js # Overpass API client with grid cache
```

---

## Getting Started

```bash
git clone https://github.com/Reinack/urban-map-planner.git
cd urban-map-planner
npm install
npm start
```

Open **http://localhost:3000** — no environment variables or database setup required.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Close polygon / confirm road |
| `Escape` | Cancel current drawing |
| `Ctrl + Z` | Undo last action |
| `S` | Switch to select tool |
| `Delete` | Delete selected construction |

---

## License

MIT
