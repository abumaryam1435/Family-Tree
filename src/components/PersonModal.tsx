import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  User,
  Users,
  Plus,
  Edit2,
  Printer,
  Layers,
  GitFork,
  GitMerge,
  ArrowUp,
  MessageSquare,
  Trash2,
  AlertCircle,
  ExternalLink,
  Heart,
  Network,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  CheckCircle2,
  ArrowRight,
  Search,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { Person, Gender } from '../types/family';
import { calculateKinship, getCoupleRelationship, isChildIncludedForWife } from '../utils/kinship';
import {
  generateChildFullName,
  getPatronymicSuffix,
  formatAppName,
  formatBranchName,
  formatQuadrupleName,
  formatDropdownName,
  extractGivenName,
  filterAndSortBySearch,
  sortPersonsMalesFirstAlphabetical
} from '../utils/nameUtils';

interface PersonModalProps {
  person: Person | null;
  allPersons?: Person[];
  onClose: () => void;
  onOpenAddChild: (fatherId: string) => void;
  onOpenAddFather: (personId: string) => void;
  onOpenEdit: (person: Person) => void;
  onOpenChangeRequest: (person: Person) => void;
  onDeletePerson: (id: string) => void;
  onToggleGender?: (id: string) => void;
  onNavigateToLineage: (personId: string) => void;
  onNavigateToTreeBranch: (personId: string) => void;
  onPrintPerson: (personId: string) => void;
  onSelectRelative?: (personId: string) => void;
  onBackToPrevious?: () => void;
  previousPersonName?: string | null;
  onOpenMergeModal?: (personId: string) => void;
  onQuickAddChild?: (data: { fullName: string; gender: Gender; fatherId: string }) => Promise<void>;
  onLinkWife?: (husbandId: string, wifeId: string) => Promise<void>;
  onUnlinkWife?: (wifeId: string) => Promise<void>;
  editingEnabled: boolean;
  isAdmin: boolean;
  getPerson: (id: string) => Person | undefined;
  getChildren: (personId: string) => Person[];
  getAncestors: (personId: string) => Person[];
  getLineageString: (id: string) => string;
}

