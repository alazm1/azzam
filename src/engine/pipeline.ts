import { rotateGray, cropGray, padGray, resizeGray, meanGray, blur3 } from './image/raster';
import { recognizeShortLabel } from './ocr/glyphClassifier';
import { parseClassName, matchPeriod, matchDay, matchSubject } from './parse/classify';
import { normalizeArabic } from './parse/normalize';
import { preprocess, binarize } from './image/preprocessor';
import { detectGrid } from './image/tableDetector';
import type { OcrEngine } from './ocr/ocrService';
import { parseSchedule, type ParseOutput } from './parse/scheduleParser';
import { validateSchedule, FAILURE_MESSAGE } from './parse/scheduleValidator';
import type { BinaryImage, CellBox, CellRead, ExtractionResult, GrayImage, Grid, ProgressCallback, Raster } from './types';

export interface ExtractOptions {
  ocr: OcrEngine;
  onProgress?: ProgressCallback;
  /** Longest side of the working image. */
  maxDimension?: number;
  /** Try 180/90/270 rotations when the upright pass fails (default true). */
  tryRotations?: boolean;
  /** Collect intermediate images for debugging / tests. */
  debug?: boolean;
}

export interface DebugInfo {
  gray: GrayImage;
  grid: Grid | null;
  reads: CellRead[];
}

const STAGE_MESSAGES = {
  preprocess: 'تجهيز الصورة وتصحيح الميل…',
  detect: 'اكتشاف بنية الجدول…',
  ocr: 'قراءة النصوص…',
  parse: 'فهم الأيام والحصص والفصول…',
  done: 'اكتمل التحليل',
} as const;

function inkCount(bin: BinaryImage, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  const ys = Math.max(0, Math.round(y0));
  const ye = Math.min(bin.height, Math.round(y1));
  const xs = Math.max(0, Math.round(x0));
  const xe = Math.min(bin.width, Math.round(x1));
  for (let y = ys; y < ye; y++) {
    const row = y * bin.width;
    for (let x = xs; x < xe; x++) n += bin.data[row + x];
  }
  return n;
}

export interface LineCrop {
  image: GrayImage;
  /** Height of the ink in the working image (before scaling). */
  inkHeight: number;
  /** Working-image x of the crop's left edge, its scale factor and padding (to map word boxes back). */
  originX: number;
  scale: number;
  pad: number;
}

/**
 * Stretches a crop so its background becomes white and its text black,
 * whatever the cell colour. Uses the 5th/95th percentiles of the crop.
 */
function normalizeCrop(crop: GrayImage): GrayImage {
  const hist = new Uint32Array(256);
  for (let i = 0; i < crop.data.length; i++) hist[crop.data[i]]++;
  const total = crop.data.length;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.03) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total * 0.2) {
      hi = v;
      break;
    }
  }
  if (hi - lo < 40) return crop;
  const out = new Uint8Array(crop.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = ((crop.data[i] - lo) * 255) / (hi - lo);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0;
  }
  return { width: crop.width, height: crop.height, data: out };
}

/** Mild unsharp mask: separates touching strokes in blurry, upscaled crops. */
function unsharp(img: GrayImage): GrayImage {
  const b = blur3(img);
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = img.data[i] * 1.6 - b.data[i] * 0.6;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Splits the ink inside a rect into horizontal text lines (row-projection gaps). */
function textLineBands(ink: BinaryImage, x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const proj: number[] = [];
  for (let y = y0; y < y1; y++) {
    let n = 0;
    const row = y * ink.width;
    for (let x = x0; x < x1; x++) n += ink.data[row + x];
    proj.push(n);
  }
  const bands: Array<[number, number]> = [];
  let start = -1;
  let gap = 0;
  const minGap = 3;
  for (let i = 0; i <= proj.length; i++) {
    const v = i < proj.length ? proj[i] : 0;
    if (v > 0) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap >= minGap || i === proj.length) {
        bands.push([y0 + start, y0 + i - gap + 1]);
        start = -1;
        gap = 0;
      }
    }
  }
  // Merge bands that are tiny relative to their neighbour (dots/diacritics split off).
  const merged: Array<[number, number]> = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    const h = b[1] - b[0];
    if (last) {
      const lh = last[1] - last[0];
      const gapPx = b[0] - last[1];
      if ((h < lh * 0.35 || lh < h * 0.35) && gapPx <= Math.max(lh, h) * 0.6) {
        last[1] = b[1];
        continue;
      }
    }
    merged.push([b[0], b[1]]);
  }
  return merged;
}

