'use client';

type Props = {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  secondaryAction?: { label: string; onClick: () => void };
};

export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete', secondaryAction }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-800 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          {secondaryAction && (
            <button onClick={secondaryAction.onClick} className="btn-secondary">
              {secondaryAction.label}
            </button>
          )}
          <button onClick={onConfirm} className="btn-danger">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
