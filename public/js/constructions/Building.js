import { BaseConstruction } from './BaseConstruction.js';

export class Building extends BaseConstruction {
  defaultOptions() { return { use: 'residential', color: '#2e3a4e', buildingRatio: 0.78 }; }
  typeName()  { return 'Edificio'; }
  typeColor() { return '#2e3a4e'; }
  typeIcon()  { return '🏗'; }

  _render(wM, hM, zoom) {
    const { color } = this._options;
    const clipId = this._setupClipPath(wM, hM);

    this._renderGardenBase(wM, hM, clipId);
    const { x: bX, y: bY, w: bW, h: bH } = this._buildingBounds(wM, hM);
    this._renderGardenDetails(wM, hM, bX, bY, bW, bH, clipId, zoom);

    const g = this._el('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(this._rect(bX, bY, bW, bH, color, 'none', 0, { rx: 0.3 }));

    if (zoom >= 17) {
      g.appendChild(this._rect(bX, bY, bW, bH * 0.07, 'rgba(255,255,255,0.1)'));
      const dW = Math.min(bW * 0.25, 5), dH = Math.min(bH * 0.15, 3);
      g.appendChild(this._rect(
        bX + bW / 2 - dW / 2, bY + bH - dH, dW, dH,
        'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.3)', 0.1, { rx: dW * 0.1 }
      ));
    }
    this._svg.appendChild(g);

    this._renderLotBorder(wM, hM);

    const fs = this.getLabelFontSize(wM, hM);
    this._svg.appendChild(this._text(wM / 2, hM / 2, this.name, fs, '#b0c4de'));
    this._selectionBorder(wM, hM);
  }

  getStats() {
    const w = this._wM || 0, h = this._hM || 0;
    const r = this._options.buildingRatio ?? 0.78;
    return {
      'Uso': this._options.use,
      'Área construida': `${(w * r * h * r).toFixed(0)} m²`,
      'Área jardín':     `${(w * h * (1 - r * r)).toFixed(0)} m²`
    };
  }

  getExtraProps() { return []; }
}
