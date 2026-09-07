import { useEffect, useMemo, useState } from 'react';
import { arabic, cloneGrid, DAYS, emptyGrid, getClasses, ORDINALS, type Cell, type Grid } from '../models/design';
import type { MergeInfo } from '../services/importer';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  grid: Grid;
  imported: boolean;
  info: MergeInfo | null;
  onApply: (grid: Grid) => void;
  onClose: () => void;
  onConfirm: (title: string, text: string, action: () => void) => void;
}

/** Review / edit dialog: days as rows, periods as columns, one cell editor. */
export function EditDialog({ open, grid, imported, info, onApply, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<Grid>(() => cloneGrid(grid));
  const [selected, setSelected] = useState<{ p: number; d: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(cloneGrid(grid));
      setSelected(null);
      setError('');
    }
  }, [open, grid]);

  const dayCount = draft[0]?.length || 5;
  const classes = useMemo(() => getClasses(draft), [draft]);
  const cell = selected ? draft[selected.p][selected.d] : null;

  const note = useMemo(() => {
    if (!imported) return 'اضغط أي خانة لتعديل المادة والفصل. الحصة الفارغة تظهر كوقت فراغ.';
    const warnings: string[] = [];
    if (info?.failedImages.length) warnings.push(`تعذرت قراءة الصور: ${info.failedImages.map(arabic).join('، ')}؛ لم تُضمّن في النتيجة.`);
    if (info?.conflictCount) warnings.push(`${arabic(info.conflictCount)} خانات تختلف بين الصور؛ اختر القراءة الصحيحة داخل الخانة.`);
    if (info?.uncertainCount) warnings.push(`${arabic(info.uncertainCount)} خانات تحتاج مراجعة؛ قارنها بصورتها الأصلية.`);
    if (info && info.dayCount < 5) warnings.push('لم تظهر الأيام الخمسة كلها؛ أضف صورة لبقية الأيام.');
    if (info && info.periodCount < 2) warnings.push('لم تظهر عناوين حصص كافية؛ أضف صورة لبقية الجدول.');
    for (const w of info?.warnings ?? []) warnings.push(w + '.');
    return `اكتشف الموقع شبكة الجدول وقرأ ${arabic(info?.count ?? 0)} حصة غير فارغة. اضغط كل خانة للتأكد من المادة والفصل، ثم اعتمد الجدول.${warnings.length ? ' ' + warnings.join(' ') : ''}`;
  }, [imported, info]);

  const update = (patch: Partial<Cell>) => {
    if (!selected) return;
    setDraft((g) => {
      const next = cloneGrid(g);
      const c = { ...next[selected.p][selected.d], ...patch };
      c.occupied = !!(c.subject.trim() || c.classroom.trim());
      c.needsReview = false;
      c.conflict = false;
      c.alternatives = undefined;
      next[selected.p][selected.d] = c;
      return next;
    });
  };

  const setPeriodCount = (n: number) => {
    const change = () =>
      setDraft((g) => {
        const next = cloneGrid(g);
        while (next.length < n) next.push(emptyGrid(1, dayCount)[0]);
        setSelected(null);
        return next.slice(0, n);
      });
    if (n < draft.length && draft.slice(n).flat().some((c) => c.subject || c.classroom)) {
      onConfirm('تقليل عدد الحصص؟', 'ستُحذف الحصص الموجودة في الصفوف التي سيتم إزالتها.', change);
    } else change();
  };

  const apply = () => {
    if (draft.flat().some((c) => c.conflict)) {
      setError('اختر القراءة الصحيحة للخانات المختلفة بين الصور قبل اعتماد الجدول.');
      return;
    }
    onApply(draft.map((row) => row.map((c) => ({ ...c, subject: c.subject.trim(), classroom: c.classroom.trim() }))));
  };

  return (
    <Dialog open={open} onClose={onClose} label="تعديل الحصص" eyebrow={`${DAYS[0]} — ${DAYS[dayCount - 1]}`} title={imported ? 'مراجعة الجدول المقروء' : 'تعديل الحصص'} wide>
      <p className="mb-4 text-sm leading-7 text-muted">{note}</p>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor="period-count">عدد الحصص يوميًا</label>
        <select id="period-count" className="field w-auto min-h-10 py-1.5 text-sm" value={draft.length} onChange={(e) => setPeriodCount(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {arabic(n)} حصص
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-ghost me-auto min-h-10 text-sm text-danger"
          onClick={() =>
            onConfirm('تفريغ الجدول؟', 'ستصبح جميع الحصص فارغة داخل المسودة. لا يتغير التصميم حتى تضغط «اعتماد الجدول».', () => {
              setDraft(emptyGrid(draft.length, dayCount));
              setSelected(null);
            })
          }
        >
          تفريغ الجدول
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-center">
          <thead>
            <tr>
              <th className="w-[4.5rem] border border-line bg-canvas px-1 py-3 text-sm font-normal">اليوم</th>
              {draft.map((_, p) => (
                <th key={p} className="border border-line bg-canvas px-1 py-3 text-sm font-normal">
                  {arabic(p + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.slice(0, dayCount).map((day, d) => (
              <tr key={day}>
                <th className="border border-line bg-canvas px-1 text-sm font-bold">{day}</th>
                {draft.map((row, p) => {
                  const c = row[d];
                  const isSel = selected?.p === p && selected?.d === d;
                  const label = c.classroom || c.subject || (c.occupied ? 'تحتاج مراجعة' : '');
                  return (
                    <td key={p} className="h-16 border border-line p-0">
                      <button
                        type="button"
                        onClick={() => setSelected({ p, d })}
                        aria-label={`${DAYS[d]}، الحصة ${ORDINALS[p]}، ${c.classroom || ''} ${c.subject || 'فارغة'}، تعديل`}
                        className={`flex h-full min-h-16 w-full flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-xs [overflow-wrap:anywhere] ${isSel ? 'bg-primary-light shadow-[inset_0_0_0_2px_#5d9c80]' : 'hover:bg-primary-light'} ${c.needsReview ? 'bg-warn-light' : ''}`}
                      >
                        {label ? <b className="text-[13px] font-bold leading-tight">{label}</b> : <span className="text-lg text-[#80968b]">+</span>}
                        {c.classroom && c.subject && <span className="text-[11px] text-muted">{c.subject}</span>}
                        {c.needsReview && <small className="text-[10px] font-bold text-warn">راجع</small>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cell && selected && (
        <div className="mt-4 rounded-xl border border-[#bdd7c9] bg-[#f5faf7] p-4">
          <strong className="text-sm">
            {DAYS[selected.d]} · الحصة {ORDINALS[selected.p]}
          </strong>
          {cell.conflict && cell.alternatives && (
            <div className="mt-2 space-y-2 text-sm">
              <p>تختلف الصور في هذه الخانة. اختر القراءة الصحيحة:</p>
              <div className="flex flex-wrap gap-2">
                {cell.alternatives.map((alt, i) => (
                  <button key={i} type="button" className="btn-secondary min-h-10 text-sm" onClick={() => update({ subject: alt.subject, classroom: alt.classroom })}>
                    الصورة {arabic(alt.sourceImage)} · {[alt.classroom, alt.subject].filter(Boolean).join(' — ') || 'فارغة'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              المادة
              <input className="field mt-1.5" value={cell.subject} onChange={(e) => update({ subject: e.target.value })} autoFocus placeholder="مثال: رياضيات" />
            </label>
            <label className="text-sm">
              الفصل
              <input className="field mt-1.5" list="class-suggestions" value={cell.classroom} onChange={(e) => update({ classroom: e.target.value })} placeholder="مثال: ٢/ب" />
              <datalist id="class-suggestions">
                {classes.map((c) => (
                  <option key={c.key} value={c.label} />
                ))}
              </datalist>
            </label>
          </div>
          {cell.raw && <p className="mt-2 whitespace-pre-wrap text-xs text-muted [overflow-wrap:anywhere]">النص الأصلي: {cell.raw}</p>}
          <button type="button" className="btn-secondary mt-3 min-h-10 text-sm" onClick={() => update({ subject: '', classroom: '' })}>
            جعل الحصة فارغة
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-primary flex-1" onClick={apply}>
          اعتماد الجدول
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Dialog>
  );
}
