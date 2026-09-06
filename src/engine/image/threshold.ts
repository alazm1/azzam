import type { BinaryImage, GrayImage } from '../types';

/** Summed-area table (integral image) with an extra zero row/col. */
export function integralImage(img: GrayImage): Float64Array {
  const { width: w, height: h, data } = img;
  const W = w + 1;
  const out = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    for (let x = 1; x <= w; x++) {
      rowSum += data[(y - 1) * w + (x - 1)];
      out[y * W + x] = out[(y - 1) * W + x] + rowSum;
    }
  }
  return out;
}

/**
 * Adaptive mean threshold: a pixel is ink when it is darker than the local
 * mean minus a constant. Robust to uneven lighting and colored backgrounds.
 */
export function adaptiveThreshold(img: GrayImage, windowSize = 31, c = 12): BinaryImage {
  const { width: w, height: h, data } = img;
  const W = w + 1;
  const integ = integralImage(img);
  const r = Math.max(1, windowSize >> 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
      const mean = sum / area;
      out[y * w + x] = data[y * w + x] < mean - c ? 1 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** Otsu global threshold value. */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

export function globalThreshold(img: GrayImage, t: number): BinaryImage {
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = img.data[i] < t ? 1 : 0;
  return { width: img.width, height: img.height, data: out };
}

export function inkRatio(bin: BinaryImage): number {
  let n = 0;
  for (let i = 0; i < bin.data.length; i++) n += bin.data[i];
  return n / bin.data.length;
}
