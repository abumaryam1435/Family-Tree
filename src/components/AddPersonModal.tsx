import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, User, Search, AlertCircle, Heart, Zap, Plus, CheckCircle2, ListPlus, Trash2, Network } from 'lucide-react';
import { Person, Gender } from '../types/family';
import {
  generateChildFullName,
  getPatronymicSuffix,
  advancedArabicMatch,
  scoreArabicMatch,
  sortPersonsMalesFirstAlphabetical,
  comparePersonsMalesFirstAlphabetical,
  rebuildChildFullName,
  extractGivenName,
  formatAppName,
  formatBranchName,
  formatDropdownName
} from '../utils/nameUtils';
import { getCoupleRelationship } from '../utils/kinship';

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    fullName: string;
    gender: Gender;
    fatherId?: string | null;
    husbandId?: string | null;
    husbandName?: string;
    excludedChildIds?: string[];
    childMotherAssignments?: Record<string, string | null>;
    notes?: string;
  }) => Promise<void>;
  initialFatherId?: string | null;
  persons: Person[];
  editPerson?: Person | null;
  onUpdate?: (id: string, data: any) => Promise<void>;
}

interface BatchChildItem {
  id: string;
  firstName: string;
  gender: Gender;
}

export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialFatherId,
  persons,
  editPerson,
  onUpdate
}) => {
  // Mode: 'quick' (first name + auto suffix) vs 'manual' (full name manually) vs 'batch' (multiple children at once)
  const [entryMode, setEntryMode] = useState<'quick' | 'manual' | 'batch'>('quick');

  // Single person fields
  const [firstName, setFirstName] = useState<string>('');
  const [fullName, setFullName] = useState<string>(editPerson?.fullName || '');
  const [gender, setGender] = useState<Gender>(editPerson?.gender || 'male');
  const [fatherId, setFatherId] = useState<string | null>(
    editPerson ? editPerson.fatherId : initialFatherId || null
  );
  const [husbandId, setHusbandId] = useState<string | null>(editPerson?.husbandId || null);
  const [husbandName, setHusbandName] = useState<string>(editPerson?.husbandName || '');
  const [husbandMode, setHusbandMode] = useState<'family' | 'manual'>(
    editPerson?.husbandId ? 'family' : editPerson?.husbandName ? 'manual' : 'family'
  );
  const [husbandSearch, setHusbandSearch] = useState<string>('');
  const [excludedChildIds, setExcludedChildIds] = useState<string[]>(editPerson?.excludedChildIds || []);
  const [childMotherMap, setChildMotherMap] = useState<Record<string, string | null>>({});
  const [otherMotherSearch, setOtherMotherSearch] = useState<string>('');
  const [notes, setNotes] = useState<string>(editPerson?.notes || '');

  // Batch children list
  const [batchList, setBatchList] = useState<BatchChildItem[]>([
    { id: '1', firstName: '', gender: 'male' },
    { id: '2', firstName: '', gender: 'male' }
  ]);

  const [fatherSearch, setFatherSearch] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const firstNameInputRef = useRef<HTMLInputElement>(null);

  // Sync state whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      if (editPerson) {
        setFullName(editPerson.fullName);
        setGender(editPerson.gender);
        setFatherId(editPerson.fatherId);
        setHusbandId(editPerson.husbandId || null);
        setHusbandName(editPerson.husbandName || '');
        setHusbandMode(
          editPerson.husbandId ? 'family' : editPerson.husbandName ? 'manual' : 'family'
        );
        // Initialize excludedChildIds and childMotherMap from existing data
        const initialExcluded = new Set<string>(editPerson.excludedChildIds || []);
        const initialMotherMap: Record<string, string | null> = {};
        if (editPerson.husbandId) {
          const hKids = persons.filter(p => p.fatherId === editPerson.husbandId);
          for (const k of hKids) {
            if (k.motherId && k.motherId !== editPerson.id) {
              initialExcluded.add(k.id);
              initialMotherMap[k.id] = k.motherId;
            }
          }
        }
        setExcludedChildIds(Array.from(initialExcluded));
        setChildMotherMap(initialMotherMap);
        setNotes(editPerson.notes || '');
        setFirstName('');
        setEntryMode('manual');
      } else {
        const fid = initialFatherId || null;
        setFatherId(fid);
        setFullName('');
        setFirstName('');
        setGender('male');
        setHusbandId(null);
        setHusbandName('');
        setExcludedChildIds([]);
        setChildMotherMap({});
        setNotes('');
        setEntryMode(fid ? 'quick' : 'manual');
        setBatchList([
          { id: '1', firstName: '', gender: 'male' },
          { id: '2', firstName: '', gender: 'male' }
        ]);
      }
      setErrorMessage(null);
      setSuccessNotice(null);
    }
  }, [isOpen, initialFatherId, editPerson, persons]);

  // Descendants of editPerson so we never allow picking a descendant as father
  const editPersonDescendantIds = useMemo(() => {
    if (!editPerson) return new Set<string>();
    const set = new Set<string>([editPerson.id]);
    let added = true;
    while (added) {
      added = false;
      for (const p of persons) {
        if (p.fatherId && set.has(p.fatherId) && !set.has(p.id)) {
          set.add(p.id);
          added = true;
        }
      }
    }
    return set;
  }, [editPerson, persons]);

  // Eligible fathers are only MALES (excluding editPerson and his descendants), sorted alphabetically
  const eligibleFathers = useMemo(() => {
    return sortPersonsMalesFirstAlphabetical(
      persons.filter((p) => {
        if (p.gender !== 'male') return false;
        if (editPerson && editPersonDescendantIds.has(p.id)) return false;
        return true;
      })
    );
  }, [persons, editPerson, editPersonDescendantIds]);

  const filteredFathers = useMemo(() => {
    if (!fatherSearch.trim()) return eligibleFathers.slice(0, 15);
    return eligibleFathers
      .filter(p => advancedArabicMatch(p.fullName, fatherSearch))
      .sort(comparePersonsMalesFirstAlphabetical)
      .slice(0, 15);
  }, [eligibleFathers, fatherSearch]);

  const selectedFather = useMemo(() => {
    if (!fatherId) return null;
    return persons.find(p => p.id === fatherId) || null;
  }, [fatherId, persons]);

  // Computed automatic suffix and full name for quick mode
  const patronymicSuffix = useMemo(() => {
    if (!selectedFather) return '';
    return getPatronymicSuffix(selectedFather.fullName, gender);
  }, [selectedFather, gender]);

  const generatedQuickFullName = useMemo(() => {
    if (!selectedFather) return firstName.trim();
    return generateChildFullName(firstName, selectedFather.fullName, gender);
  }, [firstName, selectedFather, gender]);

  // Eligible husbands are MALES, sorted alphabetically
  const eligibleHusbands = useMemo(() => {
    return sortPersonsMalesFirstAlphabetical(
      persons.filter((p) => p.gender === 'male')
    );
  }, [persons]);

  const filteredHusbands = useMemo(() => {
    if (!husbandSearch.trim()) return eligibleHusbands.slice(0, 25);
    const q = husbandSearch.trim();
    return eligibleHusbands
      .filter(p => {
        const f = p.fatherId ? persons.find(x => x.id === p.fatherId) : null;
        const kids = persons.filter(c => c.fatherId === p.id);
        const kidNames = kids.map(c => c.fullName).join(' ');
        return advancedArabicMatch(p.fullName, q, [f?.fullName || '', kidNames]);
      })
      .sort((a, b) => {
        const fA = persons.find(x => x.id === a.fatherId);
        const kidsA = persons.filter(c => c.fatherId === a.id).map(c => c.fullName).join(' ');
        const fB = persons.find(x => x.id === b.fatherId);
        const kidsB = persons.filter(c => c.fatherId === b.id).map(c => c.fullName).join(' ');
        const diff =
          scoreArabicMatch(b.fullName, q, [fB?.fullName || '', kidsB]) -
          scoreArabicMatch(a.fullName, q, [fA?.fullName || '', kidsA]);
        if (diff !== 0) return diff;
        return a.fullName.localeCompare(b.fullName, 'ar');
      })
      .slice(0, 30);
  }, [eligibleHusbands, husbandSearch, persons]);

  const selectedHusbandPerson = useMemo(() => {
    if (!husbandId) return null;
    return persons.find(p => p.id === husbandId) || null;
  }, [husbandId, persons]);

  // Children of the selected husband (sorted Males first then Females alphabetically)
  const husbandChildren = useMemo(() => {
    if (!selectedHusbandPerson) return [];
    return sortPersonsMalesFirstAlphabetical(
      persons.filter(p => p.fatherId === selectedHusbandPerson.id)
    );
  }, [selectedHusbandPerson, persons]);

  // This woman's brothers and sisters (who become maternal uncles "أخوال" and maternal aunts "خالات" to her non-excluded children)
  const femaleSiblings = useMemo(() => {
    if (!fatherId) return [];
    return sortPersonsMalesFirstAlphabetical(
      persons.filter(p => p.fatherId === fatherId && p.id !== editPerson?.id)
    );
  }, [fatherId, persons, editPerson]);

  const femaleBrothers = useMemo(
    () => femaleSiblings.filter(s => s.gender === 'male'),
    [femaleSiblings]
  );
  const femaleSisters = useMemo(
    () => femaleSiblings.filter(s => s.gender === 'female'),
    [femaleSiblings]
  );

  // Eligible other mothers from the family: ONLY females registered as a wife of the same husband/father, sorted alphabetically
  const eligibleOtherMothers = useMemo(() => {
    if (!husbandId) return [];
    return sortPersonsMalesFirstAlphabetical(
      persons.filter(
        p => p.gender === 'female' && p.id !== editPerson?.id && p.husbandId === husbandId
      )
    );
  }, [persons, editPerson, husbandId]);

  // Calculated genealogical kinship relation between female and chosen husband
  const coupleRelationship = useMemo(() => {
    if (gender !== 'female' || !husbandId) return null;
    return getCoupleRelationship(editPerson?.id, fatherId, husbandId, persons);
  }, [gender, husbandId, editPerson, fatherId, persons]);

  if (!isOpen) return null;

  // Save single child/person
  const handleSaveSingle = async (stayOpen: boolean = false) => {
    setErrorMessage(null);
    setSuccessNotice(null);

    const nameToSave = entryMode === 'quick' && selectedFather
      ? generatedQuickFullName
      : fullName.trim();

    if (!nameToSave) {
      setErrorMessage(
        entryMode === 'quick' && selectedFather
          ? 'يرجى كتابة الاسم الأول للابن/الابنة'
          : 'يرجى كتابة الاسم الكامل'
      );
      firstNameInputRef.current?.focus();
      return;
    }

    try {
      setSubmitting(true);
      const isFemale = gender === 'female';
      const finalHusbandId = isFemale && husbandMode === 'family' ? husbandId : null;
      let finalHusbandName = '';
      if (isFemale) {
        if (husbandMode === 'family' && selectedHusbandPerson) {
          finalHusbandName = selectedHusbandPerson.fullName;
        } else if (husbandMode === 'manual') {
          finalHusbandName = husbandName.trim();
        }
      }

      const finalExcludedChildIds = isFemale && finalHusbandId ? excludedChildIds : [];
      const childMotherAssignments: Record<string, string | null> = {};
      if (isFemale && finalHusbandId && husbandChildren.length > 0) {
        for (const ch of husbandChildren) {
          if (finalExcludedChildIds.includes(ch.id)) {
            childMotherAssignments[ch.id] = childMotherMap[ch.id] || null;
          } else if (ch.motherId && ch.motherId !== editPerson?.id) {
            // If previously assigned to another mother and now re-included for this wife
            childMotherAssignments[ch.id] = editPerson?.id || null;
          }
        }
      }

      if (editPerson && onUpdate) {
        await onUpdate(editPerson.id, {
          fullName: nameToSave,
          gender,
          notes,
          fatherId,
          husbandId: finalHusbandId,
          husbandName: finalHusbandName,
          excludedChildIds: finalExcludedChildIds,
          childMotherAssignments
        });
        onClose();
      } else {
        await onSubmit({
          fullName: nameToSave,
          gender,
          fatherId,
          husbandId: finalHusbandId,
          husbandName: finalHusbandName,
          excludedChildIds: finalExcludedChildIds,
          childMotherAssignments,
          notes
        });

        if (stayOpen) {
          // Success feedback & prepare for next child
          setSuccessNotice(`تمت إضافة (${nameToSave}) بنجاح! يمكنك إضافة الابن التالي مباشرة:`);
          setFirstName('');
          setFullName('');
          setExcludedChildIds([]);
          setChildMotherMap({});
          setTimeout(() => {
            firstNameInputRef.current?.focus();
          }, 50);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSubmitting(false);
    }
  };

  // Save batch children
  const handleSaveBatch = async () => {
    if (!selectedFather) {
      setErrorMessage('يرجى تحديد الأب أولاً لإضافة الأبناء إليه');
      return;
    }

    const validChildren = batchList.filter(item => item.firstName.trim().length > 0);
    if (validChildren.length === 0) {
      setErrorMessage('يرجى إدخال اسم واحد على الأقل في القائمة');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      for (const item of validChildren) {
        const completeName = generateChildFullName(item.firstName, selectedFather.fullName, item.gender);
        await onSubmit({
          fullName: completeName,
          gender: item.gender,
          fatherId: selectedFather.id
        });
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء إضافة الأبناء');
    } finally {
      setSubmitting(false);
    }
  };

  const isCurrentFemale = gender === 'female';

  const renderHusbandSection = () => {
    if (gender !== 'female') return null;

    return (
      <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200/90 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-rose-600 shrink-0" />
            <span>بيانات الزوج (زوجة فلان - اختياري)</span>
          </label>
          {(husbandId || husbandName) && (
            <button
              type="button"
              onClick={() => {
                setHusbandId(null);
                setHusbandName('');
              }}
              className="text-[11px] font-semibold text-red-600 hover:underline px-2 py-0.5 rounded hover:bg-red-50"
            >
              حذف الزوج
            </button>
          )}
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-white/80 rounded-xl border border-rose-200/80 text-xs">
          <button
            type="button"
            onClick={() => setHusbandMode('family')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              husbandMode === 'family'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>اختيار من رجال العائلة (بحث مباشر وصلة القرابة)</span>
          </button>
          <button
            type="button"
            onClick={() => setHusbandMode('manual')}
            className={`py-1.5 px-2.5 rounded-lg font-semibold transition ${
              husbandMode === 'manual'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>يدوي (خارج الشجرة)</span>
          </button>
        </div>

        {husbandMode === 'family' ? (
          <div className="space-y-2">
            {selectedHusbandPerson ? (
              <div className="p-3.5 rounded-2xl bg-white border border-rose-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 text-[10px] block font-medium">الزوج المختار:</span>
                    <strong className="text-rose-950 font-bold text-sm block">
                      {formatDropdownName(selectedHusbandPerson.fullName)}
                    </strong>
                    {selectedHusbandPerson.fatherId && (
                      <span className="text-[11px] text-slate-500">
                        الأب: {formatAppName(persons.find(p => p.id === selectedHusbandPerson.fatherId)?.fullName)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHusbandId(null);
                      setHusbandName('');
                    }}
                    className="text-xs font-bold text-rose-700 hover:underline bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 hover:bg-rose-100 transition"
                  >
                    تغيير الزوج
                  </button>
                </div>

                {/* Display calculated kinship relation between them */}
                {coupleRelationship && (
                  <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-amber-950 flex items-start gap-2">
                    <Network className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-amber-800 font-semibold">صلة القرابة بينهما:</span>
                        <span className="text-xs font-bold text-[#0F4C3A] bg-emerald-100/90 border border-emerald-300 px-2.5 py-0.5 rounded-md">
                          {coupleRelationship.relationToHusband}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900 mt-1 font-medium leading-relaxed">
                        {coupleRelationship.description}
                      </p>
                    </div>
                  </div>
                )}

                {/* Husband's Children & Default Motherhood / Exclusion + Maternal Uncles Section */}
                <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div>
                      <span className="text-xs font-bold text-rose-950 block">
                        أبناء هذا الزوج (تُعدّ هذه المرأة أمّاً لهم افتراضياً — {husbandChildren.filter(c => !excludedChildIds.includes(c.id)).length} من {husbandChildren.length}):
                      </span>
                      <span className="text-[10px] text-slate-600 block leading-relaxed">
                        افتراضياً تكون هذه المرأة أمّاً لأبناء هذا الرجل ويتبين إخوتها كأخوال لهم؛ ويمكنك استثناء بعض أبنائه من أن تكون هذه المرأة أمّهم (إذا كانوا من أم أخرى) بحيث لا يكون إخوتها أخوالاً للأبناء المستثنين.
                      </span>
                    </div>
                  </div>

                  {/* Preview of Maternal Uncles & Aunts (أخوال وخالات الأبناء الذين من هذه المرأة) */}
                  {(femaleBrothers.length > 0 || femaleSisters.length > 0) && (
                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/90 space-y-1.5">
                      <span className="text-[10px] font-bold text-[#0F4C3A] block">
                        أخوال وخالات الأبناء الذين من هذه المرأة (وليسوا أخوالاً لمن يتم استثناؤهم):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {femaleBrothers.map((bro) => (
                          <span
                            key={bro.id}
                            className="px-2 py-0.5 rounded-md bg-emerald-50 text-[#0F4C3A] border border-emerald-200 text-[10px] font-bold"
                          >
                            {formatAppName(bro.fullName)} (خال)
                          </span>
                        ))}
                        {femaleSisters.map((sis) => (
                          <span
                            key={sis.id}
                            className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold"
                          >
                            {formatAppName(sis.fullName)} (خالة)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {husbandChildren.length === 0 ? (
                    <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-rose-100 text-center">
                      لا يوجد أبناء مسجلون لهذا الزوج حالياً (سيتم اعتبارها أمّاً لأي أبناء يضافون له افتراضياً).
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                      {husbandChildren.map((ch) => {
                        const isExcluded = excludedChildIds.includes(ch.id);
                        const selectedOtherMotherId = childMotherMap[ch.id] || '';
                        const selectedOtherMotherObj = selectedOtherMotherId
                          ? persons.find(p => p.id === selectedOtherMotherId) || null
                          : null;
                        const otherMotherBrothers = selectedOtherMotherObj?.fatherId
                          ? sortPersonsMalesFirstAlphabetical(
                              persons.filter(
                                p =>
                                  p.fatherId === selectedOtherMotherObj.fatherId &&
                                  p.id !== selectedOtherMotherObj.id &&
                                  p.gender === 'male'
                              )
                            )
                          : [];
                        const filteredOtherMothers = otherMotherSearch.trim()
                          ? eligibleOtherMothers.filter(m => advancedArabicMatch(m.fullName, otherMotherSearch))
                          : eligibleOtherMothers;

                        return (
                          <div
                            key={ch.id}
                            className={`p-3 rounded-xl border transition space-y-2 ${
                              isExcluded
                                ? 'bg-amber-50/70 border-amber-200'
                                : 'bg-white border-emerald-200/80'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-start gap-1.5 flex-wrap min-w-0">
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold break-words leading-snug ${
                                    ch.gender === 'male'
                                      ? 'bg-emerald-50 text-[#0F4C3A] border border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {formatBranchName(ch.fullName)}
                                </span>
                                <span
                                  className={`text-[10px] font-bold self-center ${
                                    isExcluded ? 'text-amber-800' : 'text-emerald-700'
                                  }`}
                                >
                                  ({isExcluded
                                    ? ch.gender === 'male'
                                      ? 'مستثنى - من أم أخرى'
                                      : 'مستثناة - من أم أخرى'
                                    : ch.gender === 'male'
                                    ? 'ابنها افتراضياً'
                                    : 'ابنتها افتراضياً'})
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (isExcluded) {
                                    setExcludedChildIds(prev => prev.filter(id => id !== ch.id));
                                    setChildMotherMap(prev => {
                                      const next = { ...prev };
                                      delete next[ch.id];
                                      return next;
                                    });
                                  } else {
                                    setExcludedChildIds(prev => [...prev, ch.id]);
                                  }
                                }}
                                className={`w-full sm:w-auto min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer ${
                                  isExcluded
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                }`}
                              >
                                {isExcluded
                                  ? 'إلغاء الاستثناء (جعلها أمّه/أمّها)'
                                  : 'استثناء (ليست أمّه/أمّها)'}
                              </button>
                            </div>

                            {/* Show maternal uncles for included child */}
                            {!isExcluded && femaleBrothers.length > 0 && (
                              <div className="text-[10px] text-slate-600 flex items-center gap-1 flex-wrap">
                                <span className="font-bold text-[#0F4C3A]">
                                  {ch.gender === 'male' ? 'أخواله من هذه الأم:' : 'أخوالها من هذه الأم:'}
                                </span>
                                <span>{femaleBrothers.map(b => b.fullName).join('، ')}</span>
                              </div>
                            )}

                            {/* When excluded, allow selecting the child's other mother ONLY if she is a registered wife of the father from the family */}
                            {isExcluded && (
                              <div className="pt-1.5 border-t border-amber-200/70 space-y-1.5">
                                <div className="text-[10px] text-amber-800 font-medium">
                                  تم استثناؤه من أمومة هذه المرأة (إخوة هذه المرأة ليسوا أخوالاً له/لها).
                                </div>
                                {eligibleOtherMothers.length > 0 ? (
                                  <>
                                    <label className="text-[10px] font-bold text-amber-950 block">
                                      تحديد أمّه/أمّها الأخرى (من زوجات الأب المسجلات في العائلة):
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-1.5">
                                      {eligibleOtherMothers.length > 3 && (
                                        <input
                                          type="text"
                                          value={otherMotherSearch}
                                          onChange={(e) => setOtherMotherSearch(e.target.value)}
                                          placeholder="بحث في زوجات الأب..."
                                          className="sm:w-40 h-8 px-2.5 rounded-lg border border-amber-300 bg-white text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                      )}
                                      <select
                                        value={selectedOtherMotherId}
                                        onChange={(e) => {
                                          const val = e.target.value || null;
                                          setChildMotherMap(prev => ({
                                            ...prev,
                                            [ch.id]: val
                                          }));
                                        }}
                                        className="flex-1 h-8 px-2 rounded-lg border border-amber-300 bg-white text-[11px] font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      >
                                        <option value="">-- أم أخرى (غير مسجلة كزوجة للأب في العائلة) --</option>
                                        {filteredOtherMothers.map((om) => (
                                          <option key={om.id} value={om.id}>
                                            {formatDropdownName(om.fullName)} (زوجة الأب من العائلة)
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    {selectedOtherMotherObj && otherMotherBrothers.length > 0 && (
                                      <div className="text-[10px] text-emerald-800 font-semibold pt-0.5">
                                        أخواله/أخوالها من الأم المختارة ({formatBranchName(selectedOtherMotherObj.fullName)}):{' '}
                                        {otherMotherBrothers.map(b => formatAppName(b.fullName)).join('، ')}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-[10px] text-slate-600 bg-white/80 px-2.5 py-1.5 rounded-lg border border-amber-200/80">
                                    لا توجد زوجة أخرى محددة لهذا الأب من أفراد العائلة حالياً (تظهر هنا فقط من تم تحديدها كزوجة للأب).
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={husbandSearch}
                      onChange={(e) => setHusbandSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      placeholder="ابحث عن الزوج من رجال العائلة بالاسم أو والده..."
                      className="w-full h-10 pr-9 pl-3 rounded-xl border border-rose-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>

                  {/* Search Button ("زر بحث") */}
                  <button
                    type="button"
                    onClick={() => {}}
                    className="h-10 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs shrink-0"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>بحث</span>
                  </button>
                </div>

                <div className="border border-rose-200 rounded-2xl max-h-44 overflow-y-auto divide-y divide-rose-100 bg-white shadow-inner">
                  {filteredHusbands.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      لا يوجد رجال مطابقون لبحثك
                    </div>
                  ) : (
                    filteredHusbands.map((h) => {
                      const hFather = h.fatherId ? persons.find(p => p.id === h.fatherId) : null;
                      const relPreview = getCoupleRelationship(editPerson?.id, fatherId, h.id, persons);
                      return (
                        <div
                          key={h.id}
                          className="w-full p-2.5 text-xs hover:bg-rose-50/60 flex items-center justify-between gap-2 text-right transition"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{formatDropdownName(h.fullName)}</span>
                            <span className="text-[10px] text-slate-500">
                              {hFather ? `ابن: ${formatDropdownName(hFather.fullName)}` : 'أصل مستقل'}
                              {relPreview.commonAncestor && (
                                <span className="text-emerald-800 font-semibold mr-1.5">
                                  · {relPreview.relationToHusband}
                                </span>
                              )}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setHusbandId(h.id);
                              setHusbandName(h.fullName);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-800 border border-rose-200 transition shrink-0"
                          >
                            ربط كزوج
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={husbandName}
              onChange={(e) => {
                setHusbandName(e.target.value);
                setHusbandId(null);
              }}
              placeholder="مثال: فهد بن عبد العزيز الجاسر"
              className="w-full h-10 px-3.5 rounded-xl border border-rose-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              يُسجل الاسم كزوج (زوجة فلان) دون الحاجة لوجوده في شجرة العائلة الأبوية.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold font-display break-words leading-snug">
                {editPerson
                  ? 'تعديل بيانات الفرد'
                  : selectedFather
                  ? `إضافة ابن أو فرع لـ (${formatAppName(selectedFather.fullName)})`
                  : 'إضافة فرد جديد إلى شجرة العائلة'}
              </h3>
              {selectedFather && !editPerson && (
                <p className="text-[11px] text-emerald-100 font-normal">
                  إضافة سريعة بالاسم الأول مع إكمال النسب تلقائياً
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Notice for rapid continuous addition */}
        {successNotice && (
          <div className="mx-4 sm:mx-6 mt-3.5 sm:mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center gap-2 shrink-0 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold break-words">{successNotice}</span>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mx-4 sm:mx-6 mt-3.5 sm:mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="break-words">{errorMessage}</span>
          </div>
        )}

        {/* Mode Selector Tabs (only when not editing) */}
        {!editPerson && selectedFather && (
          <div className="px-4 sm:px-6 pt-3.5 sm:pt-4 shrink-0">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setEntryMode('quick')}
                className={`py-2 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  entryMode === 'quick'
                    ? 'bg-white text-[#0F4C3A] shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>الاسم الأول</span>
              </button>

              <button
                type="button"
                onClick={() => setEntryMode('batch')}
                className={`py-2 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                  entryMode === 'batch'
                    ? 'bg-white text-[#0F4C3A] shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListPlus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>دفعة أبناء</span>
              </button>

              <button
                type="button"
                onClick={() => setEntryMode('manual')}
                className={`py-2 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-semibold transition flex items-center justify-center cursor-pointer ${
                  entryMode === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>يدوي كامل</span>
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* FATHER SELECTION CARD */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              الأب في الشجرة:
            </label>

            {selectedFather ? (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-emerald-700 text-[10px] block font-semibold">
                      الأب / الجد المباشر المختار (يُنسب الابن وفروعه إليه):
                    </span>
                    <strong className="text-emerald-950 font-bold text-sm break-words leading-snug block">
                      {formatDropdownName(selectedFather.fullName)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFatherId(null);
                      setEntryMode('manual');
                      setFullName((prev) => extractGivenName(prev) || prev);
                    }}
                    className="self-start sm:self-center text-[11px] text-[#0F4C3A] bg-white hover:bg-emerald-100 border border-emerald-200 font-bold px-3 py-1.5 rounded-xl transition shrink-0 cursor-pointer"
                  >
                    {editPerson ? 'تغيير الأب / نقل الفرع لجد أعلى' : 'تغيير أو شجرة مستقلة'}
                  </button>
                </div>
                {editPerson && editPerson.fatherId !== selectedFather.id && (
                  <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-[11px] text-emerald-900 font-semibold leading-relaxed break-words">
                    سيتم تلقائياً نقل «{extractGivenName(editPerson.fullName)}» وجميع أبنائه وأحفاده تحت «{formatDropdownName(selectedFather.fullName)}» وتحديث أسمائهم وعلاقاتهم حسب التسلسل الصحيح.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={fatherSearch}
                    onChange={(e) => setFatherSearch(e.target.value)}
                    placeholder="ابحث لاختيار الأب أو الجد الأعلى لنقل الفرع إليه..."
                    className="w-full h-11 pr-9 pl-3 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                </div>

                <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setFatherId(null);
                      setEntryMode('manual');
                      setFullName((prev) => extractGivenName(prev) || prev);
                    }}
                    className="w-full text-right p-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                  >
                    + بدون أب مسجل حالياً (شجرة جديدة / بداية أصل مستقل)
                  </button>

                  {filteredFathers.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFatherId(f.id);
                        if (editPerson) {
                          setEntryMode('manual');
                          setFullName(prev => rebuildChildFullName(prev || editPerson.fullName, gender, f.fullName));
                        } else {
                          setEntryMode('quick');
                        }
                      }}
                      className="w-full text-right p-2.5 text-xs hover:bg-slate-50 flex items-center justify-between gap-2 group transition"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-[#0F4C3A] break-words leading-snug">
                        {formatDropdownName(f.fullName)}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-semibold shrink-0">
                        {editPerson ? 'نقل الفرع إليه' : 'اختيار كأب'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* TAB 1: QUICK MODE (First Name + Auto Patronomy) */}
          {/* ======================================================== */}
          {!editPerson && selectedFather && entryMode === 'quick' && (
            <div className="space-y-4 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200/80">
              
              {/* Gender selector */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  الجنس:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`h-11 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-2 ${
                      gender === 'male'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${gender === 'male' ? 'bg-white' : 'bg-emerald-600'}`} />
                    <span>ذكر (ابن)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`h-11 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-2 ${
                      gender === 'female'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${gender === 'female' ? 'bg-white' : 'bg-rose-500'}`} />
                    <span>أنثى (ابنة)</span>
                  </button>
                </div>
              </div>

              {/* First Name Input */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  الاسم الأول فقط <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstNameInputRef}
                  type="text"
                  required
                  autoFocus
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveSingle(true);
                    }
                  }}
                  placeholder="مثال: عبد الله، سارة، فيصل، نورة..."
                  className="w-full h-11 px-3.5 rounded-xl border border-emerald-300 bg-white text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                />
              </div>

              {/* Rest of Name: Automatic Preview */}
              <div className="p-3 rounded-xl bg-white border border-emerald-200/90 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">باقي الاسم (يُضاف تلقائياً للأب):</span>
                  <span className="text-emerald-800 font-semibold">{patronymicSuffix}</span>
                </div>

                <div className="pt-1.5 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 block mb-0.5">الاسم الكامل النهائي في الشجرة:</span>
                  <div className="font-bold text-[#0F4C3A] text-sm font-display leading-relaxed">
                    {firstName.trim() ? (
                      `« ${generatedQuickFullName} »`
                    ) : (
                      <span className="text-slate-300 italic font-sans font-normal">
                        اكتب الاسم الأول أعلاه لرؤية الاسم الكامل فوراً...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Optional husband if female child */}
              {gender === 'female' && (
                <div className="pt-2">
                  {renderHusbandSection()}
                </div>
              )}

              {/* Optional notes */}
              <div>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات نصية مختصرة (اختياري)..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs placeholder:text-slate-400"
                />
              </div>

              {/* Quick Actions Buttons */}
              <div className="pt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={submitting || !firstName.trim()}
                  onClick={() => handleSaveSingle(true)}
                  className="h-11 px-3 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>حفظ وإضافة ابن آخر</span>
                </button>

                <button
                  type="button"
                  disabled={submitting || !firstName.trim()}
                  onClick={() => handleSaveSingle(false)}
                  className="h-11 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <span>حفظ وإنهاء</span>
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: BATCH CHILDREN MODE (Add multiple in one click) */}
          {/* ======================================================== */}
          {!editPerson && selectedFather && entryMode === 'batch' && (
            <div className="space-y-4 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200/80">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">إضافة عدة أبناء لنفس الأب دفعة واحدة:</h4>
                  <p className="text-[11px] text-slate-500">
                    أدخل الاسم الأول لكل ابن أو ابنة، وسينسبون تلقائياً للأب ({selectedFather.fullName})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBatchList(prev => [
                      ...prev,
                      { id: Date.now().toString(), firstName: '', gender: 'male' }
                    ]);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#0F4C3A] bg-white border border-[#0F4C3A]/30 hover:bg-[#0F4C3A]/10 transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>سطر جديد</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {batchList.map((item, index) => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 w-5 text-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Gender toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setBatchList(list => list.map(x => x.id === item.id ? { ...x, gender: 'male' } : x));
                        }}
                        className={`px-2 py-1 transition ${item.gender === 'male' ? 'bg-emerald-600 text-white' : 'bg-slate-50 text-slate-600'}`}
                      >
                        ذكر
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBatchList(list => list.map(x => x.id === item.id ? { ...x, gender: 'female' } : x));
                        }}
                        className={`px-2 py-1 transition ${item.gender === 'female' ? 'bg-rose-600 text-white' : 'bg-slate-50 text-slate-600'}`}
                      >
                        أنثى
                      </button>
                    </div>

                    {/* First name */}
                    <input
                      type="text"
                      value={item.firstName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBatchList(list => list.map(x => x.id === item.id ? { ...x, firstName: val } : x));
                      }}
                      placeholder="الاسم الأول..."
                      className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                    />

                    {/* Preview suffix */}
                    <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
                      {item.gender === 'male' ? 'بن ' : 'بنت '}
                      {selectedFather.fullName.split(' ')[0]}...
                    </span>

                    {/* Delete row */}
                    {batchList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchList(list => list.filter(x => x.id !== item.id));
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={submitting || batchList.filter(b => b.firstName.trim()).length === 0}
                  onClick={handleSaveBatch}
                  className="w-full h-11 px-4 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {submitting
                      ? 'جارٍ الحفظ...'
                      : `حفظ وإضافة جميع الأبناء (${batchList.filter(b => b.firstName.trim()).length}) دفعة واحدة`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: MANUAL MODE (Full Name, root persons, editing) */}
          {/* ======================================================== */}
          {(editPerson || !selectedFather || entryMode === 'manual') && (
            <div className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {!selectedFather
                    ? 'اسم الأصل (الاسم الأول الذي قبل بن/بنت)'
                    : 'الاسم الكامل'}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={
                    !selectedFather
                      ? 'مثال: عبد الله، راشد، سالم...'
                      : 'مثال: عبد الله بن راشد بن سالم'
                  }
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                />
                {!selectedFather && /\s+(?:بن|بنت|ابن)\s+/i.test(fullName) && (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1">
                    سيتم إبقاء الاسم الأول فقط قبل بن/بنت عند حفظ الأصل: « {extractGivenName(fullName)} »
                  </p>
                )}
              </div>

              {/* Gender (Male / Female) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  الجنس <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`h-11 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-2 ${
                      gender === 'male'
                        ? 'bg-emerald-50 border-[#0F4C3A] text-[#0F4C3A] ring-2 ring-[#0F4C3A]/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span>ذكر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`h-11 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-2 ${
                      gender === 'female'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span>أنثى</span>
                  </button>
                </div>
              </div>

              {/* Advanced Field for Females: Husband ("زوجة فلان") */}
              {isCurrentFemale && renderHusbandSection()}

              {/* Notes: Plain Text */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  ملاحظات نصية (اختياري)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="أي معلومات إضافية، نبذة، ألقاب، أو تفاصيل..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSingle(false)}
                  disabled={submitting}
                  className="min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'جارٍ الحفظ...' : editPerson ? 'حفظ التعديلات' : 'إضافة الفرد'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
