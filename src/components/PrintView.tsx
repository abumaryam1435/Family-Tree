import React, { useState } from 'react';
import { X, Printer, TreeDeciduous, FileDown } from 'lucide-react';
import { Person } from '../types/family';
import { exportPersonCertificateToPdf } from '../utils/pdfExport';
import { calculateKinship } from '../utils/kinship';
import { extractGivenName } from '../utils/nameUtils';

interface PrintViewProps {
  person: Person | null;
  persons?: Person[];
  onClose: () => void;
  getAncestors: (id: string) => Person[];
  getChildren: (id: string) => Person[];
  getLineageString: (id: string) => string;
}

export const PrintView: React.FC<PrintViewProps> = ({
  person,
  persons = [],
  onClose,
  getAncestors,
  getChildren,
  getLineageString
}) => {
  const [isExporting, setIsExporting] = useState(false);

  if (!person) return null;

  const ancestors = getAncestors(person.id);
  const children = getChildren(person.id);
  const lineage = getLineageString(person.id);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      const kinship = persons.length > 0 ? calculateKinship(person.id, persons) : undefined;
      await exportPersonCertificateToPdf({
        person,
        lineage,
        ancestors,
        children,
        kinship
      });
    } finally {
      setIsExporting(false);
    }
  };

  const shortChain = [
    extractGivenName(person.fullName),
    ...ancestors.map(a => extractGivenName(a.fullName))
  ]
    .filter(Boolean)
    .join(` ${person.gender === 'male' ? 'بن' : 'بنت'} `)
    .replace(/(بنت\s+[^ ]+)\s+بنت\s+/g, '$1 بن ');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden my-0 sm:my-8 max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        
        {/* Controls Toolbar (hidden during actual print via CSS .no-print) */}
        <div className="no-print p-3.5 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-[#D4AF37] shrink-0" />
              <span className="text-xs font-bold">معاينة وثيقة النسب وتصديرها بصيغة PDF</span>
            </div>
            <button
              onClick={onClose}
              className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#b89738] text-[#0A3327] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-60"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" />
              <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="hidden sm:flex p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Page */}
        <div className="overflow-y-auto flex-1">
          <div className="printable-area p-5 sm:p-12 text-slate-900 font-serif text-right bg-[#FFFDF9] relative border-4 sm:border-8 border-double border-[#0F4C3A]/30 m-2.5 sm:m-4 rounded-2xl">
            {/* Ornate Arabic Header */}
            <div className="text-center space-y-2 pb-5 sm:pb-6 border-b-2 border-[#D4AF37]/50">
              <div className="text-xs sm:text-sm font-bold text-[#8C6D1F] tracking-widest font-sans">
                بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
              </div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center mx-auto my-2">
                <TreeDeciduous className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h1 className="text-xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display leading-snug">
                وثيقة إثبات النسب وسلسلة الأجداد
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 font-sans">
                مستخرجة من السجل الرقمي الموثق لشجرة العائلة
              </p>
            </div>

            {/* Person Short Name Title */}
            <div className="my-5 sm:my-8 text-center p-4 sm:p-6 bg-gradient-to-b from-[#F2F8F5] to-transparent rounded-2xl border border-[#0F4C3A]/20">
              <div className="text-xs text-slate-500 mb-2 font-sans font-semibold">
                الاسم الأول وسلسلة النسب:
              </div>
              <h2 className="text-lg sm:text-2xl font-bold text-[#0F4C3A] font-display leading-relaxed break-words">
                « {extractGivenName(person.fullName)} »
              </h2>
              {shortChain && (
                <div className="text-xs text-slate-600 font-semibold mt-1.5 font-sans break-words">
                  {shortChain}
                </div>
              )}
            </div>

            {/* Stepper Table of Ancestors (First Names Only) */}
            <div className="space-y-3 sm:space-y-4 my-5 sm:my-6">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 font-sans border-b border-slate-200 pb-2">
                سلسلة الأجداد والآباء المتسلسلة صعوداً (الاسم الأول في كل خانة):
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-sans text-xs">
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-[#0F4C3A]/30 text-center">
                  <span className="text-[10px] text-[#0F4C3A] block font-semibold">الجيل 1 (الفرد)</span>
                  <span className="text-sm font-extrabold text-[#0F4C3A] mt-0.5 block">
                    {extractGivenName(person.fullName)}
                  </span>
                </div>

                {ancestors.map((anc, idx) => (
                  <div key={anc.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-[10px] text-slate-500 block font-semibold">
                      {idx === 0 ? 'الأب المباشر' : idx === 1 ? 'الجد' : `الجد (${idx + 1})`}
                    </span>
                    <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                      {extractGivenName(anc.fullName)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Children Summary (First Name Only, No Husband Mention in PDF/Print) */}
            {children.length > 0 && (
              <div className="my-5 sm:my-6 pt-4 border-t border-slate-200 font-sans text-xs">
                <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-2">
                  الفروع والأبناء المسجلون ({children.length}):
                </h3>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {children.map((ch) => (
                    <span
                      key={ch.id}
                      className={`px-3 py-1.5 rounded-xl font-bold leading-snug ${
                        ch.gender === 'male'
                          ? 'bg-emerald-50 text-[#0F4C3A] border border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {extractGivenName(ch.fullName)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Seals & Date */}
            <div className="mt-8 sm:mt-12 pt-5 sm:pt-6 border-t-2 border-[#D4AF37]/40 flex items-center justify-between gap-3 text-xs font-sans text-slate-500">
              <div>
                <span>تاريخ التوثيق والاستخراج: </span>
                <strong>{new Date().toLocaleDateString('ar-SA')} م</strong>
              </div>

              <div className="text-center shrink-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-[#0F4C3A]/50 flex items-center justify-center text-[10px] text-[#0F4C3A] font-bold">
                  ختم الشجرة
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
