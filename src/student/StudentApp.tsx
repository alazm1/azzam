import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, type Confirmation } from '../components/ConfirmDialog';
import { ExportDialog } from '../components/ExportDialog';
import { Footer } from '../components/Footer';
import { ImportCard, type ReadProgress } from '../components/ImportCard';
import { ensureFonts } from '../services/wallpaper';
import { smartReaderEnabled } from '../services/smartReader';
import { LectureDialog } from './components/LectureDialog';
import { StudentPreviewPanel } from './components/StudentPreviewPanel';
import { StudentSettingsPanel } from './components/StudentSettingsPanel';
import { arabic, defaultStudentState, sortLectures, type Lecture, type StudentState } from './model';
import { readUniversitySchedule } from './smart';
import { loadStudentDesign, saveStudentDesign } from './storage';
import { drawStudentSchedule } from './wallpaper';

const UNAVAILABLE: Record<string, string> = {
  'not-configured': 'القراءة الذكية غير مفعّلة على هذا الموقع. أضف محاضراتك من «تعديل المحاضرات».',
  quota: 'خدمة القراءة مشغولة الآن (حد الطلبات في الدقيقة). انتظر دقيقة ثم أعد المحاولة، أو أضف محاضراتك يدويًا.',
  'worker-outdated': 'خادم القراءة يحتاج تحديثًا ليدعم جداول الجامعة. أضف محاضراتك يدويًا مؤقتًا.',
  AbortError: 'استغرقت القراءة وقتًا طويلًا. جرّب صورة أصغر أو أعد المحاولة.',
};

