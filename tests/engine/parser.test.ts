import { describe, expect, it } from 'vitest';
import { classifyCell, matchDay, matchPeriod, matchSubject, parseClassName } from '../../src/engine/parse/classify';
import { normalizeArabic, toArabicDigits } from '../../src/engine/parse/normalize';
import { parseSchedule } from '../../src/engine/parse/scheduleParser';
import { validateSchedule } from '../../src/engine/parse/scheduleValidator';
import type { CellRead, Grid } from '../../src/engine/types';

describe('normalizeArabic', () => {
  it('unifies digits, alef forms and strips diacritics', () => {
    expect(normalizeArabic('٢/أ')).toBe('2/ا');
    expect(normalizeArabic('الأَحَد')).toBe('الاحد');
    expect(normalizeArabic('ثانيةٌ')).toBe('ثانيه');
    expect(toArabicDigits(27)).toBe('٢٧');
  });
});

describe('matchDay', () => {
  it('recognises the five school days including OCR variants', () => {
    expect(matchDay(normalizeArabic('الأحد'))?.day).toBe('sun');
    expect(matchDay(normalizeArabic('يوم الاثنين'))?.day).toBe('mon');
    expect(matchDay(normalizeArabic('التلاتاء'))?.day).toBe('tue');
    expect(matchDay(normalizeArabic('الاربعاء'))?.day).toBe('wed');
    expect(matchDay(normalizeArabic('الخميس'))?.day).toBe('thu');
  });
  it('does not confuse period ordinals with days', () => {
    const cell = (text: string) => classifyCell({ row: 0, col: 0, rowSpan: 1, colSpan: 1, x: 0, y: 0, w: 1, h: 1, text, ocrConfidence: 90 });
    expect(cell('السابعة').kind).toBe('period');
    expect(cell('الأولى').kind).toBe('period');
    expect(cell('الأيام').kind).toBe('other');
  });
});

describe('matchPeriod', () => {
  it('reads numbers, ordinals and "الحصة N"', () => {
    expect(matchPeriod(normalizeArabic('٣'))?.period).toBe(3);
    expect(matchPeriod(normalizeArabic('الحصة الرابعة'))?.period).toBe(4);
    expect(matchPeriod(normalizeArabic('الحصة ٧'))?.period).toBe(7);
    expect(matchPeriod(normalizeArabic('الثامنة 12:00'))?.period).toBe(8);
    expect(matchPeriod(normalizeArabic('ح5'))?.period).toBe(5);
  });
});

describe('parseClassName', () => {
  const parse = (t: string) => parseClassName(normalizeArabic(t))?.className;
  it('handles slash forms in both reading orders', () => {
    expect(parse('٢/أ')).toBe('٢/أ');
    expect(parse('أ/٢')).toBe('٢/أ');
    expect(parse('3/ب')).toBe('٣/ب');
    expect(parse('١/ا')).toBe('١/أ');
    expect(parse('٢-ب')).toBe('٢/ب');
    expect(parse('3/1')).toBe('٣/١');
  });
  it('handles worded forms and OCR-glued sections', () => {
    expect(parse('ثاني متوسط أ')).toBe('ثاني متوسط أ');
    expect(parse('رياضيات ثاني متوسطب')).toBe('ثاني متوسط ب');
    expect(parse('الصف الثالث ب')).toBe('ثالث ب');
    expect(parse('ثالث ثانوي/أ')).toBe('ثالث ثانوي أ');
    expect(parse('اني متوسطأ')).toBe('ثاني متوسط أ');
  });
  it('rejects bare ordinals (those are periods)', () => {
    expect(parse('الثانية')).toBeUndefined();
  });
});

describe('matchSubject', () => {
  it('finds subjects inside cell text', () => {
    expect(matchSubject(normalizeArabic('رياضيات ٢/أ'))?.subject).toBe('رياضيات');
    expect(matchSubject(normalizeArabic('لغه انجليزيه'))?.subject).toBe('لغة إنجليزية');
    expect(matchSubject(normalizeArabic('علوم'))?.subject).toBe('علوم');
  });
});

