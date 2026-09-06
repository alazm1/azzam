import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { TesseractOcrEngine } from '../../src/engine/ocr/ocrService';
import { grayToRaster } from '../../src/engine/image/raster';
import type { GrayImage, Raster } from '../../src/engine/types';

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const FIXTURES = join(ROOT, 'tests', 'fixtures');

export function loadRaster(path: string): Raster {
  const buf = readFileSync(path);
  if (path.endsWith('.png')) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length) };
  }
  const img = jpeg.decode(buf, { useTArray: true });
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length) };
}

export function encodePng(img: GrayImage): Buffer {
  const raster = grayToRaster(img);
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.length);
  return PNG.sync.write(png);
}

export function savePng(path: string, img: GrayImage) {
  const { writeFileSync } = require('node:fs');
  writeFileSync(path, encodePng(img));
}

export function createNodeOcr(langs = process.env.OCR_LANGS ?? 'ara', workers = 3): TesseractOcrEngine {
  return new TesseractOcrEngine({
    langs,
    workers,
    langPath: join(ROOT, 'public', 'tessdata'),
    gzip: true,
    encode: async (img) => encodePng(img),
  });
}
