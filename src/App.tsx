import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, type Confirmation } from './components/ConfirmDialog';
import { EditDialog } from './components/EditDialog';
import { ExportDialog } from './components/ExportDialog';
import { Footer } from './components/Footer';
import { ImportCard, type ReadProgress } from './components/ImportCard';
import { PreviewPanel } from './components/PreviewPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { arabic, countLessons, defaultState, type DesignState, type Grid } from './models/design';
import { analyzeScheduleImage, warmUpOcr } from './services/analysis';
import { loadDesign, saveDesign } from './services/designStorage';
import { mergeResults, type ImageOutcome, type MergeInfo } from './services/importer';
import { drawSchedule, ensureFonts } from './services/wallpaper';

const STAGE_LABELS: Record<string, string> = {
  preprocess: 'تجهيز الصورة…',
  detect: 'اكتشاف شبكة الجدول…',
  ocr: 'قراءة نص الجدول…',
  parse: 'فهم الأيام والحصص…',
  done: 'اكتملت القراءة',
};

export function App() {
  const [state, setState] = useState<DesignState>(() => loadDesign() ?? defaultState());
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<string[]>([]);
  const [info, setInfo] = useState<MergeInfo | null>(null);
  const [edit, setEdit] = useState<{ open: boolean; imported: boolean }>({ open: false, imported: false });
  const [exportState, setExportState] = useState<{ open: boolean; url: string | null; file: File | null }>({ open: false, url: null, file: null });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [toast, setToast] = useState('');
  const [reading, setReading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastTimer = useRef<number>(0);

  useEffect(() => {
    warmUpOcr();
  }, []);


  useEffect(() => {
    saveDesign(state);
  }, [state]);

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4200);
  }, []);

  const patch = useCallback((p: Partial<DesignState>) => setState((s) => ({ ...s, ...p })), []);


  const readImages = useCallback(
    async (files: File[]) => {
      if (reading) {
        showToast('انتظر حتى تكتمل قراءة الصور الحالية.');
        return;
      }
      setError('');
      if (files.length > 8) return setError('اختر ثماني صور أو أقل.');
      if (files.some((f) => !f.type.startsWith('image/'))) return setError('اختر صورًا فقط.');
      if (files.some((f) => f.size > 20 * 1024 * 1024)) return setError('حجم إحدى الصور أكبر من ٢٠ ميجابايت.');
      setPreviews(files.map((f) => URL.createObjectURL(f)));
      setReading(true);
      setProgress({ percent: 1, status: 'تجهيز قارئ الصور…', active: true });
      const outcomes: ImageOutcome[] = [];
      try {
        for (let index = 0; index < files.length; index++) {
          const base = 12 + (index / files.length) * 82;
          const part = files.length > 1 ? ` · الصورة ${arabic(index + 1)} من ${arabic(files.length)}` : '';
          try {
            const result = await analyzeScheduleImage(files[index], (ev) => {
              const label = STAGE_LABELS[ev.stage] ?? 'تحليل صورة الجدول…';
              const detail = ev.detail ? ` (${arabic(ev.detail.current)}/${arabic(ev.detail.total)})` : '';
              setProgress({ percent: base + ev.progress * (82 / files.length), status: label + detail + part, active: true });
            });
            outcomes.push({ index, result, error: result.status === 'failed' ? result.message : undefined });
          } catch (e) {
            console.error(e);
            outcomes.push({ index, result: null, error: 'تعذرت قراءة الصورة.' });
          }
        }
        const merged = mergeResults(outcomes);
        if (!outcomes.some((o) => o.result?.status === 'ok')) {
          throw new Error(outcomes.find((o) => o.error)?.error || 'لم نجد أسماء الأيام وعناوين الحصص في الصور. اجعلها ظاهرة بوضوح ثم حاول مرة أخرى.');
        }
        if (!merged.info.count) throw new Error('ظهرت عناوين الجدول، لكن لم نجد حصصًا واضحة. قرّب الصورة وتأكد أن المادة والفصل ظاهران.');
        setInfo(merged.info);
        setState((s) => ({ ...s, grid: merged.grid, source: 'photo', colors: {} }));
        setProgress({ percent: 100, status: 'اكتملت القراءة', active: false });
        showToast(`تمت قراءة ${arabic(merged.info.count)} حصة. راجعها قبل الحفظ.`);
        window.setTimeout(() => setEdit({ open: true, imported: true }), 350);
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        setProgress({ percent: 0, status: 'لم تكتمل القراءة', active: false });
        setError(/[؀-ۿ]/.test(message) ? message : 'تعذرت قراءة الصورة. جرّب لقطة أوضح يظهر فيها اسم اليوم وعنوان الحصة.');
      } finally {
        setReading(false);
      }
    },
    [reading, showToast],
  );

  const applyGrid = useCallback(
    (grid: Grid) => {
      setState((s) => ({ ...s, grid, source: 'reviewed' }));
      setEdit({ open: false, imported: false });
      showToast('تم اعتماد الجدول');
    },
    [showToast],
  );

  const exportImage = useCallback(async () => {
    if (countLessons(state.grid) === 0) {
      showToast('صوّر جدولك أو أضف حصصك من «تعديل الحصص» أولًا.');
      return;
    }
    if (state.source === 'photo') {
      showToast('راجع الخانات المميزة ثم اضغط اعتماد الجدول قبل الحفظ.');
      setEdit({ open: true, imported: true });
      return;
    }
    try {
      await ensureFonts();
      const canvas = canvasRef.current ?? document.createElement('canvas');
      drawSchedule(canvas, state);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
      if (exportState.url) URL.revokeObjectURL(exportState.url);
      const file = new File([blob], 'جدولي.png', { type: 'image/png' });
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
              <path d="M4 5h16v14H4zM4 10h16M9 5v14M15 5v14" />
            </svg>
          </span>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">
            جدول المعلم
            <span className="mt-0.5 block text-xs font-normal text-muted">مصمم خلفية الجدول</span>
          </h1>
          <button type="button" className="ms-auto inline-flex items-center gap-1.5 px-1 py-2 text-sm text-primary" onClick={() => setEdit({ open: true, imported: false })}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="m15 4 5 5L9 20H4v-5L15 4ZM13 6l5 5" />
            </svg>
            تعديل الحصص
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1312px] px-4 pt-6 sm:px-8 sm:pt-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="mb-1 text-xs text-muted">حصصك، في صورة واحدة</p>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">صمّم جدولك.</h2>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted sm:text-sm">
            <span className="text-lg text-[#287355]">✦</span> لكل فصل لونه الخاص
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
              />
            </div>
            <div className="order-3">
              <SettingsPanel state={state} onChange={patch} />
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
            <PreviewPanel state={state} canvasRef={canvasRef} />
          </div>
        </div>
        <Footer />
      </main>

      <EditDialog open={edit.open} grid={state.grid} imported={edit.imported} info={info} onApply={applyGrid} onClose={() => setEdit({ open: false, imported: false })} onConfirm={(title, text, action) => setConfirmation({ title, text, action })} />
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
