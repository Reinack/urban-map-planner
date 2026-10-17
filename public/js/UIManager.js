import { REGISTRY } from './constructions/registry.js';

export class UIManager {
  constructor(cm, map) {
    this._cm  = cm;
    this._map = map;
    this._activeTypeId = null;

    this._buildConstructionList();
    this._bindToolbar();
    this._bindMapStatus();
    this._bindCMEvents();
  }

  // ---- Construction sidebar ----
  _buildConstructionList() {
    const list = document.getElementById('construction-list');
    list.innerHTML = '';
    for (const entry of REGISTRY) {
      const card = document.createElement('div');
      card.className = 'construction-card';
      card.dataset.typeId = entry.id;
      card.innerHTML = `
        <div class="card-icon" style="background:${entry.color}22;border:1px solid ${entry.color}55">
          <span>${entry.icon}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${entry.name}</div>
          <div class="card-desc">${entry.desc}</div>
        </div>`;
      card.addEventListener('click', () => this._activateType(entry.id, card));
      list.appendChild(card);
    }
  }

  _activateType(typeId, card) {
    document.querySelectorAll('.construction-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    this._activeTypeId = typeId;
    this._cm.startPlacing(typeId);
    this._setActiveTool(null);
  }

  // ---- Toolbar ----
  _bindToolbar() {
    document.getElementById('tool-select').addEventListener('click', () => {
      this._cm.stopPlacing();
      this._clearActiveCard();
      this._setActiveTool('tool-select');
    });

    document.getElementById('tool-delete').addEventListener('click', () => this._cm.deleteSelected());

    document.getElementById('btn-undo').addEventListener('click', () => {
      this._cm.undo();
      this._showToast('Acción deshecha');
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (confirm('¿Borrar todas las construcciones?')) {
        this._cm.clearAll();
        this._showToast('Mapa limpiado');
      }
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      const n = this._cm.save();
      this._showToast(`Proyecto guardado (${n} elementos)`);
    });

    document.getElementById('btn-load').addEventListener('click', () => {
      const n = this._cm.load();
      this._showToast(n === 0 ? 'No hay proyecto guardado' : `Proyecto cargado (${n} elementos)`);
    });

    document.getElementById('btn-delete-selected').addEventListener('click', () => this._cm.deleteSelected());

    window.addEventListener('keydown', e => {
      if (document.activeElement.tagName === 'INPUT') return;

      // ── Drawing-mode shortcuts (take priority) ──────────────────────────
      if (this._cm.isDrawing()) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._cm.finishDrawing();
          return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          this._cm.removeLastVertex();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          this._cm.removeLastVertex();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this._cm.stopPlacing();
          this._clearActiveCard();
          this._setActiveTool('tool-select');
          return;
        }
        return; // swallow any other key while drawing
      }

      // ── Normal (select) mode shortcuts ──────────────────────────────────
      if (e.key === 'Escape' || e.key === 's') {
        this._cm.stopPlacing();
        this._clearActiveCard();
        this._setActiveTool('tool-select');
      }
      if (e.key === 'Delete' || e.key === 'Backspace') this._cm.deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this._cm.undo();
        this._showToast('Acción deshecha');
      }
    });
  }

  _setActiveTool(id) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (id) document.getElementById(id)?.classList.add('active');
  }

  _clearActiveCard() {
    document.querySelectorAll('.construction-card').forEach(c => c.classList.remove('active'));
    this._activeTypeId = null;
  }

  // ---- CM events ----
  _bindCMEvents() {
    this._cm.on('selectionchange', ({ id }) => {
      if (id) this._showProps(this._cm.getConstruction(id));
      else    this._hideProps();
    });

    this._cm.on('toolchange', ({ tool }) => {
      if (tool === 'select') {
        this._setActiveTool('tool-select');
      }
    });

    this._cm.on('drawingstatus', ({ msg }) => {
      document.getElementById('status-tool').textContent = msg || 'Seleccionar';
    });

    this._cm.on('placed',   ({ construction }) => this._showToast(`${construction.name} colocado`));
    this._cm.on('removed',  ()                 => { this._hideProps(); this._showToast('Eliminado'); });
    this._cm.on('updated',  ({ id })           => {
      const sel = this._cm.getSelected();
      if (sel?.id === id) this._refreshDims(sel);
    });
    this._cm.on('collision', ({ msg, warn }) => this._showToast(msg, warn !== false));
    this._cm.on('cleared',   () => this._hideProps());
    this._cm.on('restored',  () => this._hideProps());
    this._cm.on('loaded',    () => this._hideProps());
  }

  // ---- Properties panel ----
  _showProps(c) {
    document.getElementById('props-section').style.display = '';
    document.getElementById('stats-section').style.display = '';

    const nameEl = document.getElementById('prop-name');
    nameEl.value    = c.name;
    nameEl.onchange = () => { c.name = nameEl.value; c._update(); };

    const colorEl    = document.getElementById('prop-color');
    colorEl.value    = c._options.color || '#888888';
    colorEl.oninput  = () => c.setOption('color', colorEl.value);

    this._refreshDims(c);
    this._buildExtraProps(c);
    this._buildStats(c);
  }

  _refreshDims(c) {
    const w = c._wM?.toFixed(1) ?? '–', h = c._hM?.toFixed(1) ?? '–';
    document.getElementById('prop-dims').textContent = `${w} × ${h} m`;
    this._buildStats(c);
  }

  _buildExtraProps(c) {
    const extra = document.getElementById('props-extra');
    extra.innerHTML = '';

    // Construction-specific properties
    if (c.getExtraProps) {
      for (const prop of c.getExtraProps()) {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const label = document.createElement('label');
        label.textContent = prop.label;
        row.appendChild(label);

        if (prop.type === 'checkbox') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:#5865f2';
          cb.checked = !!c._options[prop.key];
          cb.addEventListener('change', () => c.setOption(prop.key, cb.checked));
          row.appendChild(cb);
        } else {
          const input = document.createElement('input');
          input.type  = prop.type || 'text';
          input.className = 'prop-input';
          input.style.width = '80px';
          if (prop.min  !== undefined) input.min  = prop.min;
          if (prop.max  !== undefined) input.max  = prop.max;
          if (prop.step !== undefined) input.step = prop.step;
          input.value = c._options[prop.key] ?? '';
          input.addEventListener('change', () => {
            c.setOption(prop.key, prop.type === 'number' ? parseFloat(input.value) : input.value);
          });
          row.appendChild(input);
        }

        extra.appendChild(row);
      }
    }

    // Building coverage ratio (not applicable to full-lot types)
    const noRatio = ['GreenArea', 'Road', 'ParkingLot'];
    if (!noRatio.includes(c.constructor.name)) {
      this._appendRatioControl(c);
    }
  }

  _appendRatioControl(c) {
    const extra = document.getElementById('props-extra');

    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid #2a2d45;margin:8px 0 6px';
    extra.appendChild(sep);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:6px';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center';

    const lbl = document.createElement('label');
    lbl.textContent = 'Cobertura del edificio';

    const val = document.createElement('span');
    val.className   = 'prop-value';
    val.textContent = `${Math.round((c._options.buildingRatio ?? 0.75) * 100)}%`;

    header.appendChild(lbl);
    header.appendChild(val);
    row.appendChild(header);

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.className = 'ratio-slider';
    slider.min   = '0.30';
    slider.max   = '0.97';
    slider.step  = '0.01';
    slider.value = c._options.buildingRatio ?? 0.75;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      val.textContent = `${Math.round(v * 100)}%`;
      c.setOption('buildingRatio', v);
      this._buildStats(c);
    });
    row.appendChild(slider);
    extra.appendChild(row);
  }

  _buildStats(c) {
    const panel = document.getElementById('stats-panel');
    panel.innerHTML = '';
    if (!c.getStats) return;
    for (const [label, value] of Object.entries(c.getStats())) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
      panel.appendChild(row);
    }
  }

  _hideProps() {
    document.getElementById('props-section').style.display = 'none';
    document.getElementById('stats-section').style.display = 'none';
  }

  // ---- Status bar ----
  _bindMapStatus() {
    this._map.on('mousemove', e => {
      const { lat, lng } = e.latlng;
      document.getElementById('status-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    });
    this._map.on('zoomend', () => {
      document.getElementById('status-zoom').textContent = `Zoom: ${this._map.getZoom()}`;
    });
    document.getElementById('status-zoom').textContent = `Zoom: ${this._map.getZoom()}`;
  }

  // ---- Toast ----
  _showToast(msg, isWarning = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('warning', isWarning);
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove('show', 'warning');
    }, 3000);
  }
}