export const PersonModal: React.FC<PersonModalProps> = ({
  person,
  allPersons = [],
  onClose,
  onOpenAddChild,
  onOpenAddFather,
  onOpenEdit,
  onOpenChangeRequest,
  onDeletePerson,
  onToggleGender,
  onNavigateToLineage,
  onNavigateToTreeBranch,
  onPrintPerson,
  onSelectRelative,
  onBackToPrevious,
  previousPersonName,
  onOpenMergeModal,
  onQuickAddChild,
  onLinkWife,
  onUnlinkWife,
  editingEnabled,
  isAdmin,
  getPerson,
  getChildren,
  getAncestors,
  getLineageString
}) => {
  const [showKinship, setShowKinship] = useState<boolean>(true);

  // Fast inline child adder state
  const [showQuickChildBox, setShowQuickChildBox] = useState<boolean>(false);
  const [quickFirstName, setQuickFirstName] = useState<string>('');
  const [quickGender, setQuickGender] = useState<Gender>('male');
  const [quickSubmitting, setQuickSubmitting] = useState<boolean>(false);
  const [quickSuccessNotice, setQuickSuccessNotice] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Fast inline wife linker state (for male persons)
  const [showAddWifeBox, setShowAddWifeBox] = useState<boolean>(false);
  const [wifeSearch, setWifeSearch] = useState<string>('');
  const [wifeActionLoading, setWifeActionLoading] = useState<boolean>(false);
  const [wifeActionFeedback, setWifeActionFeedback] = useState<string | null>(null);

  if (!person) return null;

  const father = person.fatherId ? getPerson(person.fatherId) : null;
  const grandfather = father?.fatherId ? getPerson(father.fatherId) : null;
  const children = getChildren(person.id);
  const sons = children.filter(c => c.gender === 'male');
  const daughters = children.filter(c => c.gender === 'female');
  const lineage = getLineageString(person.id);

  // Husband object if person is female and married to someone in tree
  const husbandPerson = person.husbandId ? getPerson(person.husbandId) : null;

  // Couple relationship if female has husband from tree
  const coupleRelationship = useMemo(() => {
    if (person.gender !== 'female' || !person.husbandId) return null;
    return getCoupleRelationship(person.id, person.fatherId, person.husbandId, allPersons);
  }, [person, allPersons]);

  // Calculate extended genealogical kinship relations
  const kinship = calculateKinship(person.id, allPersons.length > 0 ? allPersons : [person]);

  // All linked wives if person is male (from kinship + allPersons)
  const linkedWives = useMemo(() => {
    if (person.gender !== 'male') return [];
    const map = new Map<string, Person>();
    (kinship.wives || []).forEach((w) => map.set(w.id, w));
    allPersons.forEach((p) => {
      if (p.gender === 'female' && p.husbandId === person.id) {
        map.set(p.id, p);
      }
    });
    return sortPersonsMalesFirstAlphabetical(Array.from(map.values()));
  }, [person, kinship.wives, allPersons]);

  // Eligible females from tree to link as wife to this male
  const eligibleFemalesToLink = useMemo(() => {
    if (person.gender !== 'male') return [];
    const linkedSet = new Set(linkedWives.map((w) => w.id));
    return sortPersonsMalesFirstAlphabetical(
      allPersons.filter((p) => p.gender === 'female' && p.id !== person.id && !linkedSet.has(p.id))
    );
  }, [person, linkedWives, allPersons]);

  const filteredFemalesToLink = useMemo(() => {
    const q = wifeSearch.trim();
    if (!q) return eligibleFemalesToLink.slice(0, 15);
    return filterAndSortBySearch(eligibleFemalesToLink, q, (p) => {
      const f = p.fatherId ? getPerson(p.fatherId) : null;
      return [f?.fullName || ''];
    }).slice(0, 20);
  }, [eligibleFemalesToLink, wifeSearch, getPerson]);

  const handleExecuteLinkWife = async (wifeId: string) => {
    if (!onLinkWife || !person) return;
    try {
      setWifeActionLoading(true);
      setWifeActionFeedback(null);
      await onLinkWife(person.id, wifeId);
      const w = getPerson(wifeId);
      setWifeActionFeedback(`تم ربط الزوجة (${w ? formatAppName(w.fullName) : ''}) بنجاح`);
      setShowAddWifeBox(false);
      setWifeSearch('');
      setTimeout(() => setWifeActionFeedback(null), 4000);
    } catch (err: any) {
      setWifeActionFeedback(err.message || 'حدث خطأ أثناء ربط الزوجة');
    } finally {
      setWifeActionLoading(false);
    }
  };

  const handleExecuteUnlinkWife = async (wifeId: string) => {
    if (!onUnlinkWife) return;
    try {
      setWifeActionLoading(true);
      setWifeActionFeedback(null);
      await onUnlinkWife(wifeId);
      setWifeActionFeedback('تم فك ارتباط الزوجة بنجاح');
      setTimeout(() => setWifeActionFeedback(null), 4000);
    } catch (err: any) {
      setWifeActionFeedback(err.message || 'حدث خطأ أثناء فك الارتباط');
    } finally {
      setWifeActionLoading(false);
    }
  };

  // Patronymic suffix for inline quick add
  const inlineSuffix = getPatronymicSuffix(person.fullName, quickGender);
  const inlineFullName = generateChildFullName(quickFirstName, person.fullName, quickGender);

  const handleExecuteQuickAddChild = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickFirstName.trim()) {
      setQuickError('يرجى إدخال الاسم الأول');
      quickInputRef.current?.focus();
      return;
    }

    if (!onQuickAddChild) {
      onOpenAddChild(person.id);
      return;
    }

    try {
      setQuickSubmitting(true);
      setQuickError(null);
      await onQuickAddChild({
        fullName: inlineFullName,
        gender: quickGender,
        fatherId: person.id
      });
      setQuickSuccessNotice(`تمت إضافة (${inlineFullName}) بنجاح!`);
      setQuickFirstName('');
      setTimeout(() => {
        quickInputRef.current?.focus();
      }, 50);
      setTimeout(() => {
        setQuickSuccessNotice(null);
      }, 3500);
    } catch (err: any) {
      setQuickError(err.message || 'حدث خطأ أثناء إضافة الابن');
    } finally {
      setQuickSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-hidden"
    >
      <div className="relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col">
        
        {/* Modal Header: Ultra-Compact & Space-Saving on Mobile & Desktop */}
        <div
          className={`px-3 py-2 sm:px-5 sm:py-3 text-white relative shrink-0 shadow-xs ${
            person.gender === 'male'
              ? 'bg-gradient-to-r from-[#0F4C3A] via-[#125844] to-[#165B4C]'
              : 'bg-gradient-to-r from-[#88243E] via-[#982B47] to-[#A83250]'
          }`}
        >
          {/* Top Bar: Return Button / Gender Switch / Husband on Right, Close on Left */}
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Back to previous relative button if navigated from kinship */}
              {onBackToPrevious && previousPersonName && (
                <button
                  type="button"
                  onClick={onBackToPrevious}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold transition backdrop-blur-xs cursor-pointer"
                  title="العودة للفرد السابق"
                >
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[110px] sm:max-w-[180px]">الفرع: {formatAppName(previousPersonName)}</span>
                </button>
              )}

              {/* Gender selector */}
              {isAdmin ? (
                <div className="flex items-center bg-black/25 p-0.5 rounded-lg backdrop-blur-xs text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      if (person.gender !== 'male' && onToggleGender) {
                        onToggleGender(person.id);
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded transition flex items-center gap-1 cursor-pointer ${
                      person.gender === 'male'
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'text-white/70 hover:text-white'
                    }`}
                    title="تعديل الجنس إلى ذكر"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${person.gender === 'male' ? 'bg-white' : 'bg-emerald-400'}`} />
                    <span>ذكر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (person.gender !== 'female' && onToggleGender) {
                        onToggleGender(person.id);
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded transition flex items-center gap-1 cursor-pointer ${
                      person.gender === 'female'
                        ? 'bg-rose-600 text-white shadow-xs font-black'
                        : 'text-white/70 hover:text-white'
                    }`}
                    title="تعديل الجنس إلى أنثى"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${person.gender === 'female' ? 'bg-white' : 'bg-rose-400'}`} />
                    <span>أنثى</span>
                  </button>
                </div>
              ) : (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 ${
                    person.gender === 'male'
                      ? 'bg-emerald-600/90 text-white'
                      : 'bg-rose-600/90 text-white'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>{person.gender === 'male' ? 'ذكر' : 'أنثى'}</span>
                </span>
              )}

              {/* Husband badge if female */}
              {person.gender === 'female' && (person.husbandName || person.husbandId) && (
                <span className="text-[10px] text-white/95 bg-white/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold truncate max-w-[130px] sm:max-w-none">
                  <Heart className="w-2.5 h-2.5 text-rose-300 shrink-0" />
                  <span className="truncate">زوجة: {formatAppName(husbandPerson ? husbandPerson.fullName : person.husbandName)}</span>
                </span>
              )}

              {/* Wife / Wives badge if male */}
              {person.gender === 'male' && linkedWives.length > 0 && (
                <span className="text-[10px] text-white/95 bg-white/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold truncate max-w-[150px] sm:max-w-none">
                  <Heart className="w-2.5 h-2.5 text-rose-300 shrink-0 fill-current" />
                  <span className="truncate">
                    {linkedWives.length === 1
                      ? `زوج: ${formatAppName(linkedWives[0].fullName)}`
                      : `متزوج (${linkedWives.length}): ${linkedWives.map((w) => extractGivenName(w.fullName)).join('، ')}`}
                  </span>
                </span>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 text-white transition cursor-pointer shrink-0"
              aria-label="إغلاق النافذة"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Name & Lineage in a single compact block */}
          <div className="flex flex-col">
            <h3 className="text-sm sm:text-lg font-black font-display text-white leading-tight break-words">
              {formatAppName(person.fullName)}
            </h3>

            <p className="text-[10px] sm:text-xs text-white/80 mt-0.5 leading-snug break-words truncate">
              « {formatAppName(lineage)} »
            </p>
          </div>
        </div>

        {/* Modal Body: Scrollable area with maximal height for content */}
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1 overscroll-contain">
          
          {/* 1. Descendants / Branches Section FIRST (الأبناء والفروع) */}
          <div className="p-3.5 sm:p-4 rounded-2xl border-2 border-[#0F4C3A]/20 bg-[#FBF9F5]/70 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-[#0F4C3A] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {person.gender === 'female'
                    ? `الفروع والأبناء (${kinship.children.length}):`
                    : `الفروع والأبناء (${children.length}):`}
                </span>
              </h4>
              
              {person.gender === 'female' && kinship.children.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200/70 font-bold">
                    {kinship.sons.length} ذكور · {kinship.daughters.length} إناث
                  </span>
                </div>
              )}

              {person.gender === 'male' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-600 font-semibold">
                    {sons.length} ذكور · {daughters.length} إناث
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowQuickChildBox(!showQuickChildBox)}
                      className={`min-h-[34px] text-[11px] font-bold px-2.5 py-1 rounded-xl border transition flex items-center gap-1 ${
                        showQuickChildBox
                          ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                          : 'bg-emerald-50 text-[#0F4C3A] border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      <Zap className="w-3 h-3 text-[#D4AF37] shrink-0" />
                      <span>{showQuickChildBox ? 'إخفاء الإضافة السريعة' : '+ إضافة ابن سريعاً'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* FAST INLINE CHILD ADDER FOR MALES (Mobile-friendly stacked layout) */}
            {person.gender === 'male' && showQuickChildBox && isAdmin && (
              <form onSubmit={handleExecuteQuickAddChild} className="p-3 sm:p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-300 space-y-2.5 animate-fade-in text-xs">
                {quickSuccessNotice && (
                  <div className="p-2 rounded-xl bg-white border border-emerald-300 text-emerald-900 flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="leading-snug break-words">{quickSuccessNotice}</span>
                  </div>
                )}

                {quickError && (
                  <div className="p-2 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{quickError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Gender toggle */}
                  <div className="grid grid-cols-2 sm:flex rounded-xl overflow-hidden border border-emerald-200 bg-white shrink-0 font-bold">
                    <button
                      type="button"
                      onClick={() => setQuickGender('male')}
                      className={`min-h-[38px] px-3 py-1.5 transition text-center ${
                        quickGender === 'male' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      ذكر (ابن)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickGender('female')}
                      className={`min-h-[38px] px-3 py-1.5 transition text-center ${
                        quickGender === 'female' ? 'bg-rose-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      أنثى (ابنة)
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    {/* First Name Input */}
                    <input
                      ref={quickInputRef}
                      type="text"
                      autoFocus
                      value={quickFirstName}
                      onChange={(e) => setQuickFirstName(e.target.value)}
                      placeholder="الاسم الأول فقط (مثال: عبد الله)..."
                      className="flex-1 h-10 px-3 rounded-xl border border-emerald-300 bg-white text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                    />

                    {/* Add button */}
                    <button
                      type="submit"
                      disabled={quickSubmitting || !quickFirstName.trim()}
                      className="h-10 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white font-bold transition flex items-center justify-center gap-1 shrink-0 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>{quickSubmitting ? '...' : 'إضافة'}</span>
                    </button>
                  </div>
                </div>

                {/* Auto Generated Preview */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-emerald-950 font-medium px-1">
                  <span className="leading-snug break-words">باقي الاسم تلقائياً: <strong className="text-emerald-800">{inlineSuffix}</strong></span>
                  {quickFirstName.trim() && (
                    <span className="font-bold text-[#0F4C3A] leading-snug break-words">« {inlineFullName} »</span>
                  )}
                </div>
              </form>
            )}

            {person.gender === 'female' ? (
              <div className="space-y-2.5">
                {kinship.children.length > 0 ? (
                  <div className="space-y-1.5 sm:space-y-2">
                    {kinship.children.map((ch) => (
                      <div
                        key={ch.id}
                        className="p-2 sm:p-2.5 rounded-xl bg-white border border-rose-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 text-xs hover:bg-rose-50/40 transition"
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ch.gender === 'male' ? 'bg-emerald-600' : 'bg-rose-500'}`} />
                          <div className="flex flex-wrap items-center gap-1.5 flex-1">
                            <button
                              type="button"
                              onClick={() => onSelectRelative?.(ch.id)}
                              className="font-bold text-slate-900 hover:text-[#0F4C3A] hover:underline text-right leading-relaxed break-words text-xs sm:text-sm"
                            >
                              {formatQuadrupleName(ch, getPerson)}
                            </button>
                            {ch.gender === 'female' && ch.husbandName && (
                              <span className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
                                زوجة: {formatAppName(ch.husbandName)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`self-end sm:self-center shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                            ch.gender === 'male'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                              : 'bg-rose-50 text-rose-800 border border-rose-200/60'
                          }`}
                        >
                          {ch.gender === 'male' ? 'ابنها' : 'ابنتها'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-500">
                    {person.husbandId
                      ? 'لا يوجد أبناء مسجلون لها من زوجها حالياً'
                      : 'لا يوجد أبناء مسجلون حالياً (يظهر أبناء البنت هنا عند ربطها بزوج من الشجرة)'}
                  </div>
                )}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  <strong>قاعدة نسب الأبناء:</strong> يُعرض أبناء البنت هنا بالاسم الرباعي عند ربطها بزوج (مع استثناء أبناء الزوج من زوجة أخرى)، ولا يظهرون في تفرع البنت تحت الشجرة لأنهم يتفرعون تحت أبيهم{husbandPerson ? ` (${formatAppName(husbandPerson.fullName)})` : ''}.
                </div>
              </div>
            ) : children.length === 0 ? (
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-400">
                لا يوجد أبناء مسجلون لهذا الشخص حالياً
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {children.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-2 sm:p-2.5 rounded-xl bg-white border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 text-xs hover:bg-emerald-50/40 transition shadow-2xs"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ch.gender === 'male' ? 'bg-emerald-600' : 'bg-rose-500'}`} />
                      <div className="flex flex-wrap items-center gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={() => onSelectRelative?.(ch.id)}
                          className="font-bold text-slate-900 hover:text-[#0F4C3A] hover:underline text-right leading-relaxed break-words text-xs sm:text-sm"
                        >
                          {formatBranchName(ch.fullName)}
                        </button>
                        {ch.gender === 'female' && ch.husbandName && (
                          <span className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60">
                            زوجة: {formatAppName(ch.husbandName)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                      {isAdmin ? (
                        <>
                          {/* Gender button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onToggleGender) {
                                onToggleGender(ch.id);
                              }
                            }}
                            className={`min-h-[32px] text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${
                              ch.gender === 'male'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                            }`}
                            title="انقر لتعديل الجنس (ذكر / أنثى)"
                          >
                            {ch.gender === 'male' ? 'ذكر (ابن)' : 'أنثى (ابنة)'}
                          </button>

                          {/* Edit child */}
                          <button
                            type="button"
                            onClick={() => onOpenEdit(ch)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg text-slate-700 bg-slate-100/80 hover:text-blue-600 hover:bg-blue-50 transition flex items-center gap-1 text-[11px] font-bold"
                            title="تعديل"
                          >
                            <Edit2 className="w-3 h-3 shrink-0" />
                            <span>تعديل</span>
                          </button>

                          {/* Delete child */}
                          <button
                            type="button"
                            onClick={() => onDeletePerson(ch.id)}
                            className="min-h-[32px] px-2 py-1 rounded-lg text-red-600 bg-red-50/70 hover:bg-red-100 transition flex items-center gap-1 text-[11px] font-bold"
                            title="حذف هذا الابن/الابنة"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="sm:hidden">حذف</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                            ch.gender === 'male'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                              : 'bg-rose-50 text-rose-800 border border-rose-200/60'
                          }`}
                        >
                          {ch.gender === 'male' ? 'ذكر (ابن)' : 'أنثى (ابنة)'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Kinship & Extended Relationships related to the name (البيانات الأخرى المتعلقة بالاسم مثل عم لـ:) */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-emerald-200/90 bg-emerald-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowKinship(!showKinship)}
                className="w-full flex items-center justify-between gap-2 text-xs font-bold text-[#0F4C3A] hover:underline text-right"
              >
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span className="leading-snug">البيانات الأخرى وصلات القرابة المتعلقة بالاسم (عم لـ، خال لـ، إخوة...)</span>
                </div>
                {showKinship ? (
                  <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                )}
              </button>
            </div>

            {showKinship && (
              <div className="space-y-2.5 pt-1 text-xs text-slate-800">
                
                {/* 1. عم لـ (Paternal Uncle to) */}
                {kinship.isPaternalUncleTo.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-emerald-100 space-y-1.5">
                    <span className="font-bold text-[#0F4C3A] block text-[11px]">
                      عم لـ ({kinship.isPaternalUncleTo.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.isPaternalUncleTo.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'ابن أخ' : 'ابنة أخ'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. عمة لـ (Paternal Aunt to) */}
                {kinship.isPaternalAuntTo.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-rose-100 space-y-1.5">
                    <span className="font-bold text-rose-800 block text-[11px]">
                      عمة لـ ({kinship.isPaternalAuntTo.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.isPaternalAuntTo.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'ابن أخ' : 'ابنة أخ'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. خال لـ (Maternal Uncle to — non-excluded children of sisters) */}
                {kinship.isMaternalUncleTo.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-emerald-100 space-y-1.5">
                    <span className="font-bold text-[#0F4C3A] block text-[11px]">
                      خال لـ ({kinship.isMaternalUncleTo.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.isMaternalUncleTo.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'ابن أخت' : 'ابنة أخت'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. خالة لـ (Maternal Aunt to — non-excluded children of sisters) */}
                {kinship.isMaternalAuntTo.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-rose-100 space-y-1.5">
                    <span className="font-bold text-rose-800 block text-[11px]">
                      خالة لـ ({kinship.isMaternalAuntTo.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.isMaternalAuntTo.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'ابن أخت' : 'ابنة أخت'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. أم لـ (For females married to a family member: her non-excluded children + their maternal uncles/aunts) */}
                {person.gender === 'female' && kinship.children.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-rose-200 space-y-2">
                    <div>
                      <span className="font-bold text-rose-900 block text-[11px] mb-1.5">
                        أم لـ (أبناؤها وبناتها من زوجها) ({kinship.children.length}):
                      </span>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                        {kinship.children.map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => onSelectRelative?.(k.id)}
                            className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                              k.gender === 'male'
                                ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                            }`}
                          >
                            <span>{formatQuadrupleName(k, getPerson)}</span>
                            <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'ابنها' : 'ابنتها'})</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {(kinship.brothers.length > 0 || kinship.sisters.length > 0) && (
                      <div className="pt-2 border-t border-rose-100 space-y-1.5">
                        <span className="font-bold text-[#0F4C3A] block text-[10px]">
                          أخوال وخالات هؤلاء الأبناء (إخوة وأخوات أمهم هذه — وليسوا أخوالاً للمستثنين):
                        </span>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                          {[...kinship.brothers, ...kinship.sisters].map((sib) => (
                            <button
                              key={sib.id}
                              type="button"
                              onClick={() => onSelectRelative?.(sib.id)}
                              className={`min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                                sib.gender === 'male'
                                  ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                              }`}
                            >
                              <span>{formatAppName(sib.fullName)}</span>
                              <span className="text-[10px] opacity-80 shrink-0">({sib.gender === 'male' ? 'خال الأبناء' : 'خالة الأبناء'})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Excluded husband children (not her children — from another mother) */}
                {kinship.excludedHusbandChildren.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
                    <span className="font-bold text-amber-900 block text-[11px]">
                      أبناء الزوج المستثنون من أمومتها (من أم أخرى — إخوتها ليسوا أخوالاً لهم) ({kinship.excludedHusbandChildren.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.excludedHusbandChildren.map(({ child, otherMother }) => (
                        <div
                          key={child.id}
                          className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-amber-200 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectRelative?.(child.id)}
                            className={`font-bold hover:underline text-right leading-snug break-words ${
                              child.gender === 'male' ? 'text-slate-800' : 'text-rose-800'
                            }`}
                          >
                            {formatQuadrupleName(child, getPerson)}
                          </button>
                          {otherMother ? (
                            <button
                              type="button"
                              onClick={() => onSelectRelative?.(otherMother.id)}
                              className="text-[10px] text-rose-700 font-bold hover:underline"
                            >
                              (الأم: {formatAppName(otherMother.fullName)})
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500">(من أم أخرى)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. الإخوة والأخوات */}
                {kinship.siblings.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/70 space-y-1.5">
                    <span className="font-bold text-slate-700 block text-[11px]">
                      الإخوة والأخوات ({kinship.siblings.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.siblings.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'أخ' : 'أخت'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. الأعمام والعمات لهذا الشخص */}
                {(kinship.paternalUncles.length > 0 || kinship.paternalAunts.length > 0) && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200/70 space-y-1.5">
                    <span className="font-bold text-slate-700 block text-[11px]">
                      الأعمام والعمات ({kinship.paternalUncles.length + kinship.paternalAunts.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {[...kinship.paternalUncles, ...kinship.paternalAunts].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'عم' : 'عمة'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. الأخوال والخالات لهذا الشخص (من جهة أمه إذا لم يكن مستثنى) */}
                {(kinship.maternalUncles.length > 0 || kinship.maternalAunts.length > 0) && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-emerald-200/80 space-y-1.5">
                    <span className="font-bold text-[#0F4C3A] block text-[11px] leading-snug">
                      الأخوال والخالات {kinship.mother ? `(إخوة وأخوات الأم: ${formatAppName(kinship.mother.fullName)})` : ''} ({kinship.maternalUncles.length + kinship.maternalAunts.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {[...kinship.maternalUncles, ...kinship.maternalAunts].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => onSelectRelative?.(k.id)}
                          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition text-right leading-snug break-words flex items-center justify-between sm:justify-start gap-1.5 ${
                            k.gender === 'male'
                              ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200/60'
                              : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                          }`}
                        >
                          <span>{formatAppName(k.fullName)}</span>
                          <span className="text-[10px] opacity-80 shrink-0">({k.gender === 'male' ? 'خال' : 'خالة'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 9. إذا كان ذكراً وله زوجات في الشجرة */}
                {kinship.wives.length > 0 && (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-rose-100 space-y-1.5">
                    <span className="font-bold text-rose-800 block text-[11px]">
                      الزوجات المسجلات ({kinship.wives.length}):
                    </span>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                      {kinship.wives.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => onSelectRelative?.(w.id)}
                          className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-900 hover:bg-rose-100 text-xs font-semibold transition border border-rose-200/60 text-right leading-snug break-words"
                        >
                          {formatAppName(w.fullName)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {kinship.children.length === 0 &&
                  kinship.excludedHusbandChildren.length === 0 &&
                  kinship.isMaternalUncleTo.length === 0 &&
                  kinship.isMaternalAuntTo.length === 0 &&
                  kinship.isPaternalUncleTo.length === 0 &&
                  kinship.isPaternalAuntTo.length === 0 &&
                  kinship.maternalUncles.length === 0 &&
                  kinship.maternalAunts.length === 0 &&
                  kinship.paternalUncles.length === 0 &&
                  kinship.paternalAunts.length === 0 &&
                  kinship.siblings.length === 0 &&
                  kinship.wives.length === 0 && (
                    <div className="text-[11px] text-slate-500 text-center py-1">
                      لا توجد بيانات قرابة إضافية مسجلة حالياً
                    </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Husband Card for Female */}
          {person.gender === 'female' && (person.husbandName || person.husbandId) && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-50/80 border border-rose-200/90 text-xs space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Heart className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-rose-700 block font-semibold">بيانات الزوج:</span>
                    <span className="font-bold text-rose-950 text-xs sm:text-sm leading-snug break-words block">
                      {formatAppName(husbandPerson ? husbandPerson.fullName : person.husbandName)}
                    </span>
                  </div>
                </div>
                {husbandPerson && onSelectRelative && (
                  <button
                    type="button"
                    onClick={() => onSelectRelative(husbandPerson.id)}
                    className="min-h-[36px] text-[11px] font-bold text-rose-800 bg-white px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-100/70 transition flex items-center justify-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                  >
                    <span>عرض بطاقة الزوج</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Kinship relation between wife and husband */}
              {husbandPerson && coupleRelationship && (
                <div className="p-2.5 rounded-xl bg-white border border-rose-200 text-slate-800 flex items-start gap-2">
                  <Network className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-semibold">صلة القرابة بينهما:</span>
                      <span className="text-xs font-bold text-[#0F4C3A] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/70">
                        {coupleRelationship.relationToHusband}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 font-medium leading-relaxed">
                      {coupleRelationship.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3b. Wife Card(s) for Male (بيانات الزوجة المربوطة بهذا الابن) */}
          {person.gender === 'male' && (
            <div className={`p-3.5 sm:p-4 rounded-2xl border text-xs space-y-3.5 shadow-2xs ${
              linkedWives.length > 0
                ? 'bg-gradient-to-b from-rose-50/90 to-rose-50/40 border-rose-200/90'
                : 'bg-[#FBF9F5] border-slate-200/80'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-rose-200/70">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shadow-xs ${
                    linkedWives.length > 0
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    <Heart className={`w-4 h-4 ${linkedWives.length > 0 ? 'fill-current' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-rose-950 flex items-center gap-1.5">
                      <span>
                        {linkedWives.length === 0
                          ? 'بيانات الزوجة:'
                          : linkedWives.length === 1
                          ? 'بيانات الزوجة المربوطة بهذا الابن:'
                          : `بيانات الزوجات (${linkedWives.length}):`}
                      </span>
                    </h4>
                    <span className="text-[10px] text-slate-600 font-medium">
                      {linkedWives.length === 0
                        ? 'لا توجد زوجة مربوطة بهذا الابن حالياً'
                        : linkedWives.length === 1
                        ? 'الزوجة المسجلة في بياناته وصلة القرابة والأبناء المشتركون'
                        : 'جميع الزوجات المسجلات في بيانات هذا الابن مع صلات القرابة والأبناء'}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddWifeBox(!showAddWifeBox)}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl bg-white hover:bg-rose-100/80 text-rose-800 border border-rose-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>
                      {showAddWifeBox
                        ? 'إغلاق البحث'
                        : linkedWives.length === 0
                        ? '+ ربط زوجة لهذا الابن'
                        : '+ ربط زوجة إضافية'}
                    </span>
                  </button>
                )}
              </div>

              {/* Action feedback banner */}
              {wifeActionFeedback && (
                <div className="p-2.5 rounded-xl bg-white border border-rose-300 text-rose-900 flex items-center gap-2 font-bold text-xs shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{wifeActionFeedback}</span>
                </div>
              )}

              {/* Admin Inline Link Wife Box */}
              {isAdmin && showAddWifeBox && (
                <div className="p-3 sm:p-3.5 rounded-2xl bg-white border-2 border-rose-300 space-y-2.5 shadow-sm animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-950 text-xs">
                      اختر الزوجة لربطها بهذا الابن ({formatAppName(person.fullName)}):
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      ({eligibleFemalesToLink.length} إناث متاحات في الشجرة)
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={wifeSearch}
                      onChange={(e) => setWifeSearch(e.target.value)}
                      placeholder="ابحث عن الزوجة باسمها أو اسم والدها..."
                      className="w-full h-10 pr-9 pl-3 rounded-xl border border-rose-200 bg-rose-50/30 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>

                  <div className="max-h-48 overflow-y-auto divide-y divide-rose-100 rounded-xl border border-rose-200 bg-white shadow-inner">
                    {filteredFemalesToLink.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        {wifeSearch.trim()
                          ? 'لا توجد إناث مطابقة لنص البحث'
                          : 'لا توجد إناث متاحة للربط حالياً'}
                      </div>
                    ) : (
                      filteredFemalesToLink.map((fem) => {
                        const femFather = fem.fatherId ? getPerson(fem.fatherId) : null;
                        const relPreview = getCoupleRelationship(fem.id, fem.fatherId, person.id, allPersons);
                        return (
                          <div
                            key={fem.id}
                            className="p-2.5 hover:bg-rose-50/70 flex items-center justify-between gap-2 text-right transition"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-900 block text-xs truncate">
                                {formatDropdownName(fem.fullName)}
                              </span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {femFather ? `بنت: ${formatDropdownName(femFather.fullName)}` : 'شجرة مستقلة'}
                                {relPreview.relationToHusband && (
                                  <span className="text-emerald-800 font-bold mr-1.5">
                                    · صلتها به: {relPreview.relationToHusband}
                                  </span>
                                )}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={wifeActionLoading}
                              onClick={() => handleExecuteLinkWife(fem.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs transition shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              {wifeActionLoading ? '...' : 'ربط كزوجة'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Linked Wives List with Complete Details */}
              {linkedWives.length > 0 ? (
                <div className="space-y-3">
                  {linkedWives.map((wife, wifeIdx) => {
                    const wifeFather = wife.fatherId ? getPerson(wife.fatherId) : null;
                    const wifeGrandfather = wifeFather?.fatherId ? getPerson(wifeFather.fatherId) : null;
                    const wifeLineage = getLineageString(wife.id);
                    const wifeCoupleRel = getCoupleRelationship(wife.id, wife.fatherId, person.id, allPersons);
                    const wifeKids = children.filter((c) => isChildIncludedForWife(wife, c));
                    const wifeSons = wifeKids.filter((c) => c.gender === 'male');
                    const wifeDaughters = wifeKids.filter((c) => c.gender === 'female');
                    const wifeSiblings = wife.fatherId
                      ? allPersons.filter((p) => p.fatherId === wife.fatherId && p.id !== wife.id)
                      : [];
                    const wifeBrothers = sortPersonsMalesFirstAlphabetical(
                      wifeSiblings.filter((p) => p.gender === 'male')
                    );
                    const wifeSisters = sortPersonsMalesFirstAlphabetical(
                      wifeSiblings.filter((p) => p.gender === 'female')
                    );

                    return (
                      <div
                        key={wife.id}
                        className="p-3 sm:p-4 rounded-2xl bg-white border border-rose-200/90 shadow-2xs space-y-3 text-xs"
                      >
                        {/* Wife Header & Action Buttons */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-rose-100">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                            <div className="min-w-0">
                              {linkedWives.length > 1 && (
                                <span className="text-[10px] font-bold text-rose-700 block">
                                  الزوجة رقم ({wifeIdx + 1}):
                                </span>
                              )}
                              <h5 className="font-black text-rose-950 text-sm sm:text-base leading-snug break-words">
                                {formatAppName(wife.fullName)}
                              </h5>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug break-words">
                                « نسبها: {formatAppName(wifeLineage)} »
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                            {onSelectRelative && (
                              <button
                                type="button"
                                onClick={() => onSelectRelative(wife.id)}
                                className="min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 transition flex items-center gap-1 cursor-pointer"
                                title="الانتقال إلى بطاقة الزوجة"
                              >
                                <span>عرض بطاقتها</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenEdit(wife)}
                                  className="min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition flex items-center gap-1 cursor-pointer"
                                  title="تعديل بيانات الزوجة"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>تعديل</span>
                                </button>
                                {onUnlinkWife && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          `هل أنت متأكد من فك ارتباط الزوجة (${wife.fullName}) من هذا الابن؟`
                                        )
                                      ) {
                                        handleExecuteUnlinkWife(wife.id);
                                      }
                                    }}
                                    className="min-h-[32px] px-2 py-1 rounded-xl text-[11px] font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition flex items-center gap-1 cursor-pointer"
                                    title="فك ارتباط الزوجة"
                                  >
                                    <UserMinus className="w-3 h-3" />
                                    <span>فك الارتباط</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Wife Ancestry (والدها وجدها) */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-[10px] font-bold text-slate-600 block">أصل الزوجة ونسبها:</span>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-800 text-xs">
                            <span>
                              <strong>الوالد: </strong>
                              {wifeFather && onSelectRelative ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectRelative(wifeFather.id)}
                                  className="text-rose-800 font-bold hover:underline"
                                >
                                  {formatAppName(wifeFather.fullName)}
                                </button>
                              ) : (
                                <span>
                                  {wifeFather ? formatAppName(wifeFather.fullName) : 'غير مسجل في الشجرة'}
                                </span>
                              )}
                            </span>
                            {wifeGrandfather && (
                              <span>
                                <strong>الجد: </strong>
                                <span>{formatAppName(wifeGrandfather.fullName)}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Kinship Connection (صلة القرابة بين الزوج والزوجة) */}
                        {wifeCoupleRel && (
                          <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/90 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-amber-900">صلة القرابة بينهما:</span>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0F4C3A] border border-emerald-300 text-xs font-black">
                                {wifeCoupleRel.relationToHusband}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-950 font-medium leading-relaxed">
                              {wifeCoupleRel.description}
                            </p>
                          </div>
                        )}

                        {/* Children from this wife */}
                        <div className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-200 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-bold text-rose-950 text-[11px] flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-rose-600" />
                              <span>الأبناء المشتركون من هذه الزوجة ({wifeKids.length}):</span>
                            </span>
                            {wifeKids.length > 0 && (
                              <span className="text-[10px] font-bold text-rose-800 bg-white px-2 py-0.5 rounded-md border border-rose-200">
                                {wifeSons.length} ذكور · {wifeDaughters.length} إناث
                              </span>
                            )}
                          </div>

                          {wifeKids.length > 0 ? (
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 pt-1">
                              {wifeKids.map((ch) => (
                                <button
                                  key={ch.id}
                                  type="button"
                                  onClick={() => onSelectRelative?.(ch.id)}
                                  className={`min-h-[30px] px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center justify-between sm:justify-start gap-1.5 border cursor-pointer ${
                                    ch.gender === 'male'
                                      ? 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50'
                                      : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-50'
                                  }`}
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      ch.gender === 'male' ? 'bg-emerald-600' : 'bg-rose-500'
                                    }`}
                                  />
                                  <span>{formatBranchName(ch.fullName)}</span>
                                  <span className="text-[10px] opacity-75">
                                    ({ch.gender === 'male' ? 'ابن' : 'ابنة'})
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-rose-100 text-center">
                              لا يوجد أبناء مسجلون من هذه الزوجة حالياً
                            </p>
                          )}
                        </div>

                        {/* Maternal Uncles & Aunts (أخوال وخالات الأبناء) */}
                        {(wifeBrothers.length > 0 || wifeSisters.length > 0) && (
                          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1.5">
                            <span className="text-[10px] font-bold text-[#0F4C3A] block">
                              أخوال وخالات أبنائها (إخوة وأخوات الزوجة):
                            </span>
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                              {wifeBrothers.map((b) => (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => onSelectRelative?.(b.id)}
                                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-white text-[#0F4C3A] border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 transition flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{formatAppName(b.fullName)}</span>
                                  <span className="text-[10px] text-emerald-700">(خال)</span>
                                </button>
                              ))}
                              {wifeSisters.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => onSelectRelative?.(s.id)}
                                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-white text-rose-800 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{formatAppName(s.fullName)}</span>
                                  <span className="text-[10px] text-rose-700">(خالة)</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Wife Notes if any */}
                        {wife.notes && (
                          <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-slate-700 text-[11px] leading-relaxed break-words">
                            <strong className="block text-amber-900 font-bold mb-0.5">
                              نبذة وملاحظات عن الزوجة:
                            </strong>
                            {wife.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-500">
                  لا توجد زوجة مربوطة بهذا الابن حالياً.
                  {isAdmin && ' يمكنك النقر على الزر أعلاه للبحث عن زوجة من بنات العائلة وربطها به.'}
                </div>
              )}
            </div>
          )}

          {/* 4. Ancestry Card (Father, Mother, Grandfather) */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2">
            <div className="text-xs font-bold text-[#0F4C3A] flex items-center justify-between flex-wrap gap-2">
              <span>نسب الفرد (الأصول):</span>
              <button
                onClick={() => onNavigateToLineage(person.id)}
                className="min-h-[32px] text-[11px] text-[#0F4C3A] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>عرض النسب الصاعد كاملاً</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="text-xs text-slate-700 divide-y divide-slate-100">
              <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <span className="text-slate-500 shrink-0">الأب:</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {father && onSelectRelative ? (
                    <button
                      type="button"
                      onClick={() => onSelectRelative(father.id)}
                      className="font-bold text-slate-900 hover:text-[#0F4C3A] hover:underline text-right leading-snug break-words"
                    >
                      {formatAppName(father.fullName)}
                    </button>
                  ) : (
                    <span className="font-bold text-slate-900 leading-snug break-words">
                      {father ? formatAppName(father.fullName) : 'غير مسجل (بداية شجرة مستقلة)'}
                    </span>
                  )}
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onOpenAddFather(person.id)}
                        className="min-h-[32px] px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-[11px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                        title="نقل الابن وفروعه إلى جد أعلى أو إضافة جد أو أكثر من جد فوق هذا الفرد"
                      >
                        <ArrowUp className="w-3 h-3 shrink-0" />
                        <span>{father ? 'نقل الفرع لجد أعلى / + جد' : '+ إضافة جد أعلى / نقل لجد'}</span>
                      </button>

                      {onOpenMergeModal && person.gender === 'male' && (
                        <button
                          type="button"
                          onClick={() => onOpenMergeModal(person.id)}
                          className="min-h-[32px] px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                          title="دمج هذا الجد مع جد آخر بنفس الاسم"
                        >
                          <GitMerge className="w-3 h-3 shrink-0 text-amber-700" />
                          <span>دمج مع أصل آخر</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {kinship.mother && (
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span className="text-slate-500 shrink-0">الأم (من العائلة):</span>
                  {onSelectRelative ? (
                    <button
                      type="button"
                      onClick={() => onSelectRelative(kinship.mother!.id)}
                      className="font-bold text-rose-800 hover:underline text-right leading-snug break-words"
                    >
                      {formatAppName(kinship.mother.fullName)}
                    </button>
                  ) : (
                    <span className="font-bold text-rose-800 leading-snug break-words">{formatAppName(kinship.mother.fullName)}</span>
                  )}
                </div>
              )}
              <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="text-slate-500 shrink-0">الجد:</span>
                <span className="font-bold text-slate-900 leading-snug break-words">
                  {grandfather ? formatAppName(grandfather.fullName) : 'غير مسجل'}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Notes if present */}
          {person.notes && (
            <div className="p-3.5 rounded-2xl bg-[#FBF9F5] border border-slate-200/70 text-xs text-slate-700 leading-relaxed break-words">
              <strong className="block text-slate-900 mb-1">نبذة وملاحظات:</strong>
              {person.notes}
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Buttons Toolbar (Ultra-Compact on Mobile & Desktop) */}
        <div className="p-2 sm:px-5 sm:py-3 bg-white border-t border-slate-200 shrink-0">
          {isAdmin ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Add child (sons / daughters) - ONLY for male */}
              {person.gender === 'male' && (
                <button
                  type="button"
                  onClick={() => onOpenAddChild(person.id)}
                  className="flex-1 min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1 px-2 rounded-xl text-xs font-black transition shadow-2xs bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] active:scale-98 cursor-pointer"
                  title="إضافة ابن أو بنت لهذا الاسم"
                >
                  <Plus className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span className="truncate">
                    <span className="sm:hidden">+ فرع</span>
                    <span className="hidden sm:inline">إضافة ابن أو بنت</span>
                  </span>
                </button>
              )}

              {/* Add father / root ancestor above person */}
              <button
                type="button"
                onClick={() => onOpenAddFather(person.id)}
                className="flex-1 min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1 px-2 rounded-xl text-xs font-bold border transition border-[#0F4C3A]/30 text-[#0F4C3A] hover:bg-[#0F4C3A]/10 active:scale-98 bg-emerald-50/40 cursor-pointer"
                title={father ? 'إضافة الأب صعوداً / نقل لجد أعلى' : '+ إضافة أصل لهذا الأصل'}
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0 text-[#0F4C3A]" />
                <span className="truncate">
                  <span className="sm:hidden">+ أب</span>
                  <span className="hidden sm:inline">{father ? 'إضافة الأب صعوداً' : '+ إضافة أصل'}</span>
                </span>
              </button>

              {/* Edit Person Button */}
              <button
                type="button"
                onClick={() => onOpenEdit(person)}
                className="min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1 px-2.5 rounded-xl text-xs font-bold border transition hover:bg-blue-50 border-blue-200 text-blue-700 bg-white active:scale-98 cursor-pointer shrink-0"
                title="تعديل الاسم والبيانات"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">تعديل</span>
              </button>

              {/* Print Person card */}
              <button
                type="button"
                onClick={() => onPrintPerson(person.id)}
                className="min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1 px-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition bg-white active:scale-98 cursor-pointer shrink-0"
                title="طباعة بطاقة الفرد أو تصدير PDF"
              >
                <Printer className="w-3.5 h-3.5 text-[#0F4C3A] shrink-0" />
                <span className="hidden sm:inline">طباعة / PDF</span>
              </button>

              {/* Delete Person */}
              <button
                type="button"
                onClick={() => onDeletePerson(person.id)}
                className="min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1 px-2.5 rounded-xl text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 bg-white transition active:scale-98 cursor-pointer shrink-0"
                title="حذف هذا الاسم من شجرة العائلة"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">حذف</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onPrintPerson(person.id)}
                className="min-h-[36px] flex items-center justify-center gap-1.5 py-1 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="طباعة بطاقة الفرد"
              >
                <Printer className="w-4 h-4 text-[#0F4C3A] shrink-0" />
                <span>طباعة / تصدير PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] py-1 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
