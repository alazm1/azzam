import { Dialog } from './Dialog';

export interface Confirmation {
  title: string;
  text: string;
  action: () => void;
}

interface Props {
  confirmation: Confirmation | null;
  onClose: () => void;
}

export function ConfirmDialog({ confirmation, onClose }: Props) {
  return (
    <Dialog open={!!confirmation} onClose={onClose} label="تأكيد" title={confirmation?.title ?? 'تأكيد'}>
      <p className="text-sm leading-7 text-muted">{confirmation?.text}</p>
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={() => {
            const a = confirmation?.action;
            onClose();
            a?.();
          }}
        >
          متابعة
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </Dialog>
  );
}
