import { REGISTRY, getRegistryEntry, createFromJSON } from './constructions/registry.js';

const SNAP_PX = 14; // pixels — distance to snap/close polygon on first vertex

export class ConstructionManager extends L.Evented {
  constructor(map, osmService) {
    super();
    this._map        = map;
    this._osm        = osmService;
    this._constructions = new Map();
    this._selected   = null;
    this._handles    = [];
    this._undoStack  = [];
    this._maxUndo    = 30;

    // Polygon drawing state
    this._drawing    = false;
    this._drawType   = null;
    this._drawVerts  = [];       // L.LatLng[]
    this._previewPoly = null;    // L.Polygon (fill preview)
    this._rubberBand  = null;    // L.Polyline (cursor line)
    this._snapMarker  = null;    // L.CircleMarker (first vertex indicator)
    this._checking    = false;   // async collision check in progress

    map.on('click',    this._onMapClick,    this);
    map.on('dblclick', this._onMapDblClick, this);
    map.on('mousemove', this._onMapMove,    this);
  }

  // ---- Placement mode ----
  startPlacing(typeId) {
    this._drawing   = true;
    this._drawType  = typeId;
    this._drawVerts = [];
    this._clearPreview();
    this._map.getContainer().style.cursor = 'crosshair';
    this.fire('toolchange',    { tool: 'place', typeId });
    const startHint = typeId === 'Road'
      ? 'Clic para colocar puntos de la vía · Intro / doble-clic para finalizar · Esc para cancelar'
      : 'Clic para añadir vértices · Intro / doble-clic para cerrar · Esc para cancelar';
    this.fire('drawingstatus', { msg: startHint });
  }

  stopPlacing() {
    this._drawing   = false;
    this._drawType  = null;
    this._drawVerts = [];
    this._clearPreview();
    this._map.getContainer().style.cursor = '';
    this.fire('toolchange',    { tool: 'select' });
    this.fire('drawingstatus', { msg: '' });
  }

  // ---- Map event handlers ----
  _onMapClick(e) {
    if (this._checking) return;

    if (!this._drawing) {
      if (this._selected) this.select(null);
      return;
    }

    L.DomEvent.stopPropagation(e);
    const latlng = e.latlng;

    // Snap-to-close: only for polygon types, not Road
    if (this._drawType !== 'Road' && this._drawVerts.length >= 3) {
      const firstPx = this._map.latLngToContainerPoint(this._drawVerts[0]);
      const clickPx = this._map.latLngToContainerPoint(latlng);
      if (firstPx.distanceTo(clickPx) < SNAP_PX) {
        this._closePolygon();
        return;
      }
    }

    this._drawVerts.push(latlng);
    this._updatePreview();

    const n = this._drawVerts.length;
    let hint;
    if (this._drawType === 'Road') {
      hint = n < 2
        ? 'Añade más puntos · Intro o doble-clic para finalizar'
        : `${n} puntos — Intro o doble-clic para finalizar · Retroceso para deshacer`;
    } else {
      hint = n >= 3
        ? `${n} vértices — Intro, doble-clic o snap para cerrar · Retroceso para deshacer`
        : `${n} vértice${n > 1 ? 's' : ''} — sigue añadiendo puntos`;
    }
    this.fire('drawingstatus', { msg: hint });
  }

  _onMapDblClick(e) {
    if (!this._drawing || this._checking) return;
    L.DomEvent.stopPropagation(e);
    // The preceding single-click already added a duplicate point — remove it.
    // Then _closePolygon() enforces the type-specific minimum vertex count.
    if (this._drawVerts.length >= 2) {
      this._drawVerts.pop();
      this._closePolygon();
    }
  }

