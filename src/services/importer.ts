import type { ExtractionResult } from '../engine/types';
import { createEmptySchedule, newId, type Lesson, type TeacherSchedule } from '../models/schedule';
import { assignClassColors } from './colors';

/** Lessons as edited on the review screen (before they become a schedule). */
export interface ReviewLesson extends Lesson {
  /** Whether the teacher already checked/edited this cell. */
  reviewed?: boolean;
}

export function extractionToReviewLessons(result: ExtractionResult): ReviewLesson[] {
  return result.lessons.map((l) => ({
    id: newId(),
    day: l.day,
    periodNumber: l.period,
    className: l.className,
    subject: l.subject,
    room: l.room,
    confidence: l.confidence,
    rawText: l.rawText,
  }));
}

/** Builds the final schedule from the reviewed lessons, keeping previous settings/colours when re-importing. */
export function buildSchedule(lessons: ReviewLesson[], periods: number[], result: ExtractionResult, previous: TeacherSchedule | null): TeacherSchedule {
  const base = previous ?? createEmptySchedule();
  const now = new Date().toISOString();
  const maxPeriod = Math.max(...periods, ...lessons.map((l) => l.periodNumber), 1);
  const allPeriods = Array.from({ length: Math.max(maxPeriod, Math.min(8, base.settings.periodTimes.length)) }, (_, i) => i + 1);
  const classColors = assignClassColors(
    lessons.map((l) => l.className),
    previous ? previous.classColors : {},
  );
  const cleaned: Lesson[] = lessons
    .filter((l) => l.className.trim() || l.subject)
    .map(({ reviewed: _reviewed, ...l }) => ({ ...l, className: l.className.trim(), color: classColors[l.className.trim()] }));
  return {
    ...base,
    id: previous?.id ?? newId(),
    days: ['sun', 'mon', 'tue', 'wed', 'thu'],
    periods: allPeriods,
    lessons: cleaned,
    classColors,
    settings: {
      periodTimes: allPeriods.map((n) => base.settings.periodTimes.find((t) => t.number === n) ?? { number: n, start: '13:00', end: '13:45' }),
    },
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    source: { importedAt: now, quality: result.stats.quality, warnings: result.warnings },
  };
}
