import { useEffect, useRef, useState } from 'react';
import { arabic } from '../models/design';
import { bookmarkletSource, tablesFromHtml, tablesFromText, type CapturedPayload } from '../services/tableImport';

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
  /** Tables pasted from a web page (Madrasati); returns true when a schedule was imported. */
  onPaste: (payload: CapturedPayload) => boolean;
}

/** Step 1 — photograph or pick the schedule image(s). */
export function ImportCard({ progress, error, canReview, previews, onFiles, onReview, onPaste }: Props) {
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
      <MadrasatiExport onPaste={onPaste} />
    </section>
  );
}

/**
 * "زر جدولي": a bookmark the teacher adds once to the phone's browser. Tapped
 * on the schedule page inside Madrasati (their own logged-in session), it
 * sends the table straight to the app. No credentials, no server.
 */
function MadrasatiExport({ onPaste }: { onPaste: (payload: CapturedPayload) => boolean }) {
  const [copied, setCopied] = useState(false);
  const [pasteNote, setPasteNote] = useState('');
  const [pasted, setPasted] = useState('');

  const importText = (html: string, text: string) => {
    const tables = html ? tablesFromHtml(html) : [];
    const fromText = tables.length ? [] : tablesFromText(text);
    const all = [...tables, ...fromText];
    if (!all.length) {
      setPasteNote('لم نجد جدولًا في النص الملصق. في مدرستي اضغط مطولًا داخل الجدول ثم «تحديد الكل» و«نسخ»، والصق هنا.');
      return;
    }
    const ok = onPaste({ v: 1, source: 'paste', tables: all });
    setPasteNote(ok ? '' : 'وجدنا جدولًا لكن لم نتعرف على أيامه وحصصه. تأكد أنك نسخت صفحة الجدول الدراسي.');
    if (ok) setPasted('');
  };
  const linkRef = useRef<HTMLAnchorElement>(null);
  const appUrl = typeof window !== 'undefined' ? new URL(import.meta.env.BASE_URL, window.location.origin).href : '/';
  const code = bookmarkletSource(appUrl);
  // React refuses javascript: hrefs; the bookmarklet link is set on the element directly.
  useEffect(() => {
    linkRef.current?.setAttribute('href', code);
  }, [code]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt('انسخ هذا الرابط:', code);
    }
  };
  return (
    <details className="mt-4 border-t border-line pt-4">
      <summary className="cursor-pointer text-sm font-bold text-primary">تصدير الجدول من منصة مدرستي مباشرة</summary>
      <p className="mt-2 text-xs leading-6 text-muted">
        أضف زر «جدولي» إلى مفضلة متصفحك مرة واحدة. بعدها افتح مدرستي على جوالك كالمعتاد، ادخل على صفحة جدولك، ثم اضغط الزر من المفضلة فينتقل الجدول إلى هنا فورًا. الزر يعمل داخل جلستك أنت، ولا يطلب بيانات دخولك ولا يرسل شيئًا إلى أي خادم.
      </p>
      <ol className="mt-2 list-decimal space-y-1 pe-5 text-xs leading-6 text-muted">
        <li>
          اضغط <button type="button" className="font-bold text-primary underline" onClick={copy}>{copied ? 'تم النسخ ✓' : 'نسخ رابط زر جدولي'}</button>.
        </li>
        <li>في متصفح الجوال أضف هذه الصفحة إلى المفضلة (الإشارات المرجعية).</li>
        <li>افتح المفضلة، حرّر الإشارة الجديدة، سمّها «جدولي»، وامسح عنوانها والصق الرابط الذي نسخته مكانه، ثم احفظ.</li>
        <li>ادخل مدرستي وافتح صفحة الجدول الدراسي، ثم افتح المفضلة واضغط «جدولي».</li>
        <li>في كروم على أندرويد لا يعمل الزر من قائمة المفضلة؛ بدلًا من ذلك اكتب «جدولي» في شريط العنوان وأنت في صفحة الجدول واختر الإشارة من الاقتراحات.</li>
      </ol>
      <div className="mt-4 rounded-xl border border-line bg-surface p-3">
        <p className="text-xs font-bold">طريقة أبسط: انسخ الجدول والصقه هنا</p>
        <p className="mt-1 text-xs leading-6 text-muted">في صفحة الجدول بمدرستي: اضغط مطولًا على النص ← «تحديد الكل» ← «نسخ». ثم الصق في المربع التالي.</p>
        <textarea
          id="madrasati-paste"
          className="field mt-2 min-h-24 text-sm"
          placeholder="الصق هنا نص صفحة الجدول"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onPaste={(e) => {
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            if (html || text) {
              e.preventDefault();
              importText(html, text);
            }
          }}
        />
        {pasted.trim() && (
          <button type="button" className="btn-secondary mt-2 min-h-10 w-full text-sm" onClick={() => importText('', pasted)}>
            استيراد النص الملصق
          </button>
        )}
        {pasteNote && (
          <p className="mt-2 text-xs leading-6 text-danger" role="alert">
            {pasteNote}
          </p>
        )}
      </div>
      <a ref={linkRef} id="jadwali-bookmarklet" className="mt-3 hidden text-xs font-bold text-primary md:inline-block" onClick={(e) => e.preventDefault()} title="اسحب هذا الرابط إلى شريط المفضلة">
        على الكمبيوتر: اسحب هذا الرابط إلى شريط المفضلة → جدولي
      </a>
    </details>
  );
}
