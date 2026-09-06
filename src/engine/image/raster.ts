import type { BinaryImage, GrayImage, Raster, Rect } from '../types';

export function toGray(img: Raster): GrayImage {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    // Rec. 601 luma; alpha is composited over white so transparent PNGs work.
    const a = data[j + 3] / 255;
    const r = data[j] * a + 255 * (1 - a);
    const g = data[j + 1] * a + 255 * (1 - a);
    const b = data[j + 2] * a + 255 * (1 - a);
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0;
  }
  return { width, height, data: out };
}

export function grayToRaster(img: GrayImage): Raster {
  const out = new Uint8ClampedArray(img.width * img.height * 4);
  for (let i = 0, j = 0; i < img.data.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = img.data[i];
    out[j + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

export function binaryToGray(bin: BinaryImage): GrayImage {
  const out = new Uint8Array(bin.data.length);
  for (let i = 0; i < out.length; i++) out[i] = bin.data[i] ? 0 : 255;
  return { width: bin.width, height: bin.height, data: out };
}

/** Bilinear resize of a gray image. */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  if (width === img.width && height === img.height) return { width, height, data: new Uint8Array(img.data) };
  const out = new Uint8Array(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  const src = img.data;
  const sw = img.width;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(img.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(img.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const p00 = src[y0 * sw + x0];
      const p01 = src[y0 * sw + x1];
      const p10 = src[y1 * sw + x0];
      const p11 = src[y1 * sw + x1];
      const top = p00 + (p01 - p00) * wx;
      const bot = p10 + (p11 - p10) * wx;
      out[y * width + x] = (top + (bot - top) * wy + 0.5) | 0;
    }
  }
  return { width, height, data: out };
}

/** Area-averaging downscale (better than bilinear for big reductions). */
export function downscaleGray(img: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return img;
  const width = Math.max(1, Math.floor(img.width / factor));
  const height = Math.max(1, Math.floor(img.height / factor));
  const out = new Uint8Array(width * height);
  const src = img.data;
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * factor);
    const sy1 = Math.min(img.height, Math.floor((y + 1) * factor));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * factor);
      const sx1 = Math.min(img.width, Math.floor((x + 1) * factor));
      let sum = 0;
      let n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        const row = yy * img.width;
        for (let xx = sx0; xx < sx1; xx++) {
          sum += src[row + xx];
          n++;
        }
      }
      out[y * width + x] = n ? (sum / n + 0.5) | 0 : 255;
    }
  }
  return { width, height, data: out };
}

export function cropGray(img: GrayImage, rect: Rect): GrayImage {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const srcRow = (y0 + y) * img.width + x0;
    out.set(img.data.subarray(srcRow, srcRow + width), y * width);
  }
  return { width, height, data: out };
}

export function cropBinary(img: BinaryImage, rect: Rect): BinaryImage {
  return cropGray(img as GrayImage, rect) as BinaryImage;
}

/** Adds a uniform border of the given value around a gray image. */
export function padGray(img: GrayImage, pad: number, value = 255): GrayImage {
  const width = img.width + pad * 2;
  const height = img.height + pad * 2;
  const out = new Uint8Array(width * height).fill(value);
  for (let y = 0; y < img.height; y++) {
    out.set(img.data.subarray(y * img.width, (y + 1) * img.width), (y + pad) * width + pad);
  }
  return { width, height, data: out };
}

export function rotateGray(img: GrayImage, angle: 0 | 90 | 180 | 270): GrayImage {
  if (angle === 0) return img;
  const { width: w, height: h, data } = img;
  if (angle === 180) {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[data.length - 1 - i] = data[i];
    return { width: w, height: h, data: out };
  }
  const out = new Uint8Array(data.length);
  if (angle === 90) {
    // clockwise: new(x, y) = old(y, h-1-x) ; new width = h
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < h; x++) {
        out[y * h + x] = data[(h - 1 - x) * w + y];
      }
    }
    return { width: h, height: w, data: out };
  }
  // 270 (counter-clockwise 90): new(x, y) = old(w-1-y, x)
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < h; x++) {
      out[y * h + x] = data[x * w + (w - 1 - y)];
    }
  }
  return { width: h, height: w, data: out };
}

/** Percentile-based contrast stretch. */
export function stretchContrast(img: GrayImage, lowPct = 0.02, highPct = 0.98): GrayImage {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * lowPct) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * (1 - highPct)) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 30) return img;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round(((v - lo) * 255) / (hi - lo))));
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = lut[img.data[i]];
  return { width: img.width, height: img.height, data: out };
}

/** Simple 3x3 box blur used to soften JPEG noise before thresholding. */
export function blur3(img: GrayImage): GrayImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          sum += data[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = (sum / n + 0.5) | 0;
    }
  }
  return { width: w, height: h, data: out };
}

export function meanGray(img: GrayImage): number {
  let s = 0;
  for (let i = 0; i < img.data.length; i++) s += img.data[i];
  return s / img.data.length;
}
