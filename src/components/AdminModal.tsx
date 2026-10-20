import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Unlock,
  Key,
  Shield,
  History,
  FileText,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  GitMerge,
  Plus,
  ArrowUp,
  Users
} from 'lucide-react';
import { AppSettings, AuditLog, ChangeRequest, MergeOperation } from '../types/family';
import { apiClient } from '../api/client';
import { ConfirmModal } from './ConfirmModal';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  isAdmin: boolean;
  onLoginSuccess: () => void;
  onLogout: () => void;
  onSettingsUpdated: () => void;
  onDataResetOrRestored: () => void;
  onOpenAddModal?: () => void;
  onOpenAddRootAncestor?: () => void;
  onOpenMergeModal?: () => void;
  onNavigateToList?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  settings,
  isAdmin,
  onLoginSuccess,
  onLogout,
  onSettingsUpdated,
  onDataResetOrRestored,
  onOpenAddModal,
  onOpenAddRootAncestor,
  onOpenMergeModal,
  onNavigateToList
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'requests' | 'merges' | 'backup' | 'passcode'>('status');
  
  // Login / Passcode state
  const [enteredPasscode, setEnteredPasscode] = useState<string>('');
  const [newPasscode, setNewPasscode] = useState<string>('');
  const [confirmPasscode, setConfirmPasscode] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [passcodeMessage, setPasscodeMessage] = useState<string | null>(null);

  // Data tabs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [mergeOperations, setMergeOperations] = useState<MergeOperation[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Restore file input ref
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadAdminData();
    }
  }, [isOpen, isAdmin, activeTab]);

  const loadAdminData = async () => {
    setLoadingData(true);
    try {
      if (activeTab === 'logs') {
        const logs = await apiClient.getAuditLogs();
        setAuditLogs(logs);
      } else if (activeTab === 'requests') {
        const reqs = await apiClient.getChangeRequests();
        setChangeRequests(reqs);
      } else if (activeTab === 'merges') {
        const merges = await apiClient.getMergeOperations();
        setMergeOperations(merges);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  if (!isOpen) return null;

  // Handle Login or Initial Setup
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      if (!settings.hasAdminPasscode) {
        // Initial setup
        if (enteredPasscode.length < 4) {
          setLoginError('يجب أن يتكون الرمز السري من 4 خانات على الأقل');
          return;
        }
        await apiClient.setAdminPasscode(enteredPasscode);
        onLoginSuccess();
      } else {
        // Verification
        await apiClient.verifyAdmin(enteredPasscode);
        onLoginSuccess();
      }
      setEnteredPasscode('');
    } catch (err: any) {
      setLoginError(err.message || 'الرمز السري غير صحيح');
    }
  };

  // Toggle Editing
  const handleToggleEdit = async (enable: boolean) => {
    try {
      await apiClient.toggleEditing(enable);
      onSettingsUpdated();
      setActionMessage(enable ? 'تم تفعيل وضع التعديل للجميع' : 'تم قفل التعديل للجميع');
    } catch (err: any) {
      setActionMessage(err.message || 'فشل في تغيير حالة التعديل');
    }
  };

  // Change Passcode
  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeMessage(null);

    if (newPasscode.length < 4) {
      setPasscodeMessage('الرمز الجديد يجب أن يتكون من 4 خانات على الأقل');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setPasscodeMessage('الرمزان غير متطابقين');
      return;
    }

    try {
      await apiClient.setAdminPasscode(newPasscode, enteredPasscode);
      setPasscodeMessage('تم تحديث الرمز السري للمشرف بنجاح');
      setNewPasscode('');
      setConfirmPasscode('');
      setEnteredPasscode('');
    } catch (err: any) {
      setPasscodeMessage(err.message || 'فشل في تحديث الرمز السري');
    }
  };

  // Confirm Dialog State inside Admin
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isDestructive: false,
    onConfirm: () => {}
  });

  // Resolve Change Request
  const handleResolveRequest = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await apiClient.resolveChangeRequest(id, decision);
      await loadAdminData();
      onSettingsUpdated();
      setActionMessage(decision === 'approved' ? 'تم قبول الطلب وتطبيقه بنجاح' : 'تم رفض الطلب');
    } catch (err: any) {
      setActionMessage(err.message || 'فشل في معالجة الطلب');
    }
  };

  // Undo Merge
  const handleUndoMerge = (mergeOpId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'التراجع عن عملية الدمج',
      message: 'هل أنت متأكد من التراجع عن عملية الدمج واستعادة الشجرة السابقة وإعادة ربط الفروع؟',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await apiClient.undoMerge(mergeOpId);
          await loadAdminData();
          onDataResetOrRestored();
          setActionMessage('تم التراجع عن عملية الدمج بنجاح');
        } catch (err: any) {
          setActionMessage(err.message || 'فشل التراجع عن عملية الدمج');
        }
      }
    });
  };

  // Restore Backup JSON
  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = JSON.parse(content);
        setRestoreStatus('جارٍ فحص العلاقات واستعادة البيانات...');
        const result = await apiClient.restoreBackup(parsed);
        setRestoreStatus(`تمت الاستعادة بنجاح: تم استرداد ${result.restoredCount} فرداً.`);
        onDataResetOrRestored();
      } catch (err: any) {
        setRestoreStatus(`خطأ في الاستعادة: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Reset Sample Data
  const handleResetSample = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'تحميل الشجرة النموذجية',
      message: 'هل ترغب في إعادة تحميل شجرة العائلة النموذجية؟ سيتم الاحتفاظ بالسجلات الحالية كنسخة استعادة.',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await apiClient.resetSampleData();
          onDataResetOrRestored();
          setActionMessage('تم تحميل البيانات النموذجية بنجاح');
        } catch (err: any) {
          setActionMessage(err.message || 'فشل تحميل البيانات النموذجية');
        }
      }
    });
  };

  // Clear all data
  const handleClearAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'تفريغ بيانات الشجرة للبدء من الصفر',
      message: 'تحذير: هل أنت متأكد تماماً من رغبتك في مسح كافة الأفراد المسجلين لبدء شجرة عائلتك من الجد الأول؟',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await apiClient.clearAllData();
          onDataResetOrRestored();
          setActionMessage('تم تفريغ الشجرة بنجاح، يمكنك الآن البدء بإضافة الجد الأول.');
        } catch (err: any) {
          setActionMessage(err.message || 'فشل في تفريغ البيانات');
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-8">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-[#0F4C3A] via-[#092e23] to-[#0F4C3A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display">
                لوحة إعدادات المشرف وقفل التعديل
              </h3>
              <p className="text-[11px] text-white/70">
                إدارة الصلاحيات، النسخ الاحتياطي، وفحص سلامة الأنساب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* If not authenticated as Admin: Show Passcode Challenge */}
        {!isAdmin ? (
          <form onSubmit={handleLogin} className="p-8 max-w-md mx-auto space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center mx-auto">
              <Key className="w-6 h-6 text-[#D4AF37]" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-slate-900 font-display">
                {!settings.hasAdminPasscode ? 'تعيين رمز المشرف لأول مرة' : 'تسجيل دخول المشرف'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {!settings.hasAdminPasscode
                  ? 'لم يتم تعيين رمز سري بعد. يرجى اختيار رمز سري مكوّن من 4 خانات على الأقل لحماية إعدادات الشجرة.'
                  : 'أدخل الرمز السري للوصول إلى لوحة قفل التعديل، والنسخ الاحتياطي، وسجل التغييرات.'}
              </p>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {loginError}
              </div>
            )}

            <div>
              <input
                type="password"
                required
                autoFocus
                value={enteredPasscode}
                onChange={(e) => setEnteredPasscode(e.target.value)}
                placeholder={!settings.hasAdminPasscode ? 'اختر رمزاً سرياً جديداً...' : 'أدخل الرمز السري...'}
                className="w-full h-12 text-center text-lg tracking-widest rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition"
            >
              {!settings.hasAdminPasscode ? 'حفظ الرمز السري والمتابعة' : 'تأكيد ودخول المشرف'}
            </button>
          </form>
        ) : (
          /* Admin Dashboard Content */
          <div>
            {/* Tabs Bar */}
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setActiveTab('status')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === 'status' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                أدوات المشرف والإدارة
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === 'logs' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                سجل التعديلات (Audit)
              </button>
              <button
                onClick={() => setActiveTab('merges')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === 'merges' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                العمليات الأخيرة والتراجع
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === 'backup' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                النسخ الاحتياطي والاستعادة
              </button>
              <button
                onClick={() => setActiveTab('passcode')}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  activeTab === 'passcode' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                تغيير الرمز السري
              </button>
            </div>

            {/* Tab 1: Supervisor Tools & Permissions */}
            {activeTab === 'status' && (
              <div className="p-6 space-y-6">
                {actionMessage && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {actionMessage}
                  </div>
                )}

                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[#0F4C3A]">وضع صلاحيات النظام:</h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        الإضافة والتعديل والحذف ودمج الفروع متاحة <strong>حصرياً للمشرف</strong>، بينما يظهر لبقية الزوار عرض الصفحات والبيانات الجاهزة فقط.
                      </p>
                    </div>

                    <span className="text-xs font-bold text-[#0F4C3A] bg-white border border-emerald-200 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                      <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>أنت مسجل الدخول كمشرف</span>
                    </span>
                  </div>
                </div>

                {/* Quick Supervisor Actions */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">
                    الإجراءات السريعة للمشرف (الإضافة والتعديل والأصول والدمج):
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {onOpenAddModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAddModal();
                        }}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#0F4C3A] text-white flex items-center justify-center shrink-0">
                          <Plus className="w-4 h-4 text-[#D4AF37]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                            إضافة فرد أو فرع جديد
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            إضافة ابن أو بنت أو زوج أو بداية شجرة جديدة
                          </div>
                        </div>
                      </button>
                    )}

                    {onOpenAddRootAncestor && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAddRootAncestor();
                        }}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0F4C3A] flex items-center justify-center shrink-0">
                          <ArrowUp className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                            إضافة أصل للأصول الموجودة
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            ترقية أصول الأشجار صعوداً (مثلاً إضافة «راشد» فوق «عبدالله»)
                          </div>
                        </div>
                      </button>
                    )}

                    {onOpenMergeModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenMergeModal();
                        }}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 text-[#8C6D1F] flex items-center justify-center shrink-0">
                          <GitMerge className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                            دمج الأشجار تحت أصل مشترك
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            توحيد شجرتين عند التوصل لنفس الأصل التاريخي
                          </div>
                        </div>
                      </button>
                    )}

                    {onNavigateToList && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToList();
                        }}
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                            إدارة وتعديل وحذف الأفراد
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            فتح سجل الأفراد الكامل للتعديل أو الحذف المباشر
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Audit Log (Requirement 7 & 8) */}
            {activeTab === 'logs' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#0F4C3A]">
                    سجل التعديلات والعمليات ({auditLogs.length})
                  </h4>
                  <button
                    onClick={loadAdminData}
                    className="text-xs text-slate-600 hover:text-[#0F4C3A] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-2xl max-h-96 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      لا توجد سجلات مسجلة بعد
                    </div>
                  ) : (
                    auditLogs.map((log) => (
                      <div key={log.id} className="p-3 hover:bg-slate-50 text-xs space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {log.actor}: {log.actionType}
                          </span>
                          <span className="text-[10px] tabular-nums">
                            {new Date(log.timestamp).toLocaleString('ar-SA')}
                          </span>
                        </div>
                        <p className="text-slate-900 font-medium">{log.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Change Requests */}
            {activeTab === 'requests' && (
              <div className="p-6 space-y-4">
                <h4 className="text-sm font-bold text-[#0F4C3A]">
                  طلبات التصحيح والدمج المقترحة من أفراد العائلة ({changeRequests.length})
                </h4>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {changeRequests.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 border border-slate-200 rounded-2xl">
                      لا توجد طلبات معلقة حالياً
                    </div>
                  ) : (
                    changeRequests.map((req) => (
                      <div key={req.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {req.type === 'correction' ? 'طلب تصحيح اسم / بيانات' : req.type === 'merge_proposal' ? 'اقتراح دمج' : 'طلب إضافة فرد'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            req.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {req.status === 'pending' ? 'قيد المراجعة' : req.status === 'approved' ? 'مقبول' : 'مرفوض'}
                          </span>
                        </div>

                        <div>المقدم: <strong>{req.requesterName}</strong></div>
                        {req.targetPersonName && (
                          <div>الفرد المعني: <strong>{req.targetPersonName}</strong></div>
                        )}
                        <div className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                          {req.requesterNotes}
                        </div>

                        {req.status === 'pending' && (
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => handleResolveRequest(req.id, 'approved')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            >
                              قبول وتطبيق التعديل
                            </button>
                            <button
                              onClick={() => handleResolveRequest(req.id, 'rejected')}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                            >
                              رفض الطلب
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Merge Operations & Rollback */}
            {activeTab === 'merges' && (
              <div className="p-6 space-y-4">
                <h4 className="text-sm font-bold text-[#0F4C3A]">
                  سجل عمليات الدمج وإمكانية التراجع الآمن ({mergeOperations.length})
                </h4>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {mergeOperations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 border border-slate-200 rounded-2xl">
                      لم يتم تنفيذ أي عملية دمج حتى الآن
                    </div>
                  ) : (
                    mergeOperations.map((m) => (
                      <div key={m.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4 text-xs">
                        <div>
                          <div className="font-bold text-slate-900">
                            دمج: {m.sourcePersonName} في {m.targetPersonName}
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            تم نقل {m.movedChildrenIds.length} فروع · {new Date(m.timestamp).toLocaleString('ar-SA')}
                          </div>
                        </div>

                        <button
                          onClick={() => handleUndoMerge(m.id)}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>التراجع عن هذا الدمج</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Backup & Restore */}
            {activeTab === 'backup' && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Backup Card */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                    <div className="flex items-center gap-2 text-[#0F4C3A]">
                      <Download className="w-5 h-5 text-[#D4AF37]" />
                      <h4 className="font-bold text-sm">تنزيل نسخة احتياطية (JSON)</h4>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      تصدير كامل بيانات الشجرة والأفراد وسجلات التعديل في ملف JSON آمن وخالٍ من كلمات المرور.
                    </p>
                    <a
                      href={apiClient.getBackupDownloadUrl()}
                      download
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] text-xs font-bold transition shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>تنزيل النسخة الاحتياطية الآن</span>
                    </a>
                  </div>

                  {/* Restore Card */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                    <div className="flex items-center gap-2 text-[#0F4C3A]">
                      <Upload className="w-5 h-5 text-[#D4AF37]" />
                      <h4 className="font-bold text-sm">استعادة نسخة احتياطية</h4>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      رفع ملف JSON تم تصديره سابقاً، مع التحقق الأوتوماتيكي الصارم من سلامة العلاقات ومنع الدورات.
                    </p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs font-bold transition cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <span>اختيار ملف النسخة الاحتياطية</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileRestore}
                        className="hidden"
                      />
                    </label>

                    {restoreStatus && (
                      <div className="text-xs font-semibold text-[#0F4C3A] bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                        {restoreStatus}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sample / Reset Section */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">إدارة البيانات النموذجية</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      يمكنك إعادة تحميل بيانات عائلية نموذجية للتجربة، أو تفريغ الشجرة تماماً لبدء العمل الحقيقي.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleResetSample}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold text-slate-700 transition"
                    >
                      تحميل عينة نموذجية
                    </button>
                    <button
                      onClick={handleClearAll}
                      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold transition"
                    >
                      تفريغ الشجرة لبدء عائلتك
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Change Passcode */}
            {activeTab === 'passcode' && (
              <form onSubmit={handleChangePasscode} className="p-6 max-w-md mx-auto space-y-4">
                <h4 className="text-sm font-bold text-slate-900">
                  تغيير الرمز السري للمشرف
                </h4>

                {passcodeMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {passcodeMessage}
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    الرمز السري الحالي:
                  </label>
                  <input
                    type="password"
                    required
                    value={enteredPasscode}
                    onChange={(e) => setEnteredPasscode(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    الرمز السري الجديد:
                  </label>
                  <input
                    type="password"
                    required
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    تأكيد الرمز السري الجديد:
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] transition"
                >
                  حفظ الرمز السري الجديد
                </button>
              </form>
            )}

            {/* Admin Footer with Logout */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                جلسة المشرف نشطة وآمنة
              </span>
              <button
                onClick={onLogout}
                className="text-red-600 hover:underline font-semibold"
              >
                تسجيل الخروج من وضع المشرف
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Internal Confirmation Dialog */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
