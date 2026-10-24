import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  User,
  Users,
  Layers,
  Printer,
  ChevronDown,
  ArrowUp,
  Search,
  ExternalLink,
  X,
  Check,
  IdCard
} from 'lucide-react';
import { Person } from '../types/family';
import {
  comparePersonsMalesFirstAlphabetical,
  filterAndSortBySearch,
  sortPersonsMalesFirstAlphabetical,
  formatAppName,
  formatBranchName,
  formatDropdownName
} from '../utils/nameUtils';

interface LineageViewProps {
  persons: Person[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  onOpenPersonModal?: (id: string) => void;
  getPerson: (id: string) => Person | undefined;
  getChildren: (personId: string) => Person[];
  getAncestors: (personId: string) => Person[];
  getLineageString: (id: string) => string;
  onPrintPerson: (id: string) => void;
}

export const LineageView: React.FC<LineageViewProps> = ({
  persons,
  selectedPersonId,
  onSelectPerson,
  onOpenPersonModal,
  getPerson,
  getChildren,
  getAncestors,
  getLineageString,
  onPrintPerson
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const sortedPersons = useMemo(
    () => sortPersonsMalesFirstAlphabetical(persons),
    [persons]
  );

  const [internalPersonId, setInternalPersonId] = useState<string | null>(
    selectedPersonId || sortedPersons[0]?.id || null
  );

  // Sync internalPersonId if selectedPersonId prop changes from parent
  useEffect(() => {
    if (selectedPersonId) {
      setInternalPersonId(selectedPersonId);
    } else if (!internalPersonId && sortedPersons.length > 0) {
      setInternalPersonId(sortedPersons[0].id);
    }
  }, [selectedPersonId, sortedPersons, internalPersonId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opening dropdown
  useEffect(() => {
    if (isDropdownOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isDropdownOpen]);

  const handleChoosePerson = (id: string) => {
    setInternalPersonId(id);
    onSelectPerson(id);
    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  // Determine active person to inspect
  const activePerson = useMemo(() => {
    if (internalPersonId) {
      const found = getPerson(internalPersonId);
      if (found) return found;
    }
    if (selectedPersonId) {
      const found = getPerson(selectedPersonId);
      if (found) return found;
    }
    return sortedPersons[0] || null;
  }, [internalPersonId, selectedPersonId, sortedPersons, getPerson]);

  const ancestors = useMemo(() => {
    if (!activePerson) return [];
    return getAncestors(activePerson.id);
  }, [activePerson, getAncestors]);

  const children = useMemo(() => {
    if (!activePerson) return [];
    return getChildren(activePerson.id);
  }, [activePerson, getChildren]);

  const lineageString = useMemo(() => {
    if (!activePerson) return '';
    return getLineageString(activePerson.id);
  }, [activePerson, getLineageString]);

  const filteredPersons = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return sortedPersons;
    return filterAndSortBySearch(
      sortedPersons,
      q,
      (p) => [getLineageString(p.id), p.notes || ''],
      comparePersonsMalesFirstAlphabetical
    );
  }, [sortedPersons, searchTerm, getLineageString]);

  if (!activePerson) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-500">
        <Layers className="w-10 h-10 mx-auto text-[#0F4C3A] mb-3 opacity-60" />
        <p className="font-semibold text-sm">يرجى اختيار شخص من قائمة الأفراد لعرض مسار نسبه الصاعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Dropdown Selector with Search Button & Actions Card */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3.5 sm:gap-4">
        <div className="flex-1 relative" ref={dropdownContainerRef}>
          <label className="text-xs font-bold text-slate-600 block mb-2">
            اختر الاسم من القائمة لعرض فروعه ومسار نسبه الصاعد:
          </label>

          {/* Dropdown Trigger Button */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl border transition flex items-center justify-between gap-3 text-right cursor-pointer ${
              isDropdownOpen
                ? 'border-[#0F4C3A] bg-emerald-50/40 ring-2 ring-[#0F4C3A]/20'
                : 'border-slate-200 bg-slate-50/80 hover:bg-white hover:border-[#0F4C3A]/50'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  activePerson.gender === 'male'
                    ? 'bg-[#0F4C3A] text-[#D4AF37]'
                    : 'bg-rose-600 text-white'
                }`}
              >
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-400">
                  الاسم المعروض حالياً ({persons.length} فرد في القائمة):
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                  {formatDropdownName(activePerson.fullName)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  activePerson.gender === 'male'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {activePerson.gender === 'male' ? 'ذكر' : 'أنثى'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold shadow-2xs">
                <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>اختيار الاسم</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#D4AF37] transition-transform duration-200 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </span>
            </div>
          </button>

          {/* Dropdown Menu Panel with Search Bar & Search Button */}
          {isDropdownOpen && (
            <div className="absolute top-full mt-2 right-0 left-0 bg-white border-2 border-[#0F4C3A]/20 rounded-2xl shadow-2xl z-40 overflow-hidden">
              {/* Search Bar Header inside Dropdown */}
              <div className="p-3 bg-slate-50 border-b border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (listContainerRef.current) {
                          listContainerRef.current.scrollTop = 0;
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredPersons.length > 0) {
                          e.preventDefault();
                          handleChoosePerson(filteredPersons[0].id);
                        } else if (e.key === 'Escape') {
                          setIsDropdownOpen(false);
                        }
                      }}
                      placeholder="اكتب الاسم أو جزءاً منه للبحث (مثال: محمد راش مح)..."
                      className="w-full h-10 pr-9 pl-8 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          searchInputRef.current?.focus();
                        }}
                        className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute left-2.5 top-2.5 cursor-pointer"
                        title="مسح البحث"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      searchInputRef.current?.focus();
                      if (listContainerRef.current) {
                        listContainerRef.current.scrollTop = 0;
                      }
                    }}
                    className="h-10 px-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer shadow-2xs"
                  >
                    <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>بحث</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>
                    {searchTerm.trim()
                      ? `نتائج البحث المطابقة (${filteredPersons.length}) — مرتبة بالأقرب فالأقرب ثم هجائياً`
                      : `جميع الأفراد المسجلين (${filteredPersons.length}) — اختر اسماً أو ابحث أعلاه`}
                  </span>
                  {searchTerm.trim() && filteredPersons.length > 0 && (
                    <span className="text-[#0F4C3A] font-bold">
                      اضغط على الاسم لاختياره
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Dropdown List */}
              <div
                ref={listContainerRef}
                className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-1.5"
              >
                {filteredPersons.length === 0 ? (
                  <div className="py-8 px-4 text-center text-xs text-slate-400">
                    لا توجد أسماء مطابقة لنص البحث «{searchTerm}»
                  </div>
                ) : (
                  filteredPersons.map((p) => {
                    const isSelected = p.id === activePerson.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleChoosePerson(p.id)}
                        className={`w-full text-right p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-[#0F4C3A] text-white font-extrabold shadow-2xs'
                            : 'hover:bg-emerald-50/70 active:bg-emerald-100/60 text-slate-800 font-bold'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected
                                ? 'bg-[#D4AF37]'
                                : p.gender === 'male'
                                ? 'bg-emerald-600'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span className="text-xs sm:text-sm break-words leading-snug">
                            {formatDropdownName(p.fullName)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : p.gender === 'male'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-[#D4AF37]" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Print & Details Action CTAs */}
        <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
          {onOpenPersonModal && (
            <button
              type="button"
              onClick={() => onOpenPersonModal(activePerson.id)}
              className="flex-1 lg:flex-initial min-h-[48px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-[#0F4C3A]/30 bg-emerald-50/60 text-[#0F4C3A] hover:bg-emerald-100/70 active:scale-[0.99] text-xs font-bold transition cursor-pointer"
            >
              <IdCard className="w-4 h-4 text-[#0F4C3A]" />
              <span>بطاقة التفاصيل</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onPrintPerson(activePerson.id)}
            className="flex-1 lg:flex-initial min-h-[48px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] active:scale-[0.99] text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>طباعة صك النسب</span>
          </button>
        </div>
      </div>

      {/* Lineage Certificate Banner */}
      <div className="bg-gradient-to-r from-[#0F4C3A] via-[#0A3A2C] to-[#0F4C3A] text-white p-5 sm:p-8 rounded-3xl border-2 border-[#D4AF37]/40 shadow-lg text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/15 rounded-full blur-xl pointer-events-none" />
        <div className="text-[11px] font-bold text-[#F5E6B8] uppercase tracking-wider mb-2">
          سلسلة النسب الصاعد الموثقة
        </div>
        <h2 className="text-base sm:text-2xl font-bold font-display text-white max-w-2xl mx-auto leading-relaxed break-words">
          « {lineageString} »
        </h2>
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs text-slate-300">
          <span>الجيل المسجل: {ancestors.length + 1}</span>
          <span>·</span>
          <span className="break-words">الأصل: {formatBranchName(ancestors[ancestors.length - 1]?.fullName || activePerson.fullName)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Right Col (Shown First on Mobile): Descendants / Children of this Person */}
        <div className="order-1 lg:order-2 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-[#0F4C3A] font-display flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D4AF37]" />
              <span>الفروع والأبناء ({children.length})</span>
            </h3>
          </div>

          {activePerson.gender === 'female' ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed">
              <strong>ملاحظة في شجرة النسب:</strong> يُعرض نسب الإناث الصاعد إلى الآباء والأجداد، وتُسجل بيانات الزوج والقرابات دون تفرع سلاسل نسب منفصلة في الشجرة الأبوية الأساسية.
            </div>
          ) : children.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              لا يوجد أبناء مسجلون لهذا الشخص حالياً.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] sm:max-h-[500px] overflow-y-auto pr-0.5">
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => handleChoosePerson(child.id)}
                  className="w-full text-right p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 hover:border-[#0F4C3A]/40 bg-slate-50/60 hover:bg-white active:bg-slate-100 transition flex items-center justify-between gap-2.5 group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0F4C3A] block break-words leading-snug">
                      {formatBranchName(child.fullName)}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block break-words">
                      {child.gender === 'male' ? 'ابن' : 'ابنة'}
                      {child.gender === 'female' && child.husbandName ? ` · زوجة: ${formatAppName(child.husbandName)}` : ''}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-[#0F4C3A] shrink-0 transition" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Left 2 Cols: The Ascending Stepper */}
        <div className="order-2 lg:order-1 lg:col-span-2 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <h3 className="text-sm sm:text-base font-bold text-[#0F4C3A] font-display flex items-center gap-2 mb-5 sm:mb-6">
            <ArrowUp className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <span>سلسلة الأجداد الصاعدة (من الفرد صعوداً إلى الجد الأعلى)</span>
          </h3>

          <div className="space-y-4 sm:space-y-6 relative before:absolute before:right-5 sm:before:right-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-[#0F4C3A]/20">
            {/* 1. Selected Person Node */}
            <div className="relative flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center shrink-0 shadow-md ring-4 ring-[#FBF9F5] z-10">
                <User className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="flex-1 min-w-0 bg-emerald-50/70 border border-emerald-200/80 p-3.5 sm:p-4 rounded-2xl">
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    الفرد المختار
                  </span>
                  {activePerson.gender === 'female' && activePerson.husbandName && (
                    <span className="text-xs text-rose-700 font-bold break-words">
                      زوجة: {formatAppName(activePerson.husbandName)}
                    </span>
                  )}
                </div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 break-words leading-snug">
                  {lineageString || activePerson.fullName}
                </h4>
                {activePerson.notes && (
                  <p className="text-xs text-slate-600 mt-1 break-words">{activePerson.notes}</p>
                )}
              </div>
            </div>

            {/* 2. Ancestors in ascending order */}
            {ancestors.map((anc, idx) => (
              <div key={anc.id} className="relative flex items-start gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white border-2 border-[#0F4C3A] text-[#0F4C3A] flex items-center justify-center shrink-0 shadow-sm ring-4 ring-[#FBF9F5] z-10">
                  <span className="text-xs font-bold tabular-nums">{idx + 1}</span>
                </div>

                <div
                  onClick={() => handleChoosePerson(anc.id)}
                  className="flex-1 min-w-0 bg-white border border-slate-200/80 hover:border-[#0F4C3A]/50 active:bg-slate-50 p-3.5 sm:p-4 rounded-2xl cursor-pointer transition group shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-500">
                      {idx === 0
                        ? 'الأب المباشر'
                        : idx === 1
                        ? 'الجد'
                        : idx === 2
                        ? 'جد الأب'
                        : `الجد (المستوى ${idx + 1})`}
                    </span>
                    <span className="text-[11px] text-[#0F4C3A] group-hover:underline font-semibold flex items-center gap-1 shrink-0">
                      <span>عرض نسبه</span>
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0F4C3A] transition break-words leading-snug">
                    {formatBranchName(anc.fullName)}
                  </h4>
                  {anc.notes && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">{anc.notes}</p>
                  )}
                </div>
              </div>
            ))}

            {ancestors.length === 0 && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
                هذا الفرد مسجل كجد أعلى أو بداية شجرة مستقلة، ولا يوجد أب مسجل فوقه حالياً.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
