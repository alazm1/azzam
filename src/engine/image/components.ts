import type { BinaryImage } from '../types';

export interface Component {
  label: number;
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Extreme points used for quadrilateral estimation. */
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
}

/**
 * 8-connected component labelling with an explicit stack (no recursion).
 * Returns components sorted by bounding-box area, descending.
 */
export function connectedComponents(bin: BinaryImage, minArea = 1): Component[] {
  const { width: w, height: h, data } = bin;
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;
    const label = next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    const c: Component = {
      label,
      area: 0,
      x0: w,
      y0: h,
      x1: 0,
      y1: 0,
      tl: { x: 0, y: 0 },
      tr: { x: 0, y: 0 },
      br: { x: 0, y: 0 },
      bl: { x: 0, y: 0 },
    };
    let bestTl = Infinity;
    let bestTr = -Infinity;
    let bestBr = -Infinity;
    let bestBl = Infinity;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const s = x + y;
      const d = x - y;
      if (s < bestTl) {
        bestTl = s;
        c.tl = { x, y };
      }
      if (d > bestTr) {
        bestTr = d;
        c.tr = { x, y };
      }
      if (s > bestBr) {
        bestBr = s;
        c.br = { x, y };
      }
      if (d < bestBl) {
        bestBl = d;
        c.bl = { x, y };
      }
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const n = yy * w + xx;
          if (data[n] && !labels[n]) {
            labels[n] = label;
            stack[sp++] = n;
          }
        }
      }
    }
    if (c.area >= minArea) comps.push(c);
  }
  comps.sort((a, b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1));
  return comps;
}
