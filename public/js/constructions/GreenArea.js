import { BaseConstruction } from './BaseConstruction.js';

export class GreenArea extends BaseConstruction {
  defaultOptions() { return { color: '#1e4a2a', subtype: 'park', buildingRatio: 0 }; }
  typeName()  { return 'Área Verde'; }
  typeColor() { return '#1e4a2a'; }
  typeIcon()  { return '🌳'; }

  _render(wM, hM, zoom) {
    const { color } = this._options;
    const clipId = this._setupClipPath(wM, hM);

    // Full polygon is green — no inner building
    const g = this._el('g', { 'clip-path': `url(#${clipId})` });
    g.appendChild(this._rect(0, 0, wM, hM, color));

    if (zoom >= 16) {
      const stride = Math.max(0.8, Math.min(wM, hM) * 0.05);
      for (let i = 0; i * stride < hM; i++)
        g.appendChild(this._line(0, i * stride, wM, i * stride, 'rgba(50,120,50,0.3)', 0.15));

      if (zoom >= 17) {
        const sp = Math.max(8, Math.min(wM, hM) * 0.15);
        const cols = Math.floor(wM / sp), rows = Math.floor(hM / sp);
        const ox = (wM - cols * sp) / 2 + sp / 2, oy = (hM - rows * sp) / 2 + sp / 2;
        const r  = sp * 0.3;
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < cols; col++)
            this._drawTreeInGroup(g, ox + col * sp, oy + row * sp, r);
      }
    }
    this._svg.appendChild(g);

    // Green dashed park boundary (uses the drawn polygon)
    const pts = this._getLotPoints(wM, hM);
    const sw  = Math.max(0.2, Math.min(wM, hM) * 0.018);
    this._svg.appendChild(this._poly(
      pts, 'none',
      this._selected ? '#ffcc00' : 'rgba(60,160,60,0.65)',
      this._selected ? Math.max(0.3, Math.max(wM, hM) * 0.012) : sw,
      this._selected ? {} : { 'stroke-dasharray': `${Math.min(wM, hM) * 0.05} ${Math.min(wM, hM) * 0.02}` }
    ));

    const fs = this.getLabelFontSize(wM, hM);
    this._svg.appendChild(this._text(wM / 2, hM / 2, this.name, fs, '#90ee90'));
    this._selectionBorder(wM, hM);
  }

  getStats() {
    const w = this._wM || 0, h = this._hM || 0;
    return { 'Área verde': `${(w * h).toFixed(0)} m²`, 'Perímetro': `${(2*(w+h)).toFixed(0)} m` };
  }

  getExtraProps() { return []; }
}
