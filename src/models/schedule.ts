import type { DayKey } from '../engine/types';

export type { DayKey };

export interface Lesson {
  id: string;
  day: DayKey;
  periodNumber: number;
  className: string;
  subject?: string;
  room?: string;
  note?: string;
  /** Colour token (hex) — always derived from the class name, never the subject. */
  color?: string;
  /** 0..1 confidence from the import, undefined for manual entries. */
  confidence?: number;
  /** Raw OCR text kept for reference. */
  rawText?: string;
}

export interface PeriodTime {
  number: number;
  /** "07:00" */
  start: string;
  /** "07:45" */
  end: string;
}

export interface ScheduleSettings {
  periodTimes: PeriodTime[];
}

export interface TeacherSchedule {
  id: string;
  /** Schema version for future migrations / sync. */
  version: 1;
  name?: string;
  days: DayKey[];
  periods: number[];
  lessons: Lesson[];
  /** class name → colour, persisted so colours stay stable. */
  classColors: Record<string, string>;
  settings: ScheduleSettings;
  createdAt: string;
  updatedAt: string;
  source?: {
    importedAt: string;
    quality: number;
    warnings: string[];
  };
}

export const SCHOOL_DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];

export const DEFAULT_PERIOD_TIMES: PeriodTime[] = [
  { number: 1, start: '07:00', end: '07:45' },
  { number: 2, start: '07:50', end: '08:35' },
  { number: 3, start: '08:40', end: '09:25' },
  { number: 4, start: '09:30', end: '10:15' },
  { number: 5, start: '10:35', end: '11:20' },
  { number: 6, start: '11:25', end: '12:10' },
  { number: 7, start: '12:15', end: '13:00' },
  { number: 8, start: '13:05', end: '13:50' },
];

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySchedule(): TeacherSchedule {
  const now = new Date().toISOString();
  return {
    id: newId(),
    version: 1,
    days: [...SCHOOL_DAYS],
    periods: [1, 2, 3, 4, 5, 6, 7],
    lessons: [],
    classColors: {},
    settings: { periodTimes: DEFAULT_PERIOD_TIMES.map((p) => ({ ...p })) },
    createdAt: now,
    updatedAt: now,
  };
}

export function lessonAt(schedule: TeacherSchedule, day: DayKey, period: number): Lesson | undefined {
  return schedule.lessons.find((l) => l.day === day && l.periodNumber === period);
}
