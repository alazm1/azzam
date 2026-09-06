/**
 * Data model of the wallpaper designer. The grid is periods × days
 * (grid[period][day]) which is also how the wallpaper is laid out.
 */
import { normalizeArabic, toArabicDigits } from '../engine/parse/normalize';

export const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'];
export const PALETTE = ['#d9ebe1', '#e1e7f9', '#f6e7c9', '#f0dfe8', '#daf0f2', '#eadffc', '#f4dfd4', '#e7edcf', '#dce7ed', '#eddfd8'];

export const arabic = toArabicDigits;

export type ThemeKey = 'green' | 'night' | 'paper';
export type FormatKey = 'phone' | 'landscape';

export interface Cell {
  subject: string;
  classroom: string;
  /** Raw OCR text for reference. */
  raw?: string;
  /** Flagged by the reader as uncertain (or occupied but unreadable). */
  needsReview?: boolean;
  /** Occupied slot (read from a photo or entered by hand). */
  occupied?: boolean;
  /** 0..1 confidence from the reader, undefined for manual entries. */
  confidence?: number;
  /** Different readings from several photos. */
  alternatives?: Array<{ subject: string; classroom: string; sourceImage: number }>;
  conflict?: boolean;
}

export type Grid = Cell[][];

export interface DesignState {
  version: 1;
  grid: Grid;
  name: string;
  title: string;
  theme: ThemeKey;
  format: FormatKey;
  clock: boolean;
  showSubject: boolean;
  /** class key → colour override */
  colors: Record<string, string>;
  source: 'empty' | 'photo' | 'reviewed' | 'manual';
}

export function emptyCell(): Cell {
  return { subject: '', classroom: '' };
}

export function emptyGrid(periods = 7, days = 5): Grid {
  return Array.from({ length: periods }, () => Array.from({ length: days }, emptyCell));
}

export function defaultState(): DesignState {
  return {
    version: 1,
    grid: emptyGrid(),
    name: '',
    title: 'جدولي الأسبوعي',
    theme: 'green',
    format: 'phone',
    clock: true,
    showSubject: true,
    colors: {},
    source: 'empty',
  };
}

/** Key used to give the same class the same colour whatever its spelling. */
export function classKey(v: string): string {
  return normalizeArabic(v || '')
    .replace(/\s*([/|\-–])\s*/g, '/')
    .replace(/هـ/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ClassInfo {
  key: string;
  label: string;
  color: string;
}

/** Distinct classes in first-appearance order with their default palette colour. */
export function getClasses(grid: Grid): ClassInfo[] {
  const m = new Map<string, string>();
  for (const row of grid) for (const c of row) if (c.classroom.trim() && !m.has(classKey(c.classroom))) m.set(classKey(c.classroom), c.classroom.trim());
  return [...m].map(([key, label], i) => ({ key, label, color: PALETTE[i % PALETTE.length] }));
}

export function isFilled(c: Cell): boolean {
  return !!(c.subject || c.classroom || c.occupied);
}

export function countLessons(grid: Grid): number {
  return grid.flat().filter(isFilled).length;
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((c) => ({ ...c, alternatives: c.alternatives ? [...c.alternatives] : undefined })));
}
