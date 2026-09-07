import { describe, expect, it } from 'vitest';
import { activeDays, courseKey, fmtTime, hourRange, parseTime, type Lecture } from '../../src/student/model';
import { normalizeDay, smartResponseToLectures } from '../../src/student/smart';

const L = (day: Lecture['day'], start: number, end: number, course = 'x'): Lecture => ({ id: course + start, day, start, end, course });

describe('student model', () => {
  it('stops the hour rows at the latest lecture', () => {
    expect(hourRange([L('sun', 8 * 60, 9 * 60 + 50), L('mon', 10 * 60, 11 * 60 + 50)])).toEqual({ startHour: 8, endHour: 12 });
    expect(hourRange([L('sun', 8 * 60, 9 * 60 + 50), L('tue', 13 * 60, 14 * 60 + 40)])).toEqual({ startHour: 8, endHour: 15 });
    expect(hourRange([L('sun', 10 * 60 + 15, 11 * 60 + 5)])).toEqual({ startHour: 10, endHour: 12 });
    expect(hourRange([])).toEqual({ startHour: 8, endHour: 12 });
  });

  it('shows Sunday–Thursday and only adds Friday/Saturday when used', () => {
    expect(activeDays([L('mon', 480, 530)])).toEqual(['sun', 'mon', 'tue', 'wed', 'thu']);
    expect(activeDays([L('sat', 480, 530)])).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'sat']);
  });

  it('gives the same course the same colour key', () => {
    expect(courseKey('101 تقن')).toBe(courseKey('١٠١  تقن'));
    expect(courseKey('قصد 414-3')).toBe(courseKey('قصد 414 - 3'));
  });

  it('parses and formats times', () => {
    expect(parseTime('08:05')).toBe(485);
    expect(parseTime('13:00')).toBe(780);
    expect(parseTime('8.0')).toBeNull();
    expect(fmtTime(13 * 60 + 5, false)).toBe('1:05');
  });
});

describe('university smart reader', () => {
  it('normalises the model output', () => {
    const lectures = smartResponseToLectures({
      ok: true,
      lectures: [
        { day: 'sun', start: '08:00', end: '09:50', course: '101 تقن' },
        { day: 'sun', start: '08:00', end: '09:50', course: '101 تقن' }, // duplicate
        { day: 'TUE', start: '13:00', end: '14:40', course: 'نفس 3K5-102', room: '0.308 1.1.2', uncertain: true },
        { day: 'mon', start: '10:00', end: '09:00', course: 'bad end' }, // end before start → 50 min
        { day: 'xxx', start: '10:00', end: '11:00', course: 'bad day' },
        { day: 'wed', start: '8', end: '9', course: 'bad time' },
      ],
    })!;
    expect(lectures.map((l) => `${l.day}:${l.start}-${l.end}:${l.course}`)).toEqual(['sun:480-590:101 تقن', 'tue:780-880:نفس 3K5-102', 'mon:600-650:bad end']);
    expect(lectures[1].room).toBe('0.308 1.1.2');
    expect(lectures[1].needsReview).toBe(true);
  });

  it('accepts day names and letter codes as a safety net', () => {
    expect(['Sunday', 'الأحد', 'U', 'thu', 'R', 'Wednesday'].map(normalizeDay)).toEqual(['sun', 'sun', 'sun', 'thu', 'thu', 'wed']);
    expect(normalizeDay('yesterday')).toBeNull();
  });

  it('rejects an outdated (teacher-only) worker response', () => {
    expect(smartResponseToLectures({ ok: true, lessons: [] } as never)).toBeNull();
  });
});
