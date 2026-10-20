import React from 'react';
import {
  Search,
  Users,
  GitFork,
  Layers,
  Plus,
  GitMerge,
  ArrowUpRight,
  UserCheck,
  ChevronLeft,
  Sparkles,
  TreeDeciduous,
  ShieldAlert,
  Info,
  ArrowUp
} from 'lucide-react';
import { Person } from '../types/family';

interface HomeHeroProps {
  stats: {
    totalMembers: number;
    totalMales: number;
    totalFemales: number;
    independentTreesCount: number;
    maxGenerations: number;
  };
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: Person[];
  treeRoots: Person[];
  onSelectPerson: (id: string) => void;
  onNavigateTab: (tab: 'tree' | 'lineage' | 'kinship' | 'list' | 'trees' | 'requests') => void;
  onOpenAddModal: () => void;
  onOpenMergeModal: () => void;
  onOpenAdminModal: () => void;
  onOpenAddFather?: (rootId: string) => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  getPerson: (id: string) => Person | undefined;
  getLineageString: (id: string) => string;
}

export const HomeHero: React.FC<HomeHeroProps> = ({
  stats,
  searchQuery,
  setSearchQuery,
  searchResults,
  treeRoots,
  onSelectPerson,
  onNavigateTab,
  onOpenAddModal,
  onOpenMergeModal,
  onOpenAdminModal,
  onOpenAddFather,
  editingEnabled,
  isAdmin,
  getPerson,
  getLineageString
}) => {
  return (
    <div className="space-y-6 sm:space-y-8 pb-10 sm:pb-12">
      {/* Admin Active Mode Banner (shown only when Admin is logged in) */}
      {isAdmin && (
        <div className="p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-medium border shadow-2xs bg-emerald-50/80 border-emerald-200 text-emerald-950">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
            <span>
              <strong>وضع المشرف مفعّل:</strong> يمكنك الآن الإضافة والتعديل والحذف ودمج الفروع في جميع صفحات الشجرة.
            </span>
          </div>
          <button
            onClick={onOpenAdminModal}
            className="self-end sm:self-auto text-xs underline font-bold text-[#0F4C3A] hover:opacity-80 shrink-0 py-1 px-2"
          >
            فتح لوحة التحكم
          </button>
        </div>
      )}

      {/* Main Hero Card with Arabic Luxury Aesthetic */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F4C3A] via-[#0A3A2C] to-[#06221A] text-white p-5 sm:p-10 shadow-xl border border-[#D4AF37]/30">
        {/* Subtle decorative Islamic / Arabic pattern background */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:24px_24px]" />
        
        {/* Gold Accent corner flourishes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-b from-[#D4AF37]/20 to-transparent blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-t from-[#D4AF37]/15 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#F5E6B8] text-[11px] sm:text-xs font-semibold mb-3.5 sm:mb-4 backdrop-blur-xs">
            <TreeDeciduous className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span>المنصة الرقمية الموحدة للأنساب والعائلة</span>
          </div>

          <h1 className="text-2xl sm:text-5xl font-extrabold tracking-tight text-white mb-2.5 sm:mb-3 font-display leading-tight">
            شجرة العائلة
          </h1>

          <p className="text-xs sm:text-base text-slate-200/90 leading-relaxed mb-6 sm:mb-8 max-w-2xl font-light">
            منظومة متكاملة لتوثيق الأنساب والأجيال، وتتبع الفروع والأجداد، ودعم التعديل الجماعي المنظم مع إمكانية دمج الفروع المستقلة وضمان استدامة تاريخ العائلة.
          </p>

          {/* Quick Search Input with Dropdown */}
          <div className="relative max-w-xl mb-6 sm:mb-8">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم الكامل أو جزء من الاسم أو اللقب..."
                className="w-full h-12 sm:h-13 pr-10 sm:pr-11 pl-14 rounded-2xl bg-white/95 text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37] shadow-lg border border-white/20 transition"
              />
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute right-3.5 sm:right-4 top-4" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-2.5 text-xs text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg font-bold"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Instant Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-14 sm:top-15 right-0 left-0 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-80 overflow-y-auto p-2 text-slate-900">
                <div className="px-3 py-2 text-xs font-bold text-slate-400 border-b border-slate-100 flex items-center justify-between">
                  <span>نتائج البحث ({searchResults.length})</span>
                  <span className="text-[10px] text-slate-500">انقر لفتح ملف الشخص</span>
                </div>

                {searchResults.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    لم يتم العثور على أفراد يطابقون «{searchQuery}»
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchResults.map((p) => {
                      const father = p.fatherId ? getPerson(p.fatherId) : null;
                      const grandfather = father?.fatherId ? getPerson(father.fatherId) : null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            onSelectPerson(p.id);
                            setSearchQuery('');
                          }}
                          className="w-full text-right p-3 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-[#0F4C3A] group-hover:text-[#D4AF37] transition break-words leading-snug">
                                {p.fullName}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                p.gender === 'male' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                              </span>
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 mt-1 break-words leading-relaxed">
                              {father ? (
                                <span>
                                  الأب: <strong>{father.fullName}</strong>
                                  {grandfather && (
                                    <> · الجد: <strong>{grandfather.fullName}</strong></>
                                  )}
                                </span>
                              ) : (
                                <span className="text-amber-700">شجرة مستقلة / جد أعلى</span>
                              )}
                            </div>
                          </div>
                          <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-[#0F4C3A] shrink-0 transition" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Action Buttons - Responsive 2-column grid on mobile, flex-wrap on larger screens */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
            {/* Button: استعراض الشجرة */}
            <button
              onClick={() => onNavigateTab('tree')}
              className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B89738] text-[#0A3327] font-bold text-xs shadow-md hover:brightness-105 active:scale-95 transition cursor-pointer"
            >
              <TreeDeciduous className="w-4 h-4 shrink-0" />
              <span>استعراض الشجرة</span>
            </button>

            {/* Button: إضافة فرد (Admin Only) */}
            {isAdmin && (
              <button
                onClick={onOpenAddModal}
                className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition active:scale-95 bg-white text-[#0F4C3A] hover:bg-slate-100 cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>إضافة فرد</span>
              </button>
            )}

            {/* Button: إيجاد العلاقة بين شخصين */}
            <button
              onClick={() => onNavigateTab('kinship')}
              className="col-span-2 sm:col-span-1 min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs border border-[#D4AF37]/50 backdrop-blur-xs transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>إيجاد العلاقة بين شخصين</span>
            </button>

            {/* Button: عرض الأجداد */}
            <button
              onClick={() => onNavigateTab('lineage')}
              className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/15 backdrop-blur-xs transition cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>عرض الأجداد</span>
            </button>

            {/* Button: عرض الفروع */}
            <button
              onClick={() => onNavigateTab('tree')}
              className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/15 backdrop-blur-xs transition cursor-pointer"
            >
              <GitFork className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>عرض الفروع</span>
            </button>

            {/* Button: قائمة الأفراد */}
            <button
              onClick={() => onNavigateTab('list')}
              className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/15 backdrop-blur-xs transition cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>قائمة الأفراد</span>
            </button>

            {/* Button: دمج الأشجار (Admin Only) */}
            {isAdmin && (
              <button
                onClick={onOpenMergeModal}
                className="min-h-[42px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#F5E6B8] font-medium text-xs border border-[#D4AF37]/40 backdrop-blur-xs transition cursor-pointer"
              >
                <GitMerge className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>دمج الأشجار</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics & Statistical Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Indicator 8: أفراد العائلة المسجلين */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 transition group">
          <div className="flex items-center justify-between text-slate-500 mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-semibold">أفراد العائلة المسجلين</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums">
            {stats.totalMembers}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 sm:gap-2">
            <span>{stats.totalMales} ذكور</span>
            <span>·</span>
            <span>{stats.totalFemales} إناث</span>
          </div>
        </div>

        {/* Indicator 9: عدد الأجيال */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 transition group">
          <div className="flex items-center justify-between text-slate-500 mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-semibold">عدد الأجيال المتسلسلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#D4AF37]/20 text-[#8C6D1F] flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums">
            {stats.maxGenerations}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
            من الجد الأول حتى أحدث الأحفاد
          </div>
        </div>

        {/* Indicator 9: عدد الفروع والأشجار المستقلة */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 transition group">
          <div className="flex items-center justify-between text-slate-500 mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-semibold">الأشجار / الفروع المستقلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <TreeDeciduous className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums">
            {stats.independentTreesCount}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
            قابلة للدمج عند إثبات الجد المشترك
          </div>
        </div>

        {/* Indicator: حالة التوثيق */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 transition group">
          <div className="flex items-center justify-between text-slate-500 mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-semibold">حالة السجل</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-[#0F4C3A] font-display mt-1">
            {isAdmin ? 'وضع المشرف' : 'موثق ومعتمد'}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1.5 sm:mt-2">
            {isAdmin ? 'صلاحية الإضافة والتعديل والحذف' : 'عرض واستعراض البيانات الجاهزة'}
          </div>
        </div>
      </div>

      {/* Independent Trees Overview Section */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0F4C3A] font-display flex items-center gap-2">
              <TreeDeciduous className="w-5 h-5 text-[#D4AF37]" />
              <span>الأشجار والفروع العائلية</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              استعراض أصول وفروع شجرة العائلة والتنقل بين الأجيال.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={onOpenMergeModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#8C6D1F] border border-[#D4AF37]/30 text-xs font-bold transition cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>دمج الأشجار</span>
              </button>
            )}
            <button
              onClick={() => onNavigateTab('trees')}
              className="text-xs font-semibold text-[#0F4C3A] hover:underline px-2.5 py-2 cursor-pointer"
            >
              عرض الكل
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {treeRoots.map((root) => (
            <div
              key={root.id}
              className="p-4 sm:p-5 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-[#FBF9F5] hover:border-[#0F4C3A]/40 transition group hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
                  <TreeDeciduous className="w-5 h-5" />
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                  أصل الشجرة
                </span>
              </div>

              <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#0F4C3A] transition break-words leading-snug">
                {root.fullName}
              </h3>
              
              {root.notes && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed break-words">
                  {root.notes}
                </p>
              )}

              <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => onSelectPerson(root.id)}
                  className="py-1.5 px-2.5 rounded-lg bg-[#0F4C3A]/5 hover:bg-[#0F4C3A]/10 text-xs font-bold text-[#0F4C3A] flex items-center gap-1 transition cursor-pointer"
                >
                  <span>استعراض الفروع</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  {isAdmin && onOpenAddFather && (
                    <button
                      type="button"
                      onClick={() => onOpenAddFather(root.id)}
                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 flex items-center gap-1 transition cursor-pointer"
                      title={`إضافة أصل أعلى فوق ${root.fullName}`}
                    >
                      <ArrowUp className="w-3 h-3" />
                      <span>+ إضافة أصل</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSelectPerson(root.id);
                      onNavigateTab('lineage');
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 py-1.5 px-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    النسب الصاعد
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
