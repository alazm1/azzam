// Shared ground-truth schedule used to render every fixture.
export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu'];
export const DAY_AR = { sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس' };
export const PERIOD_AR = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
export const PERIOD_TIMES = ['7:00', '7:50', '8:40', '9:30', '10:20', '11:10', '12:00', '12:50'];
export const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** 5 days × 7 periods. null = free period. */
export const BASE = {
  sun: ['١/أ', '٢/ب', null, '٣/أ', '١/ب', null, '٢/أ'],
  mon: ['٢/أ', '١/أ', '٣/أ', null, '٢/ب', '١/ب', null],
  tue: [null, '٣/أ', '١/ب', '٢/أ', null, '١/أ', '٢/ب'],
  wed: ['١/ب', null, '٢/ب', '١/أ', '٣/أ', null, '٢/أ'],
  thu: ['٣/أ', '٢/أ', null, '١/ب', null, '٢/ب', '١/أ'],
};

/** Worded class names (Madrasati style). */
export const WORDED = { '١/أ': 'أول متوسط أ', '١/ب': 'أول متوسط ب', '٢/أ': 'ثاني متوسط أ', '٢/ب': 'ثاني متوسط ب', '٣/أ': 'ثالث متوسط أ' };

export function expectedFrom(schedule, { subject, classMap } = {}) {
  const lessons = [];
  for (const day of DAYS) {
    schedule[day].forEach((cls, i) => {
      if (!cls) return;
      const entry = { day, period: i + 1, className: classMap ? classMap[cls] : cls };
      if (subject) entry.subject = subject;
      lessons.push(entry);
    });
  }
  return lessons;
}
