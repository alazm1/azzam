import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyzeScreen } from './components/AnalyzeScreen';
import { BottomNav, type NavTab } from './components/BottomNav';
import { FailureScreen } from './components/FailureScreen';
import { Footer } from './components/Footer';
import { ImageUpload } from './components/ImageUpload';
import { ImportReview } from './components/ImportReview';
import { ScheduleView } from './components/ScheduleView';
import { Settings } from './components/Settings';
import { TodayView } from './components/TodayView';
import type { ExtractionResult, ProgressEvent } from './engine/types';
import type { TeacherSchedule } from './models/schedule';
import { analyzeScheduleImage, warmUpOcr } from './services/analysis';
import { buildSchedule, extractionToReviewLessons, type ReviewLesson } from './services/importer';
import { scheduleRepository } from './services/storage';

type View = 'loading' | 'home' | 'analyzing' | 'review' | 'failed' | 'schedule' | 'today' | 'settings';

interface ImportState {
  file: File | null;
  previewUrl: string | null;
  progress: ProgressEvent | null;
  result: ExtractionResult | null;
  lessons: ReviewLesson[];
  error: string | null;
}

const EMPTY_IMPORT: ImportState = { file: null, previewUrl: null, progress: null, result: null, lessons: [], error: null };

export function App() {
  const [view, setView] = useState<View>('loading');
  const [schedule, setSchedule] = useState<TeacherSchedule | null>(null);
  const [imp, setImp] = useState<ImportState>(EMPTY_IMPORT);
  const runId = useRef(0);

  useEffect(() => {
    scheduleRepository.load().then((s) => {
      setSchedule(s);
      setView(s ? 'schedule' : 'home');
      // The OCR core is large; start fetching it early so the first import feels fast.
      if (!s) warmUpOcr();
    });
  }, []);

  // Revoke preview URLs when they are replaced or the import ends (the photo is not kept).
  useEffect(() => {
    return () => {
      if (imp.previewUrl) URL.revokeObjectURL(imp.previewUrl);
    };
  }, [imp.previewUrl]);

  const persist = useCallback((s: TeacherSchedule) => {
    setSchedule(s);
    void scheduleRepository.save(s);
  }, []);

  const startImport = useCallback(async (file: File) => {
    const id = ++runId.current;
    const previewUrl = URL.createObjectURL(file);
    setImp({ ...EMPTY_IMPORT, file, previewUrl });
    setView('analyzing');
    try {
      const result = await analyzeScheduleImage(file, (progress) => {
        if (runId.current === id) setImp((s) => ({ ...s, progress }));
      });
      if (runId.current !== id) return;
      if (result.status !== 'ok') {
        setImp((s) => ({ ...s, result, error: result.message ?? 'لم نتمكن من قراءة الجدول بشكل كافٍ.' }));
        setView('failed');
        return;
      }
      setImp((s) => ({ ...s, result, lessons: extractionToReviewLessons(result) }));
      setView('review');
    } catch (err) {
      if (runId.current !== id) return;
      console.error(err);
      setImp((s) => ({
        ...s,
        error: 'لم نتمكن من قراءة الجدول بشكل كافٍ. حاول تصوير الجدول بشكل أوضح بحيث تظهر جميع الصفوف والأعمدة.',
      }));
      setView('failed');
    }
  }, []);

  const confirmImport = useCallback(() => {
    if (!imp.result) return;
    const next = buildSchedule(imp.lessons, imp.result.periods, imp.result, schedule);
    persist(next);
    setImp(EMPTY_IMPORT);
    setView('schedule');
  }, [imp.lessons, imp.result, schedule, persist]);

  const goHome = useCallback(() => {
    runId.current++;
    setImp(EMPTY_IMPORT);
    setView('home');
  }, []);

  const deleteSchedule = useCallback(() => {
    void scheduleRepository.clear();
    setSchedule(null);
    setView('home');
  }, []);

  const navTab: NavTab | null = view === 'schedule' || view === 'today' || view === 'settings' ? view : null;
  const showNav = !!schedule && navTab !== null;

  let content: React.ReactNode;
  switch (view) {
    case 'loading':
      content = <div className="p-10 text-center text-muted">جارٍ التحميل…</div>;
      break;
    case 'home':
      content = <ImageUpload onImage={startImport} hasSchedule={!!schedule} onOpenSchedule={() => setView('schedule')} />;
      break;
    case 'analyzing':
      content = <AnalyzeScreen progress={imp.progress} previewUrl={imp.previewUrl} />;
      break;
    case 'failed':
      content = <FailureScreen message={imp.error ?? ''} onRetake={goHome} onUpload={goHome} />;
      break;
    case 'review':
      content = imp.result ? (
        <ImportReview
          result={imp.result}
          lessons={imp.lessons}
          onChange={(lessons) => setImp((s) => ({ ...s, lessons }))}
          onConfirm={confirmImport}
          onRetake={goHome}
          previewUrl={imp.previewUrl}
        />
      ) : null;
      break;
    case 'schedule':
      content = schedule ? <ScheduleView schedule={schedule} onChange={persist} /> : null;
      break;
    case 'today':
      content = schedule ? <TodayView schedule={schedule} /> : null;
      break;
    case 'settings':
      content = schedule ? <Settings schedule={schedule} onChange={persist} onReimport={goHome} onDelete={deleteSchedule} /> : null;
      break;
  }

  return (
    <div className="min-h-dvh">
      {showNav && (
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
            <h1 className="text-lg font-bold text-primary-dark">جدول المعلم</h1>
            <button type="button" className="text-xs font-bold text-primary" onClick={goHome}>
              جدول جديد
            </button>
          </div>
        </header>
      )}
      <main className={showNav ? 'pb-4' : ''}>{content}</main>
      <Footer />
      {showNav && <BottomNav active={navTab!} onChange={(tab) => setView(tab)} />}
    </div>
  );
}
