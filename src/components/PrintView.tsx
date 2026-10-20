import React, { useState } from 'react';
import { X, Printer, TreeDeciduous, FileDown } from 'lucide-react';
import { Person } from '../types/family';
import { exportPersonCertificateToPdf } from '../utils/pdfExport';
import { calculateKinship } from '../utils/kinship';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Controls Toolbar (hidden during actual print via CSS .no-print) */}
        <div className="no-print p-4 bg-slate-900 text-white flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#D4AF37]" />
            <span className="text-xs font-bold">معاينة وثيقة النسب وتصديرها بصيغة PDF</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-4 py-1.5 rounded-xl bg-[#D4AF37] hover:bg-[#b89738] text-[#0A3327] font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-60"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Page */}
        <div className="printable-area p-8 sm:p-12 text-slate-900 font-serif text-right bg-[#FFFDF9] relative border-8 border-double border-[#0F4C3A]/30 m-4 rounded-2xl">
          {/* Ornate Arabic Header */}
          <div className="text-center space-y-2 pb-6 border-b-2 border-[#D4AF37]/50">
            <div className="text-sm font-bold text-[#8C6D1F] tracking-widest font-sans">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <div className="w-12 h-12 rounded-full bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center mx-auto my-2">
              <TreeDeciduous className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display">
              وثيقة إثبات النسب وسلسلة الأجداد
            </h1>
            <p className="text-xs text-slate-500 font-sans">
              مستخرجة من السجل الرقمي الموثق لشجرة العائلة
            </p>
          </div>

          {/* Person Full Lineage Title */}
          <div className="my-8 text-center p-6 bg-gradient-to-b from-[#F2F8F5] to-transparent rounded-2xl border border-[#0F4C3A]/20">
            <div className="text-xs text-slate-500 mb-2 font-sans font-semibold">
              سلسلة النسب المبارك:
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0F4C3A] font-display leading-relaxed">
              « {lineage} »
            </h2>
            {person.gender === 'female' && person.husbandName && (
              <div className="text-xs text-rose-800 font-bold mt-2 font-sans">
                زوجة: {person.husbandName}
              </div>
            )}
          </div>

          {/* Stepper Table of Ancestors */}
          <div className="space-y-4 my-6">
            <h3 className="text-sm font-bold text-slate-800 font-sans border-b border-slate-200 pb-2">
              سلسلة الأجداد والآباء المتسلسلة صعوداً:
            </h3>

            <div className="divide-y divide-slate-100 font-sans text-xs">
              <div className="py-2.5 flex justify-between items-center bg-slate-50 px-3 rounded-lg font-bold">
                <span className="text-[#0F4C3A]">الجيل 1 (الفرد):</span>
                <span>{person.fullName}</span>
              </div>

              {ancestors.map((anc, idx) => (
                <div key={anc.id} className="py-2 flex justify-between items-center px-3">
                  <span className="text-slate-500">
                    {idx === 0 ? 'الأب المباشر:' : idx === 1 ? 'الجد:' : `الجد (الجيل ${idx + 2}):`}
                  </span>
                  <span className="font-semibold text-slate-800">{anc.fullName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Children Summary */}
          {children.length > 0 && (
            <div className="my-6 pt-4 border-t border-slate-200 font-sans text-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                الفروع والأبناء المسجلون ({children.length}):
              </h3>
              <div className="flex flex-wrap gap-2">
                {children.map((ch) => (
                  <span
                    key={ch.id}
                    className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium"
                  >
                    {ch.fullName} ({ch.gender === 'male' ? 'ابن' : 'ابنة'})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer Seals & Date */}
          <div className="mt-12 pt-6 border-t-2 border-[#D4AF37]/40 flex items-center justify-between text-xs font-sans text-slate-500">
            <div>
              <span>تاريخ التوثيق والاستخراج: </span>
              <strong>{new Date().toLocaleDateString('ar-SA')} م</strong>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#0F4C3A]/50 flex items-center justify-center text-[10px] text-[#0F4C3A] font-bold">
                ختم الشجرة
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
