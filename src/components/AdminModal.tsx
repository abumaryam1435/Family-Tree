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
import {
  parseBackupFile,
  reconstructFromCloudLogs,
  buildTimeTravelRestorePoints,
  reconstructAtTimestamp,
  loadLocalSafetyBackups,
  triggerJsonBackupDownload,
  CloudRecoverySummary,
  TimeTravelRestorePoint,
  LocalSafetySnapshot
} from '../utils/backupRecovery';

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

  // Backup & Restore state
  const [restoreStatus, setRestoreStatus] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [cloudRecovery, setCloudRecovery] = useState<CloudRecoverySummary | null>(null);
  const [localSafetyBackups, setLocalSafetyBackups] = useState<LocalSafetySnapshot[]>([]);
  const [timeTravelPoints, setTimeTravelPoints] = useState<TimeTravelRestorePoint[]>([]);
  const [previewedPointId, setPreviewedPointId] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}T${pad(yesterday.getHours())}:${pad(yesterday.getMinutes())}`;
  });
  const [customPoint, setCustomPoint] = useState<TimeTravelRestorePoint | null>(null);
  const [showRecoveryPreview, setShowRecoveryPreview] = useState<boolean>(false);

  const [currentPersonsForEnrich, setCurrentPersonsForEnrich] = useState<LocalSafetySnapshot['persons']>([]);

  const buildEnrichmentPool = (
    snaps: LocalSafetySnapshot[],
    livePersons: LocalSafetySnapshot['persons'] = currentPersonsForEnrich
  ) => {
    // Prefer snapshots with the most wife/mother/notes details and cleanest root structure first
    const ordered = [...snaps].sort((a, b) => {
      if (a.wifeLinksCount !== b.wifeLinksCount) return b.wifeLinksCount - a.wifeLinksCount;
      if (a.hasRichDetails !== b.hasRichDetails) return a.hasRichDetails ? -1 : 1;
      if (a.rootsCount !== b.rootsCount) return a.rootsCount - b.rootsCount;
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });
    const byId = new Map<string, LocalSafetySnapshot['persons'][number]>();
    const mergePerson = (p: LocalSafetySnapshot['persons'][number]) => {
      const prev = byId.get(p.id);
      if (!prev) {
        byId.set(p.id, { ...p });
      } else {
        // Fill any missing wife/mother/notes fields from secondary snapshots
        byId.set(p.id, {
          ...prev,
          motherId: prev.motherId || p.motherId || null,
          husbandId: prev.husbandId || p.husbandId || null,
          husbandName: prev.husbandName?.trim() ? prev.husbandName : p.husbandName || '',
          notes: prev.notes?.trim() ? prev.notes : p.notes || '',
          excludedChildIds:
            prev.excludedChildIds && prev.excludedChildIds.length > 0
              ? prev.excludedChildIds
              : p.excludedChildIds || []
        });
      }
    };
    for (const snap of ordered) {
      for (const p of snap.persons) mergePerson(p);
    }
    for (const p of livePersons) mergePerson(p);
    return Array.from(byId.values());
  };

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
      } else if (activeTab === 'backup') {
        const localSnaps = loadLocalSafetyBackups();
        setLocalSafetyBackups(localSnaps);
        const [logs, merges, livePersons] = await Promise.all([
          apiClient.getAuditLogs(),
          apiClient.getMergeOperations(),
          apiClient.getPersons().catch(() => [])
        ]);
        setCurrentPersonsForEnrich(livePersons);
        const enrichmentPool = buildEnrichmentPool(localSnaps, livePersons);
        setAuditLogs(logs);
        setMergeOperations(merges);
        setCloudRecovery(reconstructFromCloudLogs(logs, merges));
        setTimeTravelPoints(buildTimeTravelRestorePoints(logs, merges, enrichmentPool));
        setCustomPoint(null);
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

  // Real Firestore JSON Backup Download (never downloads HTML)
  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    setBackupStatus(null);
    try {
      const res = await apiClient.downloadBackupJson();
      setBackupStatus(`تم تنزيل النسخة الاحتياطية بنجاح (${res.personsCount} فرداً) في الملف: ${res.filename}`);
    } catch (err: any) {
      setBackupStatus(`تعذر إنشاء النسخة الاحتياطية: ${err.message || 'خطأ غير متوقع'}`);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  // Multi-format Restore (JSON, Interactive HTML, Excel XLSX)
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsRestoring(true);
    setRestoreStatus({ type: 'info', message: 'جارٍ قراءة الملف وفحص العلاقات والأنساب...' });

    try {
      const parsed = await parseBackupFile(file);

      if (parsed.isEmptyAppShellHtml) {
        setRestoreStatus({
          type: 'warning',
          message:
            parsed.diagnostics ||
            'هذا الملف لا يحتوي على بيانات العائلة. استخدم أداة «الاستعادة الطارئة من سجل التعديلات السحابي» بالأسفل.'
        });
        return;
      }

      const result = await apiClient.restoreBackup(parsed.persons, {
        mode: 'replace',
        sourceLabel: `${parsed.sourceLabel} (${file.name})`
      });

      const warnSuffix =
        result.warnings.length > 0 ? ` (${result.warnings.join(' · ')})` : '';
      setRestoreStatus({
        type: 'success',
        message: `تمت الاستعادة بنجاح من ${parsed.sourceLabel}: تم استرداد ${result.restoredCount} فرداً إلى قاعدة البيانات السحابية.${warnSuffix}`
      });
      onDataResetOrRestored();
      await loadAdminData();
    } catch (err: any) {
      setRestoreStatus({
        type: 'error',
        message: `تعذر استعادة الملف: ${err.message || 'صيغة الملف غير مدعومة'}`
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Emergency Recovery from Cloud Audit Logs / Local Safety Snapshot
  const handleCloudEmergencyRestore = () => {
    if (!cloudRecovery || cloudRecovery.persons.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: 'استعادة البيانات المحذوفة إلى الشجرة',
      message: `سيتم استعادة ${cloudRecovery.persons.length} فرداً (${cloudRecovery.maleCount} ذكور و ${cloudRecovery.femaleCount} إناث) وإعادة بناء روابط الآباء والأجداد تلقائياً في قاعدة البيانات السحابية. هل ترغب بالمتابعة؟`,
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsRestoring(true);
        setRestoreStatus({
          type: 'info',
          message: `جارٍ استعادة ${cloudRecovery.persons.length} فرداً إلى قاعدة البيانات السحابية...`
        });
        try {
          const sourceLabel =
            cloudRecovery.source === 'local_safety'
              ? 'نسخة الأمان التلقائية'
              : 'سجل التعديلات السحابي';
          const result = await apiClient.restoreBackup(cloudRecovery.persons, {
            mode: 'replace',
            sourceLabel
          });
          setRestoreStatus({
            type: 'success',
            message: `تمت الاستعادة الطارئة بنجاح! تم استرجاع ${result.restoredCount} فرداً إلى شجرة العائلة.`
          });
          onDataResetOrRestored();
          await loadAdminData();
        } catch (err: any) {
          setRestoreStatus({
            type: 'error',
            message: `حدث خطأ أثناء الاستعادة الطارئة: ${err.message || 'يرجى المحاولة مرة أخرى'}`
          });
        } finally {
          setIsRestoring(false);
        }
      }
    });
  };

  const handleDownloadRecoveredJson = () => {
    if (!cloudRecovery || cloudRecovery.persons.length === 0) return;
    const filename = triggerJsonBackupDownload(
      {
        version: 2,
        source: cloudRecovery.source,
        exportedAt: new Date().toISOString(),
        personsCount: cloudRecovery.persons.length,
        persons: cloudRecovery.persons
      },
      'family_tree_recovered'
    );
    setRestoreStatus({
      type: 'success',
      message: `تم حفظ البيانات المستخرجة (${cloudRecovery.persons.length} فرداً) كملف JSON آمن: ${filename}`
    });
  };

  // Restore a specific Time-Travel point
  const handleRestoreTimeTravelPoint = (point: TimeTravelRestorePoint) => {
    if (!point || point.persons.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: `العودة بالزمن: ${point.label}`,
      message: `سيتم استبدال البيانات الحالية بنسخة «${point.label}» التي تحتوي على ${point.rootsCount} شجرة/أصل (${point.persons.length} فرداً: ${point.maleCount} ذكور و ${point.femaleCount} إناث) مع حفظ نسخة أمان تلقائية للوضع الحالي. هل ترغب بالمتابعة؟`,
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsRestoring(true);
        setRestoreStatus({
          type: 'info',
          message: `جارٍ استعادة نسخة «${point.label}» (${point.persons.length} فرداً)...`
        });
        try {
          const result = await apiClient.restoreBackup(point.persons, {
            mode: 'replace',
            sourceLabel: `استعادة زمنية: ${point.label}`
          });
          setRestoreStatus({
            type: 'success',
            message: `تمت الاستعادة الزمنية بنجاح! عادت الشجرة إلى حالة «${point.label}» (${result.restoredCount} فرداً، ${point.rootsCount} أشجار).`
          });
          onDataResetOrRestored();
          await loadAdminData();
        } catch (err: any) {
          setRestoreStatus({
            type: 'error',
            message: `حدث خطأ أثناء الاستعادة الزمنية: ${err.message || 'يرجى المحاولة مرة أخرى'}`
          });
        } finally {
          setIsRestoring(false);
        }
      }
    });
  };

  const handleDownloadTimeTravelJson = (point: TimeTravelRestorePoint) => {
    const filename = triggerJsonBackupDownload(
      {
        version: 2,
        source: 'time_travel_point',
        pointLabel: point.label,
        cutoffTimestamp: point.cutoffTimestamp,
        exportedAt: new Date().toISOString(),
        personsCount: point.persons.length,
        rootsCount: point.rootsCount,
        persons: point.persons
      },
      'family_tree_point_in_time'
    );
    setRestoreStatus({
      type: 'success',
      message: `تم تنزيل نسخة «${point.label}» (${point.persons.length} فرداً) بصيغة JSON: ${filename}`
    });
  };

  const handleRestoreLocalSafety = (snap: LocalSafetySnapshot) => {
    if (!snap || snap.persons.length === 0) return;
    const savedLabel = new Date(snap.savedAt).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    setConfirmDialog({
      isOpen: true,
      title: 'استعادة نسخة الأمان الكاملة من جهازك',
      message: `سيتم استعادة النسخة التلقائية المحفوظة في (${savedLabel}) والتي تحتوي على ${snap.persons.length} فرداً في ${snap.rootsCount} أصول بكامل تفاصيلها وروابطها وملاحظاتها. سيتم حفظ الوضع الحالي تلقائياً قبل التغيير.`,
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsRestoring(true);
        setRestoreStatus({
          type: 'info',
          message: `جارٍ استعادة نسخة الأمان الكاملة (${snap.persons.length} فرداً)...`
        });
        try {
          const result = await apiClient.restoreBackup(snap.persons, {
            mode: 'replace',
            sourceLabel: `نسخة أمان تلقائية كاملة (${savedLabel})`
          });
          setRestoreStatus({
            type: 'success',
            message: `تمت استعادة النسخة الكاملة بنجاح! (${result.restoredCount} فرداً، ${snap.rootsCount} أصول بكامل التفاصيل).`
          });
          onDataResetOrRestored();
          await loadAdminData();
        } catch (err: any) {
          setRestoreStatus({
            type: 'error',
            message: `حدث خطأ أثناء الاستعادة: ${err.message || 'يرجى المحاولة مرة أخرى'}`
          });
        } finally {
          setIsRestoring(false);
        }
      }
    });
  };

  const handleDownloadLocalSafetyJson = (snap: LocalSafetySnapshot) => {
    const filename = triggerJsonBackupDownload(
      {
        version: 2,
        source: 'local_safety_snapshot',
        savedAt: snap.savedAt,
        reason: snap.reason,
        exportedAt: new Date().toISOString(),
        personsCount: snap.persons.length,
        rootsCount: snap.rootsCount,
        persons: snap.persons
      },
      'family_tree_safety_backup'
    );
    setRestoreStatus({
      type: 'success',
      message: `تم تنزيل نسخة الأمان الكاملة (${snap.persons.length} فرداً) بصيغة JSON: ${filename}`
    });
  };

  const handleCheckCustomDateTime = () => {
    if (!customDateTime) return;
    const ms = new Date(customDateTime).getTime();
    if (Number.isNaN(ms)) return;
    const enrichmentPool = buildEnrichmentPool(localSafetyBackups);
    const snap = reconstructAtTimestamp(auditLogs, mergeOperations, ms, {
      ignoreClears: false,
      enrichmentPersons: enrichmentPool
    });
    const formatted = new Date(ms).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    setCustomPoint({
      id: `custom_${ms}`,
      label: `حالة الشجرة في ${formatted}`,
      subLabel: `بناءً على ${snap.logsIncludedCount} عملية حتى هذا الوقت المحدد`,
      cutoffTimestamp: new Date(ms).toISOString(),
      cutoffMs: ms,
      persons: snap.persons,
      rootsCount: snap.rootsCount,
      rootNames: snap.rootNames,
      rootDetails: snap.rootDetails,
      maleCount: snap.maleCount,
      femaleCount: snap.femaleCount,
      wifeLinksCount: snap.wifeLinksCount,
      motherLinksCount: snap.motherLinksCount,
      notesCount: snap.notesCount,
      logsIncludedCount: snap.logsIncludedCount,
      isBeforeToday: true
    });
    setPreviewedPointId(`custom_${ms}`);
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-0 sm:my-8 max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F4C3A] via-[#092e23] to-[#0F4C3A] text-white flex items-start sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold font-display leading-snug">
                لوحة إعدادات المشرف وقفل التعديل
              </h3>
              <p className="text-[11px] text-white/75 leading-relaxed mt-0.5">
                إدارة الصلاحيات، النسخ الاحتياطي، وفحص سلامة الأنساب
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

        {/* If not authenticated as Admin: Show Passcode Challenge */}
        {!isAdmin ? (
          <form onSubmit={handleLogin} className="p-5 sm:p-8 max-w-md w-full mx-auto space-y-5 text-center overflow-y-auto">
            <div className="flex flex-col items-center gap-2 mx-auto">
              <img
                src="/tree-logo.png"
                alt="شعار شجرة العائلة"
                className="w-16 h-16 rounded-2xl object-contain shadow-md border border-[#D4AF37]/50 p-0.5 bg-[#0F4C3A]"
              />
            </div>

            <div>
              <h4 className="text-base sm:text-lg font-bold text-slate-900 font-display">
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
              className="w-full min-h-[44px] h-11 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white shadow-xs transition"
            >
              {!settings.hasAdminPasscode ? 'حفظ الرمز السري والمتابعة' : 'تأكيد ودخول المشرف'}
            </button>
          </form>
        ) : (
          /* Admin Dashboard Content */
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Tabs Bar */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold shrink-0">
              <button
                onClick={() => setActiveTab('status')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'status' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                أدوات المشرف والإدارة
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'logs' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                سجل التعديلات (Audit)
              </button>
              <button
                onClick={() => setActiveTab('merges')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'merges' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                العمليات الأخيرة والتراجع
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'backup' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                النسخ الاحتياطي والاستعادة
              </button>
              <button
                onClick={() => setActiveTab('passcode')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'passcode' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                تغيير الرمز السري
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Tab 1: Supervisor Tools & Permissions */}
              {activeTab === 'status' && (
                <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                  {actionMessage && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                      {actionMessage}
                    </div>
                  )}

                  <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-[#0F4C3A]">وضع صلاحيات النظام:</h4>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          الإضافة والتعديل والحذف ودمج الفروع متاحة <strong>حصرياً للمشرف</strong>، بينما يظهر لبقية الزوار عرض الصفحات والبيانات الجاهزة فقط.
                        </p>
                      </div>

                      <span className="self-start sm:self-center text-xs font-bold text-[#0F4C3A] bg-white border border-emerald-200 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xs shrink-0">
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
                          className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-[#0F4C3A] text-white flex items-center justify-center shrink-0">
                            <Plus className="w-4 h-4 text-[#D4AF37]" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                              إضافة فرد أو فرع جديد
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
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
                          className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#0F4C3A] flex items-center justify-center shrink-0">
                            <ArrowUp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                              نقل الابن وفروعه إلى الجد الأعلى / + جد
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              نقل ابن وفروعه لجد أعلى أو إضافة جد أو أكثر من جد فوق الأصول الحالية
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
                          className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 text-[#8C6D1F] flex items-center justify-center shrink-0">
                            <GitMerge className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                              دمج الأشجار تحت أصل مشترك
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
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
                          className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#0F4C3A] hover:bg-[#FBF9F5] transition text-right flex items-start gap-3 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 group-hover:text-[#0F4C3A]">
                              إدارة وتعديل وحذف الأفراد
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              فتح سجل الأفراد الكامل للتعديل أو الحذف المباشر
                            </div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Audit Log */}
              {activeTab === 'logs' && (
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-[#0F4C3A]">
                      سجل التعديلات والعمليات ({auditLogs.length})
                    </h4>
                    <button
                      onClick={loadAdminData}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs text-slate-600 hover:text-[#0F4C3A] flex items-center gap-1"
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
                          <div className="flex items-center justify-between gap-2 flex-wrap text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {log.actor}: {log.actionType}
                            </span>
                            <span className="text-[10px] tabular-nums">
                              {new Date(log.timestamp).toLocaleString('ar-SA')}
                            </span>
                          </div>
                          <p className="text-slate-900 font-medium leading-relaxed break-words">{log.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Change Requests */}
              {activeTab === 'requests' && (
                <div className="p-4 sm:p-6 space-y-4">
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
                        <div key={req.id} className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
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

                          <div className="break-words">المقدم: <strong>{req.requesterName}</strong></div>
                          {req.targetPersonName && (
                            <div className="break-words">الفرد المعني: <strong>{req.targetPersonName}</strong></div>
                          )}
                          <div className="text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed break-words">
                            {req.requesterNotes}
                          </div>

                          {req.status === 'pending' && (
                            <div className="grid grid-cols-2 sm:flex items-center gap-2 pt-2">
                              <button
                                onClick={() => handleResolveRequest(req.id, 'approved')}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                              >
                                قبول وتطبيق التعديل
                              </button>
                              <button
                                onClick={() => handleResolveRequest(req.id, 'rejected')}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
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
                <div className="p-4 sm:p-6 space-y-4">
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
                        <div key={m.id} className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 leading-snug break-words">
                              دمج: {m.sourcePersonName} في {m.targetPersonName}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              تم نقل {m.movedChildrenIds.length} فروع · {new Date(m.timestamp).toLocaleString('ar-SA')}
                            </div>
                          </div>

                          <button
                            onClick={() => handleUndoMerge(m.id)}
                            className="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0"
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
                <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                  {/* Local Automatic Full-Fidelity Safety Snapshots (Saved on this device before any restore/clear) */}
                  {localSafetyBackups.length > 0 && (
                    <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-500/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 space-y-3.5 shadow-xs">
                      <div className="flex items-start gap-2.5 text-[#0F4C3A]">
                        <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-[#0F4C3A]">
                            نسخ الأمان التلقائية المحفوظة على جهازك (بكامل التفاصيل الأصلية)
                          </h4>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            حفظ النظام تلقائياً نسخة كاملة مطابقة تماماً قبل كل عملية استعادة أو تفريغ — تتضمن جميع الأصول والفروع والروابط والملاحظات والزوجات والأمهات كما كانت تماماً.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
                        {localSafetyBackups.map((snap) => {
                          const isPreviewOpen = previewedPointId === snap.id;
                          const savedFormatted = new Date(snap.savedAt).toLocaleString('ar-SA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                          return (
                            <div
                              key={snap.id}
                              className="p-3.5 rounded-2xl border border-emerald-200 bg-white space-y-2.5 shadow-xs"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold">
                                    نسخة كاملة مطابقة
                                  </span>
                                  <span className="font-bold text-xs sm:text-sm text-[#0F4C3A]">
                                    {snap.reason || 'نسخة أمان تلقائية'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0F4C3A] text-[10px] font-bold">
                                    {snap.rootsCount} {snap.rootsCount === 1 ? 'شجرة' : snap.rootsCount === 2 ? 'شجرتان' : snap.rootsCount <= 10 ? 'أشجار' : 'شجرة'} · {snap.persons.length} فرداً
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>تاريخ الحفظ: {savedFormatted} ({snap.maleCount} ذكور · {snap.femaleCount} إناث)</span>
                                  <span className="font-bold text-rose-700">
                                    · روابط الزوجات: {snap.wifeLinksCount}
                                  </span>
                                  <span className="font-bold text-emerald-700">
                                    · الأمهات: {snap.motherLinksCount}
                                  </span>
                                  <span className="font-bold text-amber-700">
                                    · الملاحظات: {snap.notesCount}
                                  </span>
                                </div>
                                {snap.rootDetails.length > 0 && (
                                  <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-2 rounded-lg border border-slate-100 space-y-1">
                                    <div className="font-bold text-[#0F4C3A]">
                                      أصول الأشجار في هذه النسخة ({snap.rootsCount}):
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {snap.rootDetails.slice(0, 8).map((r) => (
                                        <span
                                          key={r.id}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-slate-800 font-semibold"
                                        >
                                          <span>{r.fullName}</span>
                                          <span className="text-[10px] text-emerald-700 font-bold">
                                            ({r.branchCount} فرداً)
                                          </span>
                                        </span>
                                      ))}
                                      {snap.rootDetails.length > 8 && (
                                        <span className="px-2 py-0.5 text-[10px] text-slate-500 font-semibold">
                                          +{snap.rootDetails.length - 8} أصول أخرى
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  disabled={isRestoring}
                                  onClick={() => handleRestoreLocalSafety(snap)}
                                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  <span>استعادة هذه النسخة الكاملة الآن</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setPreviewedPointId(isPreviewOpen ? null : snap.id)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                                >
                                  {isPreviewOpen ? 'إخفاء الأسماء' : 'معاينة الأسماء'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDownloadLocalSafetyJson(snap)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-emerald-700/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center gap-1 transition"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>حفظ JSON</span>
                                </button>
                              </div>

                              {isPreviewOpen && (
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 text-xs">
                                  {snap.persons.slice(0, 120).map((p, idx) => (
                                    <div key={p.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                      <span className="font-semibold text-slate-800 truncate">
                                        {idx + 1}. {p.fullName}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                                          p.gender === 'female'
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-emerald-50 text-emerald-700'
                                        }`}
                                      >
                                        {p.gender === 'female' ? 'أنثى' : 'ذكر'}
                                        {!p.fatherId ? ' · أصل شجرة' : ''}
                                      </span>
                                    </div>
                                  ))}
                                  {snap.persons.length > 120 && (
                                    <div className="px-3 py-1.5 text-center text-[11px] text-slate-500">
                                      ... و {snap.persons.length - 120} فرداً آخرين
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Time-Travel Point-in-Time Recovery Card (Restore to Before Today / Any Prior Date) */}
                  <div className="p-4 sm:p-5 rounded-2xl border-2 border-[#D4AF37]/70 bg-gradient-to-br from-emerald-50/90 via-[#FBF9F5] to-amber-50/70 space-y-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 text-[#0F4C3A]">
                        <div className="w-9 h-9 rounded-xl bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-[#0F4C3A]">
                            الاستعادة الزمنية — العودة لنسخة ما قبل تعديلات اليوم أو أي تاريخ سابق
                          </h4>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            يقرأ النظام سجل التعديلات السحابي ويعيد تجميع الأشجار والفروع في أصولها الأصلية بدقة، مع دمج الملاحظات وروابط الأمهات والزوجات تلقائياً عند توفر نسخة أمان محلية.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={loadAdminData}
                        disabled={loadingData}
                        className="self-start sm:self-center min-h-[34px] px-3 py-1.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 text-xs font-bold text-[#0F4C3A] flex items-center gap-1.5 transition shrink-0"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                        <span>تحديث النقاط الزمنية</span>
                      </button>
                    </div>

                    {loadingData ? (
                      <div className="text-xs text-slate-600 bg-white/80 p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#0F4C3A]" />
                        <span>جارٍ تحليل السجل السحابي واستخراج نقاط الاستعادة الزمنية...</span>
                      </div>
                    ) : timeTravelPoints.length > 0 ? (
                      <div className="space-y-3">
                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
                          {timeTravelPoints.map((pt) => {
                            const isPreviewOpen = previewedPointId === pt.id;
                            return (
                              <div
                                key={pt.id}
                                className={`p-3.5 rounded-2xl border space-y-2.5 transition ${
                                  pt.isHighlighted
                                    ? 'bg-white border-emerald-400 shadow-xs'
                                    : 'bg-white/90 border-slate-200'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                  <div className="space-y-1.5 min-w-0 w-full">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {pt.isHighlighted && (
                                        <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/25 text-[#78570A] text-[10px] font-black">
                                          موصى به
                                        </span>
                                      )}
                                      <span className="font-bold text-xs sm:text-sm text-[#0F4C3A]">
                                        {pt.label}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0F4C3A] text-[10px] font-bold">
                                        {pt.rootsCount} {pt.rootsCount === 1 ? 'شجرة' : pt.rootsCount === 2 ? 'شجرتان' : pt.rootsCount <= 10 ? 'أشجار' : 'شجرة'} · {pt.persons.length} فرداً
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      <span>{pt.subLabel} ({pt.maleCount} ذكور · {pt.femaleCount} إناث)</span>
                                      <span className={pt.wifeLinksCount > 0 ? 'font-bold text-rose-700' : 'text-slate-400'}>
                                        · روابط الزوجات: {pt.wifeLinksCount}
                                      </span>
                                      {pt.motherLinksCount > 0 && (
                                        <span className="font-bold text-emerald-700">
                                          · الأمهات: {pt.motherLinksCount}
                                        </span>
                                      )}
                                      {pt.notesCount > 0 && (
                                        <span className="font-bold text-amber-700">
                                          · الملاحظات: {pt.notesCount}
                                        </span>
                                      )}
                                    </div>
                                    {pt.rootDetails.length > 0 && (
                                      <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-2 rounded-lg border border-slate-100 space-y-1">
                                        <div className="font-bold text-[#0F4C3A]">
                                          أصول الأشجار في هذه النسخة ({pt.rootsCount}):
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {pt.rootDetails.slice(0, 8).map((r) => (
                                            <span
                                              key={r.id}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-semibold"
                                            >
                                              <span>{r.fullName}</span>
                                              <span className="text-[10px] text-emerald-700 font-bold">
                                                ({r.branchCount} فرداً)
                                              </span>
                                            </span>
                                          ))}
                                          {pt.rootDetails.length > 8 && (
                                            <span className="px-2 py-0.5 text-[10px] text-slate-500 font-semibold">
                                              +{pt.rootDetails.length - 8} أصول أخرى
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                  <button
                                    type="button"
                                    disabled={isRestoring}
                                    onClick={() => handleRestoreTimeTravelPoint(pt)}
                                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                                    <span>استعادة هذه النسخة الآن</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewedPointId(isPreviewOpen ? null : pt.id)
                                    }
                                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                                  >
                                    {isPreviewOpen ? 'إخفاء الأسماء' : 'معاينة الأسماء'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDownloadTimeTravelJson(pt)}
                                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#0F4C3A]/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center gap-1 transition"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>حفظ JSON</span>
                                  </button>
                                </div>

                                {isPreviewOpen && (
                                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 text-xs">
                                    {pt.persons.slice(0, 120).map((p, idx) => (
                                      <div key={p.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-800 truncate">
                                          {idx + 1}. {p.fullName}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                                            p.gender === 'female'
                                              ? 'bg-rose-50 text-rose-700'
                                              : 'bg-emerald-50 text-emerald-700'
                                          }`}
                                        >
                                          {p.gender === 'female' ? 'أنثى' : 'ذكر'}
                                          {!p.fatherId ? ' · أصل شجرة' : ''}
                                        </span>
                                      </div>
                                    ))}
                                    {pt.persons.length > 120 && (
                                      <div className="px-3 py-1.5 text-center text-[11px] text-slate-500">
                                        ... و {pt.persons.length - 120} فرداً آخرين
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Custom Date/Time Picker for Exact Rollback */}
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                          <div className="text-xs font-bold text-slate-800">
                            أو اختر تاريخاً وساعة محددة للعودة إليها بالضبط:
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="datetime-local"
                              value={customDateTime}
                              onChange={(e) => setCustomDateTime(e.target.value)}
                              className="flex-1 h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={handleCheckCustomDateTime}
                              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shrink-0"
                            >
                              فحص حالة الشجرة في هذا الوقت
                            </button>
                          </div>

                          {customPoint && (
                            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
                              {customPoint.persons.length > 0 ? (
                                <>
                                  <div className="font-bold text-[#0F4C3A]">
                                    {customPoint.label}: تم العثور على {customPoint.rootsCount} {customPoint.rootsCount === 1 ? 'شجرة' : customPoint.rootsCount === 2 ? 'شجرتين' : customPoint.rootsCount <= 10 ? 'أشجار' : 'شجرة'} و {customPoint.persons.length} فرداً ({customPoint.maleCount} ذكور · {customPoint.femaleCount} إناث)
                                  </div>
                                  {customPoint.rootDetails.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                      {customPoint.rootDetails.slice(0, 8).map((r) => (
                                        <span
                                          key={r.id}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-slate-800 font-semibold"
                                        >
                                          <span>{r.fullName}</span>
                                          <span className="text-[10px] text-emerald-700 font-bold">
                                            ({r.branchCount} فرداً)
                                          </span>
                                        </span>
                                      ))}
                                      {customPoint.rootDetails.length > 8 && (
                                        <span className="px-2 py-0.5 text-[10px] text-slate-500 font-semibold">
                                          +{customPoint.rootDetails.length - 8} أصول أخرى
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      disabled={isRestoring}
                                      onClick={() => handleRestoreTimeTravelPoint(customPoint)}
                                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white text-xs font-bold flex items-center gap-1.5 transition"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                                      <span>استعادة هذه اللحظة الآن</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadTimeTravelJson(customPoint)}
                                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#0F4C3A]/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center gap-1 transition"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>حفظ JSON</span>
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="text-amber-900">
                                  لم تكن هناك سجلات مضافة قبل هذا التاريخ والوقت المحدد. جرّب اختيار تاريخ أحدث قليلاً.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : cloudRecovery && cloudRecovery.persons.length > 0 ? (
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-white border border-emerald-200 text-xs space-y-1">
                          <div className="font-bold text-[#0F4C3A] flex items-center gap-1.5 flex-wrap">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              تم العثور على {cloudRecovery.persons.length} فرداً قابلاً للاستعادة
                              ({cloudRecovery.maleCount} ذكور · {cloudRecovery.femaleCount} إناث · {cloudRecovery.rootsCount} أصل شجرة)
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isRestoring}
                            onClick={handleCloudEmergencyRestore}
                            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs"
                          >
                            <RotateCcw className="w-4 h-4 text-[#D4AF37]" />
                            <span>
                              {isRestoring ? 'جارٍ الاستعادة...' : `استعادة الـ ${cloudRecovery.persons.length} فرداً الآن إلى الشجرة`}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadRecoveredJson}
                            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#0F4C3A]/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center justify-center gap-1.5 transition"
                          >
                            <Download className="w-4 h-4" />
                            <span>حفظها كملف JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRecoveryPreview(prev => !prev)}
                            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                          >
                            {showRecoveryPreview ? 'إخفاء المعاينة' : 'معاينة الأسماء'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 bg-white/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
                        لم يتم العثور على نقاط زمنية سابقة في السجل السحابي. إذا كان لديك ملف <strong>شجرة تفاعلية (HTML)</strong> أو ملف <strong>إكسل (XLSX)</strong> سبق تصديره، يمكنك رفعه مباشرة في خانة «استعادة نسخة احتياطية» بالأسفل.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Backup Card */}
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center gap-2 text-[#0F4C3A]">
                        <Download className="w-5 h-5 text-[#D4AF37]" />
                        <h4 className="font-bold text-sm">تنزيل نسخة احتياطية (JSON)</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        تصدير مباشر لكامل بيانات الشجرة والأفراد من قاعدة البيانات السحابية في ملف JSON حقيقي وآمن وخالٍ من كلمات المرور.
                      </p>
                      <button
                        type="button"
                        disabled={isDownloadingBackup}
                        onClick={handleDownloadBackup}
                        className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] disabled:opacity-60 text-xs font-bold transition shadow-xs"
                      >
                        <Download className="w-4 h-4" />
                        <span>{isDownloadingBackup ? 'جارٍ تجهيز ملف JSON...' : 'تنزيل النسخة الاحتياطية الآن (JSON)'}</span>
                      </button>

                      {backupStatus && (
                        <div className="text-xs font-semibold text-[#0F4C3A] bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 leading-relaxed">
                          {backupStatus}
                        </div>
                      )}
                    </div>

                    {/* Restore Card */}
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center gap-2 text-[#0F4C3A]">
                        <Upload className="w-5 h-5 text-[#D4AF37]" />
                        <h4 className="font-bold text-sm">استعادة نسخة احتياطية (JSON / HTML / Excel)</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        يدعم رفع ملف النسخة الاحتياطية <strong>JSON</strong>، أو ملف الشجرة التفاعلية <strong>HTML</strong>، أو ملف الإكسل <strong>XLSX</strong> المصدَّر سابقاً مع فحص تلقائي للعلاقات.
                      </p>
                      <label className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs font-bold transition cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>{isRestoring ? 'جارٍ الاستعادة...' : 'اختيار ملف (JSON أو HTML أو XLSX)'}</span>
                        <input
                          type="file"
                          accept=".json,.html,.htm,.xlsx"
                          disabled={isRestoring}
                          onChange={handleFileRestore}
                          className="hidden"
                        />
                      </label>

                      {restoreStatus && (
                        <div
                          className={`text-xs font-semibold p-3 rounded-xl border leading-relaxed ${
                            restoreStatus.type === 'success'
                              ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                              : restoreStatus.type === 'warning'
                              ? 'text-amber-900 bg-amber-50 border-amber-300'
                              : restoreStatus.type === 'error'
                              ? 'text-red-800 bg-red-50 border-red-200'
                              : 'text-slate-700 bg-slate-50 border-slate-200'
                          }`}
                        >
                          {restoreStatus.message}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sample / Reset Section */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">إدارة البيانات النموذجية</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        يمكنك إعادة تحميل بيانات عائلية نموذجية للتجربة، أو تفريغ الشجرة تماماً لبدء العمل الحقيقي.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        onClick={handleResetSample}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                      >
                        تحميل عينة نموذجية
                      </button>
                      <button
                        onClick={handleClearAll}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-red-300 bg-white text-red-600 hover:bg-red-50 text-xs font-semibold transition"
                      >
                        تفريغ الشجرة لبدء عائلتك
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 6: Change Passcode */}
              {activeTab === 'passcode' && (
                <form onSubmit={handleChangePasscode} className="p-4 sm:p-6 max-w-md mx-auto space-y-4">
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
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
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
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
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
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[42px] py-2.5 rounded-xl text-xs font-bold bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] transition"
                  >
                    حفظ الرمز السري الجديد
                  </button>
                </form>
              )}
            </div>

            {/* Admin Footer with Logout */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-xs shrink-0">
              <span className="text-slate-500">
                جلسة المشرف نشطة وآمنة
              </span>
              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 font-semibold transition cursor-pointer"
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
