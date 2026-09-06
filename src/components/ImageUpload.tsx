import { useRef } from 'react';

interface Props {
  onImage: (file: File) => void;
  hasSchedule: boolean;
  onOpenSchedule: () => void;
}

/** Home screen: the only way in is a photo (camera) or an uploaded image. */
export function ImageUpload({ onImage, hasSchedule, onOpenSchedule }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onImage(file);
  };

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-light text-primary">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v14H4z" />
          <path d="M4 10h16M9 5v14M15 5v14" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-ink">جدول المعلم</h1>
      <p className="mt-3 text-base leading-7 text-muted">صوّر جدولك، وسنحوّله إلى جدول ذكي مرتب خلال لحظات.</p>

      <div className="mt-8 flex w-full flex-col gap-3">
        <button type="button" className="btn-primary text-lg" onClick={() => cameraRef.current?.click()}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          تصوير الجدول
        </button>
        <button type="button" className="btn-secondary text-lg" onClick={() => fileRef.current?.click()}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          رفع صورة
        </button>
        {hasSchedule && (
          <button type="button" className="btn-ghost text-lg" onClick={onOpenSchedule}>
            فتح جدولي
          </button>
        )}
      </div>

      <p className="mt-8 text-xs leading-6 text-muted">
        تتم قراءة الصورة على جهازك مباشرة ولا تُرفع إلى أي خادم. تأكد أن الصورة تُظهر الجدول كاملًا بصفوفه وأعمدته.
      </p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handle} />
    </div>
  );
}
