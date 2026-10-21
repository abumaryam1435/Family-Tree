import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#94741E] border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-semibold transition shadow-xs whitespace-nowrap shrink-0"
        title="تثبيت تطبيق «العائلة» على هاتفك"
      >
        <Download className="w-3.5 h-3.5" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#94741E] border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-semibold transition shadow-xs whitespace-nowrap shrink-0"
          title="تثبيت تطبيق «العائلة» في الآيفون"
        >
          <Download className="w-3.5 h-3.5" />
          <span>تثبيت في الآيفون</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-800 text-right">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/tree-logo.png"
                    alt="شعار التطبيق"
                    className="w-9 h-9 rounded-xl object-contain border border-[#D4AF37]/50 shadow-xs"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-[#0F4C3A]">تثبيت تطبيق «شجرة العائلة»</h3>
                    <p className="text-[10px] text-slate-500">على شاشة الآيفون الرئيسية</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 mt-4 text-sm text-slate-600 leading-relaxed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[#0F4C3A]">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <span>1. اضغط على أيقونة <strong>المشاركة (Share)</strong> في شريط متصفح سفاري.</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[#0F4C3A]">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <span>2. مرر للأسفل واضغط على <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-[#0F4C3A] py-2.5 text-xs font-bold text-white hover:bg-[#0c3c2e] transition"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