function gridFor(rows: number, cols: number): Grid {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, x: c * 100, y: r * 50, w: 100, h: 50 });
  return { rows, cols, rowLines: [], colLines: [], cells, method: 'lines' };
}

function reads(texts: string[][]): CellRead[] {
  const out: CellRead[] = [];
  texts.forEach((row, r) => row.forEach((text, c) => out.push({ row: r, col: c, rowSpan: 1, colSpan: 1, x: c * 100, y: r * 50, w: 100, h: 50, text, ocrConfidence: 90 })));
  return out;
}

describe('parseSchedule', () => {
  it('understands days-in-rows tables laid out right-to-left', () => {
    // visual order: rightmost column is the day column (index cols-1)
    const table = [
      ['٣', '٢', '١', 'اليوم'],
      ['', '٢/ب', '١/أ', 'الأحد'],
      ['٣/أ', '', '٢/أ', 'الاثنين'],
    ];
    const p = parseSchedule(reads(table), gridFor(3, 4));
    expect(p.orientation).toBe('days-in-rows');
    expect(p.days).toEqual(['sun', 'mon']);
    expect(p.periods).toEqual([1, 2, 3]);
    const key = (d: string, n: number) => p.lessons.find((l) => l.day === d && l.period === n)?.className;
    expect(key('sun', 1)).toBe('١/أ');
    expect(key('sun', 2)).toBe('٢/ب');
    expect(key('mon', 3)).toBe('٣/أ');
    expect(key('mon', 2)).toBeUndefined();
  });

  it('understands days-in-columns tables', () => {
    const table = [
      ['الاثنين', 'الأحد', 'الحصة'],
      ['٢/أ', '١/أ', 'الأولى'],
      ['', '٢/ب', 'الثانية'],
    ];
    const p = parseSchedule(reads(table), gridFor(3, 3));
    expect(p.orientation).toBe('days-in-columns');
    const key = (d: string, n: number) => p.lessons.find((l) => l.day === d && l.period === n)?.className;
    expect(key('sun', 1)).toBe('١/أ');
    expect(key('sun', 2)).toBe('٢/ب');
    expect(key('mon', 1)).toBe('٢/أ');
  });

  it('infers a missing period label from its neighbours', () => {
    const table = [
      ['٤', '', '٢', '١', 'اليوم'],
      ['١/أ', '٢/أ', '٣/أ', '١/ب', 'الأحد'],
      ['', '١/أ', '', '٢/ب', 'الاثنين'],
      ['٢/ب', '', '١/ب', '', 'الثلاثاء'],
    ];
    const p = parseSchedule(reads(table), gridFor(4, 5));
    expect(p.periods).toEqual([1, 2, 3, 4]);
    expect(p.lessons.find((l) => l.day === 'sun' && l.period === 3)?.className).toBe('٢/أ');
  });

  it('numbers columns positionally when no period labels were read', () => {
    const table = [
      ['', '٢/ب', '١/أ', 'الأحد'],
      ['٣/أ', '', '٢/أ', 'الاثنين'],
      ['١/ب', '٢/أ', '', 'الثلاثاء'],
    ];
    const p = parseSchedule(reads(table), gridFor(3, 4));
    expect(p.periods).toEqual([1, 2, 3]);
    expect(p.lessons.find((l) => l.day === 'sun' && l.period === 1)?.className).toBe('١/أ');
    expect(p.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateSchedule', () => {
  it('unifies spelling variants of the same class and computes quality', () => {
    const lessons = [
      { day: 'sun' as const, period: 1, className: '٢/أ', rawText: '', confidence: 0.9, source: { row: 0, col: 0 } },
      { day: 'sun' as const, period: 2, className: '2/ا', rawText: '', confidence: 0.6, source: { row: 0, col: 1 } },
      { day: 'mon' as const, period: 1, className: '١/ب', rawText: '', confidence: 0.95, source: { row: 1, col: 0 } },
    ];
    const v = validateSchedule(lessons, 5, 7);
    expect(v.lessons[1].className).toBe('٢/أ');
    expect(v.ok).toBe(true);
    expect(v.quality).toBeGreaterThan(0.8);
  });
  it('fails clearly when too little was recognised', () => {
    const v = validateSchedule([], 1, 0);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('لم نتمكن');
  });
});
