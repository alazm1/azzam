import type { DayKey, Lesson, PeriodTime, TeacherSchedule } from '../models/schedule';

const JS_DAY_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function todayKey(now = new Date()): DayKey {
  return JS_DAY_TO_KEY[now.getDay()];
}

export function isSchoolDay(day: DayKey, schedule: TeacherSchedule): boolean {
  return schedule.days.includes(day);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface DayStatus {
  day: DayKey;
  isSchoolDay: boolean;
  /** Lesson happening right now, if any. */
  current?: { lesson: Lesson; time: PeriodTime };
  /** Next lesson today after now (or the first lesson if the day hasn't started). */
  next?: { lesson: Lesson; time: PeriodTime };
  /** True when every lesson of the day is over. */
  finished: boolean;
  /** Period number that is running right now (even if the teacher is free). */
  currentPeriod?: number;
}

export function dayStatus(schedule: TeacherSchedule, now = new Date()): DayStatus {
  const day = todayKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const times = schedule.settings.periodTimes;
  const lessons = schedule.lessons
    .filter((l) => l.day === day)
    .sort((a, b) => a.periodNumber - b.periodNumber);
  const timeOf = (n: number) => times.find((t) => t.number === n);
  const runningPeriod = times.find((t) => minutes >= toMinutes(t.start) && minutes < toMinutes(t.end));
  let current: DayStatus['current'];
  let next: DayStatus['next'];
  for (const lesson of lessons) {
    const t = timeOf(lesson.periodNumber);
    if (!t) continue;
    if (minutes >= toMinutes(t.start) && minutes < toMinutes(t.end)) current = { lesson, time: t };
    else if (minutes < toMinutes(t.start) && !next) next = { lesson, time: t };
  }
  const finished = lessons.length > 0 && !current && !next;
  return { day, isSchoolDay: isSchoolDay(day, schedule), current, next, finished, currentPeriod: runningPeriod?.number };
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'م' : 'ص';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
