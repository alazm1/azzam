import type { ExtractedLesson } from '../../src/engine/types';
import { classKey } from '../../src/engine/parse/scheduleValidator';

export interface ExpectedLesson {
  day: string;
  period: number;
  className: string;
  subject?: string;
}

export interface Score {
  expected: number;
  correct: number;
  wrongClass: number;
  missing: number;
  extra: number;
  subjectCorrect: number;
  subjectExpected: number;
  accuracy: number;
  mistakes: string[];
}

export function scoreLessons(expected: ExpectedLesson[], actual: ExtractedLesson[]): Score {
  const byKey = new Map(actual.map((l) => [`${l.day}:${l.period}`, l]));
  const s: Score = { expected: expected.length, correct: 0, wrongClass: 0, missing: 0, extra: 0, subjectCorrect: 0, subjectExpected: 0, accuracy: 0, mistakes: [] };
  const seen = new Set<string>();
  for (const e of expected) {
    const key = `${e.day}:${e.period}`;
    seen.add(key);
    const a = byKey.get(key);
    if (!a) {
      s.missing++;
      s.mistakes.push(`missing ${key} (${e.className})`);
      continue;
    }
    if (classKey(a.className) === classKey(e.className)) s.correct++;
    else {
      s.wrongClass++;
      s.mistakes.push(`wrong ${key}: expected "${e.className}" got "${a.className}" raw="${a.rawText.replace(/\n/g, '⏎')}"`);
    }
    if (e.subject) {
      s.subjectExpected++;
      if (a.subject === e.subject) s.subjectCorrect++;
    }
  }
  for (const a of actual) {
    const key = `${a.day}:${a.period}`;
    if (!seen.has(key)) {
      s.extra++;
      s.mistakes.push(`extra ${key}: "${a.className}" raw="${a.rawText.replace(/\n/g, '⏎')}"`);
    }
  }
  s.accuracy = s.correct / Math.max(1, s.expected + s.extra);
  return s;
}
