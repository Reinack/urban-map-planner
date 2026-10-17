import { BaseConstruction } from './BaseConstruction.js';

const LANE_W = 3.5;  // metres per traffic lane
const SDWK_W = 1.2;  // sidewalk width each side (metres)

export class Road extends BaseConstruction {
  defaultOptions() { return { lanes: 2, color: '#2d2d3a', smooth: true }; }
  typeName()  { return 'Vía propuesta'; }
  typeColor() { return '#2d2d3a'; }
  typeIcon()  { return '🛣'; }

  _roadW() {
    return Math.max(1, this._options.lanes) * LANE_W + SDWK_W * 2;
  }

  // ── Override _update: use a padded bounding box ─────────────────────────
  // A near-horizontal or near-vertical road would otherwise have a near-zero
  // SVG height / width, making it invisible and unclickable.
  _update() {
    if (!this._map || !this._container) return;

    const pts = this._polygonLatLngs;
    if (!pts || pts.length === 0) return;

    // True road bounds (used for getBounds / collision checks)
    this._bounds = L.latLngBounds(pts);

    // Expand SVG container by half road-width + 3 m safety margin
    const halfW  = this._roadW() / 2 + 3;
    const cLat   = this._bounds.getCenter().lat;
    const padLat = halfW / 111320;
    const padLng = halfW / (111320 * Math.cos(cLat * Math.PI / 180));

    const padded = L.latLngBounds(
      [this._bounds.getSouth() - padLat, this._bounds.getWest()  - padLng],
      [this._bounds.getNorth() + padLat, this._bounds.getEast()  + padLng]
    );

    const nwPx = this._map.latLngToLayerPoint(padded.getNorthWest());
    const sePx = this._map.latLngToLayerPoint(padded.getSouthEast());
    const size  = sePx.subtract(nwPx);

    L.DomUtil.setPosition(this._container, nwPx);

    const pxW = Math.max(size.x, 10);
    const pxH = Math.max(size.y, 10);
    this._svg.setAttribute('width',  pxW);
    this._svg.setAttribute('height', pxH);

    const wM = this._map.distance(padded.getNorthWest(), padded.getNorthEast());
    const hM = this._map.distance(padded.getNorthWest(), padded.getSouthWest());
    this._wM  = Math.max(wM, 1);
    this._hM  = Math.max(hM, 1);
    this._pxW = pxW;
    this._pxH = pxH;

    this._svg.setAttribute('viewBox', `0 0 ${this._wM.toFixed(2)} ${this._hM.toFixed(2)}`);

    // Map each centerline waypoint into the padded SVG metre-space
    this._polygonSVGPoints = pts.map(ll => {
      const pt = this._map.latLngToLayerPoint(ll);
      return [
        (pt.x - nwPx.x) * (this._wM / pxW),
        (pt.y - nwPx.y) * (this._hM / pxH)
      ];
    });

    while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);
    this._render(this._wM, this._hM, this._map.getZoom());
    this.fire('updated');
  }

  // ── Road rendering ──────────────────────────────────────────────────────
  _render(wM, hM, zoom) {
    const pts = this._polygonSVGPoints;
    if (!pts || pts.length < 2) return;

    const { lanes, color, smooth } = this._options;
    const rW       = this._roadW();
    const surfaceW = rW - SDWK_W * 2;
    const laneW    = surfaceW / Math.max(1, lanes);

    const d = (smooth !== false && pts.length >= 3)
      ? this._catmullPath(pts)
      : this._polyPath(pts);

    const mkPath = (sw, stroke, extra = {}) =>
      this._el('path', {
        d, fill: 'none', stroke,
        'stroke-width':    sw,
        'stroke-linecap':  'round',
        'stroke-linejoin': 'round',
        ...extra
      });

    // 1. Selection glow (below everything)
    if (this._selected) {
      this._svg.appendChild(mkPath(rW + 1.2, '#ffcc00', { opacity: '0.35' }));
    }

    // 2. Sidewalk / curb strip
    this._svg.appendChild(mkPath(rW, '#b5a880'));

    // 3. White edge-line effect: slightly wider than surface → hair-thin strips visible
    this._svg.appendChild(mkPath(surfaceW + 0.30, 'rgba(255,255,255,0.80)'));

    // 4. Road asphalt surface
    this._svg.appendChild(mkPath(surfaceW, color));

    // 5. Lane markings (zoom ≥ 16)
    if (zoom >= 16) {
      const dLen = laneW * 0.55;
      const gLen = laneW * 0.35;

      if (lanes === 1) {
        // Single-lane: dashed centre guidance line
        this._svg.appendChild(mkPath(0.18, 'rgba(255,255,255,0.60)', {
          'stroke-dasharray': `${dLen} ${gLen}`,
          'stroke-linecap':   'butt'
        }));
      } else {
        // Double solid yellow centre line (opposing-traffic separator)
        this._svg.appendChild(mkPath(0.42, '#e8c820', {
          'stroke-linecap': 'butt', opacity: '0.90'
        }));
        // Gap between the twin yellow lines
        this._svg.appendChild(mkPath(0.16, color, { 'stroke-linecap': 'butt' }));

        // Dashed white lane dividers within each half (4+ lanes)
        if (lanes >= 4) {
          this._svg.appendChild(mkPath(0.16, 'rgba(255,255,255,0.65)', {
            'stroke-dasharray': `${dLen} ${gLen}`,
            'stroke-linecap':   'butt'
          }));
        }
      }
    }

    // 6. Road name label at mid-waypoint
    if (zoom >= 15 && pts.length >= 2) {
      const mid      = Math.floor((pts.length - 1) / 2);
      const [mx, my] = pts[mid];
      const fs       = Math.max(0.8, Math.min(rW * 0.22, 3.8));
      this._svg.appendChild(
        this._text(mx, my, this.name, fs, 'rgba(210,210,200,0.72)')
      );
    }
  }

  // ── Path builders ────────────────────────────────────────────────────────

  _polyPath(pts) {
    return 'M ' + pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' L ');
  }

  // Catmull-Rom spline → cubic Bézier approximation (smooth through all waypoints)
  _catmullPath(pts) {
    const n = pts.length;
    let d = `M ${pts[0][0].toFixed(3)},${pts[0][1].toFixed(3)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(n - 1, i + 2)];
      const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(3);
      const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(3);
      const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(3);
      const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(3);
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
    }
    return d;
  }

  // ── Stats & configurable properties ─────────────────────────────────────

  getStats() {
    const pts = this._polygonLatLngs;
    let len = 0;
    if (this._map) {
      for (let i = 0; i < pts.length - 1; i++) {
        len += this._map.distance(pts[i], pts[i + 1]);
      }
    }
    const rW = this._roadW();
    return {
      'Carriles':    this._options.lanes,
      'Longitud':    `${len.toFixed(0)} m`,
      'Ancho total': `${rW.toFixed(1)} m`,
      'Superficie':  `${(len * rW).toFixed(0)} m²`
    };
  }

  getExtraProps() {
    return [
      { key: 'lanes',  label: 'Carriles',      type: 'number',   min: 1, max: 8, step: 1 },
      { key: 'smooth', label: 'Curvas suaves',  type: 'checkbox' }
    ];
  }
}
