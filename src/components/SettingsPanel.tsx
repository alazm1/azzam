import { arabic, getClasses, type DesignState, type FormatKey, type ThemeKey } from '../models/design';

interface Props {
  state: DesignState;
  onChange: (patch: Partial<DesignState>) => void;
}

const THEME_TILES: Array<{ key: ThemeKey; label: string; bg: string; bars: string[] }> = [
  { key: 'green', label: 'أخضر', bg: '#e8f2ed', bars: ['#bbd9ce', '#d4ddf7', '#f5dbaa'] },
  { key: 'night', label: 'ليلي', bg: '#163b35', bars: ['#419875', '#7c87ac', '#d4a451'] },
  { key: 'paper', label: 'أبيض', bg: '#ffffff', bars: ['#bbd9ce', '#d4ddf7', '#f5dbaa'] },
];

function Switch({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-sm">
      <span>{label}</span>
      <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className="relative block h-[21px] w-9 shrink-0 rounded-full bg-[#c9d5d0] transition-colors peer-checked:bg-primary peer-disabled:opacity-40 after:absolute after:left-[3px] after:top-[3px] after:h-[15px] after:w-[15px] after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-[15px]" />
    </label>
  );
}

/** Step 2 — personalise the wallpaper. */
export function SettingsPanel({ state, onChange }: Props) {
  const classes = getClasses(state.grid);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-label="اجعله على ذوقك">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#c9d9d2] text-sm text-primary">٢</span>
        <h2 className="text-lg font-bold">اجعله على ذوقك</h2>
      </div>
      <div className="mb-4">
        <label htmlFor="teacher-name" className="mb-2 flex justify-between text-sm">
          اسم المعلم <span className="text-xs text-muted">اختياري</span>
        </label>
        <input id="teacher-name" className="field" maxLength={48} placeholder="اكتب اسمك" autoComplete="off" value={state.name} onChange={(e) => onChange({ name: e.target.value })} />
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
      <Switch id="show-subject" label="إظهار اسم المادة" checked={state.showSubject} onChange={(v) => onChange({ showSubject: v })} />
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm">
          ألوان الفصول <span className="float-left text-xs text-muted">{arabic(classes.length)} فصول</span>
        </summary>
        <p className="my-2.5 text-xs text-muted">نفس الفصل يحتفظ بلونه في جميع الحصص.</p>
        {classes.length === 0 && <p className="text-xs text-muted">ستظهر الفصول هنا بعد قراءة الجدول.</p>}
        {classes.map((c) => (
          <label key={c.key} className="my-2 flex items-center gap-2.5 text-sm">
            <input
              type="color"
              value={state.colors[c.key] || c.color}
              aria-label={`لون الفصل ${c.label}`}
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
