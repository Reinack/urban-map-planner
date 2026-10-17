import { BaseConstruction } from './BaseConstruction.js';

export class Tower extends BaseConstruction {
  defaultOptions() { return { floors: 10, color: '#1e3a5f', buildingRatio: 0.62 }; }
  typeName()  { return 'Torre'; }
  typeColor() { return '#1e3a5f'; }
  typeIcon()  { return '🏢'; }

  _render(wM, hM, zoom) {
    const { floors, color } = this._options;
    const clipId = this._setupClipPath(wM, hM);

    this._renderGardenBase(wM, hM, clipId);
    const { x: bX, y: bY, w: bW, h: bH } = this._buildingBounds(wM, hM);
    this._renderGardenDetails(wM, hM, bX, bY, bW, bH, clipId, zoom);

    const g = this._el('g', { 'clip-path': `url(#${clipId})` });

    // Shadow
    const sh = Math.min(bW, bH) * 0.04;
    g.appendChild(this._rect(bX + sh, bY + sh, bW, bH, 'rgba(0,0,0,0.35)', 'none', 0, { rx: 0.5 }));

    // Body
    g.appendChild(this._rect(bX, bY, bW, bH, color, 'none', 0, { rx: 0.5 }));

    if (zoom >= 16) {
      const floorH = bH / Math.max(floors, 1);
      for (let f = 0; f < floors; f++) {
        const fy = bY + f * floorH;
        g.appendChild(this._line(bX, fy, bX + bW, fy, 'rgba(255,255,255,0.15)', 0.15));

        if (zoom >= 17 && floorH > 1.5) {
          const winW = Math.min(2, bW * 0.12), winH = Math.min(floorH * 0.55, 1.5);
          const step = bW / Math.max(Math.floor(bW / (winW * 1.5)), 1);
          for (let c = 0, wx = bX + step * 0.25; wx + winW < bX + bW; c++, wx += step) {
            const lit = Math.random() > 0.3;
            g.appendChild(this._rect(wx, fy + floorH * 0.2, winW * 0.7, winH,
              lit ? '#aaddff' : '#1a3050', 'rgba(100,200,255,0.3)', 0.05, { rx: 0.1 }));
          }
        }
      }
    }

    // Roof accent
    g.appendChild(this._rect(bX + bW * 0.1, bY, bW * 0.8, bH * 0.04, 'rgba(100,180,255,0.4)'));
    this._svg.appendChild(g);

    this._renderLotBorder(wM, hM);

    const fs = this.getLabelFontSize(wM, hM);
    this._svg.appendChild(this._text(wM / 2, hM / 2, this.name, fs, '#8ecfff'));
    if (zoom >= 16)
      this._svg.appendChild(this._text(wM / 2, hM / 2 + fs * 1.4, `${floors} pisos`, fs * 0.75, 'rgba(142,207,255,0.7)'));

    this._selectionBorder(wM, hM);
  }

  getStats() {
    const w = this._wM || 0, h = this._hM || 0;
    const r = this._options.buildingRatio ?? 0.62;
    const floorA = (w * r * h * r).toFixed(0);
    return {
      'Pisos': this._options.floors,
      'Área por piso': `${floorA} m²`,
      'Área total construida': `${(floorA * this._options.floors).toFixed(0)} m²`,
      'Jardín perimetral': `${(w * h * (1 - r * r)).toFixed(0)} m²`
    };
  }

  getExtraProps() {
    return [{ key: 'floors', label: 'Cantidad de pisos', type: 'number', min: 1, max: 100, step: 1 }];
  }
}
