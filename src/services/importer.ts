/**
 * Turns engine results (one per photo) into the designer grid, merging
 * several photos of the same schedule and flagging uncertain cells.
 */
import type { DayKey, ExtractionResult } from '../engine/types';
import { emptyGrid, type Cell, type Grid } from '../models/design';

const DAY_INDEX: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export interface MergeInfo {
  count: number;
  dayCount: number;
  periodCount: number;
  uncertainCount: number;
  conflictCount: number;
  failedImages: number[];
  warnings: string[];
}

export interface ImageOutcome {
  index: number;
  result: ExtractionResult | null;
  error?: string;
}

export function mergeResults(outcomes: ImageOutcome[]): { grid: Grid; info: MergeInfo } {
  const successes = outcomes.filter((o) => o.result && o.result.status === 'ok') as Array<ImageOutcome & { result: ExtractionResult }>;
  const failedImages = outcomes.filter((o) => !o.result || o.result.status !== 'ok').map((o) => o.index + 1);
  const maxPeriod = Math.max(6, ...successes.flatMap((o) => o.result.lessons.map((l) => l.period)), ...successes.flatMap((o) => o.result.periods));
  const grid = emptyGrid(Math.min(12, maxPeriod), 5);
  const days = new Set<number>();
  const periods = new Set<number>();
  let uncertainCount = 0;
  let conflictCount = 0;
  const warnings = new Set<string>();
  for (const o of successes) {
    for (const w of o.result.warnings) warnings.add(w);
    for (const d of o.result.days) if (DAY_INDEX[d] < 5) days.add(DAY_INDEX[d]);
    for (const p of o.result.periods) periods.add(p);
    for (const l of o.result.lessons) {
      const d = DAY_INDEX[l.day];
      const p = l.period - 1;
      if (d > 4 || p < 0 || p >= grid.length) continue;
      const incoming: Cell = {
        subject: l.subject ?? '',
        classroom: l.className,
        raw: l.rawText,
        confidence: l.confidence,
        needsReview: l.confidence < 0.5,
        occupied: true,
      };
      const existing = grid[p][d];
      if (!existing.occupied) {
        grid[p][d] = incoming;
        continue;
      }
      const same = existing.classroom === incoming.classroom && (existing.subject === incoming.subject || !existing.subject || !incoming.subject);
      if (same) {
        if (!existing.subject && incoming.subject) existing.subject = incoming.subject;
        if ((incoming.confidence ?? 0) > (existing.confidence ?? 0)) {
          existing.confidence = incoming.confidence;
          existing.needsReview = (incoming.confidence ?? 0) < 0.5;
        }
        continue;
      }
      existing.conflict = true;
      existing.needsReview = true;
      existing.alternatives = [
        ...(existing.alternatives ?? [{ subject: existing.subject, classroom: existing.classroom, sourceImage: 1 }]),
        { subject: incoming.subject, classroom: incoming.classroom, sourceImage: o.index + 1 },
      ];
    }
  }
  for (const row of grid) {
    for (const c of row) {
      if (c.needsReview) uncertainCount++;
      if (c.conflict) conflictCount++;
    }
  }
  const count = grid.flat().filter((c) => c.occupied).length;
  return {
    grid,
    info: { count, dayCount: days.size, periodCount: periods.size, uncertainCount, conflictCount, failedImages, warnings: [...warnings] },
  };
}
