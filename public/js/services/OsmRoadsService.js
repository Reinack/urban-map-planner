// ---- Geometry helpers ----

function cross(O, A, B) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ---- Overpass API service ----

export class OsmRoadsService {
  constructor() {
    this._cache = new Map();
    this._pending = new Map(); // deduplicates in-flight requests
  }

  // Coarse cache key (~1km grid)
  _cacheKey(bounds) {
    const r = v => (Math.floor(v * 100) / 100).toFixed(2);
    return `${r(bounds.getSouth())},${r(bounds.getWest())},${r(bounds.getNorth())},${r(bounds.getEast())}`;
  }

  // Expand bounds by ~200m buffer so nearby cache hits work
  _expandBounds(bounds) {
    const d = 0.003; // ~300m in degrees
    return L.latLngBounds(
      [bounds.getSouth() - d, bounds.getWest() - d],
      [bounds.getNorth() + d, bounds.getEast() + d]
    );
  }

  // Fetch road polylines for the given bounds.
  // Returns array of [{lat, lng}] polylines, or null on error.
  async fetchRoads(bounds) {
    const exp = this._expandBounds(bounds);
    const key = this._cacheKey(exp);

    if (this._cache.has(key)) return this._cache.get(key);

    // Deduplicate concurrent requests for the same key
    if (this._pending.has(key)) return this._pending.get(key);

    const bbox = `${exp.getSouth()},${exp.getWest()},${exp.getNorth()},${exp.getEast()}`;
    // Query real streets: roads and streets, excluding pedestrian-only paths
    const query = `[out:json][timeout:15];`
      + `way["highway"]["highway"!~"^(footway|path|steps|cycleway|track|corridor)$"](${bbox});`
      + `(._;>;);out body;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const promise = (async () => {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const nodes = {};
        for (const el of data.elements) {
          if (el.type === 'node') nodes[el.id] = { lat: el.lat, lng: el.lon };
        }

        const roads = [];
        for (const el of data.elements) {
          if (el.type === 'way') {
            const pts = el.nodes.map(id => nodes[id]).filter(Boolean);
            if (pts.length >= 2) roads.push(pts);
          }
        }

        this._cache.set(key, roads);
        return roads;
      } catch (err) {
        console.warn('[OsmRoadsService] Fetch failed:', err.message);
        return null;
      } finally {
        this._pending.delete(key);
      }
    })();

    this._pending.set(key, promise);
    return promise;
  }

  // Returns true if the given polygon (array of L.LatLng) intersects any road.
  intersectsRoads(polygonLatLngs, roads) {
    if (!roads || roads.length === 0) return false;

    // Work in {x: lng, y: lat} space (fine for small areas)
    const polyPts = polygonLatLngs.map(ll => ({ x: ll.lng, y: ll.lat }));
    const n = polyPts.length;

    for (const road of roads) {
      const roadPts = road.map(p => ({ x: p.lng, y: p.lat }));

      // 1. Polygon edge vs road segment intersection
      for (let i = 0; i < n; i++) {
        const pa = polyPts[i], pb = polyPts[(i + 1) % n];
        for (let j = 0; j < roadPts.length - 1; j++) {
          if (segmentsIntersect(pa, pb, roadPts[j], roadPts[j + 1])) return true;
        }
      }

      // 2. Any road node inside the polygon
      for (const rp of roadPts) {
        if (pointInPolygon(rp, polyPts)) return true;
      }
    }

    return false;
  }
}
