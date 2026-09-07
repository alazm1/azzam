import { Switch, THEME_TILES } from '../../components/SettingsPanel';
import type { FormatKey } from '../../models/design';
import { arabic, getCourses, type StudentState } from '../model';

interface Props {
  state: StudentState;
  onChange: (patch: Partial<StudentState>) => void;
}

/** Step 2 — personalise the university wallpaper. */
export function StudentSettingsPanel({ state, onChange }: Props) {
  const courses = getCourses(state.lectures);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label="اجعله على ذوقك">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#c9d9d2] text-sm text-primary">٢</span>
        <h2 className="text-lg font-bold">اجعله على ذوقك</h2>
      </div>
      <div className="mb-4">
        <label htmlFor="student-name" className="mb-2 flex justify-between text-sm">
          اسم الطالب <span className="text-xs text-muted">اختياري</span>
        </label>
        <input id="student-name" className="field" maxLength={48} placeholder="اكتب اسمك" autoComplete="off" value={state.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="mb-5">
        <label htmlFor="schedule-title" className="mb-2 block text-sm">
          عنوان الجدول
        </label>
        <input id="schedule-title" className="field" maxLength={40} value={state.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <fieldset className="mb-5">
        <legend className="mb-2.5 text-sm">طابع التصميم</legend>
        <div className="grid grid-cols-3 gap-3">
          {THEME_TILES.map((t) => (
            <label key={t.key} className="flex cursor-pointer flex-col items-center gap-1.5 text-xs">
              <input type="radio" name="theme" value={t.key} className="peer sr-only" checked={state.theme === t.key} onChange={() => onChange({ theme: t.key })} />
              <span className="flex h-[68px] w-full items-end justify-center gap-1.5 rounded-lg border-[3px] border-transparent p-3 shadow-[0_0_0_1px_#e1e7e4] peer-checked:border-white peer-checked:shadow-[0_0_0_2px_var(--color-primary)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary" style={{ background: t.bg }}>
                <i className="block h-6 w-5 rounded-sm" style={{ background: t.bars[0] }} />
                <i className="block h-8 w-5 rounded-sm" style={{ background: t.bars[1] }} />
                <i className="block h-5 w-5 rounded-sm" style={{ background: t.bars[2] }} />
              </span>
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mb-3">
        <label htmlFor="image-format" className="mb-2 block text-sm">
          مقاس الصورة
        </label>
        <select id="image-format" className="field" value={state.format} onChange={(e) => onChange({ format: e.target.value as FormatKey })}>
          <option value="phone">خلفية جوال — ١٢٠٠ × ٢٦٠٠</option>
          <option value="landscape">جدول أفقي — ١٩٢٠ × ١٢٨٠</option>
        </select>
      </div>
      <Switch id="clock-space" label="مساحة للساعة أعلى الخلفية" checked={state.clock} disabled={state.format !== 'phone'} onChange={(v) => onChange({ clock: v })} />
      <Switch id="show-room" label="إظهار القاعة" checked={state.showRoom} onChange={(v) => onChange({ showRoom: v })} />
      <Switch id="show-time" label="إظهار وقت المحاضرة" checked={state.showTime} onChange={(v) => onChange({ showTime: v })} />
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm">
          ألوان المقررات <span className="float-left text-xs text-muted">{arabic(courses.length)} مقررات</span>
        </summary>
        <p className="my-2.5 text-xs text-muted">نفس المقرر يحتفظ بلونه في جميع محاضراته.</p>
        {courses.length === 0 && <p className="text-xs text-muted">ستظهر المقررات هنا بعد قراءة الجدول.</p>}
        {courses.map((c) => (
          <label key={c.key} className="my-2 flex items-center gap-2.5 text-sm">
            <input
              type="color"
              value={state.colors[c.key] || c.color}
              aria-label={`لون المقرر ${c.label}`}
              className="h-8 w-8 cursor-pointer rounded-md border border-line bg-white p-0.5"
              onChange={(e) => onChange({ colors: { ...state.colors, [c.key]: e.target.value } })}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </details>
    </section>
  );
}
