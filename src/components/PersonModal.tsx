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
  ArrowRight
} from 'lucide-react';
import { Person, Gender } from '../types/family';
import { calculateKinship, getCoupleRelationship } from '../utils/kinship';
import { generateChildFullName, getPatronymicSuffix } from '../utils/nameUtils';

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
  onQuickAddChild?: (data: { fullName: string; gender: Gender; fatherId: string }) => Promise<void>;
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
  onQuickAddChild,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-6 text-white relative shrink-0 ${
            person.gender === 'male'
              ? 'bg-gradient-to-r from-[#0F4C3A] to-[#165B4C]'
              : 'bg-gradient-to-r from-[#88243E] to-[#A83250]'
          }`}
        >
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {onBackToPrevious && previousPersonName && (
            <div className="mb-3 pl-10">
              <button
                type="button"
                onClick={onBackToPrevious}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition backdrop-blur-xs shadow-2xs max-w-full text-right"
              >
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                <span className="leading-snug break-words">العودة للفرع السابق: {previousPersonName}</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mb-3 pl-10 sm:pl-10 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/80 font-medium">الجنس:</span>
              {isAdmin ? (
                <div className="flex items-center gap-1 bg-black/25 p-1 rounded-xl backdrop-blur-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (person.gender !== 'male' && onToggleGender) {
                        onToggleGender(person.id);
                      }
                    }}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                      person.gender === 'male'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                    title="تعديل الجنس إلى ذكر"
                  >
                    <span className={`w-2 h-2 rounded-full ${person.gender === 'male' ? 'bg-white' : 'bg-emerald-400'}`} />
                    <span>ذكر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (person.gender !== 'female' && onToggleGender) {
                        onToggleGender(person.id);
                      }
                    }}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                      person.gender === 'female'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                    title="تعديل الجنس إلى أنثى"
                  >
                    <span className={`w-2 h-2 rounded-full ${person.gender === 'female' ? 'bg-white' : 'bg-rose-400'}`} />
                    <span>أنثى</span>
                  </button>
                </div>
              ) : (
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    person.gender === 'male'
                      ? 'bg-emerald-600/90 text-white'
                      : 'bg-rose-600/90 text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <span>{person.gender === 'male' ? 'ذكر' : 'أنثى'}</span>
                </span>
              )}
            </div>

            {/* Quick Action Buttons in Modal Header (Admin Only) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenAddFather(person.id)}
                    className="min-h-[34px] flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#D4AF37]/25 hover:bg-[#D4AF37]/40 text-white border border-[#D4AF37]/50 text-xs font-bold transition backdrop-blur-xs shadow-2xs"
                    title="نقل الابن وفروعه إلى جد أعلى أو إضافة جد أعلى"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-[#F5E6B8] shrink-0" />
                    <span>نقل لجد أعلى / + جد</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenEdit(person)}
                    className="min-h-[34px] flex items-center gap-1 px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition backdrop-blur-xs shadow-2xs"
                    title="تعديل"
                  >
                    <Edit2 className="w-3.5 h-3.5 shrink-0" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeletePerson(person.id)}
                    className="min-h-[34px] flex items-center gap-1 px-3 py-1 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition shadow-2xs"
                    title="حذف الاسم من الشجرة"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>حذف</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {person.gender === 'female' && (person.husbandName || person.husbandId) && (
            <div className="mb-2">
              <span className="text-xs text-white/95 bg-white/20 px-2.5 py-1 rounded-md inline-flex items-center gap-1 font-semibold max-w-full break-words leading-snug">
                <Heart className="w-3 h-3 text-rose-300 shrink-0" />
                <span>زوجة: {husbandPerson ? husbandPerson.fullName : person.husbandName}</span>
              </span>
            </div>
          )}

          <h3 className="text-lg sm:text-2xl font-bold font-display text-white leading-snug break-words">
            {person.fullName}
          </h3>

          <p className="text-xs text-white/85 mt-1 leading-relaxed break-words">
            « {lineage} »
          </p>
        </div>

        {/* Modal Body: Starts with Branches (الأبناء والفروع) first, then other related data such as عم لـ: */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          
          {/* 1. Descendants / Branches Section FIRST (الأبناء والفروع) */}
          <div className="p-3.5 sm:p-4 rounded-2xl border-2 border-[#0F4C3A]/20 bg-[#FBF9F5]/70 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-[#0F4C3A] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {person.gender === 'female' && kinship.children.length > 0
                    ? `الفروع والأبناء (${kinship.children.length}):`
                    : `الفروع والأبناء (${children.length}):`}
                </span>
              </h4>
              
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
                {kinship.children.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                    {kinship.children.map((ch) => (
                      <div
                        key={ch.id}
                        className="p-3 rounded-xl bg-white border border-rose-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-rose-50/40 transition"
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ch.gender === 'male' ? 'bg-emerald-600' : 'bg-rose-500'}`} />
                          <button
                            type="button"
                            onClick={() => onSelectRelative?.(ch.id)}
                            className="font-bold text-slate-900 hover:text-[#0F4C3A] hover:underline text-right leading-relaxed break-words text-xs sm:text-sm flex-1"
                          >
                            {ch.fullName}
                          </button>
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
                )}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  <strong>قاعدة نسب الأبناء:</strong> في شجرة النسب العربية، ينسب الأبناء لآبائهم؛ وتظهر الإناث في الشجرة ويُعرض نسبهن الصاعد إلى الأجداد دون إضافة فروع مباشرة لهن داخل شجرة النسب الأساسية.
                </div>
              </div>
            ) : children.length === 0 ? (
              <div className="p-4 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-400">
                لا يوجد أبناء مسجلون لهذا الشخص حالياً
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {children.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-xl bg-white border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-emerald-50/40 transition shadow-2xs"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ch.gender === 'male' ? 'bg-emerald-600' : 'bg-rose-500'}`} />
                      <button
                        type="button"
                        onClick={() => onSelectRelative?.(ch.id)}
                        className="font-bold text-slate-900 hover:text-[#0F4C3A] hover:underline text-right leading-relaxed break-words text-xs sm:text-sm flex-1"
                      >
                        {ch.fullName}
                      </button>
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
                          <span>{k.fullName}</span>
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
                          <span>{k.fullName}</span>
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
                          <span>{k.fullName}</span>
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
                          <span>{k.fullName}</span>
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
                            <span>{k.fullName}</span>
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
                              <span>{sib.fullName}</span>
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
                            {child.fullName}
                          </button>
                          {otherMother ? (
                            <button
                              type="button"
                              onClick={() => onSelectRelative?.(otherMother.id)}
                              className="text-[10px] text-rose-700 font-bold hover:underline"
                            >
                              (الأم: {otherMother.fullName})
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
                          <span>{k.fullName}</span>
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
                          <span>{k.fullName}</span>
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
                      الأخوال والخالات {kinship.mother ? `(إخوة وأخوات الأم: ${kinship.mother.fullName})` : ''} ({kinship.maternalUncles.length + kinship.maternalAunts.length}):
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
                          <span>{k.fullName}</span>
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
                          {w.fullName}
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
                      {husbandPerson ? husbandPerson.fullName : person.husbandName}
                    </span>
                  </div>
                </div>
                {husbandPerson && onSelectRelative && (
                  <button
                    type="button"
                    onClick={() => onSelectRelative(husbandPerson.id)}
                    className="min-h-[36px] text-[11px] font-bold text-rose-800 bg-white px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-100/70 transition flex items-center justify-center gap-1 shadow-2xs shrink-0"
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
                      {father.fullName}
                    </button>
                  ) : (
                    <span className="font-bold text-slate-900 leading-snug break-words">
                      {father ? father.fullName : 'غير مسجل (بداية شجرة مستقلة)'}
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenAddFather(person.id)}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-[11px] font-bold transition flex items-center justify-center gap-1 shrink-0"
                      title="نقل الابن وفروعه إلى جد أعلى أو إضافة جد أو أكثر من جد فوق هذا الفرد"
                    >
                      <ArrowUp className="w-3 h-3 shrink-0" />
                      <span>{father ? 'نقل الفرع لجد أعلى / + جد' : '+ إضافة جد أعلى / نقل لجد'}</span>
                    </button>
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
                      {kinship.mother.fullName}
                    </button>
                  ) : (
                    <span className="font-bold text-rose-800 leading-snug break-words">{kinship.mother.fullName}</span>
                  )}
                </div>
              )}
              <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="text-slate-500 shrink-0">الجد:</span>
                <span className="font-bold text-slate-900 leading-snug break-words">
                  {grandfather ? grandfather.fullName : 'غير مسجل'}
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

        {/* Sticky Bottom Action Buttons Toolbar for Mobile & Desktop */}
        <div className="p-3.5 sm:px-6 sm:py-4 bg-white border-t border-slate-200 shrink-0">
          {isAdmin ? (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              {/* Add child (sons / daughters) - ONLY for male */}
              {person.gender === 'male' && (
                <button
                  onClick={() => onOpenAddChild(person.id)}
                  className="col-span-2 sm:flex-1 min-h-[42px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition shadow-xs bg-[#0F4C3A] text-white hover:bg-[#0c3c2e]"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span>إضافة ابن أو بنت (خيارات متقدمة)</span>
                </button>
              )}

              {/* Add father / root ancestor above person */}
              <button
                onClick={() => onOpenAddFather(person.id)}
                className="col-span-2 sm:flex-1 min-h-[42px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition border-[#0F4C3A]/30 text-[#0F4C3A] hover:bg-[#0F4C3A]/10"
              >
                <ArrowUp className="w-4 h-4 shrink-0" />
                <span>{father ? 'إضافة الأب صعوداً' : '+ إضافة أصل لهذا الأصل'}</span>
              </button>

              {/* Edit Person Button */}
              <button
                onClick={() => onOpenEdit(person)}
                className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border transition hover:bg-blue-50 border-blue-200 text-blue-700 bg-white"
                title="تعديل"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span>تعديل</span>
              </button>

              {/* Print Person card */}
              <button
                onClick={() => onPrintPerson(person.id)}
                className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition bg-white"
                title="طباعة بطاقة الفرد"
              >
                <Printer className="w-3.5 h-3.5 text-[#0F4C3A] shrink-0" />
                <span>طباعة / PDF</span>
              </button>

              {/* Delete Person */}
              <button
                onClick={() => onDeletePerson(person.id)}
                className="col-span-2 sm:col-span-1 min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 bg-white transition"
                title="حذف هذا الاسم من شجرة العائلة"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>حذف الاسم</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:flex items-center justify-between gap-2">
              <button
                onClick={() => onPrintPerson(person.id)}
                className="min-h-[42px] flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                title="طباعة بطاقة الفرد"
              >
                <Printer className="w-4 h-4 text-[#0F4C3A] shrink-0" />
                <span>طباعة / تصدير PDF</span>
              </button>

              <button
                onClick={onClose}
                className="min-h-[42px] py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
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