  _onMapMove(e) {
    if (!this._drawing || this._drawVerts.length === 0) return;

    // Update rubber-band line
    if (this._rubberBand) {
      this._rubberBand.setLatLngs([this._drawVerts[this._drawVerts.length - 1], e.latlng]);
    }

    // Highlight snap marker when cursor is near first vertex (polygon types only)
    if (this._drawType !== 'Road' && this._drawVerts.length >= 3 && this._snapMarker) {
      const firstPx = this._map.latLngToContainerPoint(this._drawVerts[0]);
      const curPx   = this._map.latLngToContainerPoint(e.latlng);
      const near    = firstPx.distanceTo(curPx) < SNAP_PX;
      this._snapMarker.setStyle({
        color:     near ? '#ffcc00' : this._entryColor(),
        fillColor: near ? '#ffcc00' : this._entryColor(),
        radius:    near ? 8 : 5
      });
    }
  }

  _entryColor() {
    return getRegistryEntry(this._drawType)?.color || '#5865f2';
  }

  // ---- Preview helpers ----
  _updatePreview() {
    const color  = this._entryColor();
    const isRoad = this._drawType === 'Road';

    if (!this._previewPoly) {
      if (isRoad) {
        // Roads preview as a thick polyline (open path, no fill)
        this._previewPoly = L.polyline([], {
          color, weight: 7, dashArray: '12 5', opacity: 0.60, interactive: false
        }).addTo(this._map);
      } else {
        this._previewPoly = L.polygon([], {
          color, weight: 2, dashArray: '6 4', fillOpacity: 0.1, interactive: false
        }).addTo(this._map);
      }
    }
    this._previewPoly.setLatLngs(this._drawVerts);

    if (this._drawVerts.length === 1) {
      // Rubber-band line: last vertex → cursor
      this._rubberBand = L.polyline([this._drawVerts[0], this._drawVerts[0]], {
        color, weight: 1.5, dashArray: '4 3', interactive: false
      }).addTo(this._map);

      // Snap-to-close marker only for polygon types
      if (!isRoad) {
        this._snapMarker = L.circleMarker(this._drawVerts[0], {
          radius: 5, color, fillColor: color, fillOpacity: 0.85,
          weight: 2, interactive: false
        }).addTo(this._map);
      }
    }
  }

  _clearPreview() {
    if (this._previewPoly)  { this._previewPoly.remove();  this._previewPoly  = null; }
    if (this._rubberBand)   { this._rubberBand.remove();   this._rubberBand   = null; }
    if (this._snapMarker)   { this._snapMarker.remove();   this._snapMarker   = null; }
  }

  // ---- Finish drawing & place construction ----
  async _closePolygon() {
    const minPts = this._drawType === 'Road' ? 2 : 3;
    if (this._drawVerts.length < minPts) return;

    const verts = [...this._drawVerts];
    this._clearPreview();
    this._drawVerts = [];
    this._checking  = true;
    this.fire('drawingstatus', { msg: '⏳ Verificando calles de la ciudad…' });

    // Only non-road types are checked against OSM streets
    const typeId = this._drawType;
    if (typeId !== 'Road') {
      const bounds = L.latLngBounds(verts);
      const roads  = await this._osm.fetchRoads(bounds);

      if (roads === null) {
        // Network error — warn but allow
        this.fire('collision', { msg: '⚠ Sin conexión a OSM. Verifique manualmente.', warn: true });
      } else if (this._osm.intersectsRoads(verts, roads)) {
        this._checking = false;
        this.fire('collision', { msg: 'El polígono intersecta una calle real. Dibuje en otro lugar.', warn: false });
        this.fire('drawingstatus', { msg: 'Clic en el mapa para añadir vértices del polígono' });
        return;
      }
    }

    this._checking = false;
    this._pushUndo();
    const c = this.addConstruction(typeId, verts);
    this.select(c.id);
    this.fire('placed', { construction: c });
    const afterHint = typeId === 'Road'
      ? 'Clic para colocar puntos de la vía · Intro / doble-clic para finalizar · Esc para cancelar'
      : 'Clic para añadir vértices · Intro / doble-clic para cerrar · Esc para cancelar';
    this.fire('drawingstatus', { msg: afterHint });
  }