/**
 * Cuts a cell out of the working image as one crop per text line, each
 * tightened around its ink and scaled so glyphs are ~42 px tall (OCR sweet
 * spot). Inverted cells (light text on dark) are flipped to dark-on-light.
 */
export function prepareCellLines(gray: GrayImage, textInk: BinaryImage, cell: CellBox, inset: number): LineCrop[] {
  const x0 = Math.max(0, Math.round(cell.x + inset));
  const y0 = Math.max(0, Math.round(cell.y + inset));
  const x1 = Math.min(gray.width, Math.round(cell.x + cell.w - inset));
  const y1 = Math.min(gray.height, Math.round(cell.y + cell.h - inset));
  if (x1 - x0 < 6 || y1 - y0 < 6) return [];
  const bands = textLineBands(textInk, x0, y0, x1, y1);
  const out: LineCrop[] = [];
  for (const [by0, by1] of bands) {
    // tight horizontal bbox for this band
    let ix0 = x1;
    let ix1 = x0;
    for (let y = by0; y < by1; y++) {
      const row = y * textInk.width;
      for (let x = x0; x < x1; x++) {
        if (!textInk.data[row + x]) continue;
        if (x < ix0) ix0 = x;
        if (x > ix1) ix1 = x;
      }
    }
    if (ix1 < ix0) continue;
    const inkHeight = by1 - by0;
    if (inkHeight < 4 || ix1 - ix0 < 4) continue;
    // a flat stroke (dash marking a free period) is not text
    if (inkHeight <= 7 && (ix1 - ix0 + 1) / inkHeight >= 4) continue;
    if (inkCount(textInk, ix0, by0, ix1 + 1, by1) < 12) continue;
    // stray dots / diacritics that were not merged into a text line
    const tallest = Math.max(...bands.map((b) => b[1] - b[0]));
    if (inkHeight < tallest * 0.3) continue;
    const margin = Math.max(4, Math.round(inkHeight * 0.35));
    const rect = {
      x: Math.max(x0, ix0 - margin),
      y: Math.max(y0, by0 - margin),
      w: Math.min(x1, ix1 + 1 + margin) - Math.max(x0, ix0 - margin),
      h: Math.min(y1, by1 + margin) - Math.max(y0, by0 - margin),
    };
    let crop = cropGray(gray, rect);
    if (meanGray(crop) < 110) {
      for (let i = 0; i < crop.data.length; i++) crop.data[i] = 255 - crop.data[i];
    }
    crop = normalizeCrop(crop);
    const scale = Math.max(1, Math.min(6, 42 / inkHeight));
    if (scale > 1.05) crop = resizeGray(crop, crop.width * scale, crop.height * scale);
    if (scale > 1.3) crop = unsharp(crop);
    out.push({ image: padGray(crop, 24, 255), inkHeight, originX: rect.x, scale, pad: 24 });
  }
  return out;
}

/** 1 when the text parses as a class name or period label, else 0. */
function labelScore(text: string): number {
  const norm = normalizeArabic(text);
  const cls = parseClassName(norm);
  if (cls) return cls.score;
  const period = matchPeriod(norm);
  return period ? period.score : 0;
}

/** Picks between the general OCR reading and the short-label reading of a cell. */
function chooseReading(
  ocrText: string,
  ocrConfidence: number,
  short: { text: string; confidence: number; glyphs: number } | null,
  shortParse: number,
): { text: string; ocrConfidence: number } {
  if (!short || shortParse === 0 || short.confidence < 0.35) return { text: ocrText, ocrConfidence };
  const norm = normalizeArabic(ocrText);
  // The general OCR wins when it read a meaningful word (day, period name, subject) with decent confidence.
  const letters = norm.replace(/[^ء-ي]/g, '').length;
  const word = matchDay(norm) ?? matchSubject(norm) ?? (letters >= 3 ? matchPeriod(norm) : null);
  if (word && word.score >= 0.7 && ocrConfidence >= 55) return { text: ocrText, ocrConfidence };
  // A real Arabic word (4+ letters) beats a short-label guess unless that guess is very sure.
  if (letters >= 4 && ocrConfidence >= 45 && short.confidence < 0.85) return { text: ocrText, ocrConfidence };
  if (letters >= 4 && ocrConfidence >= 80 && !/\d/.test(norm)) return { text: ocrText, ocrConfidence };
  const ocrParse = labelScore(ocrText);
  const ocrScore = ocrParse * (ocrConfidence / 100);
  const shortScore = shortParse * short.confidence;
  if (ocrParse === 0 || shortScore >= ocrScore) return { text: short.text, ocrConfidence: Math.round(short.confidence * 100) };
  return { text: ocrText, ocrConfidence };
}

