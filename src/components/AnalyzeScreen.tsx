import type { ProgressEvent } from '../engine/types';

interface Props {
  progress: ProgressEvent | null;
  previewUrl: string | null;
}

const STEPS: Array<{ key: ProgressEvent['stage'][]; label: string }> = [
  { key: ['preprocess'], label: 'تجهيز الصورة' },
  { key: ['detect'], label: 'اكتشاف بنية الجدول' },
  { key: ['ocr'], label: 'قراءة الأيام والحصص والفصول' },
  { key: ['parse', 'done'], label: 'بناء الجدول' },
];

export function AnalyzeScreen({ progress, previewUrl }: Props) {
  const pct = Math.round((progress?.progress ?? 0) * 100);
  const stageIndex = STEPS.findIndex((s) => s.key.includes(progress?.stage ?? 'preprocess'));
  return (
    <div className="mx-auto max-w-md px-5 pt-8">
      {previewUrl && (
        <div className="card mb-6 overflow-hidden">
          <img src={previewUrl} alt="" className="max-h-56 w-full object-cover opacity-90" />
        </div>
      )}
      <h2 className="text-2xl font-bold">جارٍ تحليل الجدول…</h2>
      <p className="mt-1 text-muted">{progress?.message ?? 'نبدأ الآن'}</p>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {progress?.detail && (
        <p className="mt-1 text-sm text-muted">
          الخلايا: {progress.detail.current} من {progress.detail.total}
        </p>
      )}
      <ol className="mt-6 space-y-2">
        {STEPS.map((s, i) => {
          const state = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'todo';
          return (
            <li key={s.label} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${state === 'active' ? 'bg-primary-light font-bold text-primary-dark animate-pulse-soft' : state === 'done' ? 'text-primary' : 'text-muted'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${state === 'done' ? 'bg-primary text-white' : state === 'active' ? 'bg-primary/20 text-primary-dark' : 'bg-line'}`}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs text-muted">قد تستغرق القراءة الأولى وقتًا أطول قليلًا لتحميل محرك القراءة مرة واحدة.</p>
    </div>
  );
}