  // ---- Construction CRUD ----
  addConstruction(typeId, polygonLatLngs, options = {}) {
    const entry = getRegistryEntry(typeId);
    if (!entry) throw new Error(`Unknown type: ${typeId}`);

    const inst = new entry.Class(polygonLatLngs, { ...options, name: options.name || entry.name });
    inst.addTo(this._map);
    inst.on('click',   ()       => this.select(inst.id));
    inst.on('updated', ()       => this.fire('updated', { id: inst.id }));
    inst.on('moveend', async ({ oldPolygon, newBounds }) => {
      if (inst.constructor.name === 'Road') return;
      const roads = await this._osm.fetchRoads(newBounds);
      if (roads && this._osm.intersectsRoads(inst._polygonLatLngs, roads)) {
        inst.setPolygon(oldPolygon);
        if (this._selected === inst.id) this._updateHandlePositions(inst);
        this.fire('collision', { msg: 'No puede intersecar calles de la ciudad.', warn: false });
      }
    });

    this._constructions.set(inst.id, inst);
    this.fire('added', { construction: inst });
    return inst;
  }

  removeConstruction(id) {
    const c = this._constructions.get(id);
    if (!c) return;
    if (this._selected === id) this.select(null);
    c.remove();
    this._constructions.delete(id);
    this.fire('removed', { id });
  }

  getConstruction(id) { return this._constructions.get(id); }
  getAll()            { return [...this._constructions.values()]; }
  isDrawing()         { return this._drawing; }

  // Finish the current drawing programmatically (e.g. from a hotkey)
  finishDrawing() {
    if (!this._drawing || this._checking) return;
    const minPts = this._drawType === 'Road' ? 2 : 3;
    if (this._drawVerts.length >= minPts) {
      this._closePolygon();
    }
  }

  // Remove the last placed vertex during drawing (undo last click)
  removeLastVertex() {
    if (!this._drawing || this._drawVerts.length === 0) return;
    this._drawVerts.pop();

    if (this._drawVerts.length === 0) {
      this._clearPreview();
    } else {
      if (this._previewPoly) this._previewPoly.setLatLngs(this._drawVerts);
      // rubberBand will reattach to the new last vertex on next mousemove
    }

    const n    = this._drawVerts.length;
    const road = this._drawType === 'Road';
    let hint;
    if (n === 0) {
      hint = road
        ? 'Clic para colocar puntos de la vía · Intro / doble-clic para finalizar'
        : 'Clic en el mapa para añadir vértices del polígono';
    } else if (road) {
      hint = `${n} punto${n > 1 ? 's' : ''} — Intro o doble-clic para finalizar`;
    } else {
      hint = n >= 3
        ? `${n} vértices — Intro, doble-clic o snap para cerrar`
        : `${n} vértice${n > 1 ? 's' : ''} — sigue añadiendo puntos`;
    }
    this.fire('drawingstatus', { msg: hint });
  }

  // ---- Selection ----
  select(id) {
    if (this._selected && this._selected !== id) {
      const prev = this._constructions.get(this._selected);
      if (prev) prev.setSelected(false);
    }
    this._clearHandles();
    this._selected = id;

    if (id) {
      const c = this._constructions.get(id);
      if (c) { c.setSelected(true); this._addHandles(c); }
    }
    this.fire('selectionchange', { id });
  }

  getSelected() { return this._selected ? this._constructions.get(this._selected) : null; }

  deleteSelected() {
    if (!this._selected) return;
    this._pushUndo();
    this.removeConstruction(this._selected);
  }