export function StudentApp() {
  const [state, setState] = useState<StudentState>(() => loadStudentDesign() ?? defaultStudentState());
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [edit, setEdit] = useState<{ open: boolean; imported: boolean }>({ open: false, imported: false });
  const [exportState, setExportState] = useState<{ open: boolean; url: string | null; file: File | null }>({ open: false, url: null, file: null });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [toast, setToast] = useState('');
  const [reading, setReading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastTimer = useRef<number>(0);

  useEffect(() => {
    saveStudentDesign(state);
  }, [state]);

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4200);
  }, []);

  const patch = useCallback((p: Partial<StudentState>) => setState((s) => ({ ...s, ...p })), []);

  const readImages = useCallback(
    async (files: File[]) => {
      if (reading) {
        showToast('انتظر حتى تكتمل قراءة الصور الحالية.');
        return;
      }
      setError('');
      if (files.length > 4) return setError('اختر أربع صور أو أقل.');
      if (files.some((f) => !f.type.startsWith('image/'))) return setError('اختر صورًا فقط.');
      if (files.some((f) => f.size > 20 * 1024 * 1024)) return setError('حجم إحدى الصور أكبر من ٢٠ ميجابايت.');
      if (!smartReaderEnabled()) return setError('فعّل «القراءة الذكية» أولًا؛ جداول الجامعة تُقرأ عبرها فقط.');
      setPreviews(files.map((f) => URL.createObjectURL(f)));
      setReading(true);
      const all: Lecture[] = [];
      let noteText = '';
      try {
        for (let index = 0; index < files.length; index++) {
          const part = files.length > 1 ? ` · الصورة ${arabic(index + 1)} من ${arabic(files.length)}` : '';
          setProgress({ percent: 10 + (index / files.length) * 80, status: 'القراءة الذكية للجدول…' + part, active: true });
          let outcome = await readUniversitySchedule(files[index]);
          if (outcome.kind === 'unavailable' && outcome.reason === 'quota') {
            // حد الطلبات في الدقيقة: محاولة ثانية تلقائية بعد مهلة قصيرة
            setProgress({ percent: 30, status: 'الخدمة مشغولة، إعادة المحاولة خلال لحظات…' + part, active: true });
            await new Promise((r) => window.setTimeout(r, 20_000));
            outcome = await readUniversitySchedule(files[index]);
          }
          if (outcome.kind === 'unavailable') throw new Error(UNAVAILABLE[outcome.reason] ?? 'تعذر الوصول إلى خادم القراءة. تأكد من الاتصال بالإنترنت ثم أعد المحاولة.');
          for (const l of outcome.lectures) if (!all.some((x) => x.day === l.day && x.start === l.start && x.course === l.course)) all.push(l);
          if (outcome.notes) noteText = outcome.notes;
        }
        if (!all.length) throw new Error('لم نجد محاضرات في الصورة. تأكد أن أسماء الأيام والأوقات ظاهرة بوضوح.');
        setNotes(noteText);
        setState((s) => ({ ...s, lectures: sortLectures(all), source: 'photo', colors: {} }));
        setProgress({ percent: 100, status: 'اكتملت القراءة الذكية', active: false });
        showToast(`تمت قراءة ${arabic(all.length)} محاضرة. راجعها قبل الحفظ.`);
        window.setTimeout(() => setEdit({ open: true, imported: true }), 350);
      } catch (e) {
        setProgress({ percent: 0, status: 'لم تكتمل القراءة', active: false });
        setError(e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذرت قراءة الصورة. جرّب لقطة أوضح.');
      } finally {
        setReading(false);
      }
    },
    [reading, showToast],
  );

  const applyLectures = useCallback(
    (lectures: Lecture[]) => {
      setState((s) => ({ ...s, lectures: sortLectures(lectures), source: lectures.length ? 'reviewed' : 'empty' }));
      setEdit({ open: false, imported: false });
      showToast('تم اعتماد الجدول');
    },
    [showToast],
  );

  const exportImage = useCallback(async () => {
    if (state.lectures.length === 0) {
      showToast('صوّر جدولك أو أضف محاضراتك من «تعديل المحاضرات» أولًا.');
      return;
    }
    if (state.source === 'photo') {
      showToast('راجع المحاضرات ثم اضغط اعتماد الجدول قبل الحفظ.');
      setEdit({ open: true, imported: true });
      return;
    }
    try {
      await ensureFonts();
      const canvas = canvasRef.current ?? document.createElement('canvas');
      drawStudentSchedule(canvas, state);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
      if (exportState.url) URL.revokeObjectURL(exportState.url);
      const file = new File([blob], 'جدولي-الجامعي.png', { type: 'image/png' });
      setExportState({ open: true, url: URL.createObjectURL(blob), file });
    } catch {
      showToast('تعذّر تجهيز الصورة. حاول مرة أخرى.');
    }
  }, [state, exportState.url, showToast]);

  const canShare = !!exportState.file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [exportState.file] });
  const share = () => {
    if (!exportState.file) return;
    navigator.share({ files: [exportState.file] }).catch((e: Error) => {
      if (e.name !== 'AbortError') showToast('يمكنك حفظ الصورة باستخدام زر تنزيل PNG.');
    });
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1312px] items-center gap-3 px-4 py-4 sm:px-8 sm:py-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white" aria-hidden="true">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 9l9-5 9 5-9 5-9-5Zm4 3v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4M21 9v6" />
            </svg>
          </span>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">
            جدولي الجامعي
            <span className="mt-0.5 block text-xs font-normal text-muted">مصمم خلفية الجدول للطلاب</span>
          </h1>
          <button type="button" className="ms-auto inline-flex items-center gap-1.5 px-1 py-2 text-sm text-primary" onClick={() => setEdit({ open: true, imported: false })}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="m15 4 5 5L9 20H4v-5L15 4ZM13 6l5 5" />
            </svg>
            تعديل المحاضرات
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1312px] px-4 pt-6 sm:px-8 sm:pt-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs text-muted">محاضراتك، في صورة واحدة</p>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">صمّم جدولك.</h2>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted sm:text-sm">
            <span className="text-lg text-[#287355]">✦</span> لكل مقرر لونه الخاص
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[370px_minmax(0,1fr)] lg:items-start lg:gap-7">
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <div className="order-1">
              <ImportCard
                progress={progress}
                error={error}
                canReview={state.source !== 'empty'}
                previews={previews}
                onFiles={readImages}
                onReview={() => setEdit({ open: true, imported: state.source === 'photo' })}
                description="ارفع لقطة شاشة لجدولك من بوابة الجامعة أو صورة له. تُقرأ الأيام والأوقات والمقررات، ثم تُعرض للمراجعة قبل الحفظ."
                hints={['لقطة شاشة أو صورة', 'الأيام والأوقات ظاهرة']}
              />
            </div>
            <div className="order-3">
              <StudentSettingsPanel state={state} onChange={patch} />
            </div>
            <div className="order-4 rounded-2xl border border-line bg-[#f9fbfa] p-4 sm:p-5">
              <button type="button" className="btn-primary w-full" onClick={exportImage}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
                </svg>
                حفظ الصورة
                <small className="ms-auto text-xs font-normal opacity-75">PNG</small>
              </button>
              <p className="mt-2 text-center text-xs text-muted">الصورة بجودة عالية، دون علامة مائية</p>
            </div>
          </div>
          <div className="order-2 min-w-0">
            <StudentPreviewPanel state={state} canvasRef={canvasRef} />
          </div>
        </div>
        <Footer brand="جدولي الجامعي" tagline="مساحة أجمل ليومك الجامعي" counter="jadwal-jamiah.app" />
      </main>

      <LectureDialog open={edit.open} lectures={state.lectures} imported={edit.imported} notes={edit.imported ? notes : undefined} onApply={applyLectures} onClose={() => setEdit({ open: false, imported: false })} onConfirm={(title, text, action) => setConfirmation({ title, text, action })} />
      <ExportDialog open={exportState.open} url={exportState.url} canShare={canShare} onShare={share} onClose={() => setExportState((s) => ({ ...s, open: false }))} />
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl bg-[#173d32] px-5 py-3 text-center text-sm text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
