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
import { formatAppName } from '../utils/nameUtils';

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
    <div className="space-y-4 sm:space-y-8 pb-8 sm:pb-12">
      {/* Admin Active Mode Banner (shown only when Admin is logged in) */}
      {isAdmin && (
        <div className="p-3 sm:p-3.5 rounded-2xl flex items-center justify-between gap-2 text-xs font-medium border shadow-2xs bg-emerald-50/90 border-emerald-200 text-emerald-950">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="truncate sm:whitespace-normal">
              <strong>وضع المشرف مفعّل:</strong> متاح الإضافة والتعديل والدمج.
            </span>
          </div>
          <button
            onClick={onOpenAdminModal}
            className="text-xs underline font-bold text-[#0F4C3A] hover:opacity-80 shrink-0 py-1 px-2 cursor-pointer"
          >
            لوحة التحكم
          </button>
        </div>
      )}

      {/* Main Hero Card with Arabic Luxury Aesthetic - Tailored for Mobile & Desktop */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#0F4C3A] via-[#0A3A2C] to-[#06221A] text-white p-4 sm:p-8 lg:p-10 shadow-xl border border-[#D4AF37]/30">
        {/* Subtle decorative pattern background */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:24px_24px]" />
        
        {/* Gold Accent corner flourishes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-b from-[#D4AF37]/20 to-transparent blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-t from-[#D4AF37]/15 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Header Lockup: Compact horizontal row with logo on mobile, full hero split on desktop */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 max-w-5xl mb-4 sm:mb-7">
            <div className="max-w-2xl">
              {/* Mobile + Desktop Top Identity Row */}
              <div className="flex items-center gap-3.5 md:block">
                <img
                  src="/tree-logo.png"
                  alt="شعار شجرة العائلة"
                  className="w-14 h-14 sm:w-16 sm:h-16 md:hidden rounded-2xl object-contain shadow-lg border border-[#D4AF37]/50 p-1 bg-[#092e23]/80 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#F5E6B8] text-[10px] sm:text-xs font-semibold mb-1.5 sm:mb-3 backdrop-blur-xs">
                    <img src="/tree-logo.png" alt="شعار" className="hidden md:block w-4 h-4 rounded-md object-contain" />
                    <span className="truncate">المنصة الرقمية الموحدة للأنساب والعائلة</span>
                  </div>

                  <h1 className="text-xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white font-display leading-tight">
                    شجرة العائلة
                  </h1>
                </div>
              </div>

              <p className="text-xs sm:text-base text-slate-200/90 leading-relaxed font-light mt-2.5 sm:mt-3">
                منظومة متكاملة لتوثيق الأنساب والأجيال، وتتبع الفروع والأجداد، مع إمكانية البحث الفوري وحساب صلة القرابة ودمج الفروع المستقلة.
              </p>
            </div>

            <div className="hidden md:flex flex-col items-center shrink-0 self-center">
              <img
                src="/tree-logo.png"
                alt="شعار شجرة العائلة"
                className="w-28 h-28 lg:w-36 lg:h-36 rounded-3xl object-contain shadow-2xl border-2 border-[#D4AF37]/50 p-1.5 bg-[#092e23]/70 backdrop-blur-xs hover:scale-105 transition-transform"
              />
            </div>
          </div>

          {/* Quick Search Input with Dropdown (16px font on mobile prevents iOS auto-zoom) */}
          <div className="relative max-w-xl mb-4 sm:mb-7">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو اللقب في شجرة العائلة..."
                className="w-full h-12 sm:h-13 pr-10 sm:pr-11 pl-14 rounded-2xl bg-white text-slate-900 placeholder:text-slate-400 text-base sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37] shadow-lg border border-white/20 transition"
              />
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 absolute right-3.5 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl font-bold cursor-pointer"
                >
                  مسح
                </button>
              )}
            </div>

            {/* Instant Search Results Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="absolute top-13 sm:top-15 right-0 left-0 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-72 sm:max-h-80 overflow-y-auto p-1.5 sm:p-2 text-slate-900">
                <div className="px-3 py-2 text-[11px] sm:text-xs font-bold text-slate-400 border-b border-slate-100 flex items-center justify-between">
                  <span>نتائج البحث ({searchResults.length})</span>
                  <span className="text-[10px] text-slate-500">اضغط لفتح البطاقة</span>
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
                          className="w-full text-right p-2.5 sm:p-3 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition flex items-center justify-between gap-2 group cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-[#0F4C3A] group-hover:text-[#D4AF37] transition break-words leading-snug">
                                {formatAppName(p.fullName)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                · {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                              </span>
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 break-words leading-relaxed">
                              {father ? (
                                <span>
                                  الأب: <strong>{formatAppName(father.fullName)}</strong>
                                  {grandfather && (
                                    <> · الجد: <strong>{formatAppName(grandfather.fullName)}</strong></>
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

          {/* Quick Action Buttons - Symmetrical Mobile Layout (Zero Empty Grid Cells) */}
          <div className="space-y-2.5 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            {/* Primary Hero CTA: Full width on mobile for easy thumb reach */}
            <button
              onClick={() => onNavigateTab('tree')}
              className="w-full sm:w-auto min-h-[46px] sm:min-h-[44px] flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B89738] text-[#0A3327] font-extrabold text-xs sm:text-sm shadow-md hover:brightness-105 active:scale-[0.99] transition cursor-pointer"
            >
              <TreeDeciduous className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>استعراض شجرة العائلة</span>
              <ChevronLeft className="w-4 h-4 sm:hidden mr-auto opacity-80" />
            </button>

            {/* 2x2 Balanced Secondary Navigation Grid on Mobile */}
            <div className="grid grid-cols-2 sm:contents gap-2">
              {/* 1. إيجاد العلاقة بين شخصين */}
              <button
                onClick={() => onNavigateTab('kinship')}
                className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] sm:text-xs border border-[#D4AF37]/50 backdrop-blur-xs active:scale-95 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] shrink-0" />
                <span className="truncate">صلة القرابة بين شخصين</span>
              </button>

              {/* 2. عرض الأجداد والنسب */}
              <button
                onClick={() => onNavigateTab('lineage')}
                className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] sm:text-xs border border-white/15 backdrop-blur-xs active:scale-95 transition cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] shrink-0" />
                <span className="truncate">عرض الأجداد والنسب</span>
              </button>

              {/* 3. قائمة الأفراد */}
              <button
                onClick={() => onNavigateTab('list')}
                className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] sm:text-xs border border-white/15 backdrop-blur-xs active:scale-95 transition cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] shrink-0" />
                <span className="truncate">قائمة أفراد العائلة</span>
              </button>

              {/* 4. الأشجار والفروع */}
              <button
                onClick={() => onNavigateTab('trees')}
                className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] sm:text-xs border border-white/15 backdrop-blur-xs active:scale-95 transition cursor-pointer"
              >
                <GitFork className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#D4AF37] shrink-0" />
                <span className="truncate">الأشجار والفروع</span>
              </button>
            </div>

            {/* Admin Actions Pair (2 columns on mobile when Admin is logged in) */}
            {isAdmin && (
              <div className="grid grid-cols-2 sm:contents gap-2 pt-0.5 sm:pt-0">
                <button
                  onClick={onOpenAddModal}
                  className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-[11px] sm:text-xs shadow-md transition active:scale-95 bg-white text-[#0F4C3A] hover:bg-slate-100 cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="truncate">إضافة فرد جديد</span>
                </button>

                <button
                  onClick={onOpenMergeModal}
                  className="min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#F5E6B8] font-bold text-[11px] sm:text-xs border border-[#D4AF37]/40 backdrop-blur-xs active:scale-95 transition cursor-pointer"
                >
                  <GitMerge className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span className="truncate">دمج الأشجار</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics & Statistical Indicators - Interactive & Compact 2x2 Grid on Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Indicator 1: أفراد العائلة المسجلين */}
        <button
          type="button"
          onClick={() => onNavigateTab('list')}
          className="text-right bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 active:scale-[0.99] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate">أفراد العائلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums leading-tight">
            {stats.totalMembers}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 truncate">
            <span>{stats.totalMales} ذكور</span>
            <span>·</span>
            <span>{stats.totalFemales} إناث</span>
          </div>
        </button>

        {/* Indicator 2: عدد الأجيال */}
        <button
          type="button"
          onClick={() => onNavigateTab('tree')}
          className="text-right bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 active:scale-[0.99] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate">الأجيال المتسلسلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#D4AF37]/20 text-[#8C6D1F] flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums leading-tight">
            {stats.maxGenerations}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            من الجد الأول للأحفاد
          </div>
        </button>

        {/* Indicator 3: عدد الفروع والأشجار المستقلة */}
        <button
          type="button"
          onClick={() => onNavigateTab('trees')}
          className="text-right bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 active:scale-[0.99] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate">الأشجار المستقلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <TreeDeciduous className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-[#0F4C3A] font-display tabular-nums leading-tight">
            {stats.independentTreesCount}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            قابلة للدمج والتوسيع
          </div>
        </button>

        {/* Indicator 4: حالة السجل */}
        <button
          type="button"
          onClick={onOpenAdminModal}
          className="text-right bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-[#0F4C3A]/30 active:scale-[0.99] transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1.5 sm:mb-2 gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-600 truncate">حالة السجل</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-xl font-extrabold text-[#0F4C3A] font-display mt-0.5 sm:mt-1 truncate">
            {isAdmin ? 'وضع المشرف' : 'موثق ومعتمد'}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            {isAdmin ? 'صلاحية التعديل مفعّلة' : 'اضغط لإدارة السجل'}
          </div>
        </button>
      </div>

      {/* Independent Trees Overview Section */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-lg font-bold text-[#0F4C3A] font-display flex items-center gap-2">
              <TreeDeciduous className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37] shrink-0" />
              <span className="truncate">الأشجار والفروع العائلية</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
              استعراض أصول وفروع شجرة العائلة والتنقل بين الأجيال
            </p>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isAdmin && (
              <button
                onClick={onOpenMergeModal}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#8C6D1F] border border-[#D4AF37]/30 text-xs font-bold transition cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>دمج الأشجار</span>
              </button>
            )}
            <button
              onClick={() => onNavigateTab('trees')}
              className="min-h-[36px] text-xs font-bold text-[#0F4C3A] bg-[#0F4C3A]/5 hover:bg-[#0F4C3A]/10 rounded-xl px-3 py-1.5 transition cursor-pointer whitespace-nowrap"
            >
              عرض الكل
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {treeRoots.map((root) => (
            <div
              key={root.id}
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-[#FBF9F5] hover:border-[#0F4C3A]/40 transition group hover:shadow-md flex flex-col justify-between"
            >
              <div>
                {/* Compact Horizontal Card Header for Mobile & Desktop */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
                      <TreeDeciduous className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        أصل الشجرة
                      </span>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#0F4C3A] transition break-words leading-snug">
                        {formatAppName(root.fullName)}
                      </h3>
                    </div>
                  </div>
                </div>
                
                {root.notes && (
                  <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed break-words">
                    {root.notes}
                  </p>
                )}
              </div>

              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectPerson(root.id)}
                  className="min-h-[38px] flex-1 sm:flex-initial py-1.5 px-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] text-xs font-bold text-white flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs"
                >
                  <span>تفاصيل الأصل</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1.5">
                  {isAdmin && onOpenAddFather && (
                    <button
                      type="button"
                      onClick={() => onOpenAddFather(root.id)}
                      className="min-h-[38px] text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
                      title={`إضافة أصل أعلى فوق ${formatAppName(root.fullName)}`}
                    >
                      <ArrowUp className="w-3 h-3 shrink-0" />
                      <span>+ أصل أعلى</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSelectPerson(root.id);
                      onNavigateTab('lineage');
                    }}
                    className="min-h-[38px] text-[11px] font-bold text-slate-700 hover:text-[#0F4C3A] py-1.5 px-2.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/70 transition cursor-pointer whitespace-nowrap"
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
