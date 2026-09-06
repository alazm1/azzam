import { useState } from 'react';
import { PERIOD_NAMES_AR } from '../engine/parse/lexicon';
import { toArabicDigits } from '../engine/parse/normalize';
import type { PeriodTime, TeacherSchedule } from '../models/schedule';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface Props {
  schedule: TeacherSchedule;
  onChange: (schedule: TeacherSchedule) => void;
  onReimport: () => void;
  onDelete: () => void;
}

export function Settings({ schedule, onChange, onReimport, onDelete }: Props) {
  const install = useInstallPrompt();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const times = schedule.settings.periodTimes;

  const updateTime = (n: number, patch: Partial<PeriodTime>) => {
    onChange({
      ...schedule,
      settings: { periodTimes: times.map((t) => (t.number === n ? { ...t, ...patch } : t)) },
      updatedAt: new Date().toISOString(),
    });
  };

  const setPeriodCount = (count: number) => {
    const periods = Array.from({ length: count }, (_, i) => i + 1);
    const periodTimes = periods.map((n) => times.find((t) => t.number === n) ?? { number: n, start: '13:00', end: '13:45' });
    onChange({
      ...schedule,
      periods,
      settings: { periodTimes },
      lessons: schedule.lessons.filter((l) => l.periodNumber <= count),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="mx-auto max-w-xl px-3 pt-4">
      <h2 className="text-xl font-bold">الإعدادات</h2>

      <section className="card mt-3 p-4">
        <h3 className="font-bold">أوقات الحصص</h3>
        <p className="text-xs text-muted">تُستخدم لعرض الحصة الحالية والقادمة.</p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <label htmlFor="period-count" className="font-bold">
            عدد الحصص
          </label>
          <select id="period-count" className="field w-24" value={schedule.periods.length} onChange={(e) => setPeriodCount(Number(e.target.value))}>
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {toArabicDigits(n)}
              </option>
            ))}
          </select>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {times.map((t) => (
            <li key={t.number} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-20 shrink-0 font-bold">{PERIOD_NAMES_AR[t.number] ?? t.number}</span>
              <input type="time" className="field" value={t.start} onChange={(e) => updateTime(t.number, { start: e.target.value })} aria-label={`بداية الحصة ${t.number}`} />
              <span className="text-muted">إلى</span>
              <input type="time" className="field" value={t.end} onChange={(e) => updateTime(t.number, { end: e.target.value })} aria-label={`نهاية الحصة ${t.number}`} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-3 p-4">
        <h3 className="font-bold">الجدول</h3>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="btn-secondary" onClick={onReimport}>
            استيراد جدول جديد من صورة
          </button>
          {!confirmDelete ? (
            <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmDelete(true)}>
              حذف الجدول من هذا الجهاز
            </button>
          ) : (
            <div className="rounded-xl bg-danger-light p-3 text-sm">
              <p className="font-bold text-danger">سيتم حذف الجدول نهائيًا من هذا الجهاز. هل أنت متأكد؟</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-danger" onClick={onDelete}>
                  نعم، احذف
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                  تراجع
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card mt-3 p-4">
        <h3 className="font-bold">إضافة إلى الشاشة الرئيسية</h3>
        {install.installed ? (
          <p className="mt-1 text-sm text-muted">التطبيق مضاف إلى جهازك.</p>
        ) : install.canPrompt ? (
          <button type="button" className="btn-primary mt-3" onClick={install.prompt}>
            إضافة التطبيق إلى الشاشة الرئيسية
          </button>
        ) : install.isIOS ? (
          <p className="mt-1 text-sm leading-6 text-muted">
            في متصفح سفاري: اضغط زر المشاركة <span className="font-bold">⎋</span> ثم اختر <span className="font-bold">إضافة إلى الشاشة الرئيسية</span>.
          </p>
        ) : (
          <p className="mt-1 text-sm leading-6 text-muted">من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق»، أو أضف الصفحة إلى المفضلة.</p>
        )}
      </section>

      <section className="card mt-3 p-4 text-sm leading-6 text-muted">
        <h3 className="font-bold text-ink">الخصوصية</h3>
        تتم قراءة صورة الجدول على جهازك فقط ولا تُرسل إلى أي خادم، ولا يُحتفظ بالصورة بعد استخراج الجدول. يُحفظ جدولك محليًا على هذا الجهاز.
      </section>
    </div>
  );
}
