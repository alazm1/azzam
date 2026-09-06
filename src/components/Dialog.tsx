import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  eyebrow?: string;
  title: string;
  wide?: boolean;
  children: ReactNode;
}

/** Native <dialog> wrapper: modal, closes on backdrop click / Escape. */
export function Dialog({ open, onClose, label, eyebrow, title, wide, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        const r = (e.currentTarget as HTMLDialogElement).getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
      className={`m-auto w-[min(590px,calc(100vw-28px))] max-h-[92dvh] overflow-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-[#0c2b2960] backdrop:backdrop-blur-sm sm:p-6 ${wide ? 'w-[min(1050px,calc(100vw-24px))]' : ''}`}
    >
      <div className="mb-5 flex items-center justify-between gap-5">
        <div>
          {eyebrow && <p className="text-xs text-muted">{eyebrow}</p>}
          <h2 className="text-xl font-bold">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-2xl text-muted">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
