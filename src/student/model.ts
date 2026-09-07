/**
 * Data model of the university edition. Lectures are time ranges on a day;
 * the wallpaper lays days out as columns and hours as rows, and the hour
 * range stops at the latest lecture (e.g. 8:00 → 12:00 when nothing runs later).
 */
import { normalizeArabic, toArabicDigits } from '../engine/parse/normalize';
import { DAYS as DAY_LABELS, PALETTE, type FormatKey, type ThemeKey } from '../models/design';

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES: Record<DayKey, string> = { sun: DAY_LABELS[0], mon: DAY_LABELS[1], tue: DAY_LABELS[2], wed: DAY_LABELS[3], thu: DAY_LABELS[4], fri: DAY_LABELS[5], sat: DAY_LABELS[6] };

export const arabic = toArabicDigits;

export interface Lecture {
  id: string;
  day: DayKey;
  /** Minutes since midnight. */
  start: number;
  end: number;
  /** Course code / short name as written (e.g. "101 تقن", "قصد 414-3"). */
  course: string;
  room?: string;
  /** Flagged by the reader as uncertain. */
  needsReview?: boolean;
}

export interface StudentState {
  version: 1;
  lectures: Lecture[];
  name: string;
  title: string;
  theme: ThemeKey;
  format: FormatKey;
  clock: boolean;
  showRoom: boolean;
  showTime: boolean;
  /** course key → colour override */
  colors: Record<string, string>;
  source: 'empty' | 'photo' | 'reviewed' | 'manual';
}

export function defaultStudentState(): StudentState {
  return {
    version: 1,
    lectures: [],
    name: '',
    title: 'جدولي الجامعي',
    theme: 'green',
    format: 'phone',
    clock: true,
    showRoom: true,
    showTime: true,
    colors: {},
    source: 'empty',
  };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Same course keeps the same colour whatever the spacing / digits used. */
export function courseKey(v: string): string {
  return normalizeArabic(v || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s*[-–/]\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface CourseInfo {
  key: string;
  label: string;
  color: string;
}

export function getCourses(lectures: Lecture[]): CourseInfo[] {
  const m = new Map<string, string>();
  for (const l of lectures) {
    const k = courseKey(l.course);
    if (k && !m.has(k)) m.set(k, l.course.trim());
  }
  return [...m].map(([key, label], i) => ({ key, label, color: PALETTE[i % PALETTE.length] }));
}

/** Days shown as columns: Sunday–Thursday always, Friday/Saturday only when used. */
export function activeDays(lectures: Lecture[]): DayKey[] {
  const base: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];
  for (const extra of ['fri', 'sat'] as DayKey[]) if (lectures.some((l) => l.day === extra)) base.push(extra);
  return base;
}

export interface HourRange {
  startHour: number;
  endHour: number;
}

/**
 * Hour rows of the grid: from the earliest lecture's hour to the hour that
 * closes the latest lecture (11:50 → 12, 14:40 → 15). Defaults to 8–12.
 */
export function hourRange(lectures: Lecture[]): HourRange {
  if (!lectures.length) return { startHour: 8, endHour: 12 };
  const startHour = Math.floor(Math.min(...lectures.map((l) => l.start)) / 60);
  const endHour = Math.ceil(Math.max(...lectures.map((l) => l.end)) / 60);
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

/** 8:05 → "٨:٠٥"; hours are shown in 12-hour form without a suffix, like university grids. */
export function fmtTime(min: number, digits = true): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const s = `${h12}:${String(m).padStart(2, '0')}`;
  return digits ? toArabicDigits(s) : s;
}

export function fmtHour(h: number): string {
  return toArabicDigits(String(h % 12 === 0 ? 12 : h % 12));
}

/** "HH:MM" (24h) → minutes; returns null when malformed. */
export function parseTime(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function toInputTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function sortLectures(list: Lecture[]): Lecture[] {
  return [...list].sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.start - b.start);
}
