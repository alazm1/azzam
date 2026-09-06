import { describe, expect, it } from 'vitest';
import { decodePayload, importCapturedTables, tablesFromText, type CapturedPayload } from '../../src/services/tableImport';

const madrasatiLike: CapturedPayload = {
  v: 1,
  source: 'schools.madrasati.sa',
  tables: [
    {
      cells: [
        ['اليوم / الحصة', 'الأولى\n06:30 ص', 'الثانية\n07:16 ص', 'الثالثة\n07:47 ص', 'الرابعة\n08:48 ص'],
        ['الأحد', 'ثاني/1-حل أنظمة المتباينات\n(محضرة)\nطباعة وتنزيل', '', 'ثاني/2-حل أنظمة المتباينات\n(محضرة)', 'ثاني/3-حل أنظمة'],
        ['الاثنين', 'ثاني/1-حل أنظمة', 'ثاني/3-حل أنظمة', '', 'ثاني/4-حل أنظمة'],
        ['الثلاثاء', '', 'ثاني/3-البرمجة الخطية', 'ثاني/2-البرمجة الخطية', 'ثاني/4-البرمجة'],
      ],
    },
  ],
};

describe('importCapturedTables', () => {
  it('rebuilds the schedule from a captured Madrasati table', () => {
    const r = importCapturedTables(madrasatiLike);
    expect(r.status).toBe('ok');
    expect(r.days).toEqual(['sun', 'mon', 'tue']);
    expect(r.periods).toEqual([1, 2, 3, 4]);
    const at = (d: string, p: number) => r.lessons.find((l) => l.day === d && l.period === p);
    expect(at('sun', 1)?.className).toBe('ثاني/١');
    expect(at('sun', 1)?.subject).toContain('حل أنظمة');
    expect(at('sun', 2)).toBeUndefined();
    expect(at('mon', 4)?.className).toBe('ثاني/٤');
    expect(at('tue', 3)?.className).toBe('ثاني/٢');
  });

  it('round-trips the base64url payload used in the URL hash', () => {
    const json = JSON.stringify(madrasatiLike);
    const b64 = Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodePayload(b64)?.tables[0].cells[1][0]).toBe('الأحد');
    expect(decodePayload('not-base64!!')).toBeNull();
  });
});

describe('tablesFromText', () => {
  it('reads tab-separated rows copied from a web table', () => {
    const text = ['اليوم\tالأولى\tالثانية\tالثالثة', 'الأحد\t٢/أ\t\t١/ب', 'الاثنين\t\t٣/ب\t٢/أ', 'الثلاثاء\t١/أ\t٢/ب\t'].join('\n');
    const tables = tablesFromText(text);
    expect(tables).toHaveLength(1);
    expect(tables[0].cells[1]).toEqual(['الأحد', '٢/أ', '', '١/ب']);
    const r = importCapturedTables({ v: 1, source: 'paste', tables });
    expect(r.status).toBe('ok');
    expect(r.lessons.find((l) => l.day === 'mon' && l.period === 2)?.className).toBe('٣/ب');
  });
});
