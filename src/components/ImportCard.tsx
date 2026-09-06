import { useRef } from 'react';
import { arabic } from '../models/design';

export interface ReadProgress {
  percent: number;
  status: string;
  active: boolean;
}

interface Props {
  progress: ReadProgress | null;
  error: string;
  canReview: boolean;
  previews: string[];
  onFiles: (files: File[]) => void;
  onReview: () => void;
}

/** Step 1 — photograph or pick the schedule image(s). */
export function ImportCard({ progress, error, canReview, previews, onFiles, onReview }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-2xl border border-line bg-[linear-gradient(145deg,#f5fbf8,#fff)] p-5 sm:p-6" aria-label="صوّر جدولك">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#c9d9d2] text-sm text-primary">١</span>
        <h2 className="text-lg font-bold">صوّر جدولك</h2>
      </div>
      <p className="mb-4 text-sm leading-7 text-muted">ارفع صورة جدولك الورقي أو الإلكتروني. يحدد القارئ الأيام والحصص من عناوينها، ثم يعرض الخانات للمراجعة قبل الحفظ.</p>
      <button type="button" className="btn-primary w-full" onClick={() => input.current?.click()} disabled={!!progress?.active}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        تصوير الجدول أو اختيار صورة
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>✓ جدول إلكتروني أو ورقي</span>
        <span>✓ العناوين ظاهرة والنص واضح</span>
      </div>

      {previews.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {previews.map((src, i) => (
            <figure key={src} className="relative shrink-0">
              <img src={src} alt={`صورة الجدول ${arabic(i + 1)}`} className="h-20 w-28 rounded-lg border border-line object-cover" />
              <figcaption className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{arabic(i + 1)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {progress && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-3" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <strong>{progress.status}</strong>
            <span>{arabic(Math.round(progress.percent))}٪</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100}>
            <i className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.active && <small className="mt-1 block text-xs text-muted">قد تستغرق القراءة الأولى عدة ثوانٍ.</small>}
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm leading-7 text-danger" role="alert">
          {error}
        </p>
      )}
      {canReview && (
        <button type="button" className="btn-secondary mt-3 w-full" onClick={onReview}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="m15 4 5 5L9 20H4v-5L15 4ZM13 6l5 5" />
          </svg>
          مراجعة الجدول المقروء
        </button>
      )}
      <p className="mt-4 text-center text-xs text-muted">✓ تُقرأ الصور داخل جهازك ولا تُرفع إلى خادم</p>
    </section>
  );
}
