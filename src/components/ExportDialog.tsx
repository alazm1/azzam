import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  url: string | null;
  canShare: boolean;
  onShare: () => void;
  onClose: () => void;
}

export function ExportDialog({ open, url, canShare, onShare, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} label="صورتك جاهزة" eyebrow="احتفظ بجدولك قريبًا" title="صورتك جاهزة">
      <div className="text-center">
        {url && <img src={url} alt="خلفية الجدول الجاهزة" className="mx-auto mb-4 block max-h-[47dvh] max-w-full rounded-lg object-contain shadow-[0_5px_20px_#163d3620]" />}
        <p className="text-sm text-muted">
          {canShare ? 'اضغط «مشاركة أو حفظ في الصور»، ثم اختر حفظ الصورة من قائمة الجوال.' : 'اضغط «تنزيل PNG». ويمكنك الضغط مطولًا على الصورة لاختيار حفظها إذا كان متصفحك يدعم ذلك.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {canShare && (
            <button type="button" className="btn-primary flex-1" onClick={onShare}>
              مشاركة أو حفظ في الصور
            </button>
          )}
          {url && (
            <a href={url} download="جدولي.png" className={`${canShare ? 'btn-secondary' : 'btn-primary flex-1'}`}>
              تنزيل PNG
            </a>
          )}
        </div>
      </div>
    </Dialog>
  );
}
