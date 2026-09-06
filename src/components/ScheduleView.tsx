import { useEffect, useMemo, useState } from 'react';
import { confidenceLevel } from '../engine/types';
import { lessonAt, newId, type DayKey, type Lesson, type TeacherSchedule } from '../models/schedule';
import { assignClassColors, colorFor } from '../services/colors';
import { dayStatus, todayKey } from '../services/time';
import { LessonSheet, type LessonDraft } from './LessonSheet';
import { ScheduleTable, type TableCell, type Zoom } from './ScheduleTable';
import { TodayCard } from './TodayCard';

interface Props {
  schedule: TeacherSchedule;
  onChange: (schedule: TeacherSchedule) => void;
}

/** Main weekly schedule with in-place editing. */
export function ScheduleView({ schedule, onChange }: Props) {
  const [editing, setEditing] = useState<{ day: DayKey; period: number } | null>(null);
  const [zoom, setZoom] = useState<Zoom>(() => (typeof window !== 'undefined' && window.innerWidth < 420 ? 'compact' : 'normal'));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const today = todayKey(now);
  const status = useMemo(() => dayStatus(schedule, now), [schedule, now]);
  const knownClasses = useMemo(() => [...new Set(schedule.lessons.map((l) => l.className).filter(Boolean))], [schedule.lessons]);

  const cellAt = (day: DayKey, period: number): TableCell | undefined => {
    const l = lessonAt(schedule, day, period);
    if (!l) return undefined;
    return {
      className: l.className,
      subject: l.subject,
      room: l.room,
      note: l.note,
      color: colorFor(schedule.classColors, l.className) ?? l.color,
      level: l.confidence !== undefined && confidenceLevel(l.confidence) === 'low' ? 'low' : undefined,
    };
  };

  const current = editing ? lessonAt(schedule, editing.day, editing.period) : undefined;

  const persist = (lessons: Lesson[]) => {
    const classColors = assignClassColors(lessons.map((l) => l.className), schedule.classColors);
    onChange({
      ...schedule,
      lessons: lessons.map((l) => ({ ...l, color: classColors[l.className] })),
      classColors,
      updatedAt: new Date().toISOString(),
    });
  };

  const save = (draft: LessonDraft) => {
    if (!editing) return;
    const others = schedule.lessons.filter((l) => l.id !== current?.id);
    // moving to another period replaces whatever was there
    const target = others.filter((l) => !(l.day === editing.day && l.periodNumber === draft.periodNumber));
    if (!draft.className && !draft.subject) {
      persist(others);
    } else {
      target.push({
        id: current?.id ?? newId(),
        day: editing.day,
        periodNumber: draft.periodNumber,
        className: draft.className,
        subject: draft.subject || undefined,
        room: draft.room || undefined,
        note: draft.note || undefined,
        rawText: current?.rawText,
        // edited by the teacher → trusted
        confidence: undefined,
      });
      persist(target);
    }
    setEditing(null);
  };

  const remove = () => {
    if (!current) return;
    persist(schedule.lessons.filter((l) => l.id !== current.id));
    setEditing(null);
  };

  const cycleZoom = () => setZoom((z) => (z === 'compact' ? 'normal' : z === 'normal' ? 'large' : 'compact'));

  return (
    <div className="mx-auto max-w-3xl px-3 pt-4">
      <TodayCard schedule={schedule} now={now} />

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">جدولي الأسبوعي</h2>
        <button type="button" className="rounded-full bg-line px-3 py-1 text-xs font-bold text-ink" onClick={cycleZoom} aria-label="تغيير حجم الجدول">
          {zoom === 'compact' ? 'تكبير' : zoom === 'normal' ? 'تكبير أكثر' : 'تصغير'}
        </button>
      </div>
      <div className="mt-2">
        <ScheduleTable
          days={schedule.days}
          periods={schedule.periods}
          cellAt={cellAt}
          onCellClick={(day, period) => setEditing({ day, period })}
          highlightDay={schedule.days.includes(today) ? today : undefined}
          highlightPeriod={status.isSchoolDay ? status.currentPeriod : undefined}
          zoom={zoom}
        />
      </div>
      <p className="mt-2 text-xs text-muted">اضغط على أي خانة لتعديل الفصل أو المادة أو إضافة ملاحظة. يُحفظ التعديل مباشرة. اسحب الجدول جانبيًا لعرض بقية الحصص.</p>

      {knownClasses.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {knownClasses.map((c) => (
            <span key={c} className="rounded-full border border-black/5 px-3 py-1 text-xs font-bold" style={{ background: colorFor(schedule.classColors, c) }}>
              {c}
            </span>
          ))}
        </div>
      )}

      <LessonSheet
        open={!!editing}
        day={editing?.day ?? 'sun'}
        period={editing?.period ?? 1}
        initial={{ className: current?.className, subject: current?.subject, room: current?.room, note: current?.note, periodNumber: editing?.period }}
        knownClasses={knownClasses}
        periods={schedule.periods}
        rawText={current?.rawText}
        isNew={!current}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
