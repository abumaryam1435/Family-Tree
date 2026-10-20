import React, { useState, useMemo } from 'react';
import {
  X,
  GitMerge,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  TreeDeciduous,
  Users,
  Search,
  ShieldCheck,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Person } from '../types/family';
import { advancedArabicMatch, scoreArabicMatch, normalizeArabic } from '../utils/nameUtils';

interface MergeTreesModalProps {
  isOpen: boolean;
  onClose: () => void;
  persons: Person[];
  treeRoots: Person[];
  onExecuteMerge: (sourcePersonId: string, targetPersonId: string) => Promise<{ targetPerson: Person; movedCount: number; mergeOpId: string }>;
  onUndoLastMerge?: (mergeOpId: string) => Promise<void>;
  lastMergeOpId?: string | null;
  getChildren: (personId: string) => Person[];
  getPerson: (id: string) => Person | undefined;
  getAncestors: (personId: string) => Person[];
}

export const MergeTreesModal: React.FC<MergeTreesModalProps> = ({
  isOpen,
  onClose,
  persons,
  treeRoots,
  onExecuteMerge,
  onUndoLastMerge,
  lastMergeOpId,
  getChildren,
  getPerson,
  getAncestors
}) => {
  const [step, setStep] = useState<number>(1); // 1: Select Persons, 2: Compare & Audit, 3: Confirm, 4: Report
  const [sourcePersonId, setSourcePersonId] = useState<string>('');
  const [targetPersonId, setTargetPersonId] = useState<string>('');
  
  const [sourceSearch, setSourceSearch] = useState<string>('');
  const [targetSearch, setTargetSearch] = useState<string>('');

  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeReport, setMergeReport] = useState<{
    targetName: string;
    sourceName: string;
    movedCount: number;
    mergeOpId: string;
  } | null>(null);

  const treeRootIds = useMemo(() => new Set(treeRoots.map(r => r.id)), [treeRoots]);

  // Automatically detect pairs of tree roots that share the same or similar first/full name
  const suggestedRootPairs = useMemo(() => {
    const pairs: { rootA: Person; rootB: Person }[] = [];
    for (let i = 0; i < treeRoots.length; i++) {
      for (let j = i + 1; j < treeRoots.length; j++) {
        const a = treeRoots[i];
        const b = treeRoots[j];
        const normA = normalizeArabic(a.fullName);
        const normB = normalizeArabic(b.fullName);
        const firstA = normA.split(' ')[0];
        const firstB = normB.split(' ')[0];
        if (normA === normB || (firstA && firstA.length >= 3 && firstA === firstB)) {
          pairs.push({ rootA: a, rootB: b });
        }
      }
    }
    return pairs;
  }, [treeRoots]);

  const sourcePerson = getPerson(sourcePersonId);
  const targetPerson = getPerson(targetPersonId);

  const sourceChildren = sourcePerson ? getChildren(sourcePerson.id) : [];
  const targetChildren = targetPerson ? getChildren(targetPerson.id) : [];

  // Filter candidates for Source (prioritizing independent tree roots)
  const filteredSources = useMemo(() => {
    const candidates = persons.filter(p => {
      if (p.gender !== 'male') return false;
      if (targetPersonId && p.id === targetPersonId) return false;
      if (sourceSearch.trim()) {
        return advancedArabicMatch(p.fullName, sourceSearch, [p.notes]);
      }
      return true;
    });
    return candidates.sort((a, b) => {
      if (sourceSearch.trim()) {
        const diff =
          scoreArabicMatch(b.fullName, sourceSearch, [b.notes]) -
          scoreArabicMatch(a.fullName, sourceSearch, [a.notes]);
        if (diff !== 0) return diff;
      }
      const aRoot = treeRootIds.has(a.id) ? 1 : 0;
      const bRoot = treeRootIds.has(b.id) ? 1 : 0;
      if (aRoot !== bRoot) return bRoot - aRoot;
      return a.fullName.localeCompare(b.fullName, 'ar');
    });
  }, [persons, targetPersonId, sourceSearch, treeRootIds]);

  // Filter candidates for Target (prioritizing independent tree roots)
  const filteredTargets = useMemo(() => {
    const candidates = persons.filter(p => {
      if (p.gender !== 'male') return false;
      if (sourcePersonId && p.id === sourcePersonId) return false;
      if (targetSearch.trim()) {
        return advancedArabicMatch(p.fullName, targetSearch, [p.notes]);
      }
      return true;
    });
    return candidates.sort((a, b) => {
      if (targetSearch.trim()) {
        const diff =
          scoreArabicMatch(b.fullName, targetSearch, [b.notes]) -
          scoreArabicMatch(a.fullName, targetSearch, [a.notes]);
        if (diff !== 0) return diff;
      }
      const aRoot = treeRootIds.has(a.id) ? 1 : 0;
      const bRoot = treeRootIds.has(b.id) ? 1 : 0;
      if (aRoot !== bRoot) return bRoot - aRoot;
      return a.fullName.localeCompare(b.fullName, 'ar');
    });
  }, [persons, sourcePersonId, targetSearch, treeRootIds]);

  if (!isOpen) return null;

  // Conflict / Cycle check
  const conflictWarning = (() => {
    if (!sourcePerson || !targetPerson) return null;

    if (sourcePerson.gender !== targetPerson.gender) {
      return 'لا يمكن دمج سجلين لجنسين مختلفين.';
    }

    // Check if target is an ancestor of source or vice-versa
    const targetAncestors = getAncestors(targetPerson.id);
    if (targetAncestors.some(a => a.id === sourcePerson.id)) {
      return `تعارض نسبي: (${sourcePerson.fullName}) مسجل كسلف أو جد لـ (${targetPerson.fullName})، دمجهما يُنشئ دورة نسبية ممنوعة.`;
    }

    const sourceAncestors = getAncestors(sourcePerson.id);
    if (sourceAncestors.some(a => a.id === targetPerson.id)) {
      return `تعارض نسبي: (${targetPerson.fullName}) مسجل كسلف أو جد لـ (${sourcePerson.fullName})، دمجهما يُنشئ دورة نسبية ممنوعة.`;
    }

    return null;
  })();

  const handleExecute = async () => {
    if (!sourcePersonId || !targetPersonId) return;
    if (conflictWarning) {
      setErrorMessage(conflictWarning);
      return;
    }
    if (!isConfirmed) {
      setErrorMessage('يرجى تأكيد إقرار التطابق التاريخي للشخصين قبل إتمام الدمج');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await onExecuteMerge(sourcePersonId, targetPersonId);
      setMergeReport({
        targetName: targetPerson?.fullName || res.targetPerson.fullName,
        sourceName: sourcePerson?.fullName || '',
        movedCount: res.movedCount,
        mergeOpId: res.mergeOpId
      });
      setStep(4); // show final report
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تنفيذ الدمج');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-8">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-[#0F4C3A] via-[#15664F] to-[#0F4C3A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display">
                معالج دمج الأشجار والأصول المشتركة
              </h3>
              <p className="text-[11px] text-white/70">
                توحيد سجلين يمثلان الأصل أو الجد التاريخي نفسه دون فقدان أي فرع أو حفيد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicators */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
          <span className={step >= 1 ? 'text-[#0F4C3A] font-bold' : ''}>1. اختيار الأصلين</span>
          <span>·</span>
          <span className={step >= 2 ? 'text-[#0F4C3A] font-bold' : ''}>2. المقارنة والفحص</span>
          <span>·</span>
          <span className={step >= 3 ? 'text-[#0F4C3A] font-bold' : ''}>3. التأكيد والدمج</span>
          <span>·</span>
          <span className={step === 4 ? 'text-[#0F4C3A] font-bold' : ''}>4. تقرير الدمج</span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Select Source and Target */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                <strong>آلية دمج الأصول المشتركة:</strong> عند التوصل لأصل مشترك بين شجرتين (مثلاً كلاهما يعود للأصل <strong>راشد</strong>)، حدد الأصل الأول في القائمة اليمنى والأصل المقابل في القائمة اليسرى ليتم توحيد جميع الفروع والأبناء تحت أصل واحد.
              </div>

              {/* Suggested matching roots banner */}
              {suggestedRootPairs.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-[#D4AF37] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#8C6D1F]">
                    <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    <span>تم رصد أصول أشجار متشابهة بالاسم (أصل مشترك مقترح للدمج):</span>
                  </div>
                  <div className="space-y-1.5">
                    {suggestedRootPairs.map((pair, idx) => (
                      <div
                        key={`${pair.rootA.id}_${pair.rootB.id}_${idx}`}
                        className="p-2.5 rounded-xl bg-white border border-amber-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#0F4C3A]">«{pair.rootA.fullName}»</span>
                          <span className="text-slate-400">مع</span>
                          <span className="font-bold text-[#0F4C3A]">«{pair.rootB.fullName}»</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSourcePersonId(pair.rootA.id);
                            setTargetPersonId(pair.rootB.id);
                            setStep(2);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#0F4C3A] text-white text-[11px] font-bold hover:bg-[#0c3c2e] transition shrink-0"
                        >
                          اختيار ومعاينة الدمج
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 block">
                    1. الأصل / السجل في الشجرة الأولى (المُراد دمجه):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      placeholder="ابحث بالاسم أو جزء منه..."
                      className="w-full h-9 pr-8 pl-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                  </div>

                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {filteredSources.map((p) => {
                      const isRoot = treeRootIds.has(p.id);
                      const isSelected = sourcePersonId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSourcePersonId(p.id)}
                          className={`w-full text-right p-2.5 text-xs transition flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-[#0F4C3A] text-white font-bold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span className="truncate">{p.fullName}</span>
                          {isRoot && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                isSelected
                                  ? 'bg-[#D4AF37] text-[#072A20]'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              أصل شجرة
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Target Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-800 block">
                    2. الأصل المقابل في الشجرة الثانية (السجل المعتمد):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                      placeholder="ابحث بالاسم أو جزء منه..."
                      className="w-full h-9 pr-8 pl-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                  </div>

                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {filteredTargets.map((p) => {
                      const isRoot = treeRootIds.has(p.id);
                      const isSelected = targetPersonId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setTargetPersonId(p.id)}
                          className={`w-full text-right p-2.5 text-xs transition flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-[#0F4C3A] text-white font-bold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <span className="truncate">{p.fullName}</span>
                          {isRoot && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                isSelected
                                  ? 'bg-[#D4AF37] text-[#072A20]'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              أصل شجرة
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  disabled={!sourcePersonId || !targetPersonId}
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] disabled:opacity-40 transition"
                >
                  التالي: مقارنة وفحص الروابط
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Compare & Audit */}
          {step === 2 && sourcePerson && targetPerson && (
            <div className="space-y-5">
              <h4 className="text-xs font-bold text-slate-800">
                مقارنة السجلين قبل الدمج:
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Source Card */}
                <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/40 text-xs space-y-2">
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md inline-block">
                    السجل المُراد دمجه (المصدر)
                  </span>
                  <div className="text-sm font-bold text-slate-900">{sourcePerson.fullName}</div>
                  <div className="text-slate-500">الفروع المباشرة: <strong>{sourceChildren.length} فروع</strong></div>
                  {sourceChildren.length > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-amber-200">
                      سيتم نقل: {sourceChildren.map(c => c.fullName).join('، ')}
                    </div>
                  )}
                </div>

                {/* Target Card */}
                <div className="p-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50/40 text-xs space-y-2">
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-md inline-block">
                    السجل المعتمد النهائي (الهدف)
                  </span>
                  <div className="text-sm font-bold text-slate-900">{targetPerson.fullName}</div>
                  <div className="text-slate-500">الفروع الحالية: <strong>{targetChildren.length} فروع</strong></div>
                  <div className="text-[11px] text-emerald-800 bg-white p-2 rounded-lg border border-emerald-200">
                    ستصبح الفروع الإجمالية: <strong>{sourceChildren.length + targetChildren.length} فروع</strong>
                  </div>
                </div>
              </div>

              {conflictWarning ? (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>تم اكتشاف تعارض في النسب:</strong>
                    <p className="mt-1">{conflictWarning}</p>
                    <p className="mt-1 font-semibold">تم إيقاف الدمج لحماية سلامة الشجرة.</p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>
                    تم التحقق من صحة النسب: لا توجد دورات مغلقة أو تعارضات مانعة للدمج.
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={!!conflictWarning}
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] disabled:opacity-40 transition"
                >
                  التالي: التأكيد والإقرار
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Confirm & Merge */}
          {step === 3 && sourcePerson && targetPerson && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  تأكيد توحيد سجل الجد المشترك:
                </h4>
                <p>
                  أنت على وشك دمج سجل <strong>«{sourcePerson.fullName}»</strong> في سجل <strong>«{targetPerson.fullName}»</strong>.
                </p>
                <p className="text-slate-500">
                  جميع الأبناء والأحفاد سيتم نقلهم وربطهم بالسجل المعتمد، وسيتم حفظ نسخة احتياطية من السجل السابق مع إمكانية التراجع عن العملية إن لزم الأمر.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition text-xs select-none">
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-[#0F4C3A] focus:ring-[#0F4C3A]"
                />
                <span className="text-slate-800 font-semibold leading-relaxed">
                  أقرّ وأؤكد أن هذين السجلين يمثلان الشخص التاريخي نفسه، وأن دمج الفروع تحت هذا السجل مطابق للنسب العائلي الصحيح.
                </span>
              </label>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={!isConfirmed || submitting}
                  onClick={handleExecute}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#D4AF37] to-[#B89738] text-[#0A3327] hover:brightness-105 shadow-md transition disabled:opacity-40"
                >
                  {submitting ? 'جارٍ تنفيذ الدمج...' : 'تنفيذ الدمج النهائي الآن'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Merge Report & Undo */}
          {step === 4 && mergeReport && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <h4 className="text-lg font-bold text-[#0F4C3A] font-display">
                تم دمج الشجرتين بنجاح تام!
              </h4>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 max-w-md mx-auto text-right space-y-1.5">
                <div>السجل المعتمد: <strong>{mergeReport.targetName}</strong></div>
                <div>السجل المدمج: <strong>{mergeReport.sourceName}</strong></div>
                <div>عدد الفروع المنقولة: <strong>{mergeReport.movedCount} فروع وأحفاد</strong></div>
                <div className="text-[11px] text-slate-400 mt-2">
                  رقم العملية: {mergeReport.mergeOpId}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] transition shadow-xs"
                >
                  تم، إغلاق والعودة للشجرة
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
