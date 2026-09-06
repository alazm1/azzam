import type { GrayImage, OcrResult } from '../types';

/** Page segmentation modes we use (subset of Tesseract PSM). */
export type SegmentationMode = 'block' | 'line' | 'word';

export interface RecognizeOptions {
  mode?: SegmentationMode;
}

/**
 * Abstract OCR engine. The extraction pipeline only depends on this
 * interface, so the OCR backend can be swapped (Tesseract today, a cloud or
 * on-device model later) without touching the rest of the engine.
 */
export interface OcrEngine {
  init(): Promise<void>;
  recognize(image: GrayImage, opts?: RecognizeOptions): Promise<OcrResult>;
  terminate(): Promise<void>;
}

/** Converts a gray image into something Tesseract can ingest (PNG blob/buffer). */
export type ImageEncoder = (image: GrayImage) => Promise<unknown>;

export interface TesseractOcrOptions {
  /** Tesseract language string, e.g. "ara+eng". */
  langs?: string;
  /** Number of parallel workers. */
  workers?: number;
  workerPath?: string;
  corePath?: string;
  langPath?: string;
  /** Force-disable gzip lookup when language files are stored uncompressed. */
  gzip?: boolean;
  encode: ImageEncoder;
  logger?: (message: string) => void;
}

const PSM: Record<SegmentationMode, string> = { block: '6', line: '7', word: '8' };

/**
 * Tesseract.js-backed OCR with a small worker pool. Works in browsers and in
 * Node; the caller supplies the environment-specific image encoder.
 */
export class TesseractOcrEngine implements OcrEngine {
  private workers: import('tesseract.js').Worker[] = [];
  private queue: Array<() => void> = [];
  private idle: import('tesseract.js').Worker[] = [];
  private initPromise: Promise<void> | null = null;
  private currentMode = new Map<import('tesseract.js').Worker, SegmentationMode>();

  constructor(private readonly options: TesseractOcrOptions) {}

  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const { createWorker, OEM } = await import('tesseract.js');
    const n = Math.max(1, this.options.workers ?? 2);
    const langs = this.options.langs ?? 'ara+eng';
    const workerOptions: Record<string, unknown> = {};
    if (this.options.workerPath) workerOptions.workerPath = this.options.workerPath;
    if (this.options.corePath) workerOptions.corePath = this.options.corePath;
    if (this.options.langPath) workerOptions.langPath = this.options.langPath;
    if (this.options.gzip !== undefined) workerOptions.gzip = this.options.gzip;
    if (this.options.logger) {
      const log = this.options.logger;
      workerOptions.logger = (m: { status?: string; progress?: number }) => log(`${m.status ?? ''} ${m.progress ?? ''}`);
    }
    const created = await Promise.all(
      Array.from({ length: n }, async () => {
        const worker = await createWorker(langs, OEM.LSTM_ONLY, workerOptions);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.block as never,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        });
        this.currentMode.set(worker, 'block');
        return worker;
      }),
    );
    this.workers = created;
    this.idle = [...created];
  }

  private acquire(): Promise<import('tesseract.js').Worker> {
    const w = this.idle.pop();
    if (w) return Promise.resolve(w);
    return new Promise((resolve) => {
      this.queue.push(() => resolve(this.idle.pop()!));
    });
  }

  private release(w: import('tesseract.js').Worker) {
    this.idle.push(w);
    const next = this.queue.shift();
    if (next) next();
  }

  async recognize(image: GrayImage, opts: RecognizeOptions = {}): Promise<OcrResult> {
    await this.init();
    const mode = opts.mode ?? 'block';
    const encoded = await this.options.encode(image);
    const worker = await this.acquire();
    try {
      if (this.currentMode.get(worker) !== mode) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM[mode] as never });
        this.currentMode.set(worker, mode);
      }
      const { data } = await worker.recognize(encoded as never, {}, { text: true, blocks: true });
      const words: OcrResult['words'] = [];
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            for (const word of line.words ?? []) {
              if (word.text.trim()) words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox ? { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 } : undefined });
            }
          }
        }
      }
      const text = (data.text ?? '').replace(/\s+\n/g, '\n').trim();
      const confidence = words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : text ? data.confidence : 0;
      return { text, confidence, words };
    } finally {
      this.release(worker);
    }
  }

  async terminate(): Promise<void> {
    const ws = this.workers;
    this.workers = [];
    this.idle = [];
    await Promise.all(ws.map((w) => w.terminate()));
    this.initPromise = null;
  }
}