  // ---- Vertex handles (one per polygon vertex) ----
  _addHandles(construction) {
    const verts = construction._polygonLatLngs;

    for (let i = 0; i < verts.length; i++) {
      const m = L.marker(verts[i], {
        draggable: true,
        icon: L.divIcon({
          className: 'vertex-handle',
          iconSize:   [12, 12],
          iconAnchor: [6, 6]
        }),
        zIndexOffset: 1000
      }).addTo(this._map);

      m._vertexIndex = i;

      let preDragPolygon;

      m.on('dragstart', () => {
        // Snapshot the whole polygon for rollback
        preDragPolygon = construction._polygonLatLngs.map(ll => L.latLng(ll.lat, ll.lng));
        this._pushUndo();
        this._map.dragging.disable();
      });

      m.on('drag', ev => {
        // Move only this vertex; others stay put
        const updated = construction._polygonLatLngs.map((ll, idx) =>
          idx === i ? ev.latlng : ll
        );
        // Suppress the 'updated' event re-render of ALL handles during live drag
        construction._polygonLatLngs = updated.map(p => L.latLng(p));
        construction._update();
      });

      m.on('dragend', async () => {
        this._map.dragging.enable();

        if (construction.constructor.name !== 'Road') {
          const roads = await this._osm.fetchRoads(construction.getBounds());
          if (roads && this._osm.intersectsRoads(construction._polygonLatLngs, roads)) {
            construction.setPolygon(preDragPolygon);
            this._undoStack.pop(); // discard — we reverted
            this._updateHandlePositions(construction);
            this.fire('collision', { msg: 'No puede intersecar calles de la ciudad.', warn: false });
            return;
          }
        }
        // Sync handle position to final vertex (Leaflet moves the marker via drag,
        // but setPolygon may have snapped it; keep them in sync)
        m.setLatLng(construction._polygonLatLngs[i]);
        this.fire('updated', { id: construction.id });
      });

      this._handles.push(m);
    }
  }

  _clearHandles() { this._handles.forEach(h => h.remove()); this._handles = []; }

  // Resync all vertex handle markers to current polygon vertex positions
  _updateHandlePositions(construction) {
    const verts = construction._polygonLatLngs;
    this._handles.forEach((m, i) => {
      if (i < verts.length) m.setLatLng(verts[i]);
    });
  }

  // ---- Undo ----
  _pushUndo() {
    const snapshot = this.getAll().map(c => c.toJSON());
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
  }

  _restoreSnapshot(snapshot) {
    this.select(null);
    for (const c of [...this._constructions.values()]) c.remove();
    this._constructions.clear();
    for (const data of snapshot) {
      const inst = createFromJSON(data);
      if (!inst) continue;
      inst.addTo(this._map);
      inst.on('click',   ()       => this.select(inst.id));
      inst.on('updated', ()       => this.fire('updated', { id: inst.id }));
      inst.on('moveend', async ({ oldPolygon, newBounds }) => {
        if (inst.constructor.name === 'Road') return;
        const roads = await this._osm.fetchRoads(newBounds);
        if (roads && this._osm.intersectsRoads(inst._polygonLatLngs, roads)) {
          inst.setPolygon(oldPolygon);
          if (this._selected === inst.id) this._updateHandlePositions(inst);
          this.fire('collision', { msg: 'No puede intersecar calles de la ciudad.', warn: false });
        }
      });
      this._constructions.set(inst.id, inst);
    }
  }

  undo() {
    if (!this._undoStack.length) return;
    this._restoreSnapshot(this._undoStack.pop());
    this.fire('restored');
  }

  clearAll() {
    this._pushUndo();
    this.select(null);
    for (const c of [...this._constructions.values()]) c.remove();
    this._constructions.clear();
    this.fire('cleared');
  }

  // ---- Persistence ----
  save() {
    const data = this.getAll().map(c => c.toJSON());
    localStorage.setItem('urban-map-planner', JSON.stringify(data));
    return data.length;
  }

  load() {
    const raw = localStorage.getItem('urban-map-planner');
    if (!raw) return 0;
    const data = JSON.parse(raw);
    this.clearAll();
    this._undoStack = [];
    this._restoreSnapshot(data);
    this.fire('loaded', { count: data.length });
    return data.length;
  }
}
