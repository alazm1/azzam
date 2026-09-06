import type { ExtractedLesson } from '../types';
import { normalizeArabic, toArabicDigits } from './normalize';

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
  return normalizeArabic(name)
    .replace(/هـ/g, 'ه')
    .replace(/\s*[/\\-]+\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
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

  fixDigitPairOrder(cleaned);
  fixSectionStyle(cleaned);

  const recognised = cleaned.filter((l) => l.confidence >= 0.5).length;
  const withClass = cleaned.filter((l) => l.className && l.confidence >= 0.35).length;
  const dayScore = Math.min(1, daysCount / 5);
  const periodScore = Math.min(1, periodsCount / 5);
  const lessonScore = cleaned.length ? (0.5 * recognised + 0.5 * withClass) / cleaned.length : 0;
  const quality = 0.35 * dayScore + 0.25 * periodScore + 0.4 * lessonScore;
  const ok = daysCount >= 3 && periodsCount >= 3 && cleaned.length >= 3 && quality >= 0.45;
  return { lessons: cleaned, warnings, quality, ok, message: ok ? undefined : FAILURE_MESSAGE };
}

/**
 * "2/4"-style names are ambiguous in direction. In a teacher's schedule the
 * grade is (almost always) the constant part and the section varies, so when
 * the second number is constant while the first varies, the pairs were read
 * mirrored and are swapped back.
 */
function fixDigitPairOrder(lessons: ExtractedLesson[]): void {
  const pairs = lessons
    .map((l) => ({ l, m: normalizeArabic(l.className).match(/^(\d{1,2})\/(\d{1,2})$/) }))
    .filter((x) => x.m) as Array<{ l: ExtractedLesson; m: RegExpMatchArray }>;
  if (pairs.length < 3) return;
  const firsts = new Set(pairs.map((p) => p.m[1]));
  const seconds = new Set(pairs.map((p) => p.m[2]));
  if (seconds.size === 1 && firsts.size >= 2) {
    for (const p of pairs) p.l.className = `${toArabicDigits(p.m[2])}/${toArabicDigits(p.m[1])}`;
  }
}

/**
 * A bare alef and the digit one look alike. When most sections in the schedule
 * are letters, a "/١" section is really "/أ" (and vice versa).
 */
function fixSectionStyle(lessons: ExtractedLesson[]): void {
  const parsed = lessons.map((l) => ({ l, m: normalizeArabic(l.className).match(/^(\d{1,2})\/(\S+)$/) }));
  const sections = parsed.filter((p) => p.m).map((p) => p.m![2]);
  if (sections.length < 3) return;
  const letters = sections.filter((x) => /^[ء-ي]+$/.test(x) && x !== 'ا').length;
  const digits = sections.filter((x) => /^\d+$/.test(x) && x !== '1').length;
  for (const p of parsed) {
    if (!p.m) continue;
    const grade = toArabicDigits(p.m[1]);
    if (letters > digits && letters >= 2 && (p.m[2] === '1' || p.m[2] === 'ا')) p.l.className = `${grade}/أ`;
    else if (digits > letters && digits >= 2 && p.m[2] === 'ا') p.l.className = `${grade}/١`;
  }
}
