import { describe, expect, it } from 'vitest';
import { smartResponseToResult } from '../../src/services/smartReader';

describe('smartResponseToResult', () => {
  it('canonicalises class names and subjects from the model output', () => {
    const r = smartResponseToResult(
      {
        ok: true,
        periodsCount: 7,
        lessons: [
          { day: 'sun', period: 1, className: '2/ب', subject: 'الرياضيات' },
          { day: 'sun', period: 3, className: 'ثاني/1', subject: 'حل أنظمة المتباينات' },
          { day: 'mon', period: 2, className: 'ثالث ابتدائي 2', subject: 'اللغة الإنجليزية' },
          { day: 'tue', period: 4, className: 'منتظر 1' },
          { day: 'tue', period: 4, className: 'duplicate ignored' },
          { day: 'fri', period: 1, className: 'weekend ignored' },
        ],
      },
      Date.now(),
    );
    expect(r?.status).toBe('ok');
    expect(r?.days).toEqual(['sun', 'mon', 'tue']);
    expect(r?.periods).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const at = (d: string, p: number) => r!.lessons.find((l) => l.day === d && l.period === p);
    expect(at('sun', 1)?.className).toBe('٢/ب');
    expect(at('sun', 1)?.subject).toBe('رياضيات');
    expect(at('sun', 3)?.className).toBe('ثاني/١');
    expect(at('sun', 3)?.subject).toBeUndefined(); // عنوان درس وليس مادة
    expect(at('mon', 2)?.className).toBe('ثالث ابتدائي/٢');
    expect(at('mon', 2)?.subject).toBe('لغة إنجليزية');
    expect(at('tue', 4)?.className).toBe('منتظر ١');
    expect(r?.lessons).toHaveLength(4);
  });

  it('reports failure when the model returned too little', () => {
    const r = smartResponseToResult({ ok: true, lessons: [{ day: 'sun', period: 1, className: '٢/أ' }] }, Date.now());
    expect(r?.status).toBe('failed');
    expect(smartResponseToResult({ ok: false, error: 'quota' }, Date.now())).toBeNull();
  });
});
