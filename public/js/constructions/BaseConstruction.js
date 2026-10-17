export class BaseConstruction extends L.Layer {
  constructor(polygonLatLngs, options = {}) {
    super();
    // Accept [[lat,lng],...] or [L.LatLng,...]
    this._polygonLatLngs = polygonLatLngs.map(p =>
      Array.isArray(p) ? L.latLng(p[0], p[1]) : L.latLng(p)
    );
    this._bounds = L.latLngBounds(this._polygonLatLngs);
    this._options = {
      buildingRatio: 0.75,
      ...this.defaultOptions(),
      ...options
    };
    this._selected = false;
    this._container = null;
    this._svg = null;
    this._polygonSVGPoints = null;
    this.id = options.id || crypto.randomUUID();
    this.name = options.name || this.typeName();
    this._moving = false;
    this._moveStart = null;
    this._moveStartPolygon = null;
  }

  defaultOptions() { return {}; }
  typeName()  { return 'Construcción'; }
  typeColor() { return '#666'; }
  typeIcon()  { return '🏗'; }

  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'construction-overlay';

    this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._svg.style.overflow = 'visible';
    this._container.appendChild(this._svg);

    map.getPanes().overlayPane.appendChild(this._container);
    map.on('zoomend viewreset', this._update, this);

    this._svg.addEventListener('mousedown', this._onMouseDown.bind(this));
    this._svg.addEventListener('click', e => {
      e.stopPropagation();
      this.fire('click', { originalEvent: e });
    });

    this._update();
    return this;
  }

  onRemove(map) {
    if (this._container?.parentNode) this._container.parentNode.removeChild(this._container);
    map.off('zoomend viewreset', this._update, this);
    this._map = null;
  }

  _update() {
    if (!this._map || !this._container) return;

    // Bounding box of the polygon
    this._bounds = L.latLngBounds(this._polygonLatLngs);

    const nwPx = this._map.latLngToLayerPoint(this._bounds.getNorthWest());
    const sePx = this._map.latLngToLayerPoint(this._bounds.getSouthEast());
    const size  = sePx.subtract(nwPx);

    L.DomUtil.setPosition(this._container, nwPx);

    const pxW = Math.max(size.x, 2);
    const pxH = Math.max(size.y, 2);
    this._svg.setAttribute('width',  pxW);
    this._svg.setAttribute('height', pxH);

    const wM = this._map.distance(this._bounds.getNorthWest(), this._bounds.getNorthEast());
    const hM = this._map.distance(this._bounds.getNorthWest(), this._bounds.getSouthWest());

    this._wM  = Math.max(wM, 1);
    this._hM  = Math.max(hM, 1);
    this._pxW = pxW;
    this._pxH = pxH;

    this._svg.setAttribute('viewBox', `0 0 ${this._wM.toFixed(2)} ${this._hM.toFixed(2)}`);

    // Convert polygon vertices to SVG metre-space
    this._polygonSVGPoints = this._polygonLatLngs.map(ll => {
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

  // ---- Public API ----

  setPolygon(latlngs) {
    this._polygonLatLngs = latlngs.map(p =>
      Array.isArray(p) ? L.latLng(p[0], p[1]) : L.latLng(p)
    );
    this._update();
  }

  // Scale the polygon proportionally to fit a new bounding box
  scaleToNewBounds(newBounds) {
    const nb = L.latLngBounds(newBounds);
    const ob = this._bounds;
    const dLat = ob.getNorth() - ob.getSouth();
    const dLng = ob.getEast()  - ob.getWest();

    this._polygonLatLngs = this._polygonLatLngs.map(ll => {
      const tLat = dLat > 1e-9 ? (ll.lat - ob.getSouth()) / dLat : 0.5;
      const tLng = dLng > 1e-9 ? (ll.lng - ob.getWest())  / dLng : 0.5;
      return L.latLng(
        nb.getSouth() + tLat * (nb.getNorth() - nb.getSouth()),
        nb.getWest()  + tLng * (nb.getEast()  - nb.getWest())
      );
    });
    this._update();
  }

  // Keep setBounds for compatibility (handle drags)
  setBounds(bounds) { this.scaleToNewBounds(bounds); }

  getBounds()  { return this._bounds; }
  getPolygon() { return this._polygonLatLngs; }

  setSelected(sel) { this._selected = sel; this._update(); }

  setOption(key, val) { this._options[key] = val; this._update(); }

  // ---- Drag to move ----
  _onMouseDown(e) {
    if (!this._selected || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    this._moving = true;
    this._moveStart = this._map.containerPointToLatLng(
      this._map.mouseEventToContainerPoint(e)
    );
    // Deep copy polygon for rollback
    this._moveStartPolygon = this._polygonLatLngs.map(ll => L.latLng(ll.lat, ll.lng));
    this._map.dragging.disable();

    const onMove = ev => {
      if (!this._moving) return;
      const cur = this._map.containerPointToLatLng(
        this._map.mouseEventToContainerPoint(ev)
      );
      const dLat = cur.lat - this._moveStart.lat;
      const dLng = cur.lng - this._moveStart.lng;
      this.setPolygon(this._moveStartPolygon.map(ll =>
        L.latLng(ll.lat + dLat, ll.lng + dLng)
      ));
    };

    const onUp = () => {
      this._moving = false;
      this._map.dragging.enable();
      this.fire('moveend', {
        oldPolygon: this._moveStartPolygon,
        newBounds:  this._bounds
      });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ---- Default render ----
  _render(wM, hM, zoom) {
    const clipId = this._setupClipPath(wM, hM);
    const g = this._el('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(this._rect(0, 0, wM, hM, this.typeColor()));
    this._svg.appendChild(g);
    this._renderLotBorder(wM, hM);
    this._selectionBorder(wM, hM);
  }

  // ---- SVG primitives ----
  _el(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  _rect(x, y, w, h, fill, stroke = 'none', sw = 0, extra = {}) {
    return this._el('rect', { x, y, width: w, height: h, fill, stroke, 'stroke-width': sw, ...extra });
  }

  _line(x1, y1, x2, y2, stroke, sw, extra = {}) {
    return this._el('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw, ...extra });
  }

  _text(x, y, content, size, fill = '#fff', anchor = 'middle') {
    const t = this._el('text', {
      x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle',
      fill, 'font-size': size, 'font-family': 'Arial, sans-serif', 'font-weight': '600'
    });
    t.textContent = content;
    return t;
  }

  _poly(points, fill, stroke = 'none', sw = 0, extra = {}) {
    const pts = points.map(([x, y]) => `${x},${y}`).join(' ');
    return this._el('polygon', { points: pts, fill, stroke, 'stroke-width': sw, ...extra });
  }

  // ---- Lot polygon system ----

  // Returns the SVG polygon points for the lot (the drawn polygon, in metre-space)
  _getLotPoints(wM, hM) {
    if (this._polygonSVGPoints?.length >= 3) return this._polygonSVGPoints;
    return [[0, 0], [wM, 0], [wM, hM], [0, hM]];
  }

  _setupClipPath(wM, hM) {
    const clipId = `clip-${this.id.replace(/-/g, '')}`;
    const defs     = this._el('defs', {});
    const clipPath = this._el('clipPath', { id: clipId });
    clipPath.appendChild(this._poly(this._getLotPoints(wM, hM), 'white'));
    defs.appendChild(clipPath);
    this._svg.appendChild(defs);
    return clipId;
  }

  // Building footprint rectangle, centred on the polygon centroid
  _buildingBounds(wM, hM) {
    const ratio = Math.min(0.97, Math.max(0.10, this._options.buildingRatio ?? 0.75));
    const pts = this._getLotPoints(wM, hM);
    const cx  = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy  = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const minX = Math.min(...pts.map(p => p[0]));
    const maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1]));
    const maxY = Math.max(...pts.map(p => p[1]));
    const bW = (maxX - minX) * ratio;
    const bH = (maxY - minY) * ratio;
    return { x: cx - bW / 2, y: cy - bH / 2, w: bW, h: bH };
  }

  // Garden: green fill clipped to lot polygon
  _renderGardenBase(wM, hM, clipId) {
    const g = this._el('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(this._rect(0, 0, wM, hM, '#1e4525'));
    const stride = Math.max(0.8, Math.min(wM, hM) * 0.05);
    for (let i = 0; i * stride < hM; i++) {
      g.appendChild(this._line(0, i * stride, wM, i * stride, 'rgba(45,115,45,0.32)', 0.15));
    }
    this._svg.appendChild(g);
  }

  // Walkways + corner trees in the garden residual area
  _renderGardenDetails(wM, hM, bX, bY, bW, bH, clipId, zoom) {
    if (zoom < 16) return;
    const g = this._el('g', { 'clip-path': `url(#${clipId})` });
    const pathColor = 'rgba(195,175,130,0.55)';
    const pathW = Math.max(0.4, Math.min(bX, bY) * 0.45, Math.min(wM, hM) * 0.035);
    const hp = pathW / 2;

    if (bY > pathW * 1.5)          g.appendChild(this._rect(wM/2 - hp, 0, pathW, bY, pathColor));
    if (hM - bY - bH > pathW * 1.5) g.appendChild(this._rect(wM/2 - hp, bY + bH, pathW, hM - bY - bH, pathColor));
    if (bX > pathW * 1.5)          g.appendChild(this._rect(0, hM/2 - hp, bX, pathW, pathColor));
    if (wM - bX - bW > pathW * 1.5) g.appendChild(this._rect(bX + bW, hM/2 - hp, wM - bX - bW, pathW, pathColor));

    if (zoom >= 17) {
      const r = Math.min(bX, bY) * 0.28;
      if (r >= 0.5) {
        for (const [cx, cy] of [
          [bX * 0.42, bY * 0.42], [wM - bX * 0.42, bY * 0.42],
          [bX * 0.42, hM - bY * 0.42], [wM - bX * 0.42, hM - bY * 0.42]
        ]) this._drawTreeInGroup(g, cx, cy, r);
      }
    }
    this._svg.appendChild(g);
  }

  _drawTreeInGroup(g, cx, cy, r) {
    g.appendChild(this._rect(cx - r * 0.15, cy, r * 0.3, r * 0.5, '#5c3d1e'));
    g.appendChild(this._el('circle', { cx, cy: cy - r * 0.1, r: r * 0.7,  fill: '#2d6e30', opacity: '0.5' }));
    g.appendChild(this._el('circle', { cx: cx - r * 0.15, cy: cy - r * 0.4, r: r * 0.6, fill: '#3a8c3e' }));
    g.appendChild(this._el('circle', { cx: cx + r * 0.15, cy: cy - r * 0.3, r: r * 0.55, fill: '#4aac4e' }));
  }

  // Lot polygon boundary line
  _renderLotBorder(wM, hM) {
    const pts = this._getLotPoints(wM, hM);
    const sw  = Math.max(0.2, Math.min(wM, hM) * 0.018);
    this._svg.appendChild(this._poly(pts, 'none', 'rgba(205,180,115,0.65)', sw));
  }

  // Yellow selection highlight follows the lot polygon
  _selectionBorder(wM, hM) {
    if (!this._selected) return;
    const pts = this._getLotPoints(wM, hM);
    const sw  = Math.max(0.3, Math.max(wM, hM) * 0.012);
    this._svg.appendChild(this._poly(pts, 'none', '#ffcc00', sw));
  }

  getLabelFontSize(wM, hM) {
    return Math.min(wM * 0.1, hM * 0.15, 5);
  }

  toJSON() {
    return {
      type:    this.constructor.name,
      id:      this.id,
      name:    this.name,
      polygon: this._polygonLatLngs.map(ll => [ll.lat, ll.lng]),
      options: this._options
    };
  }
}
