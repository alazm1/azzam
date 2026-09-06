import { DAY_NAMES_AR, PERIOD_NAMES_AR } from '../engine/parse/lexicon';
import type { TeacherSchedule } from '../models/schedule';
import { colorFor } from '../services/colors';
import { dayStatus, formatTime } from '../services/time';

interface Props {
  schedule: TeacherSchedule;
  now: Date;
}

/** Smart card at the top of the schedule: current lesson and the next one. */
export function TodayCard({ schedule, now }: Props) {
  const status = dayStatus(schedule, now);
  const dayName = DAY_NAMES_AR[status.day];

  if (!status.isSchoolDay) {
    return (
      <div className="card p-4">
        <p className="text-sm text-muted">اليوم {dayName}</p>
        <p className="mt-1 text-lg font-bold">لا توجد حصص اليوم — إجازة سعيدة</p>
      </div>
    );
  }

  const block = (title: string, item?: { lesson: { className: string; subject?: string; periodNumber: number }; time: { start: string; end: string } }, emphasized = false) => (
    <div className={`flex-1 rounded-2xl p-3 ${emphasized ? 'bg-primary text-white' : 'bg-canvas'}`}>
      <p className={`text-xs ${emphasized ? 'text-white/80' : 'text-muted'}`}>{title}</p>
      {item ? (
        <>
          <p className="mt-1 flex items-center gap-2 text-xl font-bold">
            <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: colorFor(schedule.classColors, item.lesson.className) ?? '#fff' }} />
            {item.lesson.className || item.lesson.subject}
          </p>
          <p className={`text-sm ${emphasized ? 'text-white/85' : 'text-muted'}`}>
            الحصة {PERIOD_NAMES_AR[item.lesson.periodNumber] ?? item.lesson.periodNumber}
            {item.lesson.subject && item.lesson.className ? ` · ${item.lesson.subject}` : ''}
          </p>
          <p className={`text-xs ${emphasized ? 'text-white/75' : 'text-muted'}`}>
            {formatTime(item.time.start)} – {formatTime(item.time.end)}
          </p>
        </>
      ) : (
        <p className="mt-1 font-bold">{emphasized ? 'لا توجد حصة الآن' : status.finished ? 'انتهت حصص اليوم' : '—'}</p>
      )}
    </div>
  );

  return (
    <div className="card p-3">
      <p className="mb-2 px-1 text-sm font-bold text-primary-dark">جدول اليوم — {dayName}</p>
      <div className="flex gap-2">
        {block('الحصة الحالية', status.current, true)}
        {block('الحصة القادمة', status.next)}
      </div>
    </div>
  );
}
