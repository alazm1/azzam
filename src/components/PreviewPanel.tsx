import { useEffect, useRef, useState } from 'react';
import { arabic, DAYS, type DesignState } from '../models/design';
import { drawSchedule, ensureFonts, type DrawStats } from '../services/wallpaper';

interface Props {
  state: DesignState;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const SOURCE_LABELS: Record<DesignState['source'], string> = {
  empty: 'بانتظار صورة',
  photo: 'مقروء من الصورة',
  reviewed: 'تمت مراجعته',
  manual: 'جدول مخصص',
};

/** Live preview of the wallpaper (the same canvas is exported as PNG). */
export function PreviewPanel({ state, canvasRef }: Props) {
  const [stats, setStats] = useState<DrawStats | null>(null);
  const fontsReady = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      setStats(drawSchedule(canvas, state));
    };
    if (fontsReady.current) paint();
    else {
      paint();
      ensureFonts().then(() => {
        fontsReady.current = true;
        paint();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [state, canvasRef]);

  const landscape = state.format === 'landscape';
  const dayCount = state.grid[0]?.length || 5;
  return (
    <section className="rounded-2xl border border-[#e0e7e2] bg-[#edf2ef] p-4 sm:p-6 lg:sticky lg:top-6" aria-label="معاينة الجدول">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3b886f]" />
          المعاينة
        </h2>
        <span className={`rounded-md border px-2 py-1 text-xs ${state.source === 'empty' ? 'border-[#ecdeb6] bg-[#fff9e8] text-[#796025]' : 'border-[#c6e2d1] bg-[#e3f2e9] text-[#24674e]'}`}>{SOURCE_LABELS[state.source]}</span>
      </div>
      <div className="flex min-h-[420px] items-center justify-center py-6">
        <div className={`relative overflow-hidden bg-[#e8f2ed] shadow-[0_18px_48px_#173b3120,0_0_0_1px_#173b3118] ${landscape ? 'w-full rounded-xl' : 'w-[min(100%,290px)] rounded-[17px]'}`}>
          <canvas ref={canvasRef} width={1200} height={2600} className="block h-auto w-full" role="img" aria-label="معاينة الجدول الأسبوعي. تتوفر الحصص كنص في زر تعديل الحصص." />
          {!landscape && state.clock && (
            <div className={`pointer-events-none absolute left-0 top-[6.8%] flex w-full flex-col items-center ${state.theme === 'night' ? 'text-[#deeee57a]' : 'text-[#0a4b4075]'}`} aria-hidden="true">
              <span className="text-[11px]">مساحة الساعة</span>
              <strong className="text-5xl font-bold leading-snug">٩:٤١</strong>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between gap-3 border-t border-[#d6e0da] pt-4 text-xs text-[#50665c]">
        <span>{stats ? `${arabic(stats.count)} حصة · ${arabic(stats.classes.length)} فصول` : ''}</span>
        <span>
          {DAYS[0]} — {DAYS[dayCount - 1]}
        </span>
      </div>
      <p className="mt-3 text-center text-xs text-[#74857b]">تظهر تعديلاتك هنا مباشرة</p>
    </section>
  );
}
