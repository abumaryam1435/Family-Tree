import React from 'react';
import { GitFork, Users, Settings, ShieldCheck, Sparkles, Plus, LogOut, Home, TreeDeciduous, Layers } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  activeTab: 'home' | 'tree' | 'lineage' | 'kinship' | 'list' | 'trees' | 'requests';
  setActiveTab: (tab: 'home' | 'tree' | 'lineage' | 'kinship' | 'list' | 'trees' | 'requests') => void;
  onOpenAddModal: () => void;
  onOpenAdminModal: () => void;
  onLogout?: () => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  onOpenSearch?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenAddModal,
  onOpenAdminModal,
  onLogout,
  isAdmin,
}) => {
  const navItems: {
    id: 'home' | 'tree' | 'lineage' | 'kinship' | 'list' | 'trees';
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'home', label: 'الرئيسية', mobileLabel: 'الرئيسية', icon: Home },
    { id: 'tree', label: 'استعراض الشجرة', mobileLabel: 'الشجرة', icon: TreeDeciduous },
    { id: 'kinship', label: 'إيجاد العلاقة بين شخصين', mobileLabel: 'صلة القرابة', icon: Sparkles },
    { id: 'lineage', label: 'عرض النسب الصاعد', mobileLabel: 'النسب', icon: Layers },
    { id: 'list', label: 'قائمة الأفراد', mobileLabel: 'الأفراد', icon: Users },
    { id: 'trees', label: 'الأشجار العائلية', mobileLabel: 'الفروع', icon: GitFork }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FBF9F5]/95 backdrop-blur-md border-b border-[#0F4C3A]/10 shadow-2xs">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-13 sm:h-16 gap-1.5 sm:gap-6">
          
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 min-w-0">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 sm:gap-2.5 text-right group focus:outline-none cursor-pointer"
            >
              <img
                src="/tree-logo.png"
                alt="شعار شجرة العائلة"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-contain shadow-2xs group-hover:scale-105 transition-transform shrink-0 border border-[#D4AF37]/40"
              />
              <div>
                <span className="text-sm sm:text-lg font-extrabold text-[#0F4C3A] tracking-tight whitespace-nowrap block leading-tight font-display">
                  شجرة العائلة
                </span>
                <span className="text-[10px] text-slate-500 font-medium hidden sm:block whitespace-nowrap">
                  توثيق النسب والأجيال
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-[#0F4C3A] text-white shadow-xs'
                    : 'text-slate-700 hover:text-[#0F4C3A] hover:bg-[#0F4C3A]/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Actions & Admin Control Panel */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Add Person CTA - Visible ONLY to Admin */}
            {isAdmin && (
              <button
                onClick={onOpenAddModal}
                className="min-h-[36px] sm:min-h-[38px] flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-bold rounded-xl transition shadow-2xs whitespace-nowrap shrink-0 bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white hover:brightness-110 active:scale-95 cursor-pointer"
                title="إضافة فرد جديد إلى شجرة العائلة"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xs:inline sm:hidden">إضافة</span>
                <span className="hidden sm:inline">إضافة فرد</span>
              </button>
            )}

            {/* Admin Control Panel Button (زر لوحة التحكم) */}
            <button
              onClick={onOpenAdminModal}
              className={`min-h-[36px] sm:min-h-[38px] flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isAdmin
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#8C6D1F] hover:bg-[#D4AF37]/30'
                  : 'bg-white/90 border-slate-200 text-slate-700 hover:text-[#0F4C3A] hover:border-[#0F4C3A]/30'
              }`}
              title={isAdmin ? 'لوحة تحكم المشرف (مفعل)' : 'لوحة التحكم (للمشرف فقط)'}
              aria-label="لوحة التحكم"
            >
              {isAdmin ? (
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8C6D1F] shrink-0" />
              ) : (
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              )}
              <span className="sm:hidden">{isAdmin ? 'المشرف' : 'الإدارة'}</span>
              <span className="hidden sm:inline">{isAdmin ? 'لوحة التحكم (المشرف)' : 'لوحة التحكم'}</span>
            </button>

            {/* Quick Admin Logout Button */}
            {isAdmin && onLogout && (
              <button
                onClick={onLogout}
                className="min-h-[36px] sm:min-h-[38px] flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer shadow-2xs"
                title="تسجيل الخروج من وضع المشرف والعودة للصفحة الرئيسية"
                aria-label="تسجيل خروج المشرف"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">خروج المشرف</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation: Compact, touch-friendly bar where tabs fit cleanly */}
        <nav className="flex md:hidden items-center justify-between gap-1 py-1.5 border-t border-slate-200/60 overflow-x-auto no-scrollbar scroll-smooth">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[36px] flex-1 px-2.5 py-1.5 text-[11px] font-bold rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-1 leading-tight cursor-pointer ${
                  isActive
                    ? 'bg-[#0F4C3A] text-white shadow-2xs'
                    : 'bg-white/90 text-slate-700 border border-slate-200/70 active:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                <span>{item.mobileLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
