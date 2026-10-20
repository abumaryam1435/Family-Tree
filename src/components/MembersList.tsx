import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  User,
  ArrowUpDown,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  GitFork,
  Printer,
  ArrowUp,
  FileDown
} from 'lucide-react';
import { Person } from '../types/family';
import {
  advancedArabicMatch,
  comparePersonsMalesFirstAlphabetical
} from '../utils/nameUtils';
import { exportMembersListToPdf } from '../utils/pdfExport';

interface MembersListProps {
  persons: Person[];
  onSelectPerson: (id: string) => void;
  onOpenAddModal: () => void;
  onOpenEditModal: (person: Person) => void;
  onOpenAddFather?: (personId: string) => void;
  onDeletePerson: (id: string) => void;
  onToggleGender?: (id: string) => void;
  onPrintPerson: (id: string) => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  getPerson: (id: string) => Person | undefined;
  getChildren: (id: string) => Person[];
  getAncestors: (id: string) => Person[];
}

export const MembersList: React.FC<MembersListProps> = ({
  persons,
  onSelectPerson,
  onOpenAddModal,
  onOpenEditModal,
  onOpenAddFather,
  onDeletePerson,
  onToggleGender,
  onPrintPerson,
  editingEnabled,
  isAdmin,
  getPerson,
  getChildren,
  getAncestors
}) => {
  const [search, setSearch] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'newest'>('name');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const filteredPersons = useMemo(() => {
    return persons
      .filter((p) => {
        // Gender filter
        if (genderFilter !== 'all' && p.gender !== genderFilter) return false;
        // Advanced Search (supports partial non-consecutive parts like "مح زا سع")
        if (search.trim()) {
          const father = p.fatherId ? getPerson(p.fatherId)?.fullName || '' : '';
          const ancestorsNames = getAncestors(p.id).map(a => a.fullName).join(' ');
          return advancedArabicMatch(p.fullName, search, [
            father,
            ancestorsNames,
            p.husbandName || '',
            p.notes || ''
          ]);
        }
        return true;
      })
      .sort((a, b) => {
        // Always sort Males first then Females, and alphabetically within each group
        if (sortBy === 'newest') {
          if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return comparePersonsMalesFirstAlphabetical(a, b);
      });
  }, [persons, genderFilter, search, sortBy, getPerson, getAncestors]);

  return (
    <div className="space-y-6">
      {/* Header & Controls Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#0F4C3A] font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              قائمة أفراد العائلة ({filteredPersons.length} من {persons.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              استعراض شامل لجميع المسجلين مع سلاسل الآباء والأجداد وإمكانية الإدارة المباشرة
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex items-center gap-2 w-full sm:w-auto">
            {filteredPersons.length > 0 && (
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={async () => {
                  setIsExportingPdf(true);
                  try {
                    await exportMembersListToPdf({
                      persons: filteredPersons,
                      getPerson,
                      getChildren
                    });
                  } finally {
                    setIsExportingPdf(false);
                  }
                }}
                className="min-h-[42px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs bg-amber-50 hover:bg-amber-100 text-[#8C6D1F] border border-[#D4AF37]/50 cursor-pointer disabled:opacity-60"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                <span>{isExportingPdf ? 'جارٍ التصدير...' : 'تصدير القائمة PDF'}</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={onOpenAddModal}
                className="min-h-[42px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>إضافة فرد جديد</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الأب أو المواليد..."
              className="w-full h-11 pr-9 pl-3 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
          </div>

          {/* Gender Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setGenderFilter('all')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                genderFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({persons.length})
            </button>
            <button
              onClick={() => setGenderFilter('male')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                genderFilter === 'male'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الذكور
            </button>
            <button
              onClick={() => setGenderFilter('female')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                genderFilter === 'female'
                  ? 'bg-white text-rose-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الإناث
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">الترتيب:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-800 px-3 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
            >
              <option value="name">أبجدياً (أ - ي)</option>
              <option value="newest">الأحدث إضافة</option>
            </select>
          </div>
        </div>
      </div>

      {/* List Items Grid / Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredPersons.length === 0 ? (
          <div className="p-10 sm:p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold">لا توجد نتائج مطابقة لبحثك</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPersons.map((person) => {
              const father = person.fatherId ? getPerson(person.fatherId) : null;
              const grandfather = father?.fatherId ? getPerson(father.fatherId) : null;
              const children = getChildren(person.id);
              const ancestors = getAncestors(person.id);

              return (
                <div
                  key={person.id}
                  className="p-4 sm:p-5 hover:bg-[#FBF9F5] transition flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4 group"
                >
                  <div className="flex items-start gap-3 sm:gap-3.5 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        person.gender === 'male'
                          ? 'bg-[#0F4C3A]/10 text-[#0F4C3A]'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => onSelectPerson(person.id)}
                          className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#0F4C3A] hover:underline transition text-right break-words leading-snug cursor-pointer"
                        >
                          {person.fullName}
                        </button>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                            person.gender === 'male'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-rose-50 text-rose-800'
                          }`}
                        >
                          {person.gender === 'male' ? 'ذكر' : 'أنثى'}
                        </span>
                        {person.gender === 'female' && person.husbandName && (
                          <span className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md font-medium break-words">
                            زوجة: {person.husbandName}
                          </span>
                        )}
                      </div>

                      {/* Branches / Children Preview so branch names fit mobile screens cleanly */}
                      {children.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-[#0F4C3A] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/70">
                            الفروع ({children.length}):
                          </span>
                          {children.slice(0, 5).map((child) => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => onSelectPerson(child.id)}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-[#0F4C3A] transition break-words text-right cursor-pointer"
                            >
                              {child.fullName}
                            </button>
                          ))}
                          {children.length > 5 && (
                            <button
                              type="button"
                              onClick={() => onSelectPerson(person.id)}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0F4C3A]"
                            >
                              +{children.length - 5} فروع أخرى
                            </button>
                          )}
                        </div>
                      )}

                      {/* Parentage string */}
                      <div className="text-xs text-slate-600 mt-1.5 flex flex-wrap items-center gap-2 break-words leading-relaxed">
                        {father ? (
                          <span>
                            الأب: <strong>{father.fullName}</strong>
                            {grandfather && (
                              <> · الجد: <strong>{grandfather.fullName}</strong></>
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded-md">
                            أصل شجرة مستقلة / جد أعلى
                          </span>
                        )}
                        {ancestors.length > 0 && (
                          <span className="text-[11px] text-slate-400">
                            (الجيل {ancestors.length + 1})
                          </span>
                        )}
                      </div>

                      {person.notes && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">{person.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto shrink-0">
                    {/* View Details */}
                    <button
                      onClick={() => onSelectPerson(person.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-[#0F4C3A] transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      title="عرض الفروع وبطاقة الفرد"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span>الفروع والتفاصيل</span>
                    </button>

                    {/* Print Lineage */}
                    <button
                      onClick={() => onPrintPerson(person.id)}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-[#0F4C3A] hover:bg-slate-200 transition cursor-pointer"
                      title="طباعة صك النسب"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Admin-Only Actions */}
                    {isAdmin && (
                      <>
                        {!person.fatherId && onOpenAddFather && (
                          <button
                            onClick={() => onOpenAddFather(person.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            title={`إضافة أصل أعلى فوق ${person.fullName}`}
                          >
                            <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                            <span>+ إضافة أصل</span>
                          </button>
                        )}

                        <button
                          onClick={() => onOpenEditModal(person)}
                          className="p-2 rounded-xl bg-slate-100 transition text-slate-600 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => onDeletePerson(person.id)}
                          className="p-2 rounded-xl bg-slate-100 transition text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="حذف الفرد"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
