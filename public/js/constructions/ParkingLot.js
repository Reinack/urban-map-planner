import { BaseConstruction } from './BaseConstruction.js';

export class ParkingLot extends BaseConstruction {
  defaultOptions() {
    return { spaceW: 2.5, spaceD: 5, aisleW: 6, color: '#28283a' };
  }
  typeName()  { return 'Estacionamiento'; }
  typeColor() { return '#28283a'; }
  typeIcon()  { return '🅿'; }

  _render(wM, hM, zoom) {
    const { spaceW, spaceD, aisleW } = this._options;
    const clipId = this._setupClipPath(wM, hM);

    // ── 1. Asphalt base — fills the entire clipped polygon ──
    const base = this._el('g', { 'clip-path': `url(#${clipId})` });
    base.appendChild(this._rect(0, 0, wM, hM, '#26263a'));
    // Subtle surface texture
    const stride = Math.max(1, Math.min(wM, hM) * 0.045);
    for (let y = 0; y < hM; y += stride) {
      base.appendChild(this._line(0, y, wM, y, 'rgba(255,255,255,0.025)', 0.35));
    }
    this._svg.appendChild(base);

    if (zoom >= 15) {
      const g = this._el('g', { 'clip-path': `url(#${clipId})` });
      const isHoriz = wM >= hM;

      if (isHoriz) {
        this._drawHorizBays(g, wM, hM, spaceW, spaceD, aisleW, zoom);
      } else {
        this._drawVertBays(g, wM, hM, spaceW, spaceD, aisleW, zoom);
      }
      this._svg.appendChild(g);

      // ── Capacity badge ──
      if (zoom >= 17) {
        const cap = this._capacity(wM, hM);
        const fs  = Math.min(wM, hM) * 0.065;
        const pts = this._getLotPoints(wM, hM);
        const cx  = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy  = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const bw  = fs * 4.2, bh = fs * 1.7;
        const capG = this._el('g', { 'clip-path': `url(#${clipId})` });
        capG.appendChild(this._rect(cx - bw / 2, cy - bh / 2, bw, bh,
          'rgba(0,0,0,0.72)', '#4a9eff', 0.1, { rx: fs * 0.3 }));
        capG.appendChild(this._text(cx, cy, `🅿 ${cap} plazas`, fs * 0.9, '#4a9eff'));
        this._svg.appendChild(capG);
      }
    } else {
      // Low zoom — show label only
      const labelG = this._el('g', { 'clip-path': `url(#${clipId})` });
      labelG.appendChild(this._text(wM / 2, hM / 2, this.name,
        this.getLabelFontSize(wM, hM), '#8888bb'));
      this._svg.appendChild(labelG);
    }

    // ── Perimeter curb ──
    this._renderCurb(wM, hM, clipId);
    this._renderLotBorder(wM, hM);
    this._selectionBorder(wM, hM);
  }

  // ── Landscape layout: aisles run left-right, stalls face up/down ──
  _drawHorizBays(g, wM, hM, spaceW, spaceD, aisleW, zoom) {
    const moduleH = 2 * spaceD + aisleW;
    const numMods = Math.max(1, Math.floor(hM / moduleH));
    const totalH  = numMods * moduleH;
    const y0      = (hM - totalH) / 2;
    const cols    = Math.max(1, Math.floor(wM / spaceW));
    const spW     = wM / cols;

    for (let m = 0; m < numMods; m++) {
      const rowTop = y0 + m * moduleH;
      const aisleY = rowTop + spaceD;
      const rowBot = aisleY + aisleW;
      const midY   = aisleY + aisleW / 2;

      // Aisle — slightly lighter surface
      g.appendChild(this._rect(0, aisleY, wM, aisleW, '#31314a'));

      // Aisle centre dashed navigation line
      g.appendChild(this._line(0, midY, wM, midY, '#ffcc00', 0.13, {
        opacity: '0.45',
        'stroke-dasharray': `${aisleW * 0.65} ${aisleW * 0.35}`
      }));

      // Top stall row boundary lines
      g.appendChild(this._line(0, rowTop, wM, rowTop, 'rgba(255,255,255,0.45)', 0.14));
      g.appendChild(this._line(0, aisleY, wM, aisleY, 'rgba(255,255,255,0.45)', 0.14));
      for (let c = 0; c <= cols; c++) {
        const x = c * spW;
        g.appendChild(this._line(x, rowTop, x, aisleY, 'rgba(255,255,255,0.6)', 0.10));
      }

      // Bottom stall row boundary lines
      g.appendChild(this._line(0, rowBot + spaceD, wM, rowBot + spaceD, 'rgba(255,255,255,0.45)', 0.14));
      for (let c = 0; c <= cols; c++) {
        const x = c * spW;
        g.appendChild(this._line(x, rowBot, x, rowBot + spaceD, 'rgba(255,255,255,0.6)', 0.10));
      }

      // Directional arrow in aisle
      if (zoom >= 16) {
        const dir = m % 2 === 0 ? 1 : -1;
        const sz  = aisleW * 0.30;
        const cx  = wM / 2, cy = midY;
        const dx  = dir * sz, s = sz * 0.38;
        g.appendChild(this._el('polygon', {
          points:  `${cx - dx * 0.25},${cy - s} ${cx + dx},${cy} ${cx - dx * 0.25},${cy + s}`,
          fill:    '#ffcc00',
          opacity: '0.52'
        }));
      }
    }
  }

