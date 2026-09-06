import { extractSchedule } from '../engine/pipeline';
import { encodeGrayToBlob } from '../engine/ocr/browserEncoder';
import { TesseractOcrEngine, type OcrEngine } from '../engine/ocr/ocrService';
import type { ExtractionResult, ProgressCallback } from '../engine/types';
import { fileToRaster } from './imageLoad';

let engine: OcrEngine | null = null;

/** Lazily creates the on-device OCR engine (all assets are served from this origin). */
export function getOcrEngine(): OcrEngine {
  if (engine) return engine;
  const origin = new URL(import.meta.env.BASE_URL, window.location.origin).href.replace(/\/$/, '');
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  engine = new TesseractOcrEngine({
    langs: 'ara',
    workers: Math.max(1, Math.min(3, cores - 1)),
    workerPath: `${origin}/tesseract/worker.min.js`,
    corePath: `${origin}/tesseract/`,
    langPath: `${origin}/tessdata`,
    gzip: true,
    encode: encodeGrayToBlob,
  });
  return engine;
}

/** Warms up the OCR engine in the background (downloads + compiles the WASM core). */
export function warmUpOcr(): void {
  getOcrEngine()
    .init()
    .catch(() => {
      // will retry on first use
    });
}

/** Runs the full extraction on an image file, reporting progress in Arabic. */
export async function analyzeScheduleImage(file: Blob, onProgress: ProgressCallback): Promise<ExtractionResult> {
  onProgress({ stage: 'preprocess', progress: 0.01, message: 'فتح الصورة…' });
  const raster = await fileToRaster(file);
  // Let the UI paint before the heavy synchronous image work starts.
  await new Promise((r) => setTimeout(r, 30));
  return extractSchedule(raster, { ocr: getOcrEngine(), onProgress });
}
