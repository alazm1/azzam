import type { GrayImage, Point } from '../types';

/** Solves a small dense linear system with Gaussian elimination. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Computes the 3x3 homography H that maps src[i] -> dst[i] for 4 point pairs.
 * Returns a flat row-major array of 9 numbers (h33 = 1).
 */
export function homography(src: Point[], dst: Point[]): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

/**
 * Warps `img` so that the quadrilateral `quad` (TL, TR, BR, BL) becomes an
 * axis-aligned rectangle of the given size. Uses inverse mapping with
 * bilinear sampling; pixels outside the source are white.
 */
export function warpPerspective(img: GrayImage, quad: Point[], outW: number, outH: number): GrayImage | null {
  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  // inverse homography: output -> input
  const H = homography(dst, quad);
  if (!H) return null;
  const out = new Uint8Array(outW * outH).fill(255);
  const { width: w, height: h, data } = img;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / den;
      const sy = (H[3] * x + H[4] * y + H[5]) / den;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const wx = sx - x0;
      const wy = sy - y0;
      const p00 = data[y0 * w + x0];
      const p01 = data[y0 * w + x1];
      const p10 = data[y1 * w + x0];
      const p11 = data[y1 * w + x1];
      const top = p00 + (p01 - p00) * wx;
      const bot = p10 + (p11 - p10) * wx;
      out[y * outW + x] = (top + (bot - top) * wy + 0.5) | 0;
    }
  }
  return { width: outW, height: outH, data: out };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rotates a gray image by an arbitrary small angle (degrees), white fill. */
export function rotateGrayByAngle(img: GrayImage, degrees: number): GrayImage {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h).fill(255);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const wx = sx - x0;
      const wy = sy - y0;
      const top = data[y0 * w + x0] + (data[y0 * w + x1] - data[y0 * w + x0]) * wx;
      const bot = data[y1 * w + x0] + (data[y1 * w + x1] - data[y1 * w + x0]) * wx;
      out[y * w + x] = (top + (bot - top) * wy + 0.5) | 0;
    }
  }
  return { width: w, height: h, data: out };
}