  // ── Portrait layout: aisles run top-bottom, stalls face left/right ──
  _drawVertBays(g, wM, hM, spaceW, spaceD, aisleW, zoom) {
    const moduleW = 2 * spaceD + aisleW;
    const numMods = Math.max(1, Math.floor(wM / moduleW));
    const totalW  = numMods * moduleW;
    const x0      = (wM - totalW) / 2;
    const rows    = Math.max(1, Math.floor(hM / spaceW));
    const spH     = hM / rows;

    for (let m = 0; m < numMods; m++) {
      const colLeft  = x0 + m * moduleW;
      const aisleX   = colLeft + spaceD;
      const colRight = aisleX + aisleW;
      const midX     = aisleX + aisleW / 2;

      // Aisle — slightly lighter surface
      g.appendChild(this._rect(aisleX, 0, aisleW, hM, '#31314a'));

      // Aisle centre dashed navigation line
      g.appendChild(this._line(midX, 0, midX, hM, '#ffcc00', 0.13, {
        opacity: '0.45',
        'stroke-dasharray': `${aisleW * 0.65} ${aisleW * 0.35}`
      }));

      // Left stall column boundary lines
      g.appendChild(this._line(colLeft, 0, colLeft, hM, 'rgba(255,255,255,0.45)', 0.14));
      g.appendChild(this._line(aisleX, 0, aisleX, hM, 'rgba(255,255,255,0.45)', 0.14));
      for (let r = 0; r <= rows; r++) {
        const y = r * spH;
        g.appendChild(this._line(colLeft, y, aisleX, y, 'rgba(255,255,255,0.6)', 0.10));
      }

      // Right stall column boundary lines
      g.appendChild(this._line(colRight + spaceD, 0, colRight + spaceD, hM, 'rgba(255,255,255,0.45)', 0.14));
      for (let r = 0; r <= rows; r++) {
        const y = r * spH;
        g.appendChild(this._line(colRight, y, colRight + spaceD, y, 'rgba(255,255,255,0.6)', 0.10));
      }

      // Directional arrow in aisle
      if (zoom >= 16) {
        const dir = m % 2 === 0 ? 1 : -1;
        const sz  = aisleW * 0.30;
        const cx  = midX, cy = hM / 2;
        const dy  = dir * sz, s = sz * 0.38;
        g.appendChild(this._el('polygon', {
          points:  `${cx - s},${cy - dy * 0.25} ${cx},${cy + dy} ${cx + s},${cy - dy * 0.25}`,
          fill:    '#ffcc00',
          opacity: '0.52'
        }));
      }
    }
  }

  // ── Inner perimeter curb strip ──
  _renderCurb(wM, hM, clipId) {
    const curbW = Math.max(0.3, Math.min(wM, hM) * 0.025);
    const pts   = this._getLotPoints(wM, hM);
    const sw    = curbW;
    const curbG = this._el('g', { 'clip-path': `url(#${clipId})` });
    curbG.appendChild(this._poly(pts, 'none', 'rgba(200,200,180,0.22)', sw));
    this._svg.appendChild(curbG);
  }

  _capacity(wM, hM) {
    const { spaceW, spaceD, aisleW } = this._options;
    const isHoriz = wM >= hM;
    if (isHoriz) {
      const numMods = Math.max(1, Math.floor(hM / (2 * spaceD + aisleW)));
      const cols    = Math.max(1, Math.floor(wM / spaceW));
      return numMods * 2 * cols;
    } else {
      const numMods = Math.max(1, Math.floor(wM / (2 * spaceD + aisleW)));
      const rows    = Math.max(1, Math.floor(hM / spaceW));
      return numMods * 2 * rows;
    }
  }

  getStats() {
    const w = this._wM || 0, h = this._hM || 0;
    const cap = this._capacity(w, h);

    // Polygon area via shoelace formula
    const pts = this._polygonSVGPoints;
    let area = 0;
    if (pts && pts.length >= 3) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        area += x1 * y2 - x2 * y1;
      }
      area = Math.abs(area) / 2;
    } else {
      area = w * h;
    }

    return {
      'Plazas estimadas': `${cap}`,
      'Área del lote':    `${area.toFixed(0)} m²`,
      'Orientación':      w >= h ? 'Horizontal' : 'Vertical'
    };
  }

  getExtraProps() {
    return [
      { key: 'spaceW', label: 'Ancho plaza (m)',   type: 'number', min: 2,   max: 4, step: 0.1 },
      { key: 'spaceD', label: 'Prof. plaza (m)',   type: 'number', min: 4,   max: 7, step: 0.5 },
      { key: 'aisleW', label: 'Ancho pasillo (m)', type: 'number', min: 5,   max: 9, step: 0.5 }
    ];
  }
}
