import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 text-right">
        <button
          onClick={onCancel}
          className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-3 pl-8">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isDestructive ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display leading-snug">
            {title}
          </h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-5 break-words">
          {message}
        </p>

        <div className="grid grid-cols-2 sm:flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100/80 hover:bg-slate-200 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold text-white transition shadow-xs ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#0F4C3A] hover:bg-[#0c3c2e]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
