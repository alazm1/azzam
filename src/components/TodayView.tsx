import { useEffect, useMemo, useState } from 'react';
import { DAY_NAMES_AR, PERIOD_NAMES_AR } from '../engine/parse/lexicon';
import { lessonAt, type TeacherSchedule } from '../models/schedule';
import { colorFor } from '../services/colors';
import { dayStatus, formatTime } from '../services/time';
import { TodayCard } from './TodayCard';

interface Props {
  schedule: TeacherSchedule;
}

/** A phone-friendly list of today's periods. */
export function TodayView({ schedule }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const status = useMemo(() => dayStatus(schedule, now), [schedule, now]);
  const day = status.day;

  return (
    <div className="mx-auto max-w-xl px-3 pt-4">
      <TodayCard schedule={schedule} now={now} />
      <h2 className="mt-5 text-xl font-bold">حصص {DAY_NAMES_AR[day]}</h2>
      {!status.isSchoolDay ? (
        <p className="mt-2 text-muted">اليوم ليس من أيام الدراسة.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {schedule.periods.map((p) => {
            const lesson = lessonAt(schedule, day, p);
            const time = schedule.settings.periodTimes.find((t) => t.number === p);
            const isCurrent = status.currentPeriod === p;
            return (
              <li
                key={p}
                className={`card flex items-center gap-3 p-3 ${isCurrent ? 'ring-2 ring-primary' : ''} ${lesson ? '' : 'opacity-70'}`}
                style={{ background: lesson ? colorFor(schedule.classColors, lesson.className) : undefined }}
              >
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white/70 text-xs font-bold text-primary-dark">
                  <span>الحصة</span>
                  <span>{PERIOD_NAMES_AR[p] ?? p}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{lesson ? lesson.className || lesson.subject : 'فراغ'}</p>
                  <p className="text-xs text-muted">
                    {lesson?.subject && lesson.className ? `${lesson.subject} · ` : ''}
                    {time ? `${formatTime(time.start)} – ${formatTime(time.end)}` : ''}
                    {lesson?.room ? ` · ${lesson.room}` : ''}
                  </p>
                  {lesson?.note && <p className="mt-0.5 text-xs text-ink/80">{lesson.note}</p>}
                </div>
                {isCurrent && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">الآن</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
