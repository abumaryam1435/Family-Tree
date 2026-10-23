import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  ArrowUp,
  AlertCircle,
  ShieldCheck,
  TreeDeciduous,
  GitMerge,
  Search,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  Users,
  Network
} from 'lucide-react';
import { Person } from '../types/family';
import {
  advancedArabicMatch,
  scoreArabicMatch,
  filterAndSortBySearch,
  normalizeArabic,
  extractGivenName,
  splitLineageChain,
  rebuildChildFullName,
  comparePersonsMalesFirstAlphabetical,
  formatAppName,
  formatBranchName,
  formatDropdownName
} from '../utils/nameUtils';

interface AddFatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  person: Person | null;
  persons?: Person[];
  treeRoots?: Person[];
  onSelectTargetPerson?: (person: Person) => void;
  onOpenMergeModal?: (sourcePersonId?: string) => void;
  onSubmit: (
    personId: string,
    data: {
      fullName: string;
      ancestorChain?: string[];
      notes?: string;
      grandFatherId?: string | null;
      existingFatherId?: string | null;
      splitCompoundName?: boolean;
      keepCurrentFatherAsTop?: boolean;
      updateDescendantsNames?: boolean;
    }
  ) => Promise<{
    father: Person;
    highestAncestor?: Person;
    child: Person;
    updatedDescendantsCount?: number;
  } | void>;
  currentFather: Person | null;
}

