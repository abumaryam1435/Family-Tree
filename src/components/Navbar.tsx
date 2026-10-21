import { GitFork, Users, Search, Settings, ShieldCheck, Lock, Unlock, Sparkles, Plus, LogOut } from 'lucide-react';
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
  const navItems: { id: 'home' | 'tree' | 'lineage' | 'kinship' | 'list' | 'trees'; label: string }[] = [
    { id: 'home', label: 'الرئيسية' },
    { id: 'tree', label: 'استعراض الشجرة' },
    { id: 'kinship', label: 'إيجاد العلاقة بين شخصين' },
    { id: 'lineage', label: 'عرض النسب الصاعد' },
    { id: 'list', label: 'قائمة الأفراد' },
    { id: 'trees', label: 'الأشجار العائلية' }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FBF9F5]/95 backdrop-blur-md border-b border-[#0F4C3A]/10 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-6">
          
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 sm:gap-2.5 text-right group focus:outline-none cursor-pointer"
            >
              <img
                src="/tree-logo.png"
                alt="شعار شجرة العائلة"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain shadow-xs group-hover:scale-105 transition-transform shrink-0 border border-[#D4AF37]/40"
              />
              <div>
                <span className="text-base sm:text-lg font-extrabold text-[#0F4C3A] tracking-tight whitespace-nowrap block leading-tight font-display">
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
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Add Person CTA - Visible ONLY to Admin */}
            {isAdmin && (
              <button
                onClick={onOpenAddModal}
                className="min-h-[38px] flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition shadow-xs whitespace-nowrap shrink-0 bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white hover:brightness-110 active:scale-95"
                title="إضافة فرد جديد إلى شجرة العائلة"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>إضافة فرد</span>
              </button>
            )}

            {/* Admin Control Panel Button (زر لوحة التحكم) */}
            <button
              onClick={onOpenAdminModal}
              className={`min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition whitespace-nowrap ${
                isAdmin
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#8C6D1F] hover:bg-[#D4AF37]/30'
                  : 'bg-white/90 border-slate-200 text-slate-700 hover:text-[#0F4C3A] hover:border-[#0F4C3A]/30'
              }`}
              title={isAdmin ? 'لوحة تحكم المشرف (مفعل)' : 'لوحة التحكم (للمشرف فقط)'}
              aria-label="لوحة التحكم"
            >
              {isAdmin ? (
                <ShieldCheck className="w-4 h-4 text-[#8C6D1F] shrink-0" />
              ) : (
                <Settings className="w-4 h-4 shrink-0" />
              )}
              <span className="sm:hidden">{isAdmin ? 'المشرف' : 'لوحة التحكم'}</span>
              <span className="hidden sm:inline">{isAdmin ? 'لوحة التحكم (المشرف)' : 'لوحة التحكم'}</span>
            </button>

            {/* Quick Admin Logout Button */}
            {isAdmin && onLogout && (
              <button
                onClick={onLogout}
                className="min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition whitespace-nowrap cursor-pointer shadow-2xs"
                title="تسجيل الخروج من وضع المشرف والعودة للصفحة الرئيسية"
                aria-label="تسجيل خروج المشرف"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">خروج المشرف</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Grid: All 6 tabs cleanly visible and touch-friendly on phone screens */}
        <nav className="grid grid-cols-3 sm:grid-cols-6 md:hidden gap-1.5 py-2 border-t border-slate-200/60">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[38px] px-2 py-1.5 text-[11px] font-bold rounded-xl transition-colors text-center flex items-center justify-center leading-tight ${
                activeTab === item.id
                  ? 'bg-[#0F4C3A] text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200/80 active:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
