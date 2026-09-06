/**
 * Core data types shared by the schedule-extraction engine.
 * The engine is framework-agnostic: it only depends on plain typed arrays so
 * it can run in the browser (main thread or worker) and in Node for tests.
 */

/** 8-bit RGBA raster (same layout as the DOM ImageData). */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 8-bit single-channel image (0 = black, 255 = white). */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Binary image: 1 = ink (foreground), 0 = background. */
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A logical cell of the detected grid (may span several rows/cols). */
export interface CellBox extends Rect {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export type GridMethod = 'lines' | 'projection' | 'boxes';

export interface Grid {
  rows: number;
  cols: number;
  /** y coordinates of horizontal grid lines (rows + 1 entries). */
  rowLines: number[];
  /** x coordinates of vertical grid lines (cols + 1 entries). */
  colLines: number[];
  cells: CellBox[];
  method: GridMethod;
}

export interface OcrWord {
  text: string;
  confidence: number; // 0..100
  /** Bounding box in the coordinates of the image given to the OCR (optional). */
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  /** 0..100 mean word confidence. */
  confidence: number;
  words: OcrWord[];
}

export interface CellRead extends CellBox {
  text: string;
  ocrConfidence: number; // 0..100
  /** Words with their horizontal position in working-image coordinates (when available). */
  words?: Array<{ text: string; x0: number; x1: number; confidence: number }>;
}

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export type CellKind = 'day' | 'period' | 'lesson' | 'empty' | 'other';

export interface ParsedCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  kind: CellKind;
  rawText: string;
  normalizedText: string;
  ocrConfidence: number; // 0..1
  parseConfidence: number; // 0..1
  day?: DayKey;
  period?: number;
  className?: string;
  subject?: string;
  room?: string;
  /** Clock time found in the cell (minutes since midnight), used to order periods. */
  timeMinutes?: number;
}

export type Orientation = 'days-in-rows' | 'days-in-columns';

export interface ExtractedLesson {
  day: DayKey;
  period: number;
  className: string;
  subject?: string;
  room?: string;
  rawText: string;
  /** 0..1 combined confidence. */
  confidence: number;
  /** Index of the source cell in the grid. */
  source: { row: number; col: number };
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ExtractionStats {
  cellsTotal: number;
  cellsWithText: number;
  daysDetected: number;
  periodsDetected: number;
  lessonsDetected: number;
  lowConfidence: number;
  mediumConfidence: number;
  /** 0..1 overall quality estimate used to decide success/failure. */
  quality: number;
  durationMs: number;
  rotationApplied: 0 | 90 | 180 | 270;
  gridMethod: GridMethod;
  perspectiveCorrected: boolean;
}

export interface ExtractionResult {
  status: 'ok' | 'failed';
  /** Arabic, user-facing message when status === 'failed'. */
  message?: string;
  orientation: Orientation;
  days: DayKey[];
  periods: number[];
  lessons: ExtractedLesson[];
  cells: ParsedCell[];
  grid: Grid | null;
  warnings: string[];
  stats: ExtractionStats;
}

export type ProgressStage = 'preprocess' | 'detect' | 'ocr' | 'parse' | 'done';

export interface ProgressEvent {
  stage: ProgressStage;
  /** 0..1 overall progress. */
  progress: number;
  /** Arabic message for the UI. */
  message: string;
  detail?: { current: number; total: number };
}

export type ProgressCallback = (event: ProgressEvent) => void;

export const SCHOOL_DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];
export const ALL_DAYS: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

export function confidenceLevel(c: number): ConfidenceLevel {
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}
