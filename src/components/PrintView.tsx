import React, { useState } from 'react';
import {
  X,
  Printer,
  TreeDeciduous,
  FileDown,
  Users,
  Network,
  Heart,
  UserCheck,
  FileText
} from 'lucide-react';
import { Person } from '../types/family';
import { exportPersonCertificateToPdf } from '../utils/pdfExport';
import { calculateKinship, getCoupleRelationship } from '../utils/kinship';
import { extractGivenName, formatAppName, formatBranchName } from '../utils/nameUtils';

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
  const kinship = calculateKinship(person.id, persons);

  const father = person.fatherId ? persons.find((p) => p.id === person.fatherId) : undefined;
  const grandfather = father?.fatherId ? persons.find((p) => p.id === father.fatherId) : undefined;

  const husbandPerson =
    person.gender === 'female' && person.husbandId
      ? persons.find((p) => p.id === person.husbandId)
      : undefined;

  const coupleRelationship =
    person.gender === 'female' && person.husbandId
      ? getCoupleRelationship(person.id, person.fatherId, person.husbandId, persons)
      : null;

  const sons = children.filter((c) => c.gender === 'male');
  const daughters = children.filter((c) => c.gender === 'female');
  const maleMotherChildren = kinship.children.filter((c) => c.gender === 'male');
  const femaleMotherChildren = kinship.children.filter((c) => c.gender === 'female');

  const hasAnyKinshipDetails =
    kinship.children.length > 0 ||
    kinship.excludedHusbandChildren.length > 0 ||
    kinship.isMaternalUncleTo.length > 0 ||
    kinship.isMaternalAuntTo.length > 0 ||
    kinship.isPaternalUncleTo.length > 0 ||
    kinship.isPaternalAuntTo.length > 0 ||
    kinship.maternalUncles.length > 0 ||
    kinship.maternalAunts.length > 0 ||
    kinship.paternalUncles.length > 0 ||
    kinship.paternalAunts.length > 0 ||
    kinship.siblings.length > 0 ||
    kinship.wives.length > 0;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await exportPersonCertificateToPdf({
        person,
        lineage,
        ancestors,
        children,
        kinship,
        allPersons: persons
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible print:block">
      <div className="relative w-full max-w-4xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden my-0 sm:my-6 max-h-[94vh] sm:max-h-[92vh] flex flex-col print:max-w-none print:max-h-none print:overflow-visible print:shadow-none print:rounded-none print:my-0">
        {/* Controls Toolbar (hidden during actual print via CSS .no-print) */}
        <div className="no-print p-3.5 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-[#D4AF37] shrink-0" />
              <span className="text-xs sm:text-sm font-bold">
                معاينة بطاقة التفاصيل الكاملة وتصديرها بصيغة PDF أو طباعتها
              </span>
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
              <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير PDF شامل'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>طباعة الورقة</span>
            </button>
            <button
              onClick={onClose}
              className="hidden sm:flex p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Detailed Document */}
        <div className="overflow-y-auto flex-1 print:overflow-visible">
          <div
            dir="rtl"
            className="printable-area p-5 sm:p-10 text-slate-900 font-sans text-right bg-[#FFFDF9] relative border-4 sm:border-8 border-double border-[#0F4C3A]/35 m-2.5 sm:m-4 rounded-2xl space-y-6"
          >
            {/* 1. Document Header */}
            <div className="text-center space-y-2 pb-5 border-b-2 border-[#D4AF37]/50">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center mx-auto mb-1 shadow-xs">
                <TreeDeciduous className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0F4C3A] leading-snug">
                بطاقة التفصيل الكامل للنسب والفروع وصلات القرابة
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 font-semibold">
                مستخرجة من السجل الرقمي الموثق لشجرة العائلة
              </p>
            </div>

            {/* 2. Primary Identity Banner (Matches PersonModal Header) */}
            <div
              className={`p-4 sm:p-6 rounded-2xl border-2 ${
                person.gender === 'male'
                  ? 'bg-gradient-to-b from-[#F2F8F5] to-white border-[#0F4C3A]/30'
                  : 'bg-gradient-to-b from-rose-50/70 to-white border-rose-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                      person.gender === 'male'
                        ? 'bg-[#0F4C3A] text-[#FDE68A] border-[#D4AF37]'
                        : 'bg-rose-800 text-rose-100 border-rose-400'
                    }`}
                  >
                    {person.gender === 'male' ? 'ذكر' : 'أنثى'}
                  </span>

                  {person.gender === 'female' && (person.husbandName || husbandPerson) && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                      زوجة: {formatAppName(husbandPerson ? husbandPerson.fullName : person.husbandName)}
                    </span>
                  )}
                </div>

                <span className="text-xs font-bold text-slate-500">
                  الاسم الشخصي: <strong className="text-slate-900">{extractGivenName(person.fullName)}</strong>
                </span>
              </div>

              <div className="text-center space-y-2 py-2">
                <div className="text-[11px] font-bold text-slate-500">الاسم الكامل لصاحب البطاقة:</div>
                <h2
                  className={`text-xl sm:text-3xl font-black leading-relaxed break-words ${
                    person.gender === 'male' ? 'text-[#0F4C3A]' : 'text-rose-950'
                  }`}
                >
                  « {formatAppName(person.fullName)} »
                </h2>
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-slate-500 block mb-1">
                    سلسلة النسب الكاملة في الشجرة:
                  </span>
                  <div className="inline-block bg-white px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800 leading-relaxed break-words shadow-2xs">
                    {lineage}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Direct Origins & Lineage Section (نسب الفرد والأصول المباشرة) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0F4C3A] text-white flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                  <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                  <span>أولاً: نسب الفرد والأصول المباشرة (الأب، الأم، الجد)</span>
                </div>
                <span className="text-[11px] text-[#FDE68A] font-semibold">
                  عدد الأجيال الصاعدة: {ancestors.length + 1}
                </span>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-semibold block mb-1">الأب المباشر:</span>
                    <span className="font-extrabold text-slate-900 text-sm block break-words">
                      {father ? formatAppName(father.fullName) : 'غير مسجل (بداية شجرة مستقلة)'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-semibold block mb-1">الجد المباشر:</span>
                    <span className="font-extrabold text-slate-900 text-sm block break-words">
                      {grandfather ? formatAppName(grandfather.fullName) : 'غير مسجل'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-semibold block mb-1">الأم (الوالدة):</span>
                    <span className="font-extrabold text-rose-900 text-sm block break-words">
                      {kinship.mother ? formatAppName(kinship.mother.fullName) : 'غير مسجلة في الشجرة'}
                    </span>
                  </div>
                </div>

                {/* Stepper of Ancestors */}
                {ancestors.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <div className="text-xs font-bold text-[#0F4C3A] mb-2">
                      تسلسل الآباء والأجداد صعوداً:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-[#0F4C3A]/30 text-center">
                        <span className="text-[10px] text-[#0F4C3A] block font-bold">الجيل 1 (الفرد)</span>
                        <span className="text-sm font-black text-[#0F4C3A] mt-0.5 block">
                          {extractGivenName(person.fullName)}
                        </span>
                      </div>

                      {ancestors.map((anc, idx) => (
                        <div
                          key={anc.id}
                          className="p-2.5 rounded-xl bg-white border border-slate-200 text-center"
                        >
                          <span className="text-[10px] text-slate-500 block font-semibold">
                            {idx === 0 ? 'الأب المباشر' : idx === 1 ? 'الجد الأول' : `الجد (${idx + 1})`}
                          </span>
                          <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                            {extractGivenName(anc.fullName)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Spouse / Marriage Details for Female (بيانات الزوج وصلة القرابة بينهما) */}
            {person.gender === 'female' && (person.husbandName || husbandPerson) && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 overflow-hidden">
                <div className="px-4 py-2.5 bg-rose-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                    <Heart className="w-4 h-4 text-rose-300" />
                    <span>بيانات الزوج وصلة القرابة بين الزوجين</span>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-rose-700 font-bold">الزوج المسجل:</span>
                    <span className="text-sm font-black text-rose-950">
                      {formatAppName(husbandPerson ? husbandPerson.fullName : person.husbandName)}
                    </span>
                  </div>

                  {husbandPerson && coupleRelationship && (
                    <div className="p-3 rounded-xl bg-white border border-rose-200 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-600">صلة القرابة بينهما:</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-[#0F4C3A] border border-emerald-200 font-extrabold">
                          {coupleRelationship.relationToHusband}
                        </span>
                      </div>
                      <p className="text-slate-600 font-medium leading-relaxed">
                        {coupleRelationship.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Descendants / Children Section (الفروع والأبناء) */}
            <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0F4C3A] text-white flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                  <Users className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    ثانياً: الفروع والأبناء (
                    {person.gender === 'male' ? children.length : kinship.children.length})
                  </span>
                </div>
                {person.gender === 'male' && children.length > 0 && (
                  <span className="text-[11px] font-bold text-[#FDE68A]">
                    {sons.length} ذكور · {daughters.length} إناث
                  </span>
                )}
                {person.gender === 'female' && kinship.children.length > 0 && (
                  <span className="text-[11px] font-bold text-[#FDE68A]">
                    {maleMotherChildren.length} ذكور · {femaleMotherChildren.length} إناث
                  </span>
                )}
              </div>

              <div className="p-4 space-y-4">
                {person.gender === 'male' ? (
                  children.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-2">
                      لا يوجد أبناء أو بنات مسجلون لهذا الاسم حالياً
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Sons List */}
                      <div className="space-y-2">
                        <div className="text-xs font-extrabold text-[#0F4C3A] flex items-center justify-between border-b border-emerald-200 pb-1.5">
                          <span>الأبناء الذكور ({sons.length}):</span>
                        </div>
                        {sons.length === 0 ? (
                          <div className="text-xs text-slate-400 py-1">— لا يوجد أبناء ذكور مسجلون —</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {sons.map((son, idx) => (
                              <div
                                key={son.id}
                                className="p-2.5 rounded-xl bg-white border border-emerald-200 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <span className="text-xs sm:text-sm font-black text-slate-900 block">
                                    {idx + 1}. {formatBranchName(son.fullName)}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {formatAppName(son.fullName)}
                                  </span>
                                </div>
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-[#0F4C3A] border border-emerald-200 text-[10px] font-bold shrink-0">
                                  ذكر (ابن)
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Daughters List */}
                      <div className="space-y-2">
                        <div className="text-xs font-extrabold text-rose-900 flex items-center justify-between border-b border-rose-200 pb-1.5">
                          <span>البنات الإناث ({daughters.length}):</span>
                        </div>
                        {daughters.length === 0 ? (
                          <div className="text-xs text-slate-400 py-1">— لا توجد بنات مسجلات —</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {daughters.map((daughter, idx) => {
                              const dHusband = daughter.husbandId
                                ? persons.find((p) => p.id === daughter.husbandId)
                                : undefined;
                              return (
                                <div
                                  key={daughter.id}
                                  className="p-2.5 rounded-xl bg-white border border-rose-200 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <span className="text-xs sm:text-sm font-black text-rose-950 block">
                                      {idx + 1}. {formatBranchName(daughter.fullName)}
                                    </span>
                                    {(dHusband || daughter.husbandName) && (
                                      <span className="text-[10px] text-rose-700 font-semibold block">
                                        زوجة: {formatAppName(dHusband ? dHusband.fullName : daughter.husbandName)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-900 border border-rose-200 text-[10px] font-bold shrink-0">
                                    أنثى (ابنة)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    {kinship.children.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-rose-900">
                          أبناؤها وبناتها من زوجها ({kinship.children.length}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {kinship.children.map((ch, idx) => (
                            <div
                              key={ch.id}
                              className="p-2.5 rounded-xl bg-white border border-rose-200 flex items-center justify-between gap-2"
                            >
                              <span className="text-xs sm:text-sm font-bold text-slate-900">
                                {idx + 1}. {formatAppName(ch.fullName)}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold shrink-0">
                                {ch.gender === 'male' ? 'ابنها' : 'ابنتها'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 leading-relaxed">
                        <strong className="block mb-0.5 text-[#0F4C3A]">
                          ملاحظة النسب الشرعي للأم:
                        </strong>
                        في المشجرات العربية الأصيلة يُنسب الأبناء لآبائهم في عمود النسب، وتُحفظ صلتهم بأمهم وأخوالهم وخالاتهم في سجل القرابة.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 6. Extended Kinship & Related Data Section (البيانات الأخرى وصلات القرابة المتعلقة بالاسم) */}
            <div className="rounded-2xl border border-amber-300/80 bg-amber-50/30 overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0F4C3A] text-white flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                  <Network className="w-4 h-4 text-[#D4AF37]" />
                  <span>ثالثاً: البيانات الأخرى وصلات القرابة المتعلقة بالاسم</span>
                </div>
              </div>

              <div className="p-4 space-y-3 text-xs">
                {!hasAnyKinshipDetails && (
                  <div className="text-slate-500 text-center py-2">
                    لا توجد بيانات قرابة إضافية مسجلة حالياً لهذا الاسم
                  </div>
                )}

                {/* Wives (if male) */}
                {person.gender === 'male' && kinship.wives.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-rose-200 space-y-2">
                    <div className="font-extrabold text-rose-900 border-b border-rose-100 pb-1.5">
                      الزوجات المسجلات في الشجرة ({kinship.wives.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {kinship.wives.map((w) => {
                        const rel = getCoupleRelationship(w.id, w.fatherId, person.id, persons);
                        return (
                          <div
                            key={w.id}
                            className="p-2 rounded-lg bg-rose-50/60 border border-rose-200/80 flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">{formatAppName(w.fullName)}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                                زوجة
                              </span>
                            </div>
                            {rel && (
                              <span className="text-[10px] text-[#0F4C3A] font-semibold">
                                صلة القرابة: {rel.relationToHusband}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Siblings (الإخوة والأخوات) */}
                {kinship.siblings.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-1.5">
                      <span className="font-extrabold text-slate-800">
                        الإخوة والأخوات ({kinship.siblings.length}):
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {kinship.brothers.length} ذكور · {kinship.sisters.length} إناث
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.siblings.map((sib) => (
                        <div
                          key={sib.id}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(sib.fullName)}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                              sib.gender === 'male'
                                ? 'bg-emerald-50 text-[#0F4C3A] border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {sib.gender === 'male' ? 'أخ' : 'أخت'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paternal Uncles & Aunts (الأعمام والعمات) */}
                {(kinship.paternalUncles.length > 0 || kinship.paternalAunts.length > 0) && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-1.5">
                      <span className="font-extrabold text-[#0F4C3A]">
                        الأعمام والعمات — إخوة وأخوات الأب (
                        {kinship.paternalUncles.length + kinship.paternalAunts.length}):
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {kinship.paternalUncles.length} أعمام · {kinship.paternalAunts.length} عمات
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.paternalUncles.map((u) => (
                        <div
                          key={u.id}
                          className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200/70 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(u.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-[#0F4C3A] font-bold shrink-0">
                            عم
                          </span>
                        </div>
                      ))}
                      {kinship.paternalAunts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2 rounded-lg bg-rose-50/50 border border-rose-200/70 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(a.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold shrink-0">
                            عمة
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maternal Uncles & Aunts (الأخوال والخالات) */}
                {(kinship.maternalUncles.length > 0 || kinship.maternalAunts.length > 0) && (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-100 pb-1.5">
                      <div>
                        <span className="font-extrabold text-amber-950 block">
                          الأخوال والخالات — إخوة وأخوات الأم (
                          {kinship.maternalUncles.length + kinship.maternalAunts.length}):
                        </span>
                        {kinship.mother && (
                          <span className="text-[10px] text-amber-800 font-semibold">
                            الأم: {formatAppName(kinship.mother.fullName)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-amber-800">
                        {kinship.maternalUncles.length} أخوال · {kinship.maternalAunts.length} خالات
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.maternalUncles.map((u) => (
                        <div
                          key={u.id}
                          className="p-2 rounded-lg bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(u.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                            خال
                          </span>
                        </div>
                      ))}
                      {kinship.maternalAunts.map((a) => (
                        <div
                          key={a.id}
                          className="p-2 rounded-lg bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(a.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                            خالة
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paternal Uncle To (عم لـ) */}
                {person.gender === 'male' && kinship.isPaternalUncleTo.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-2">
                    <div className="font-extrabold text-[#0F4C3A] border-b border-emerald-100 pb-1.5">
                      عم لـ — أبناء وبنات إخوته الذكور ({kinship.isPaternalUncleTo.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.isPaternalUncleTo.map((n) => (
                        <div
                          key={n.id}
                          className="p-2 rounded-lg bg-emerald-50/40 border border-emerald-200/70 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(n.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-[#0F4C3A] font-bold shrink-0">
                            {n.gender === 'male' ? 'ابن أخ' : 'ابنة أخ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paternal Aunt To (عمة لـ) */}
                {person.gender === 'female' && kinship.isPaternalAuntTo.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-2">
                    <div className="font-extrabold text-[#0F4C3A] border-b border-emerald-100 pb-1.5">
                      عمة لـ — أبناء وبنات إخوتها الذكور ({kinship.isPaternalAuntTo.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.isPaternalAuntTo.map((n) => (
                        <div
                          key={n.id}
                          className="p-2 rounded-lg bg-emerald-50/40 border border-emerald-200/70 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(n.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-[#0F4C3A] font-bold shrink-0">
                            {n.gender === 'male' ? 'ابن أخ' : 'ابنة أخ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maternal Uncle To (خال لـ) */}
                {person.gender === 'male' && kinship.isMaternalUncleTo.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-2">
                    <div className="font-extrabold text-amber-950 border-b border-amber-100 pb-1.5">
                      خال لـ — أبناء وبنات أخواته ({kinship.isMaternalUncleTo.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.isMaternalUncleTo.map((n) => (
                        <div
                          key={n.id}
                          className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/80 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(n.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                            {n.gender === 'male' ? 'ابن أخت' : 'ابنة أخت'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maternal Aunt To (خالة لـ) */}
                {person.gender === 'female' && kinship.isMaternalAuntTo.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-2">
                    <div className="font-extrabold text-amber-950 border-b border-amber-100 pb-1.5">
                      خالة لـ — أبناء وبنات أخواتها ({kinship.isMaternalAuntTo.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.isMaternalAuntTo.map((n) => (
                        <div
                          key={n.id}
                          className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/80 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-800">{formatAppName(n.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                            {n.gender === 'male' ? 'ابن أخت' : 'ابنة أخت'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maternal Uncles/Aunts of Her Children (if female with children) */}
                {person.gender === 'female' &&
                  kinship.children.length > 0 &&
                  (kinship.brothers.length > 0 || kinship.sisters.length > 0) && (
                    <div className="p-3 rounded-xl bg-white border border-rose-200 space-y-2">
                      <div className="font-extrabold text-rose-900 border-b border-rose-100 pb-1.5">
                        أخوال وخالات أبنائها (إخوة وأخوات أمهم هذه —{' '}
                        {kinship.brothers.length + kinship.sisters.length}):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {kinship.brothers.map((b) => (
                          <div
                            key={b.id}
                            className="p-2 rounded-lg bg-rose-50/40 border border-rose-200/70 flex items-center justify-between gap-2"
                          >
                            <span className="font-bold text-slate-800">{formatAppName(b.fullName)}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-bold shrink-0">
                              خال الأبناء
                            </span>
                          </div>
                        ))}
                        {kinship.sisters.map((s) => (
                          <div
                            key={s.id}
                            className="p-2 rounded-lg bg-rose-50/40 border border-rose-200/70 flex items-center justify-between gap-2"
                          >
                            <span className="font-bold text-slate-800">{formatAppName(s.fullName)}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-bold shrink-0">
                              خالة الأبناء
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Excluded Husband Children (if any) */}
                {person.gender === 'female' && kinship.excludedHusbandChildren.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="font-extrabold text-slate-700 border-b border-slate-100 pb-1.5">
                      أبناء الزوج المستثنون من أمومتها (من أم أخرى —{' '}
                      {kinship.excludedHusbandChildren.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {kinship.excludedHusbandChildren.map(({ child, otherMother }) => (
                        <div
                          key={child.id}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                        >
                          <span className="font-bold text-slate-700">{formatAppName(child.fullName)}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold shrink-0">
                            {otherMother ? `الأم: ${formatAppName(otherMother.fullName)}` : 'من أم أخرى'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 7. Notes / Biography Section (نبذة وملاحظات) */}
            {person.notes && (
              <div className="rounded-2xl border border-slate-200 bg-[#FBF9F5] p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-[#0F4C3A]">
                  <FileText className="w-4 h-4 text-[#D4AF37]" />
                  <span>رابعاً: نبذة وملاحظات مسجلة</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {person.notes}
                </p>
              </div>
            )}

            {/* 8. Footer Seals & Date */}
            <div className="pt-5 border-t-2 border-[#D4AF37]/40 flex items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                <span>تاريخ التوثيق والاستخراج: </span>
                <strong className="text-slate-800">{new Date().toLocaleDateString('ar-SA')} م</strong>
              </div>

              <div className="text-center shrink-0">
                <div className="px-4 py-2 rounded-xl border-2 border-dashed border-[#0F4C3A]/50 text-[11px] text-[#0F4C3A] font-extrabold bg-emerald-50/40">
                  ختم سجل شجرة العائلة الموثق
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
