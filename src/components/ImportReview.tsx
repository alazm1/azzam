import { useMemo, useState } from 'react';
import { confidenceLevel, type ExtractionResult } from '../engine/types';
import { toArabicDigits } from '../engine/parse/normalize';
import { newId, type DayKey } from '../models/schedule';
import { assignClassColors } from '../services/colors';
import type { ReviewLesson } from '../services/importer';
import { LessonSheet, type LessonDraft } from './LessonSheet';
import { ScheduleTable, type TableCell, type Zoom } from './ScheduleTable';

interface Props {
  result: ExtractionResult;
  lessons: ReviewLesson[];
  onChange: (lessons: ReviewLesson[]) => void;
  onConfirm: () => void;
  onRetake: () => void;
  previewUrl: string | null;
}

const DAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];

/** "راجع جدولك قبل الحفظ" — the digital copy of the photo, editable cell by cell. */
export function ImportReview({ result, lessons, onChange, onConfirm, onRetake, previewUrl }: Props) {
  const [editing, setEditing] = useState<{ day: DayKey; period: number } | null>(null);
  const [zoom, setZoom] = useState<Zoom>(() => (typeof window !== 'undefined' && window.innerWidth < 420 ? 'compact' : 'normal'));
  const [showPhoto, setShowPhoto] = useState(false);

  const periods = useMemo(() => {
    const max = Math.max(7, ...result.periods, ...lessons.map((l) => l.periodNumber));
    return Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1);
  }, [result.periods, lessons]);

  const colors = useMemo(() => assignClassColors(lessons.map((l) => l.className)), [lessons]);
  const knownClasses = useMemo(() => [...new Set(lessons.map((l) => l.className).filter(Boolean))], [lessons]);

  const low = lessons.filter((l) => !l.reviewed && (l.confidence ?? 1) < 0.5).length;
  const medium = lessons.filter((l) => !l.reviewed && (l.confidence ?? 1) >= 0.5 && (l.confidence ?? 1) < 0.8).length;

  const cellAt = (day: DayKey, period: number): TableCell | undefined => {
    const l = lessons.find((x) => x.day === day && x.periodNumber === period);
    if (!l) return undefined;
    return {
      className: l.className,
      subject: l.subject,
      color: colors[l.className],
      level: l.reviewed ? 'high' : confidenceLevel(l.confidence ?? 1),
    };
  };

  const current = editing ? lessons.find((x) => x.day === editing.day && x.periodNumber === editing.period) : undefined;

  const save = (draft: LessonDraft) => {
    if (!editing) return;
    const rest = lessons.filter((x) => !(x.day === editing.day && x.periodNumber === editing.period));
    if (!draft.className && !draft.subject) {
      onChange(rest);
    } else {
      onChange([
        ...rest,
        {
          id: current?.id ?? newId(),
          day: editing.day,
          periodNumber: editing.period,
          className: draft.className,
          subject: draft.subject || undefined,
          room: draft.room || undefined,
          note: draft.note || undefined,
          confidence: current?.confidence,
          rawText: current?.rawText,
          reviewed: true,
        },
      ]);
    }
    setEditing(null);
  };

  const remove = () => {
    if (!editing) return;
    onChange(lessons.filter((x) => !(x.day === editing.day && x.periodNumber === editing.period)));
    setEditing(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-3 pt-5">
      <h2 className="text-2xl font-bold">راجع جدولك قبل الحفظ</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        تم التعرف على <b className="text-ink">{toArabicDigits(lessons.length)}</b> حصة. اضغط على أي خانة لتصحيحها أو لإضافة حصة ناقصة.
      </p>

      {(low > 0 || medium > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {low > 0 && (
            <span className="rounded-full bg-danger-light px-3 py-1 font-bold text-danger">
              {toArabicDigits(low)} خانة تحتاج مراجعة
            </span>
          )}
          {medium > 0 && (
            <span className="rounded-full bg-warn-light px-3 py-1 font-bold text-warn">
              {toArabicDigits(medium)} خانة يُفضّل التأكد منها
            </span>
          )}
        </div>
      )}
      {result.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-warn-light px-3 py-2 text-xs text-warn">
          {result.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 text-xs">
          <button type="button" className={`rounded-full px-3 py-1 ${zoom === 'compact' ? 'bg-primary text-white' : 'bg-line'}`} onClick={() => setZoom('compact')}>
            مصغّر
          </button>
          <button type="button" className={`rounded-full px-3 py-1 ${zoom === 'normal' ? 'bg-primary text-white' : 'bg-line'}`} onClick={() => setZoom('normal')}>
            عادي
          </button>
          <button type="button" className={`rounded-full px-3 py-1 ${zoom === 'large' ? 'bg-primary text-white' : 'bg-line'}`} onClick={() => setZoom('large')}>
            مكبّر
          </button>
        </div>
        {previewUrl && (
          <button type="button" className="text-xs font-bold text-primary" onClick={() => setShowPhoto((v) => !v)}>
            {showPhoto ? 'إخفاء الصورة' : 'عرض الصورة الأصلية'}
          </button>
        )}
      </div>
      {showPhoto && previewUrl && (
        <div className="card mt-3 overflow-x-auto">
          <img src={previewUrl} alt="صورة الجدول الأصلية" className="max-h-72 w-auto max-w-none" />
        </div>
      )}

      <div className="mt-3">
        <ScheduleTable days={DAYS} periods={periods} cellAt={cellAt} onCellClick={(day, period) => setEditing({ day, period })} zoom={zoom} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {periods.length > 5 && <span className="me-3">اسحب الجدول جانبيًا لعرض بقية الحصص.</span>}
        <span className="me-2 inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-danger align-middle" /> ثقة منخفضة
        <span className="ms-4 me-2 inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-warn align-middle" /> ثقة متوسطة
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <button type="button" className="btn-primary text-lg" onClick={onConfirm} disabled={lessons.length === 0}>
          اعتماد الجدول
        </button>
        <button type="button" className="btn-secondary" onClick={onRetake}>
          إعادة رفع الصورة
        </button>
      </div>

      <LessonSheet
        open={!!editing}
        day={editing?.day ?? 'sun'}
        period={editing?.period ?? 1}
        initial={{ className: current?.className, subject: current?.subject, room: current?.room, note: current?.note }}
        knownClasses={knownClasses}
        rawText={current?.rawText}
        isNew={!current}
        onSave={save}
        onDelete={remove}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
