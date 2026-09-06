import type { BinaryImage } from '../types';

/**
 * Keeps only horizontal ink runs that are at least `minLen` pixels long.
 * Small gaps (<= `gap`) inside a run are bridged first, which makes dashed or
 * slightly broken table borders survive.
 */
export function horizontalLines(bin: BinaryImage, minLen: number, gap = 2): BinaryImage {
  const { width: w, height: h, data } = bin;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let x = 0;
    while (x < w) {
      if (!data[row + x]) {
        x++;
        continue;
      }
      // run start
      const start = x;
      let end = x;
      let missing = 0;
      let cursor = x;
      while (cursor < w) {
        if (data[row + cursor]) {
          end = cursor;
          missing = 0;
        } else {
          missing++;
          if (missing > gap) break;
        }
        cursor++;
      }
      if (end - start + 1 >= minLen) out.fill(1, row + start, row + end + 1);
      x = end + 1;
    }
  }
  return { width: w, height: h, data: out };
}

export function verticalLines(bin: BinaryImage, minLen: number, gap = 2): BinaryImage {
  const { width: w, height: h, data } = bin;
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!data[y * w + x]) {
        y++;
        continue;
      }
      const start = y;
      let end = y;
      let missing = 0;
      let cursor = y;
      while (cursor < h) {
        if (data[cursor * w + x]) {
          end = cursor;
          missing = 0;
        } else {
          missing++;
          if (missing > gap) break;
        }
        cursor++;
      }
      if (end - start + 1 >= minLen) {
        for (let yy = start; yy <= end; yy++) out[yy * w + x] = 1;
      }
      y = end + 1;
    }
  }
  return { width: w, height: h, data: out };
}

export function unionBinary(a: BinaryImage, b: BinaryImage): BinaryImage {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] | b.data[i];
  return { width: a.width, height: a.height, data: out };
}

/** Removes line pixels from an ink image (keeps text only). */
export function subtractBinary(a: BinaryImage, lines: BinaryImage, dilate = 1): BinaryImage {
  const { width: w, height: h } = a;
  const out = new Uint8Array(a.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!lines.data[y * w + x]) continue;
      for (let dy = -dilate; dy <= dilate; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -dilate; dx <= dilate; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          out[yy * w + xx] = 0;
        }
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** Square dilation by radius r. */
export function dilate(bin: BinaryImage, r: number): BinaryImage {
  if (r <= 0) return bin;
  const { width: w, height: h, data } = bin;
  // separable: horizontal then vertical
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!data[row + x]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      tmp.fill(1, row + x0, row + x1 + 1);
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!tmp[y * w + x]) continue;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) out[yy * w + x] = 1;
    }
  }
  return { width: w, height: h, data: out };
}

/** Row projection: number of ink pixels per row. */
export function rowProjection(bin: BinaryImage, x0 = 0, x1 = bin.width): Uint32Array {
  const out = new Uint32Array(bin.height);
  for (let y = 0; y < bin.height; y++) {
    let n = 0;
    const row = y * bin.width;
    for (let x = x0; x < x1; x++) n += bin.data[row + x];
    out[y] = n;
  }
  return out;
}

/** Column projection: number of ink pixels per column. */
export function colProjection(bin: BinaryImage, y0 = 0, y1 = bin.height): Uint32Array {
  const out = new Uint32Array(bin.width);
  for (let x = 0; x < bin.width; x++) {
    let n = 0;
    for (let y = y0; y < y1; y++) n += bin.data[y * bin.width + x];
    out[x] = n;
  }
  return out;
}

/** Square erosion by radius r (separable min filter). */
export function erode(bin: BinaryImage, r: number): BinaryImage {
  if (r <= 0) return bin;
  const { width: w, height: h, data } = bin;
  const tmp = new Uint8Array(w * h).fill(1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[row + x]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      tmp.fill(0, row + x0, row + x1 + 1);
    }
  }
  const out = new Uint8Array(w * h).fill(1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) continue;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) out[yy * w + x] = 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** Morphological opening: keeps only solid regions thicker than 2r. */
export function open(bin: BinaryImage, r: number): BinaryImage {
  return dilate(erode(bin, r), r);
}

export function xorBinary(a: BinaryImage, b: BinaryImage): BinaryImage {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = a.data[i] ^ b.data[i];
  return { width: a.width, height: a.height, data: out };
}

/** Dilation by rx horizontally and ry vertically (either may be 0). */
export function dilateAxis(bin: BinaryImage, rx: number, ry: number): BinaryImage {
  const { width: w, height: h, data } = bin;
  let cur = data;
  if (rx > 0) {
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (!cur[row + x]) continue;
        tmp.fill(1, row + Math.max(0, x - rx), row + Math.min(w - 1, x + rx) + 1);
      }
    }
    cur = tmp;
  }
  if (ry > 0) {
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - ry);
      const y1 = Math.min(h - 1, y + ry);
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (!cur[row + x]) continue;
        for (let yy = y0; yy <= y1; yy++) tmp[yy * w + x] = 1;
      }
    }
    cur = tmp;
  }
  return { width: w, height: h, data: cur === data ? new Uint8Array(data) : cur };
}
