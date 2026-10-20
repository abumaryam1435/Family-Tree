import React, { useState, useMemo } from 'react';
import {
  User,
  Users,
  Layers,
  Printer,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Search,
  ExternalLink,
  TreeDeciduous,
  Share2
} from 'lucide-react';
import { Person } from '../types/family';
import {
  advancedArabicMatch,
  comparePersonsMalesFirstAlphabetical
} from '../utils/nameUtils';

interface LineageViewProps {
  persons: Person[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
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
  getPerson,
  getChildren,
  getAncestors,
  getLineageString,
  onPrintPerson
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Determine active person to inspect
  const activePerson = useMemo(() => {
    if (selectedPersonId) {
      return getPerson(selectedPersonId) || persons[0] || null;
    }
    return persons[0] || null;
  }, [selectedPersonId, persons, getPerson]);

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
    if (!searchTerm.trim()) return [];
    return persons
      .filter(p => advancedArabicMatch(p.fullName, searchTerm, [getLineageString(p.id)]))
      .sort(comparePersonsMalesFirstAlphabetical)
      .slice(0, 12);
  }, [persons, searchTerm, getLineageString]);

  if (!activePerson) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-500">
        <Layers className="w-10 h-10 mx-auto text-[#0F4C3A] mb-3 opacity-60" />
        <p className="font-semibold text-sm">يرجى اختيار شخص من قائمة الأفراد لعرض مسار نسبه الصاعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Selector Card */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex-1 relative">
          <label className="text-xs font-bold text-slate-600 block mb-1">
            اختر فرداً لعرض مسار نسبه الصاعد وفروعه:
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم لتغيير الفرد المعروض..."
              className="w-full h-10 pr-9 pl-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          {filteredPersons.length > 0 && (
            <div className="absolute top-16 right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {filteredPersons.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectPerson(p.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-right p-2 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-800 flex items-center justify-between"
                >
                  <span>{p.fullName}</span>
                  <span className="text-[10px] text-slate-400">
                    {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Print / Action CTA */}
        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            onClick={() => onPrintPerson(activePerson.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] text-xs font-bold transition shadow-xs"
          >
            <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>طباعة صك النسب</span>
          </button>
        </div>
      </div>

      {/* Lineage Certificate Banner */}
      <div className="bg-gradient-to-r from-[#0F4C3A] via-[#0A3A2C] to-[#0F4C3A] text-white p-6 sm:p-8 rounded-3xl border-2 border-[#D4AF37]/40 shadow-lg text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/15 rounded-full blur-xl pointer-events-none" />
        <div className="text-[11px] font-bold text-[#F5E6B8] uppercase tracking-wider mb-2">
          سلسلة النسب الصاعد الموثقة
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-display text-white max-w-2xl mx-auto leading-relaxed">
          « {lineageString} »
        </h2>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-300">
          <span>الجيل المسجل: {ancestors.length + 1}</span>
          <span>·</span>
          <span>الأصل: {ancestors[ancestors.length - 1]?.fullName || activePerson.fullName}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: The Ascending Stepper */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
          <h3 className="text-base font-bold text-[#0F4C3A] font-display flex items-center gap-2 mb-6">
            <ArrowUp className="w-5 h-5 text-[#D4AF37]" />
            سلسلة الأجداد الصاعدة (من الفرد صعوداً إلى الجد الأعلى)
          </h3>

          <div className="space-y-6 relative before:absolute before:right-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-[#0F4C3A]/20">
            {/* 1. Selected Person Node */}
            <div className="relative flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center shrink-0 shadow-md ring-4 ring-[#FBF9F5] z-10">
                <User className="w-6 h-6" />
              </div>

              <div className="flex-1 bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    الفرد المختار
                  </span>
                  {activePerson.gender === 'female' && activePerson.husbandName && (
                    <span className="text-xs text-rose-700 font-bold">
                      زوجة: {activePerson.husbandName}
                    </span>
                  )}
                </div>
                <h4 className="text-base font-bold text-slate-900">{activePerson.fullName}</h4>
                {activePerson.notes && (
                  <p className="text-xs text-slate-600 mt-1">{activePerson.notes}</p>
                )}
              </div>
            </div>

            {/* 2. Ancestors in ascending order */}
            {ancestors.map((anc, idx) => (
              <div key={anc.id} className="relative flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border-2 border-[#0F4C3A] text-[#0F4C3A] flex items-center justify-center shrink-0 shadow-sm ring-4 ring-[#FBF9F5] z-10">
                  <span className="text-xs font-bold tabular-nums">{idx + 1}</span>
                </div>

                <div
                  onClick={() => onSelectPerson(anc.id)}
                  className="flex-1 bg-white border border-slate-200/80 hover:border-[#0F4C3A]/50 p-4 rounded-2xl cursor-pointer transition group shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500">
                      {idx === 0
                        ? 'الأب المباشر'
                        : idx === 1
                        ? 'الجد'
                        : idx === 2
                        ? 'جد الأب'
                        : `الجد (المستوى ${idx + 1})`}
                    </span>
                    <span className="text-[11px] text-[#0F4C3A] group-hover:underline font-semibold flex items-center gap-1">
                      <span>عرض نسبه</span>
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0F4C3A] transition">
                    {anc.fullName}
                  </h4>
                  {anc.notes && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{anc.notes}</p>
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

        {/* Right Col: Descendants / Children of this Person */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0F4C3A] font-display flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D4AF37]" />
              الأبناء والفروع ({children.length})
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
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onSelectPerson(child.id)}
                  className="w-full text-right p-3 rounded-xl border border-slate-200/70 hover:border-[#0F4C3A]/40 bg-slate-50/50 hover:bg-white transition flex items-center justify-between group"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A] block">
                      {child.fullName}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      {child.gender === 'male' ? 'ابن' : 'ابنة'}
                      {child.gender === 'female' && child.husbandName ? ` · زوجة ${child.husbandName}` : ''}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-[#0F4C3A] transition" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
