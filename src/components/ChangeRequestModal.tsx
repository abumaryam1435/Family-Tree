import React, { useState } from 'react';
import { X, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { Person } from '../types/family';
import { apiClient } from '../api/client';

interface ChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: Person | null;
  onSubmitted: () => void;
}

export const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({
  isOpen,
  onClose,
  person,
  onSubmitted
}) => {
  const [type, setType] = useState<'correction' | 'merge_proposal' | 'addition'>('correction');
  const [requesterName, setRequesterName] = useState<string>('');
  const [requesterNotes, setRequesterNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!requesterNotes.trim()) {
      setErrorMessage('يرجى كتابة تفاصيل الاقتراح أو التصحيح المطلوب');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.createChangeRequest({
        type,
        targetPersonId: person?.id,
        proposedData: {
          notes: requesterNotes
        },
        requesterName: requesterName || 'فرد من العائلة',
        requesterNotes: requesterNotes
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSubmitted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل في إرسال الاقتراح');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <h3 className="text-sm sm:text-base font-bold font-display">
              اقتراح تصحيح أو إبلاغ للمشرف
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {success ? (
            <div className="py-6 text-center space-y-2">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
              <h4 className="text-base font-bold text-slate-900 font-display">
                تم إرسال اقتراحك بنجاح!
              </h4>
              <p className="text-xs text-slate-500">
                سيقوم المشرف بمراجعة الطلب واعتماده في الشجرة. شكراً لمساهمتك.
              </p>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {person && (
                <div className="p-3 rounded-xl bg-[#FBF9F5] border border-slate-200 text-xs text-slate-700 leading-snug break-words">
                  الفرد المعني: <strong>{person.fullName}</strong>
                </div>
              )}

              {/* Request Type */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  نوع الطلب:
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                >
                  <option value="correction">تصحيح خطأ إملائي أو تاريخي في الاسم</option>
                  <option value="merge_proposal">اقتراح دمج مع شخص آخر متطابق</option>
                  <option value="addition">اقتراح إضافة فرع أو حفيد ناقص</option>
                </select>
              </div>

              {/* Requester Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  اسمك الكريم (اختياري):
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="مثال: فهد بن عبد العزيز"
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تفاصيل التصحيح أو الدليل <span className="text-red-500">*</span>:
                </label>
                <textarea
                  required
                  rows={4}
                  value={requesterNotes}
                  onChange={(e) => setRequesterNotes(e.target.value)}
                  placeholder="اشرح التصحيح المقترح بوضوح، مثل: الاسم الصحيح هو فلان، أو هذا الشخص هو نفسه فلان بن فلان المسجل في الشجرة الأخرى..."
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                />
              </div>

              <div className="pt-2 grid grid-cols-2 sm:flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100/80 hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] transition shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'جارٍ الإرسال...' : 'إرسال الاقتراح للمشرف'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
