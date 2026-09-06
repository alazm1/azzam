import type { ExtractedLesson } from '../types';
import { normalizeArabic } from './normalize';

export interface ValidationOutput {
  lessons: ExtractedLesson[];
  warnings: string[];
  /** 0..1 */
  quality: number;
  ok: boolean;
  message?: string;
}

export const FAILURE_MESSAGE = 'لم نتمكن من قراءة الجدول بشكل كافٍ. حاول تصوير الجدول بشكل أوضح بحيث تظهر جميع الصفوف والأعمدة.';

/** Canonical key for grouping near-identical class names. */
export function classKey(name: string): string {
  return normalizeArabic(name).replace(/\s+/g, '').replace(/هـ/g, 'ه');
}

/**
 * Stage 6: sanity checks and light clean-up of the parsed lessons.
 * - unify spelling variants of the same class (uses the most confident one)
 * - drop impossible periods
 * - compute an overall quality score that decides whether the import is usable
 */
export function validateSchedule(lessons: ExtractedLesson[], daysCount: number, periodsCount: number): ValidationOutput {
  const warnings: string[] = [];
  const cleaned = lessons.filter((l) => l.period >= 1 && l.period <= 12);
  if (cleaned.length !== lessons.length) warnings.push('تم تجاهل حصص بأرقام غير منطقية');

  // Unify class-name variants.
  const groups = new Map<string, { name: string; conf: number }>();
  for (const l of cleaned) {
    if (!l.className) continue;
    const key = classKey(l.className);
    const g = groups.get(key);
    if (!g || l.confidence > g.conf) groups.set(key, { name: l.className, conf: l.confidence });
  }
  for (const l of cleaned) {
    if (!l.className) continue;
    const g = groups.get(classKey(l.className));
    if (g) l.className = g.name;
  }

  const recognised = cleaned.filter((l) => l.confidence >= 0.5).length;
  const withClass = cleaned.filter((l) => l.className && l.confidence >= 0.35).length;
  const dayScore = Math.min(1, daysCount / 5);
  const periodScore = Math.min(1, periodsCount / 5);
  const lessonScore = cleaned.length ? (0.5 * recognised + 0.5 * withClass) / cleaned.length : 0;
  const quality = 0.35 * dayScore + 0.25 * periodScore + 0.4 * lessonScore;
  const ok = daysCount >= 3 && periodsCount >= 3 && cleaned.length >= 3 && quality >= 0.45;
  return { lessons: cleaned, warnings, quality, ok, message: ok ? undefined : FAILURE_MESSAGE };
}
