import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  ArrowLeftRight,
  TreeDeciduous,
  Sparkles,
  FileDown,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  GitMerge
} from 'lucide-react';
import { Person } from '../types/family';
import {
  advancedArabicMatch,
  scoreArabicMatch,
  sortPersonsMalesFirstAlphabetical
} from '../utils/nameUtils';
import { findRelationshipBetweenPersons } from '../utils/kinship';
import { exportRelationshipReportToPdf } from '../utils/pdfExport';

interface KinshipFinderViewProps {
  persons: Person[];
  initialPersonAId?: string | null;
  initialPersonBId?: string | null;
  onSelectPerson: (id: string) => void;
}

export const KinshipFinderView: React.FC<KinshipFinderViewProps> = ({
  persons,
  initialPersonAId,
  initialPersonBId,
  onSelectPerson
}) => {
  const sortedPersons = useMemo(
    () => sortPersonsMalesFirstAlphabetical(persons),
    [persons]
  );

  const [personAId, setPersonAId] = useState<string>(
    initialPersonAId || sortedPersons[0]?.id || ''
  );
  const [personBId, setPersonBId] = useState<string>(
    initialPersonBId || sortedPersons[1]?.id || sortedPersons[0]?.id || ''
  );

  const [searchA, setSearchA] = useState<string>('');
  const [searchB, setSearchB] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  useEffect(() => {
    if (initialPersonAId) {
      setPersonAId(initialPersonAId);
    }
  }, [initialPersonAId]);

  useEffect(() => {
    if (initialPersonBId) {
      setPersonBId(initialPersonBId);
    }
  }, [initialPersonBId]);

  const filteredListA = useMemo(() => {
    const q = searchA.trim();
    if (!q) return sortedPersons;
    return sortedPersons
      .filter((p) => advancedArabicMatch(p.fullName, q))
      .sort((a, b) => scoreArabicMatch(b.fullName, q) - scoreArabicMatch(a.fullName, q));
  }, [sortedPersons, searchA]);

  const filteredListB = useMemo(() => {
    const q = searchB.trim();
    if (!q) return sortedPersons;
    return sortedPersons
      .filter((p) => advancedArabicMatch(p.fullName, q))
      .sort((a, b) => scoreArabicMatch(b.fullName, q) - scoreArabicMatch(a.fullName, q));
  }, [sortedPersons, searchB]);

  const personA = useMemo(
    () => persons.find((p) => p.id === personAId) || null,
    [persons, personAId]
  );
  const personB = useMemo(
    () => persons.find((p) => p.id === personBId) || null,
    [persons, personBId]
  );

  const relationship = useMemo(
    () => findRelationshipBetweenPersons(personAId, personBId, persons),
    [personAId, personBId, persons]
  );

  const handleSwap = () => {
    const tempId = personAId;
    setPersonAId(personBId);
    setPersonBId(tempId);
  };

  const handleExportPdf = async () => {
    if (!personA || !personB) return;
    setIsExportingPdf(true);
    try {
      await exportRelationshipReportToPdf({
        personA,
        personB,
        headline: relationship.headline,
        relationBtoA: relationship.relationBtoA,
        relationAtoB: relationship.relationAtoB,
        commonAncestor: relationship.commonAncestor,
        summaryDescription: relationship.summaryDescription,
        additionalTies: relationship.additionalTies,
        pathA: relationship.pathA,
        pathB: relationship.pathB
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Page Header Banner */}
      <div className="bg-gradient-to-l from-[#0F4C3A] via-[#135A45] to-[#0A3327] text-white p-5 sm:p-8 rounded-3xl shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5E6B8] text-[11px] sm:text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>محرك حساب صلات القرابة والأنساب</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold font-display leading-snug">
              إيجاد العلاقة بين شخصين من العائلة
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
              اختر أي فردين من العائلة لمعرفة صلة القرابة الدقيقة بينهما (من جهة الأب، أو الأم، أو المصاهرة)، والجد المشترك الجامع لنسبهما، مع إمكانية تصدير وثيقة القرابة بصيغة PDF.
            </p>
          </div>

          {personA && personB && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="w-full md:w-auto min-h-[42px] justify-center px-4 py-2.5 rounded-2xl bg-[#D4AF37] hover:bg-[#c5a02e] text-[#0A3327] font-extrabold text-xs flex items-center gap-2 shadow-md transition cursor-pointer shrink-0 disabled:opacity-60"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>{isExportingPdf ? 'جارٍ تجهيز ملف PDF...' : 'تصدير تقرير القرابة PDF'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Two Persons Selection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-3.5 sm:gap-4 items-stretch">
        {/* Person 1 Selector Card */}
        <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#0F4C3A] bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                الطرف الأول (الشخص الأول)
              </span>
              {personA && (
                <button
                  type="button"
                  onClick={() => onSelectPerson(personA.id)}
                  className="text-xs font-bold text-[#0F4C3A] hover:underline py-1 px-2"
                >
                  عرض ملف الفرد ←
                </button>
              )}
            </div>

            {/* Search Input A */}
            <div className="relative">
              <input
                type="text"
                value={searchA}
                onChange={(e) => setSearchA(e.target.value)}
                placeholder="ابحث عن اسم الشخص الأول..."
                className="w-full h-11 pr-9 pl-3 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            </div>

            {/* Scrollable List A */}
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200/80 divide-y divide-slate-100 bg-slate-50/50">
              {filteredListA.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  لا يوجد اسم مطابق للبحث
                </div>
              ) : (
                filteredListA.map((p) => {
                  const isSelected = p.id === personAId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonAId(p.id)}
                      className={`w-full px-3.5 py-2.5 text-right flex items-center justify-between gap-2 transition text-xs sm:text-sm ${
                        isSelected
                          ? 'bg-[#0F4C3A] text-white font-bold'
                          : 'hover:bg-white text-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                            p.gender === 'male' ? 'bg-emerald-500' : 'bg-rose-400'
                          }`}
                        />
                        <span className="break-words leading-snug text-right">{p.fullName}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : p.gender === 'male'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}
                      >
                        {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Person A Summary Box */}
          {personA && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-l from-emerald-50/80 to-slate-50 border border-emerald-200/70 flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  personA.gender === 'male'
                    ? 'bg-[#0F4C3A] text-[#D4AF37]'
                    : 'bg-rose-500 text-white'
                }`}
              >
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-500">المختار كطرف أول:</div>
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 break-words leading-snug">
                  {personA.fullName}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Swap Button */}
        <div className="lg:col-span-1 flex items-center justify-center">
          <button
            type="button"
            onClick={handleSwap}
            className="w-full lg:w-auto min-h-[42px] justify-center p-3 rounded-2xl bg-white hover:bg-[#0F4C3A] text-[#0F4C3A] hover:text-white border border-slate-200 shadow-xs transition flex items-center gap-2 text-xs font-bold cursor-pointer"
            title="تبديل الطرف الأول والطرف الثاني"
          >
            <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="lg:hidden">تبديل الطرف الأول والثاني</span>
          </button>
        </div>

        {/* Person 2 Selector Card */}
        <div className="lg:col-span-5 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#8C6D1F] bg-amber-50 px-3 py-1 rounded-lg border border-amber-200">
                الطرف الثاني (الشخص الثاني)
              </span>
              {personB && (
                <button
                  type="button"
                  onClick={() => onSelectPerson(personB.id)}
                  className="text-xs font-bold text-[#0F4C3A] hover:underline py-1 px-2"
                >
                  عرض ملف الفرد ←
                </button>
              )}
            </div>

            {/* Search Input B */}
            <div className="relative">
              <input
                type="text"
                value={searchB}
                onChange={(e) => setSearchB(e.target.value)}
                placeholder="ابحث عن اسم الشخص الثاني..."
                className="w-full h-11 pr-9 pl-3 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
            </div>

            {/* Scrollable List B */}
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200/80 divide-y divide-slate-100 bg-slate-50/50">
              {filteredListB.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  لا يوجد اسم مطابق للبحث
                </div>
              ) : (
                filteredListB.map((p) => {
                  const isSelected = p.id === personBId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPersonBId(p.id)}
                      className={`w-full px-3.5 py-2.5 text-right flex items-center justify-between gap-2 transition text-xs sm:text-sm ${
                        isSelected
                          ? 'bg-[#0F4C3A] text-white font-bold'
                          : 'hover:bg-white text-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                            p.gender === 'male' ? 'bg-emerald-500' : 'bg-rose-400'
                          }`}
                        />
                        <span className="break-words leading-snug text-right">{p.fullName}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : p.gender === 'male'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}
                      >
                        {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Person B Summary Box */}
          {personB && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-l from-amber-50/80 to-slate-50 border border-amber-200/70 flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  personB.gender === 'male'
                    ? 'bg-[#0F4C3A] text-[#D4AF37]'
                    : 'bg-rose-500 text-white'
                }`}
              >
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-500">المختار كطرف ثانٍ:</div>
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 break-words leading-snug">
                  {personB.fullName}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Relationship Result Display */}
      {personA && personB && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Primary Result Banner */}
          <div
            className={`p-5 sm:p-8 text-center border-b ${
              relationship.found
                ? 'bg-gradient-to-b from-[#F2F8F5] to-white border-emerald-100'
                : 'bg-gradient-to-b from-amber-50/70 to-white border-amber-100'
            }`}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 bg-[#0F4C3A]/10 text-[#0F4C3A]">
              {relationship.found ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>نتيجة صلة القرابة المعتمدة</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>شجرتان غير مرتبطتين حالياً</span>
                </>
              )}
            </div>

            <h2 className="text-xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display leading-snug break-words">
              « {relationship.headline} »
            </h2>

            <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-2xl mx-auto font-medium leading-relaxed break-words">
              {relationship.summaryDescription}
            </p>

            {/* Two-Way Relationship Pills */}
            {!relationship.isSamePerson && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mt-5 sm:mt-6 max-w-4xl mx-auto text-right">
                <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
                  <div className="text-[11px] font-bold text-slate-500 mb-1 break-words">
                    صلة ({personB.fullName}) بالنسبة لـ ({personA.fullName}):
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-[#0F4C3A] break-words">
                    {relationship.relationBtoA}
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                  <div className="text-[11px] font-bold text-slate-500 mb-1 break-words">
                    صلة ({personA.fullName}) بالنسبة لـ ({personB.fullName}):
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-[#8C6D1F] break-words">
                    {relationship.relationAtoB}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
            {/* Common Ancestor Spotlight Card */}
            {relationship.commonAncestor && !relationship.isSamePerson && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-l from-[#0F4C3A] to-[#16654E] text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shrink-0">
                    <TreeDeciduous className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-[#F5E6B8] block">
                      الجد المشترك الأقرب (ملتقى النسبين):
                    </span>
                    <h3 className="text-base sm:text-xl font-extrabold font-display break-words leading-snug">
                      {relationship.commonAncestor.fullName}
                    </h3>
                    {relationship.distA !== null && relationship.distB !== null && (
                      <p className="text-[11px] sm:text-xs text-emerald-100 mt-0.5">
                        يبعد الطرف الأول ({relationship.distA} أجيال) · ويبعد الطرف الثاني ({relationship.distB} أجيال) عن الجد المشترك
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectPerson(relationship.commonAncestor!.id)}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold border border-white/25 transition shrink-0 cursor-pointer text-center"
                >
                  عرض ملف الجد المشترك
                </button>
              </div>
            )}

            {/* Additional Maternal / Marital Ties */}
            {relationship.additionalTies.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-[#0F4C3A] shrink-0" />
                  <span>صلات القرابة والمصاهرة والأمومة التفصيلية:</span>
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {relationship.additionalTies.map((tie, idx) => (
                    <div
                      key={idx}
                      className="p-3 sm:p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs font-bold text-amber-950 flex items-start gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#D4AF37] shrink-0 mt-1.5" />
                      <span className="break-words leading-relaxed">{tie}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Side-by-Side Upward Lineage Convergence Diagram */}
            {(relationship.pathA.length > 0 || relationship.pathB.length > 0) &&
              !relationship.isSamePerson && (
                <div className="space-y-4">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0F4C3A] shrink-0" />
                    <span>مسار تسلسل الآباء والأجداد للطرفين حتى نقطة الالتقاء:</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {/* Column A */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <div className="text-xs font-extrabold text-[#0F4C3A] pb-2 border-b border-slate-200 break-words">
                        سلسلة نسب الطرف الأول ({personA.fullName}):
                      </div>
                      {relationship.pathA.map((node, index) => {
                        const isLCA = relationship.commonAncestor?.id === node.id;
                        return (
                          <div key={node.id} className="space-y-1.5">
                            {index > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pr-3 sm:pr-4">
                                <ArrowUp className="w-3 h-3 text-[#0F4C3A]" />
                                <span>ابن / ابنة لـ (الجيل +{index})</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectPerson(node.id)}
                              className={`w-full p-3 rounded-xl border text-right flex items-center justify-between gap-2 transition cursor-pointer ${
                                isLCA
                                  ? 'bg-[#FEF3C7] border-[#D4AF37] text-amber-950 font-extrabold shadow-2xs'
                                  : index === 0
                                  ? 'bg-emerald-50 border-emerald-300 text-[#0F4C3A] font-bold'
                                  : 'bg-white border-slate-200 hover:border-[#0F4C3A] text-slate-800 font-semibold'
                              }`}
                            >
                              <span className="text-xs sm:text-sm break-words leading-snug text-right flex-1">
                                {node.fullName}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-black/5 shrink-0">
                                {isLCA
                                  ? 'الجد المشترك'
                                  : index === 0
                                  ? 'الطرف الأول'
                                  : index === 1
                                  ? 'الأب المباشر'
                                  : `الجد ${index - 1}`}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Column B */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                      <div className="text-xs font-extrabold text-[#8C6D1F] pb-2 border-b border-slate-200 break-words">
                        سلسلة نسب الطرف الثاني ({personB.fullName}):
                      </div>
                      {relationship.pathB.map((node, index) => {
                        const isLCA = relationship.commonAncestor?.id === node.id;
                        return (
                          <div key={node.id} className="space-y-1.5">
                            {index > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pr-3 sm:pr-4">
                                <ArrowUp className="w-3 h-3 text-[#8C6D1F]" />
                                <span>ابن / ابنة لـ (الجيل +{index})</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectPerson(node.id)}
                              className={`w-full p-3 rounded-xl border text-right flex items-center justify-between gap-2 transition cursor-pointer ${
                                isLCA
                                  ? 'bg-[#FEF3C7] border-[#D4AF37] text-amber-950 font-extrabold shadow-2xs'
                                  : index === 0
                                  ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                                  : 'bg-white border-slate-200 hover:border-[#0F4C3A] text-slate-800 font-semibold'
                              }`}
                            >
                              <span className="text-xs sm:text-sm break-words leading-snug text-right flex-1">
                                {node.fullName}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-black/5 shrink-0">
                                {isLCA
                                  ? 'الجد المشترك'
                                  : index === 0
                                  ? 'الطرف الثاني'
                                  : index === 1
                                  ? 'الأب المباشر'
                                  : `الجد ${index - 1}`}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
};
