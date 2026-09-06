import { useEffect, useState } from 'react';
import { DAY_NAMES_AR, PERIOD_NAMES_AR } from '../engine/parse/lexicon';
import type { DayKey } from '../models/schedule';

export interface LessonDraft {
  className: string;
  subject: string;
  room: string;
  note: string;
  periodNumber: number;
}

interface Props {
  open: boolean;
  day: DayKey;
  period: number;
  initial: Partial<LessonDraft>;
  /** Class names already used in the schedule, offered as quick picks. */
  knownClasses: string[];
  /** When provided, the period can be changed (moves the lesson). */
  periods?: number[];
  rawText?: string;
  isNew: boolean;
  onSave: (draft: LessonDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Bottom sheet used to add/edit a lesson (review screen and main schedule). */
export function LessonSheet({ open, day, period, initial, knownClasses, periods, rawText, isNew, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<LessonDraft>({ className: '', subject: '', room: '', note: '', periodNumber: period });

  useEffect(() => {
    if (open) {
      setDraft({
        className: initial.className ?? '',
        subject: initial.subject ?? '',
        room: initial.room ?? '',
        note: initial.note ?? '',
        periodNumber: initial.periodNumber ?? period,
      });
    }
  }, [open, initial.className, initial.subject, initial.room, initial.note, initial.periodNumber, period]);

  if (!open) return null;

  const periodLabel = (n: number) => PERIOD_NAMES_AR[n] ?? String(n);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-lg rounded-t-3xl bg-surface p-5 shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label="تعديل الحصة"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
        <h3 className="text-lg font-bold">
          {DAY_NAMES_AR[day]} — الحصة {periodLabel(draft.periodNumber)}
        </h3>
        {rawText && (
          <p className="mt-1 text-xs text-muted">
            النص كما قُرئ من الصورة: <span className="font-bold text-ink">{rawText.replace(/\n/g, ' | ')}</span>
          </p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="lesson-class">
              الفصل / الشعبة
            </label>
            <input
              id="lesson-class"
              className="field"
              value={draft.className}
              onChange={(e) => setDraft({ ...draft, className: e.target.value })}
              placeholder="مثال: ٢/ب أو ثاني متوسط أ"
              autoFocus
            />
            {knownClasses.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {knownClasses.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, className: c })}
                    className={`rounded-full border px-3 py-1 text-sm ${draft.className === c ? 'border-primary bg-primary-light text-primary-dark' : 'border-line bg-canvas text-ink'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lesson-subject">
                المادة
              </label>
              <input id="lesson-subject" className="field" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="اختياري" />
            </div>
            <div>
              <label className="label" htmlFor="lesson-room">
                القاعة
              </label>
              <input id="lesson-room" className="field" value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} placeholder="اختياري" />
            </div>
          </div>
          {periods && (
            <div>
              <label className="label" htmlFor="lesson-period">
                رقم الحصة
              </label>
              <select id="lesson-period" className="field" value={draft.periodNumber} onChange={(e) => setDraft({ ...draft, periodNumber: Number(e.target.value) })}>
                {periods.map((n) => (
                  <option key={n} value={n}>
                    الحصة {periodLabel(n)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="lesson-note">
              ملاحظة
            </label>
            <textarea id="lesson-note" className="field" rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="اختياري" />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-primary flex-1" onClick={() => onSave({ ...draft, className: draft.className.trim() })}>
            حفظ
          </button>
          {!isNew && (
            <button type="button" className="btn-danger" onClick={onDelete}>
              حذف الحصة
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
