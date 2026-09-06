interface Props {
  message: string;
  onRetake: () => void;
  onUpload: () => void;
}

export function FailureScreen({ message, onRetake, onUpload }: Props) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-warn-light text-warn">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold">لم نتمكن من قراءة الجدول</h2>
      <p className="mt-3 leading-7 text-muted">{message}</p>
      <ul className="mt-4 space-y-1 text-start text-sm text-muted">
        <li>• اجعل الجدول يملأ الصورة وبإضاءة جيدة.</li>
        <li>• صوّر من الأعلى مباشرة قدر الإمكان.</li>
        <li>• تأكد من ظهور أسماء الأيام وأرقام الحصص.</li>
      </ul>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button type="button" className="btn-primary text-lg" onClick={onRetake}>
          إعادة التصوير
        </button>
        <button type="button" className="btn-secondary" onClick={onUpload}>
          رفع صورة أخرى
        </button>
      </div>
    </div>
  );
}