interface LineReading {
  text: string;
  confidence: number; // 0..100
  words?: CellRead['words'];
}

/** Reads one text line: specialised short-label recogniser first, general OCR when needed. */
async function readLine(line: LineCrop, ocr: OcrEngine): Promise<LineReading> {
  const short = recognizeShortLabel(line.image, 5);
  if (short && short.text === '') return { text: '', confidence: Math.round(short.confidence * 100) };
  const shortParse = short ? labelScore(short.text) : 0;
  const strict = short ? /^(\d{1,2}|\d{1,2}[/-][ء-يa-zA-Z0-9])$/.test(normalizeArabic(short.text)) : false;
  if (short && strict && shortParse > 0 && short.confidence >= 0.8 && short.glyphs <= 4) {
    return { text: short.text, confidence: Math.round(short.confidence * 100) };
  }
  try {
    // very wide lines (merged header cells) hold several labels: let the OCR segment them
    const wide = line.image.width / line.image.height > 5;
    const res = await ocr.recognize(line.image, { mode: wide ? 'block' : 'line' });
    const chosen = chooseReading(res.text, res.confidence, short, shortParse);
    const words = chosen.text === res.text
      ? res.words
          .filter((w) => w.bbox)
          .map((w) => ({ text: w.text, confidence: w.confidence, x0: line.originX + (w.bbox!.x0 - line.pad) / line.scale, x1: line.originX + (w.bbox!.x1 - line.pad) / line.scale }))
      : undefined;
    return { text: chosen.text, confidence: chosen.ocrConfidence, words };
  } catch {
    return short && shortParse > 0 ? { text: short.text, confidence: Math.round(short.confidence * 100) } : { text: '', confidence: 0 };
  }
}

async function readCells(
  gray: GrayImage,
  textInk: BinaryImage,
  grid: Grid,
  ocr: OcrEngine,
  onProgress: (current: number, total: number) => void,
): Promise<CellRead[]> {
  const dim = Math.max(gray.width, gray.height);
  const baseInset = Math.max(3, Math.round(dim * 0.004));
  const reads: CellRead[] = [];
  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = grid.cells.length;
  const tick = () => {
    done++;
    onProgress(done, total);
  };
  for (const cell of grid.cells) {
    // Card layouts: keep clear of the rounded outline of each box.
    const inset = grid.method === 'boxes' ? Math.max(baseInset, Math.round(Math.min(cell.w, cell.h) * 0.1)) : baseInset;
    const ink = inkCount(textInk, cell.x + inset, cell.y + inset, cell.x + cell.w - inset, cell.y + cell.h - inset);
    const area = Math.max(1, (cell.w - inset * 2) * (cell.h - inset * 2));
    if (ink < 12 || ink / area < 0.0015) {
      reads.push({ ...cell, text: '', ocrConfidence: 100 });
      tick();
      continue;
    }
    const lines = prepareCellLines(gray, textInk, cell, inset);
    if (!lines.length) {
      reads.push({ ...cell, text: '', ocrConfidence: 100 });
      tick();
      continue;
    }
    jobs.push(
      Promise.all(lines.map((l) => readLine(l, ocr)))
        .then((results) => {
          const texts = results.map((r) => r.text.trim()).filter(Boolean);
          const conf = results.length ? results.reduce((s, r) => s + r.confidence, 0) / results.length : 0;
          const words = results.flatMap((r) => r.words ?? []);
          reads.push({ ...cell, text: texts.join('\n'), ocrConfidence: conf, words: words.length ? words : undefined });
        })
        .catch(() => {
          reads.push({ ...cell, text: '', ocrConfidence: 0 });
        })
        .finally(tick),
    );
  }
  await Promise.all(jobs);
  reads.sort((a, b) => a.row - b.row || a.col - b.col);
  return reads;
}

interface PassResult {
  parse: ParseOutput;
  grid: Grid | null;
  reads: CellRead[];
  gray: GrayImage;
  rotation: 0 | 90 | 180 | 270;
}

