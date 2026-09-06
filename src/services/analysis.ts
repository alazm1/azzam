import { extractSchedule } from '../engine/pipeline';
import { encodeGrayToBlob } from '../engine/ocr/browserEncoder';
import { TesseractOcrEngine, type OcrEngine } from '../engine/ocr/ocrService';
import type { ExtractionResult, ProgressCallback } from '../engine/types';
import { fileToRaster } from './imageLoad';
import { loadSmartReaderConfig, readWithSmartReader, smartReaderEnabled } from './smartReader';

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

export interface AnalysisOutcome {
  result: ExtractionResult;
  /** Which reader produced the result. */
  reader: 'smart' | 'local';
  /** Why the smart reader was skipped, when it was. */
  smartSkipped?: string;
}

/**
 * Reads an image: the smart reader (Gemini via the owner's Worker) first when
 * it is configured and enabled, otherwise — or on any failure — the on-device
 * engine. Progress messages are in Arabic.
 */
export async function analyzeScheduleImage(file: Blob, onProgress: ProgressCallback): Promise<AnalysisOutcome> {
  const config = await loadSmartReaderConfig();
  let smartSkipped: string | undefined;
  if (config.url && smartReaderEnabled()) {
    onProgress({ stage: 'ocr', progress: 0.15, message: 'القراءة الذكية للجدول…' });
    const outcome = await readWithSmartReader(file, config.url);
    if (outcome.kind === 'ok' && outcome.result.status === 'ok') {
      onProgress({ stage: 'done', progress: 1, message: 'اكتمل التحليل' });
      return { result: outcome.result, reader: 'smart' };
    }
    smartSkipped = outcome.kind === 'ok' ? 'too-few' : outcome.reason;
    onProgress({ stage: 'preprocess', progress: 0.2, message: 'تعذرت القراءة الذكية، نقرأ الصورة على جهازك…' });
  } else if (config.url) {
    smartSkipped = 'disabled';
  }
  onProgress({ stage: 'preprocess', progress: 0.22, message: 'فتح الصورة…' });
  const raster = await fileToRaster(file);
  // Let the UI paint before the heavy synchronous image work starts.
  await new Promise((r) => setTimeout(r, 30));
  const result = await extractSchedule(raster, { ocr: getOcrEngine(), onProgress });
  return { result, reader: 'local', smartSkipped };
}