export const AddFatherModal: React.FC<AddFatherModalProps> = ({
  isOpen,
  onClose,
  person,
  persons = [],
  treeRoots = [],
  onSelectTargetPerson,
  onOpenMergeModal,
  onSubmit,
  currentFather
}) => {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  // Array of ancestor levels ordered from direct father up to highest grandfather
  const [ancestorLevels, setAncestorLevels] = useState<string[]>(['']);
  // Optional intermediate ancestors when linking to an existing higher grandfather
  const [intermediateLevels, setIntermediateLevels] = useState<string[]>([]);
  const [splitCompoundName, setSplitCompoundName] = useState<boolean>(false);
  const [keepCurrentFatherAsTop, setKeepCurrentFatherAsTop] = useState<boolean>(false);

  const [notes, setNotes] = useState<string>('');
  const [existingFatherId, setExistingFatherId] = useState<string>('');
  const [existingSearch, setExistingSearch] = useState<string>('');
  const [showBranchSwitcher, setShowBranchSwitcher] = useState<boolean>(false);
  const [branchSearch, setBranchSearch] = useState<string>('');
  const [updateDescendantsNames, setUpdateDescendantsNames] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    setErrorMessage(null);
  }, [person?.id, mode]);

  // Reset form when modal opens for a new target person
  useEffect(() => {
    if (isOpen) {
      setAncestorLevels(['']);
      setIntermediateLevels([]);
      setSplitCompoundName(false);
      setNotes('');
      setErrorMessage(null);
      setSuccessNotice(null);
    }
  }, [isOpen]);

  // All descendants of `person` (his sons, daughters, grandsons, branches)
  const { descendantIds, descendantPersons } = useMemo(() => {
    if (!person) return { descendantIds: new Set<string>(), descendantPersons: [] as Person[] };
    const childrenMap = new Map<string, Person[]>();
    for (const p of persons) {
      if (p.fatherId) {
        const list = childrenMap.get(p.fatherId) || [];
        list.push(p);
        childrenMap.set(p.fatherId, list);
      }
    }

    const set = new Set<string>([person.id]);
    const orderedDescendants: Person[] = [];
    const queue: string[] = [person.id];

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const kids = (childrenMap.get(currId) || []).sort(comparePersonsMalesFirstAlphabetical);
      for (const k of kids) {
        if (!set.has(k.id)) {
          set.add(k.id);
          orderedDescendants.push(k);
          queue.push(k.id);
        }
      }
    }

    return { descendantIds: set, descendantPersons: orderedDescendants };
  }, [person, persons]);

  const treeRootIds = useMemo(() => new Set(treeRoots.map(r => r.id)), [treeRoots]);

  // Filterable list of all persons in case admin wants to pick another Son/Father to move with his branches
  const switchableBranches = useMemo(() => {
    const q = branchSearch.trim();
    if (!q) {
      return [...persons].sort(comparePersonsMalesFirstAlphabetical).slice(0, 25);
    }
    return filterAndSortBySearch(persons, q, (p) => (p.notes ? [p.notes] : [])).slice(0, 25);
  }, [persons, branchSearch]);

  // Candidate existing higher grandfathers/fathers (males not in person's descendants)
  const candidateFathers = useMemo(() => {
    const males = persons.filter((p) => p.gender === 'male' && !descendantIds.has(p.id));
    const q = existingSearch.trim();
    if (!q) {
      return [...males].sort((a, b) => {
        const aIsRoot = treeRootIds.has(a.id) ? 1 : 0;
        const bIsRoot = treeRootIds.has(b.id) ? 1 : 0;
        if (aIsRoot !== bIsRoot) return bIsRoot - aIsRoot;
        return comparePersonsMalesFirstAlphabetical(a, b);
      });
    }
    return filterAndSortBySearch(males, q, (p) => (p.notes ? [p.notes] : []));
  }, [persons, descendantIds, existingSearch, treeRootIds]);

  const selectedExistingFather = useMemo(
    () => persons.find(p => p.id === existingFatherId) || null,
    [persons, existingFatherId]
  );

  // Resolve the effective chain of new ancestors (from direct father up to highest new grandfather)
  const resolvedNewChain = useMemo(() => {
    const sourceArray = mode === 'new' ? ancestorLevels : intermediateLevels;
    const result: string[] = [];
    for (const raw of sourceArray) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (splitCompoundName && /\s+(?:بن|بنت|ابن)\s+/i.test(trimmed)) {
        result.push(...splitLineageChain(trimmed));
      } else {
        result.push(extractGivenName(trimmed) || trimmed);
      }
    }
    return result;
  }, [mode, ancestorLevels, intermediateLevels, splitCompoundName]);

  // Detect if highest typed ancestor matches an existing root/person in another tree
  const matchingExistingRoots = useMemo(() => {
    if (mode !== 'new' || resolvedNewChain.length === 0 || !person) return [];
    const topName = resolvedNewChain[resolvedNewChain.length - 1];
    if (!topName || topName.length < 2) return [];
    const normQ = normalizeArabic(topName);
    return treeRoots.filter(
      r =>
        r.id !== person.id &&
        !descendantIds.has(r.id) &&
        (normalizeArabic(r.fullName) === normQ ||
          normalizeArabic(extractGivenName(r.fullName)) === normQ)
    );
  }, [mode, resolvedNewChain, treeRoots, person, descendantIds]);

  // Compute simulated full names for the ancestor chain, the moved person, and his descendants
  const simulationPreview = useMemo(() => {
    if (!person) return null;

    let topAnchorName = '';
    if (mode === 'existing') {
      if (!selectedExistingFather) return null;
      topAnchorName = selectedExistingFather.fullName;
    } else {
      if (resolvedNewChain.length === 0) return null;
      if (currentFather && keepCurrentFatherAsTop) {
        topAnchorName = currentFather.fullName;
      }
    }

    // Build ancestor fullNames from top down to direct father
    const chainTopDown: { givenName: string; fullName: string; roleLabel: string }[] = [];
    let runningParentFullName = topAnchorName;

    for (let i = resolvedNewChain.length - 1; i >= 0; i--) {
      const gName = resolvedNewChain[i];
      const fName = runningParentFullName
        ? rebuildChildFullName(gName, 'male', runningParentFullName)
        : gName;
      const roleLabel =
        i === 0
          ? 'الأب المباشر'
          : i === 1
          ? 'الجد الأعلى'
          : `الجد الأعلى (${i + 1})`;
      chainTopDown.push({ givenName: gName, fullName: fName, roleLabel });
      runningParentFullName = fName;
    }

    const directFatherFullName = runningParentFullName;
    if (!directFatherFullName) return null;

    const newPersonFullName = updateDescendantsNames
      ? rebuildChildFullName(person.fullName, person.gender, directFatherFullName)
      : person.fullName;

    // Simulate descendant updates (first 6 for preview display)
    const simulatedNamesMap = new Map<string, string>();
    simulatedNamesMap.set(person.id, newPersonFullName);

    const sampleDescendantChanges: { id: string; oldName: string; newName: string; gender: 'male' | 'female' }[] = [];
    for (const desc of descendantPersons) {
      const parentNewName = desc.fatherId ? simulatedNamesMap.get(desc.fatherId) : undefined;
      const dNew =
        updateDescendantsNames && parentNewName
          ? rebuildChildFullName(desc.fullName, desc.gender, parentNewName)
          : desc.fullName;
      simulatedNamesMap.set(desc.id, dNew);
      if (sampleDescendantChanges.length < 6) {
        sampleDescendantChanges.push({
          id: desc.id,
          oldName: desc.fullName,
          newName: dNew,
          gender: desc.gender
        });
      }
    }

    return {
      topAnchorName,
      chainTopDown,
      directFatherFullName,
      newPersonFullName,
      sampleDescendantChanges,
      totalDescendantsCount: descendantPersons.length
    };
  }, [
    person,
    mode,
    selectedExistingFather,
    resolvedNewChain,
    currentFather,
    keepCurrentFatherAsTop,
    updateDescendantsNames,
    descendantPersons
  ]);

  if (!isOpen || !person) return null;

  const handleUpdateLevel = (index: number, value: string, isIntermediate: boolean = false) => {
    if (isIntermediate) {
      setIntermediateLevels(prev => prev.map((v, i) => (i === index ? value : v)));
    } else {
      setAncestorLevels(prev => prev.map((v, i) => (i === index ? value : v)));
    }
  };

  const handleAddLevel = (isIntermediate: boolean = false) => {
    if (isIntermediate) {
      setIntermediateLevels(prev => [...prev, '']);
    } else {
      setAncestorLevels(prev => [...prev, '']);
    }
  };

  const handleRemoveLevel = (index: number, isIntermediate: boolean = false) => {
    if (isIntermediate) {
      setIntermediateLevels(prev => prev.filter((_, i) => i !== index));
    } else {
      if (ancestorLevels.length <= 1) return;
      setAncestorLevels(prev => prev.filter((_, i) => i !== index));
    }
  };

  const executeSave = async (keepOpenForHigherAncestor: boolean) => {
    setErrorMessage(null);
    setSuccessNotice(null);

    if (mode === 'new') {
      if (resolvedNewChain.length === 0) {
        setErrorMessage('يرجى إدخال اسم الأب / الجد الأعلى (مثال: راشد أو راشد بن عبدالله)');
        return;
      }
    } else {
      if (!existingFatherId || !selectedExistingFather) {
        setErrorMessage('يرجى اختيار الجد الأعلى / الأب الموجود من القائمة لنقل هذا الابن وفروعه إليه');
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await onSubmit(person.id, {
        fullName:
          mode === 'new'
            ? resolvedNewChain.join(' بن ')
            : selectedExistingFather!.fullName,
        ancestorChain: resolvedNewChain,
        notes: mode === 'new' || resolvedNewChain.length > 0 ? notes : undefined,
        grandFatherId: null,
        existingFatherId: mode === 'existing' ? existingFatherId : null,
        splitCompoundName,
        keepCurrentFatherAsTop: mode === 'new' && currentFather ? keepCurrentFatherAsTop : false,
        updateDescendantsNames
      });

      const topCreated = res ? res.highestAncestor || res.father : null;

      if (keepOpenForHigherAncestor && res && topCreated && onSelectTargetPerson) {
        setAncestorLevels(['']);
        setIntermediateLevels([]);
        setNotes('');
        setExistingFatherId('');
        setSuccessNotice(
          `تم نقل/ربط «${res.child.fullName}» وفروعه بنجاح تحت «${topCreated.fullName}»! يمكنك الآن إضافة جد أعلى فوق «${topCreated.fullName}».`
        );
        onSelectTargetPerson(topCreated);
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء نقل الفرع وإضافة الجد الأعلى');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSave(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white flex items-start sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0">
              <ArrowUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold font-display leading-snug">
                نقل الابن وفروعه إلى الجد الأعلى / إضافة جد أو أكثر من جد
              </h3>
              <p className="text-[11px] text-white/80 leading-relaxed mt-0.5">
                تحديث مواقع الابن وجميع أبنائه وأحفاده تلقائياً حسب التسلسل الصحيح والعلاقات الصحيحة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Selected Son / Branch Banner + Switcher */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-[#FBF9F5] border border-slate-200/90 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  <Users className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-slate-500 block font-semibold">
                    الابن / الأب المراد نقله مع فروعه:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <strong className="text-xs sm:text-sm font-bold text-[#0F4C3A] leading-snug break-words">
                      «{person.fullName}»
                    </strong>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold">
                      ينتقل معه تلقائياً: {descendantPersons.length} من الأبناء والأحفاد
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:flex items-center gap-1.5 w-full sm:w-auto">
                {onSelectTargetPerson && (
                  <button
                    type="button"
                    onClick={() => setShowBranchSwitcher(!showBranchSwitcher)}
                    className="min-h-[36px] text-[11px] font-bold text-[#0F4C3A] bg-white hover:bg-emerald-50 px-3 py-1.5 rounded-xl border border-slate-200 transition text-center"
                  >
                    {showBranchSwitcher ? 'إخفاء قائمة الاختيار' : 'تغيير الابن / الفرع المختار'}
                  </button>
                )}
                {onOpenMergeModal && treeRoots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenMergeModal();
                    }}
                    className="min-h-[36px] text-[11px] font-bold text-[#8C6D1F] bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1 transition"
                  >
                    <GitMerge className="w-3.5 h-3.5 shrink-0" />
                    <span>دمج الأشجار</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Root Pills */}
            {treeRoots.length > 1 && onSelectTargetPerson && !showBranchSwitcher && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500">أصول الأشجار الحالية:</span>
                {treeRoots.map(root => {
                  const isSelected = root.id === person.id;
                  return (
                    <button
                      key={root.id}
                      type="button"
                      onClick={() => {
                        setSuccessNotice(null);
                        onSelectTargetPerson(root);
                      }}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition border leading-snug break-words text-right ${
                        isSelected
                          ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#0F4C3A]/40'
                      }`}
                    >
                      {root.fullName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Searchable Branch Switcher for ANY Son/Father in the tree */}
            {showBranchSwitcher && onSelectTargetPerson && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={branchSearch}
                    onChange={e => setBranchSearch(e.target.value)}
                    placeholder="ابحث عن أي ابن أو أب في الشجرة لنقله مع فروعه..."
                    className="w-full h-10 pr-8 pl-3 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {switchableBranches.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTargetPerson(item);
                        setShowBranchSwitcher(false);
                        setBranchSearch('');
                      }}
                      className={`w-full text-right px-3 py-2.5 text-xs flex items-start sm:items-center justify-between gap-2 transition ${
                        item.id === person.id
                          ? 'bg-[#0F4C3A] text-white font-bold'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span className="leading-snug break-words flex-1">{formatDropdownName(item.fullName)}</span>
                      <span className="text-[10px] opacity-75 shrink-0">
                        {treeRootIds.has(item.id) ? 'أصل شجرة' : 'فرع في الشجرة'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {successNotice && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-start gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed break-words">{successNotice}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Mode Tabs: 1. Add 1 or More New Higher Grandfathers vs 2. Move Son & Branches to Existing Higher Grandfather */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                mode === 'new'
                  ? 'bg-white text-[#0F4C3A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>إضافة جد أعلى أو أكثر من جد (جديد)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                mode === 'existing'
                  ? 'bg-white text-[#0F4C3A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5 shrink-0" />
              <span>نقل الابن وفروعه إلى جد أعلى موجود</span>
            </button>
          </div>

          {/* Current Father handling when in 'new' mode */}
          {currentFather && mode === 'new' && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <strong className="leading-snug break-words">
                  الأب المسجل حالياً لـ «{extractGivenName(person.fullName)}» هو: ({formatAppName(currentFather.fullName)})
                </strong>
                {onSelectTargetPerson && (
                  <button
                    type="button"
                    onClick={() => onSelectTargetPerson(currentFather)}
                    className="min-h-[34px] px-3 py-1.5 rounded-xl bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-bold text-[11px] transition leading-snug break-words text-center"
                  >
                    الانتقال لإضافة جد فوق ({formatAppName(currentFather.fullName)})
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                <label className="flex items-start gap-2 cursor-pointer text-[11px] font-semibold">
                  <input
                    type="radio"
                    checked={!keepCurrentFatherAsTop}
                    onChange={() => setKeepCurrentFatherAsTop(false)}
                    className="mt-0.5 text-[#0F4C3A]"
                  />
                  <span className="leading-snug">نقل الابن وفروعه ليكون تحت الجد الجديد مباشرة</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-[11px] font-semibold">
                  <input
                    type="radio"
                    checked={keepCurrentFatherAsTop}
                    onChange={() => setKeepCurrentFatherAsTop(true)}
                    className="mt-0.5 text-[#0F4C3A]"
                  />
                  <span className="leading-snug">إدراج الأب/الجد الجديد بين ({extractGivenName(person.fullName)}) وبين ({formatAppName(currentFather.fullName)})</span>
                </label>
              </div>
            </div>
          )}

          {mode === 'new' ? (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-[11px] text-emerald-950 leading-relaxed">
                يمكنك إدخال <strong>جد أعلى واحد أو أكثر من جد</strong> بالتسلسل (سواء بكتابة السلسلة مثل: <strong>راشد بن عبدالله بن عامر</strong>، أو بإضافة خانات متعددة لكل جد)، وسيقوم النظام تلقائياً بإنشاء الأجداد بالترتيب الصحيح ونقل «{extractGivenName(person.fullName)}» وجميع أبنائه وأحفاده تحتهم.
              </div>

              {/* Multi-Ancestor Inputs */}
              <div className="space-y-2.5">
                {ancestorLevels.map((val, idx) => {
                  const labelText =
                    idx === 0
                      ? `1. الأب المباشر / الجد الأول فوق «${extractGivenName(person.fullName)}»`
                      : idx === 1
                      ? `2. الجد الأعلى (أبُ ${extractGivenName(ancestorLevels[0] || 'الأب')})`
                      : `${idx + 1}. الجد الأعلى التالي في السلسلة`;

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-700 leading-snug">
                          {labelText} {idx === 0 && <span className="text-red-500">*</span>}
                        </label>
                        {ancestorLevels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLevel(idx, false)}
                            className="text-[11px] text-red-600 hover:underline flex items-center gap-1 shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>إزالة</span>
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={val}
                        onChange={e => handleUpdateLevel(idx, e.target.value, false)}
                        placeholder={
                          idx === 0
                            ? 'مثال: راشد (أو اكتب السلسلة كاملة: راشد بن عبدالله بن عامر)'
                            : 'مثال: عبدالله'
                        }
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                      />
                    </div>
                  );
                })}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAddLevel(false)}
                    className="min-h-[38px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-xs font-bold transition inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>+ إضافة جد أعلى آخر فوقه (إدخال أكثر من جد)</span>
                  </button>

                  {ancestorLevels.some(v => /\s+(?:بن|بنت|ابن)\s+/i.test(v)) && (
                    <label className="flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={splitCompoundName}
                        onChange={e => setSplitCompoundName(e.target.checked)}
                        className="mt-0.5 rounded text-[#0F4C3A]"
                      />
                      <span className="leading-snug">تفكيك الأسماء المركبة بـ «بن» إلى درجات أجداد متسلسلة تلقائياً</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Smart alert if highest ancestor matches an existing root */}
              {matchingExistingRoots.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-[#D4AF37] text-xs text-amber-950 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#8C6D1F]">
                    <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
                    <span>تم رصد جد أعلى مطابق بالاسم في شجرة أخرى!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed break-words">
                    يوجد بالفعل أصل باسم <strong>«{matchingExistingRoots[0].fullName}»</strong>. يمكنك نقل «{person.fullName}» وفروعه مباشرة إلى ذلك الجد الأعلى لتوحيد الفرعين فوراً:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const intermediate = resolvedNewChain.slice(0, -1);
                      setMode('existing');
                      setExistingFatherId(matchingExistingRoots[0].id);
                      if (intermediate.length > 0) {
                        setIntermediateLevels(intermediate);
                      }
                    }}
                    className="w-full sm:w-auto min-h-[38px] px-3 py-2 rounded-xl bg-[#0F4C3A] text-white text-[11px] font-bold hover:bg-[#0c3c2e] transition inline-flex items-center justify-center gap-1.5"
                  >
                    <GitMerge className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                    <span className="leading-snug break-words">نقل مباشر إلى الجد الأعلى الموجود ({matchingExistingRoots[0].fullName})</span>
                  </button>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  ملاحظات عن الجد الأعلى (اختياري)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: الجد الجامع للفروع..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-[11px] text-emerald-950 leading-relaxed">
                اختر <strong>الجد الأعلى (أو الأب)</strong> الموجود في الشجرة لنقل «{extractGivenName(person.fullName)}» وجميع أبنائه وأحفاده إليه، مع إمكانية إضافة آباء/أجداد وسطاء بينهما إذا كان بينهما أكثر من جد.
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  1. ابحث واختر الجد الأعلى / الأب المستهدف من الشجرة:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={existingSearch}
                    onChange={e => setExistingSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو بجزء غير متتالٍ من الاسم (مثال: راشد أو مح زا)..."
                    className="w-full h-11 pr-9 pl-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white">
                {candidateFathers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    لا يوجد جد / أصل مطابق للبحث
                  </div>
                ) : (
                  candidateFathers.map(cand => {
                    const isRoot = treeRootIds.has(cand.id);
                    const isSelected = existingFatherId === cand.id;
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => setExistingFatherId(cand.id)}
                        className={`w-full text-right p-3 text-xs transition flex items-start sm:items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#0F4C3A] text-white font-bold'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span className="leading-snug break-words flex-1">{formatDropdownName(cand.fullName)}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                            isSelected
                              ? 'bg-[#D4AF37] text-[#072A20]'
                              : isRoot
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isRoot ? 'أصل شجرة / جد أعلى' : 'أب / فرع'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Optional Intermediate Fathers between the moved Son and the Selected Higher Grandfather */}
              {selectedExistingFather && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700 leading-snug">
                      هل يوجد أب أو جد وسيط بين «{extractGivenName(person.fullName)}» وبين الجد الأعلى «{extractGivenName(selectedExistingFather.fullName)}»؟
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddLevel(true)}
                      className="min-h-[34px] px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-[#0F4C3A] border border-emerald-200 text-[11px] font-bold transition inline-flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      <span>+ إضافة أب / جد وسيط بينهما</span>
                    </button>
                  </div>

                  {intermediateLevels.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {intermediateLevels.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={val}
                            onChange={e => handleUpdateLevel(idx, e.target.value, true)}
                            placeholder={
                              idx === 0
                                ? `الأب المباشر لـ «${extractGivenName(person.fullName)}» (أو سلسلة آباء بـ بن)`
                                : `الجد الوسيط رقم ${idx + 1}`
                            }
                            className="flex-1 h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveLevel(idx, true)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 transition shrink-0"
                            title="حذف الوسيط"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Live Hierarchy, Positions & Automatic Descendant Names Preview */}
          {simulationPreview && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FBF9F5] border-2 border-[#0F4C3A]/25 space-y-3 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-[#0F4C3A] flex items-center gap-1.5">
                  <Network className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span>معاينة التسلسل الجديد والمواقع بعد النقل التلقائي:</span>
                </span>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full">
                  تحديث تلقائي لـ {simulationPreview.totalDescendantsCount + 1} فرد في هذا الفرع
                </span>
              </div>

              {/* Visual Chain of Ancestors -> Moved Son -> Branches */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 flex-wrap text-[11px]">
                {simulationPreview.topAnchorName && (
                  <>
                    <span className="px-2.5 py-1 rounded-lg bg-[#5C3A21] text-white font-bold leading-snug break-words">
                      الجد الأعلى: {simulationPreview.topAnchorName}
                    </span>
                    <span className="text-slate-400 font-bold">⬅️</span>
                  </>
                )}
                {simulationPreview.chainTopDown.map((anc, idx) => (
                  <React.Fragment key={idx}>
                    <span className="px-2.5 py-1 rounded-lg bg-[#0F4C3A] text-white font-bold leading-snug break-words">
                      {anc.roleLabel}: {anc.fullName}
                    </span>
                    <span className="text-slate-400 font-bold">⬅️</span>
                  </React.Fragment>
                ))}
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold leading-snug break-words">
                  الابن المنقول: {simulationPreview.newPersonFullName}
                </span>
                {simulationPreview.totalDescendantsCount > 0 && (
                  <>
                    <span className="text-slate-400 font-bold">⬅️</span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-bold">
                      جميع أبنائه وفروعه ({simulationPreview.totalDescendantsCount})
                    </span>
                  </>
                )}
              </div>

              {/* Sample Preview of Automatic Name Updates for Son & His Branches */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-slate-700">
                  التعديل التلقائي للأسماء والمواقع والعلاقات (الابن وفروعه):
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-0.5">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                    <span className="text-slate-500 line-through leading-snug break-words">
                      {person.fullName}
                    </span>
                    <span className="text-emerald-700 font-bold leading-snug break-words">
                      ⬅️ {simulationPreview.newPersonFullName}
                    </span>
                  </div>
                  {simulationPreview.sampleDescendantChanges.map(item => (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl bg-white/80 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]"
                    >
                      <span className="text-slate-400 line-through leading-snug break-words">
                        {item.oldName}
                      </span>
                      <span className="text-[#0F4C3A] font-bold leading-snug break-words">
                        ⬅️ {item.newName}
                      </span>
                    </div>
                  ))}
                  {simulationPreview.totalDescendantsCount > 6 && (
                    <div className="text-[10px] text-slate-500 text-center pt-1 font-semibold">
                      + {simulationPreview.totalDescendantsCount - 6} من الأبناء والأحفاد الآخرين سيتم تحديث مواقعهم وأسمائهم وعلاقاتهم تلقائياً
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 pt-2 border-t border-slate-200/70 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateDescendantsNames}
                  onChange={e => setUpdateDescendantsNames(e.target.checked)}
                  className="mt-0.5 rounded text-[#0F4C3A] focus:ring-[#0F4C3A]"
                />
                <span className="text-[11px] text-slate-700 leading-relaxed">
                  تحديث أسماء الابن وجميع أبنائه وأحفاده تلقائياً حسب التسلسل الجديد مع ضبط جميع العلاقات (الأجداد، الأعمام، العمات، الإخوة، الأخوال)
                </span>
              </label>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              إلغاء
            </button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {mode === 'new' && onSelectTargetPerson && (
                <button
                  type="button"
                  disabled={submitting || resolvedNewChain.length === 0}
                  onClick={() => executeSave(true)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold border border-[#0F4C3A] text-[#0F4C3A] hover:bg-[#0F4C3A]/10 transition disabled:opacity-40 flex items-center justify-center gap-1"
                  title="حفظ ثم البقاء في النافذة لإضافة جد أعلى آخر فوق الجد الجديد"
                >
                  <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                  <span>حفظ ثم إضافة جد أعلى فوقه</span>
                </button>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  (mode === 'new' ? resolvedNewChain.length === 0 : !existingFatherId)
                }
                className="min-h-[42px] px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition disabled:opacity-50"
              >
                {submitting
                  ? 'جارٍ النقل وتحديث التسلسل...'
                  : mode === 'existing'
                  ? 'نقل الابن وفروعه إلى الجد الأعلى وحفظ'
                  : 'اعتماد الجد الأعلى وتحديث التسلسل'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};