async function runPass(
  gray: GrayImage,
  binary: BinaryImage,
  lineBinary: BinaryImage,
  rotation: 0 | 90 | 180 | 270,
  ocr: OcrEngine,
  onProgress: ProgressCallback,
  progressBase: number,
  progressSpan: number,
): Promise<PassResult> {
  onProgress({ stage: 'detect', progress: progressBase, message: STAGE_MESSAGES.detect });
  const det = detectGrid(binary, {}, lineBinary);
  if (!det.grid || det.grid.rows < 2 || det.grid.cols < 2) {
    return { parse: emptyParse(), grid: det.grid, reads: [], gray, rotation };
  }
  const reads = await readCells(gray, det.textInk, det.grid, ocr, (current, total) => {
    onProgress({
      stage: 'ocr',
      progress: progressBase + progressSpan * (0.1 + 0.8 * (current / Math.max(1, total))),
      message: STAGE_MESSAGES.ocr,
      detail: { current, total },
    });
  });
  onProgress({ stage: 'parse', progress: progressBase + progressSpan * 0.95, message: STAGE_MESSAGES.parse });
  const parse = parseSchedule(reads, det.grid);
  return { parse, grid: det.grid, reads, gray, rotation };
}

function emptyParse(): ParseOutput {
  return { orientation: 'days-in-rows', days: [], periods: [], lessons: [], cells: [], warnings: [], daysRead: 0, periodsRead: 0, score: 0 };
}

function passIsGood(p: ParseOutput): boolean {
  return p.daysRead >= 3 && p.periodsRead >= 3;
}

/**
 * Runs the full extraction: preprocess → detect grid → OCR cells → parse →
 * validate. Never throws for "bad image" situations; it returns a failed
 * result with a user-facing Arabic message instead.
 */
export async function extractSchedule(raster: Raster, options: ExtractOptions): Promise<ExtractionResult & { debug?: DebugInfo }> {
  const started = Date.now();
  const onProgress = options.onProgress ?? (() => {});
  onProgress({ stage: 'preprocess', progress: 0.02, message: STAGE_MESSAGES.preprocess });
  await options.ocr.init();

  const pre = preprocess(raster, { maxDimension: options.maxDimension });
  let best = await runPass(pre.gray, pre.binary, pre.lineBinary, 0, options.ocr, onProgress, 0.1, 0.8);

  if (options.tryRotations !== false && !passIsGood(best.parse)) {
    const rotations: Array<90 | 180 | 270> = [180, 90, 270];
    for (const rot of rotations) {
      onProgress({ stage: 'detect', progress: 0.9, message: 'محاولة قراءة الصورة باتجاه مختلف…' });
      const g = rotateGray(pre.gray, rot);
      const b = binarize(g);
      const pass = await runPass(g, b, binarize(g, 5), rot, options.ocr, onProgress, 0.9, 0.08);
      // Only real day/period words justify switching orientation, not a higher raw score.
      if (pass.parse.daysRead >= 2 && pass.parse.periodsRead >= 1 && pass.parse.score > best.parse.score) best = pass;
      if (passIsGood(best.parse)) break;
    }
  }

  const { parse, grid, reads } = best;
  const validation = validateSchedule(parse.lessons, parse.days.length, parse.periods.length);
  const lessons = validation.lessons;
  const low = lessons.filter((l) => l.confidence < 0.5).length;
  const medium = lessons.filter((l) => l.confidence >= 0.5 && l.confidence < 0.8).length;
  const warnings = [...parse.warnings, ...validation.warnings];
  const status = validation.ok ? 'ok' : 'failed';
  onProgress({ stage: 'done', progress: 1, message: STAGE_MESSAGES.done });

  const result: ExtractionResult & { debug?: DebugInfo } = {
    status,
    message: status === 'failed' ? validation.message ?? FAILURE_MESSAGE : undefined,
    orientation: parse.orientation,
    days: parse.days,
    periods: parse.periods,
    lessons,
    cells: parse.cells,
    grid,
    warnings,
    stats: {
      cellsTotal: reads.length,
      cellsWithText: reads.filter((r) => r.text.trim()).length,
      daysDetected: parse.days.length,
      periodsDetected: parse.periods.length,
      lessonsDetected: lessons.length,
      lowConfidence: low,
      mediumConfidence: medium,
      quality: validation.quality,
      durationMs: Date.now() - started,
      rotationApplied: best.rotation,
      gridMethod: grid?.method ?? 'lines',
      perspectiveCorrected: pre.perspectiveCorrected,
    },
  };
  if (options.debug) result.debug = { gray: best.gray, grid, reads };
  return result;
}
