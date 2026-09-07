import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { arabic, DAY_KEYS, DAY_NAMES, fmtTime, newId, parseTime, sortLectures, toInputTime, type DayKey, type Lecture } from '../model';

interface Props {
  open: boolean;
  lectures: Lecture[];
  imported: boolean;
  notes?: string;
  onApply: (lectures: Lecture[]) => void;
  onClose: () => void;
  onConfirm: (title: string, text: string, action: () => void) => void;
}

interface Form {
  id: string | null;
  day: DayKey;
  start: string;
  end: string;
  course: string;
  room: string;
}

const emptyForm = (): Form => ({ id: null, day: 'sun', start: '08:00', end: '08:50', course: '', room: '' });

/** Review / edit dialog: a list of lectures per day plus a small form to add or change one. */
export function LectureDialog({ open, lectures, imported, notes, onApply, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<Lecture[]>(lectures);
  const [form, setForm] = useState<Form>(emptyForm());
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(sortLectures(lectures));
      setForm(emptyForm());
      setFormError('');
    }
  }, [open, lectures]);

  const edit = (l: Lecture) => {
    setForm({ id: l.id, day: l.day, start: toInputTime(l.start), end: toInputTime(l.end), course: l.course, room: l.room ?? '' });
    setFormError('');
  };

  const submit = () => {
    const start = parseTime(form.start);
    const end = parseTime(form.end);
    const course = form.course.trim();
    if (!course) return setFormError('اكتب اسم المقرر أو رمزه.');
    if (start === null || end === null) return setFormError('اختر وقت البداية والنهاية.');
    if (end <= start) return setFormError('وقت النهاية يجب أن يكون بعد البداية.');
    const lecture: Lecture = { id: form.id ?? newId(), day: form.day, start, end, course, room: form.room.trim() || undefined };
    setDraft((d) => sortLectures(form.id ? d.map((x) => (x.id === form.id ? lecture : x)) : [...d, lecture]));
    setForm(emptyForm());
    setFormError('');
  };

  const remove = (id: string) => {
    setDraft((d) => d.filter((x) => x.id !== id));
    if (form.id === id) setForm(emptyForm());
  };

  const uncertain = draft.filter((l) => l.needsReview).length;
  const days = DAY_KEYS.filter((d) => draft.some((l) => l.day === d));

  return (
    <Dialog open={open} onClose={onClose} label="تعديل المحاضرات" eyebrow={`${arabic(draft.length)} محاضرة`} title={imported ? 'مراجعة الجدول المقروء' : 'تعديل المحاضرات'} wide>
      <p className="mb-4 text-sm leading-7 text-muted">
        {imported
          ? `اكتشف الموقع ${arabic(draft.length)} محاضرة${uncertain ? `، منها ${arabic(uncertain)} تحتاج مراجعة` : ''}. اضغط أي محاضرة لتعديلها، ثم اعتمد الجدول.`
          : 'أضف محاضراتك أو اضغط محاضرة لتعديلها. صفوف الساعات تتوقف تلقائيًا عند آخر محاضرة.'}
      </p>
      {notes && <p className="mb-4 rounded-lg bg-warn-light px-3 py-2 text-xs leading-6 text-warn">{notes}</p>}

      <form
        className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="text-xs">
          اليوم
          <select className="field mt-1" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value as DayKey })}>
            {DAY_KEYS.map((d) => (
              <option key={d} value={d}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          من
          <input type="time" className="field mt-1" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
        </label>
        <label className="text-xs">
          إلى
          <input type="time" className="field mt-1" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
        </label>
        <label className="text-xs">
          المقرر
          <input className="field mt-1" maxLength={40} placeholder="مثل: 101 تقن" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
        </label>
        <label className="text-xs">
          القاعة <span className="text-muted">(اختياري)</span>
          <input className="field mt-1" maxLength={30} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className="btn-primary flex-1 sm:flex-none">
            {form.id ? 'تحديث' : 'إضافة'}
          </button>
          {form.id && (
            <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm())}>
              جديد
            </button>
          )}
        </div>
        {formError && (
          <p className="col-span-full text-xs text-danger" role="alert">
            {formError}
          </p>
        )}
      </form>

      {draft.length === 0 && <p className="mb-4 text-center text-sm text-muted">لا توجد محاضرات بعد.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((d) => (
          <section key={d} className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-sm font-bold">{DAY_NAMES[d]}</h3>
            <ul className="flex flex-col gap-1.5">
              {draft
                .filter((l) => l.day === d)
                .map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => edit(l)}
                      aria-label={`${DAY_NAMES[l.day]}، ${fmtTime(l.start)} إلى ${fmtTime(l.end)}، ${l.course}، تعديل`}
                      className={`flex min-w-0 flex-1 flex-col rounded-lg px-2.5 py-1.5 text-start text-sm ${form.id === l.id ? 'bg-primary-light shadow-[inset_0_0_0_2px_#5d9c80]' : 'bg-canvas hover:bg-primary-light'} ${l.needsReview ? 'bg-warn-light' : ''}`}
                    >
                      <b className="truncate">{l.course}</b>
                      <span className="text-xs text-muted">
                        <span dir="ltr">{fmtTime(l.start)}&lrm;–&lrm;{fmtTime(l.end)}</span>
                        {l.room ? ` · ${l.room}` : ''}
                        {l.needsReview ? ' · راجع' : ''}
                      </span>
                    </button>
                    <button type="button" onClick={() => remove(l.id)} aria-label={`حذف ${l.course}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-canvas hover:text-danger">
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary flex-1" onClick={() => onApply(draft.map((l) => ({ ...l, needsReview: undefined })))}>
          اعتماد الجدول
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          إلغاء
        </button>
        {draft.length > 0 && (
          <button type="button" className="btn-ghost text-danger" onClick={() => onConfirm('تفريغ الجدول', 'ستُحذف جميع المحاضرات من هذه النافذة. يمكنك إلغاء ذلك بإغلاقها دون اعتماد.', () => setDraft([]))}>
            تفريغ الجدول
          </button>
        )}
      </div>
    </Dialog>
  );
}
