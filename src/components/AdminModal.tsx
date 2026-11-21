import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  CheckCircle,
  GitMerge,
  Plus,
  ArrowUp,
  Users,
  Heart,
  Search,
  FileSpreadsheet,
  FileCode,
  FileJson
} from 'lucide-react';
import { AppSettings, AuditLog, ChangeRequest, MergeOperation, Person } from '../types/family';
import { apiClient } from '../api/client';
import { ConfirmModal } from './ConfirmModal';
import {
  parseBackupFile,
  reconstructAtTimestamp,
  detachPersonAsRootInSnapshot,
  stripAuditMetaTag,
  loadLocalSafetyBackups,
  triggerJsonBackupDownload,
  TimeTravelRestorePoint,
  LocalSafetySnapshot
} from '../utils/backupRecovery';
import { exportTreeToExcel } from '../utils/excelExport';
import { exportTreeToInteractiveHtml } from '../utils/htmlExport';
import { normalizeArabic } from '../utils/nameUtils';

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
  const [activeTab, setActiveTab] = useState<'status' | 'wives' | 'logs' | 'requests' | 'backup' | 'passcode'>('status');
  
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
  const [downloadingFormat, setDownloadingFormat] = useState<'json' | 'html' | 'excel' | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [localSafetyBackups, setLocalSafetyBackups] = useState<LocalSafetySnapshot[]>([]);

  const [currentPersonsForEnrich, setCurrentPersonsForEnrich] = useState<LocalSafetySnapshot['persons']>([]);

  // Quick Batch Wife-Linking tab state
  const [wivesFilter, setWivesFilter] = useState<'unlinked' | 'linked' | 'all'>('unlinked');
  const [wivesSearch, setWivesSearch] = useState<string>('');
  const [editingWifeId, setEditingWifeId] = useState<string | null>(null);
  const [husbandQuery, setHusbandQuery] = useState<string>('');
  const [externalHusbandText, setExternalHusbandText] = useState<string>('');
  const [wifeSavingId, setWifeSavingId] = useState<string | null>(null);
  const [wivesNotice, setWivesNotice] = useState<string | null>(null);

  // Interactive Click-to-Restore inside Audit Logs tab
  const [logsSearch, setLogsSearch] = useState<string>('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedLogMode, setSelectedLogMode] = useState<'at' | 'before'>('at');
  const [selectedLogPoint, setSelectedLogPoint] = useState<TimeTravelRestorePoint | null>(null);
  const [showLogPointPreview, setShowLogPointPreview] = useState<boolean>(false);
  const [logPreviewSearch, setLogPreviewSearch] = useState<string>('');

  const getTrustedRootIdsForCutoff = (snaps: LocalSafetySnapshot[], cutoffMs: number): Set<string> => {
    // Only use root IDs from a local safety snapshot actually saved at or before `cutoffMs`
    const cleanCandidates = snaps
      .filter((s) => {
        const savedMs = new Date(s.savedAt).getTime();
        return !Number.isNaN(savedMs) && savedMs <= cutoffMs + 60_000 && s.rootsCount >= 1 && s.rootsCount <= 6;
      })
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    const chosen = cleanCandidates[0];
    if (!chosen) return new Set<string>();
    return new Set<string>(chosen.rootDetails.map((r) => r.id));
  };

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
        const localSnaps = loadLocalSafetyBackups();
        setLocalSafetyBackups(localSnaps);
        const [logs, merges, livePersons] = await Promise.all([
          apiClient.getAuditLogs(),
          apiClient.getMergeOperations(),
          apiClient.getPersons().catch(() => [])
        ]);
        setAuditLogs(logs);
        setMergeOperations(merges);
        setCurrentPersonsForEnrich(livePersons);
      } else if (activeTab === 'wives') {
        const livePersons = await apiClient.getPersons().catch(() => []);
        setCurrentPersonsForEnrich(livePersons);
      } else if (activeTab === 'requests') {
        const reqs = await apiClient.getChangeRequests();
        setChangeRequests(reqs);
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

  // Export Backup in 3 formats: Excel (.xlsx), Interactive HTML (.html), or JSON (.json)
  const handleDownloadBackup = async (format: 'json' | 'html' | 'excel') => {
    setDownloadingFormat(format);
    setBackupStatus(null);
    try {
      if (format === 'json') {
        const res = await apiClient.downloadBackupJson();
        setBackupStatus(`تم تصدير النسخة الاحتياطية (JSON) بنجاح (${res.personsCount} فرداً): ${res.filename}`);
        return;
      }

      const persons = await apiClient.getPersons();
      if (persons.length === 0) {
        setBackupStatus('لا توجد بيانات في الشجرة لتصديرها.');
        return;
      }

      const byId = new Map<string, Person>(persons.map((p) => [p.id, p]));
      const childrenByFather = new Map<string, Person[]>();
      for (const p of persons) {
        if (p.fatherId && byId.has(p.fatherId)) {
          const list = childrenByFather.get(p.fatherId) || [];
          list.push(p);
          childrenByFather.set(p.fatherId, list);
        }
      }
      const roots = persons.filter((p) => !p.fatherId || !byId.has(p.fatherId));
      const effectiveRoots = roots.length > 0 ? roots : [persons[0]];
      const getChildren = (personId: string) => childrenByFather.get(personId) || [];

      if (format === 'excel') {
        const { filename } = exportTreeToExcel({
          rootPerson: effectiveRoots[0],
          rootPersons: effectiveRoots,
          getChildren,
          allPersons: persons,
          includeFemales: true
        });
        setBackupStatus(`تم تصدير النسخة الاحتياطية (إكسل) بنجاح (${persons.length} فرداً): ${filename}`);
      } else {
        const { filename } = await exportTreeToInteractiveHtml({
          rootPerson: effectiveRoots[0],
          rootPersons: effectiveRoots,
          getChildren,
          getAllPersons: () => persons,
          mode: 'classic',
          includeFemales: true
        });
        setBackupStatus(`تم تصدير النسخة الاحتياطية (HTML) بنجاح (${persons.length} فرداً): ${filename}`);
      }
    } catch (err: any) {
      setBackupStatus(`تعذر تصدير النسخة الاحتياطية: ${err.message || 'خطأ غير متوقع'}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  // Multi-format Restore (JSON, Interactive HTML, Excel XLSX)
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsRestoring(true);
    setRestoreStatus({ type: 'info', message: 'جارٍ قراءة الملف واستعادة البيانات...' });

    try {
      const parsed = await parseBackupFile(file);

      if (parsed.isEmptyAppShellHtml) {
        setRestoreStatus({
          type: 'warning',
          message: parsed.diagnostics || 'هذا الملف لا يحتوي على بيانات العائلة.'
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
        message: `تمت الاستعادة بنجاح (${result.restoredCount} فرداً).${warnSuffix}`
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

  // Restore a specific point from Audit Log
  const handleRestoreTimeTravelPoint = (point: TimeTravelRestorePoint) => {
    if (!point || point.persons.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: `استعادة: ${point.label}`,
      message: `سيتم استبدال البيانات الحالية بنسخة «${point.label}» التي تحتوي على ${point.rootsCount} شجرة/أصل (${point.persons.length} فرداً: ${point.maleCount} ذكور و ${point.femaleCount} إناث). هل ترغب بالمتابعة؟`,
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
            sourceLabel: `استعادة من سجل التعديلات: ${point.label}`
          });
          setRestoreStatus({
            type: 'success',
            message: `تمت الاستعادة بنجاح (${result.restoredCount} فرداً، ${point.rootsCount} أشجار).`
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

  const handleDownloadTimeTravelJson = (point: TimeTravelRestorePoint) => {
    const filename = triggerJsonBackupDownload(
      {
        version: 2,
        source: 'audit_log_point',
        pointLabel: point.label,
        cutoffTimestamp: point.cutoffTimestamp,
        exportedAt: new Date().toISOString(),
        personsCount: point.persons.length,
        rootsCount: point.rootsCount,
        persons: point.persons
      },
      'family_tree_backup'
    );
    setRestoreStatus({
      type: 'success',
      message: `تم تنزيل نسخة «${point.label}» (${point.persons.length} فرداً): ${filename}`
    });
  };

  const handleBatchLinkWife = async (wife: Person, husband: Person | null, customExternalName?: string) => {
    setWifeSavingId(wife.id);
    setWivesNotice(null);
    try {
      if (husband) {
        await apiClient.updatePerson(wife.id, {
          husbandId: husband.id,
          husbandName: husband.fullName
        });
        setWivesNotice(`تم ربط «${wife.fullName}» بالزوج «${husband.fullName}» بنجاح`);
      } else if (customExternalName && customExternalName.trim()) {
        await apiClient.updatePerson(wife.id, {
          husbandId: null,
          husbandName: customExternalName.trim()
        });
        setWivesNotice(`تم تسجيل زوج «${wife.fullName}» (${customExternalName.trim()}) بنجاح`);
      } else {
        await apiClient.updatePerson(wife.id, {
          husbandId: null,
          husbandName: ''
        });
        setWivesNotice(`تم فك ارتباط الزوج عن «${wife.fullName}»`);
      }
      setEditingWifeId(null);
      setHusbandQuery('');
      setExternalHusbandText('');
      const updated = await apiClient.getPersons().catch(() => []);
      setCurrentPersonsForEnrich(updated);
      onSettingsUpdated();
    } catch (err: any) {
      setWivesNotice(err.message || 'تعذر حفظ ربط الزوجة');
    } finally {
      setWifeSavingId(null);
    }
  };

  // Build a Time-Travel Restore Point directly from any clicked Audit Log entry
  const buildPointForAuditLog = (log: AuditLog, mode: 'at' | 'before'): TimeTravelRestorePoint | null => {
    const tsMs = new Date(log.timestamp).getTime();
    if (Number.isNaN(tsMs)) return null;
    const cutoffMs = mode === 'before' ? tsMs - 1 : tsMs;
    const enrichmentPool = buildEnrichmentPool(localSafetyBackups, currentPersonsForEnrich);
    const trustedRootIds = getTrustedRootIdsForCutoff(localSafetyBackups, cutoffMs);
    const snap = reconstructAtTimestamp(auditLogs, mergeOperations, cutoffMs, {
      ignoreClears: false,
      enrichmentPersons: enrichmentPool,
      trustedRootIds
    });
    const formatted = new Date(tsMs).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const cleanDesc = stripAuditMetaTag(log.description);
    return {
      id: `log_${log.id}_${mode}`,
      label:
        mode === 'before'
          ? `قبل التعديل مباشرة (${formatted})`
          : `عند التعديل (${formatted})`,
      subLabel: cleanDesc,
      cutoffTimestamp: new Date(cutoffMs).toISOString(),
      cutoffMs,
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
      isBeforeToday: true,
      isExactSnapshot: snap.isExactSnapshot
    };
  };

  const handleSelectAuditLog = (log: AuditLog) => {
    if (selectedLogId === log.id) {
      setSelectedLogId(null);
      setSelectedLogPoint(null);
      setShowLogPointPreview(false);
      setLogPreviewSearch('');
      return;
    }
    const defaultMode: 'at' | 'before' =
      log.actionType === 'snapshot'
        ? 'at'
        : log.actionType === 'delete' || log.actionType === 'restore' || log.actionType === 'merge'
        ? 'before'
        : 'at';
    setSelectedLogId(log.id);
    setSelectedLogMode(defaultMode);
    setShowLogPointPreview(false);
    setLogPreviewSearch('');
    setSelectedLogPoint(buildPointForAuditLog(log, defaultMode));
  };

  const handleSwitchSelectedLogMode = (log: AuditLog, mode: 'at' | 'before') => {
    setSelectedLogMode(mode);
    setSelectedLogPoint(buildPointForAuditLog(log, mode));
  };

  const handleDetachInSelectedLogPoint = (personId: string) => {
    setSelectedLogPoint((prev) => (prev ? detachPersonAsRootInSnapshot(prev, personId) : prev));
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
                onClick={() => setActiveTab('wives')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap flex items-center gap-1 ${
                  activeTab === 'wives' ? 'bg-rose-700 text-white' : 'text-rose-800 bg-rose-50/70 hover:bg-rose-100'
                }`}
              >
                <Heart className="w-3.5 h-3.5" />
                <span>ربط الزوجات السريع</span>
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl transition whitespace-nowrap ${
                  activeTab === 'logs' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                سجل التعديلات
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

              {/* Quick Batch Wife-Linking Tab */}
              {activeTab === 'wives' && (() => {
                const allFemales = currentPersonsForEnrich.filter((p) => p.gender === 'female');
                const allMales = currentPersonsForEnrich.filter((p) => p.gender === 'male');
                const linkedCount = allFemales.filter(
                  (f) => Boolean(f.husbandId) || Boolean(f.husbandName && f.husbandName.trim())
                ).length;
                const unlinkedCount = allFemales.length - linkedCount;
                const normSearch = normalizeArabic(wivesSearch.trim());
                const filteredFemales = allFemales.filter((f) => {
                  const isLinked = Boolean(f.husbandId) || Boolean(f.husbandName && f.husbandName.trim());
                  if (wivesFilter === 'unlinked' && isLinked) return false;
                  if (wivesFilter === 'linked' && !isLinked) return false;
                  if (normSearch && !normalizeArabic(f.fullName).includes(normSearch) && !normalizeArabic(f.husbandName || '').includes(normSearch)) {
                    return false;
                  }
                  return true;
                });
                const normHQ = normalizeArabic(husbandQuery.trim());
                const matchedMales = normHQ
                  ? allMales.filter((m) => normalizeArabic(m.fullName).includes(normHQ)).slice(0, 12)
                  : allMales.slice(0, 12);

                return (
                  <div className="p-4 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                          <Heart className="w-4 h-4 text-rose-600" />
                          <span>ربط الزوجات السريع ({linkedCount} مربوطة · {unlinkedCount} غير مربوطة)</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          اربط بنات العائلة بأزواجهن بسرعة من مكان واحد — كل ربط يُحفظ تلقائياً في قاعدة البيانات وسجل الاستعادة السحابي.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadAdminData}
                        className="self-start sm:self-center min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:text-[#0F4C3A] flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                        <span>تحديث</span>
                      </button>
                    </div>

                    {wivesNotice && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{wivesNotice}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
                        <button
                          type="button"
                          onClick={() => setWivesFilter('unlinked')}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            wivesFilter === 'unlinked' ? 'bg-rose-700 text-white' : 'text-slate-600 hover:bg-white'
                          }`}
                        >
                          غير مربوطات ({unlinkedCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setWivesFilter('linked')}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            wivesFilter === 'linked' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-white'
                          }`}
                        >
                          مربوطات ({linkedCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setWivesFilter('all')}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            wivesFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-white'
                          }`}
                        >
                          الكل ({allFemales.length})
                        </button>
                      </div>

                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={wivesSearch}
                          onChange={(e) => setWivesSearch(e.target.value)}
                          placeholder="ابحث باسم البنت أو الزوج..."
                          className="w-full h-9 pr-8 pl-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-600"
                        />
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl max-h-96 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {filteredFemales.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                          لا توجد نتائج مطابقة حالياً
                        </div>
                      ) : (
                        filteredFemales.map((f) => {
                          const isEditing = editingWifeId === f.id;
                          const isSaving = wifeSavingId === f.id;
                          const linkedHusband = f.husbandId
                            ? allMales.find((m) => m.id === f.husbandId)
                            : null;
                          const displayHusband = linkedHusband?.fullName || f.husbandName || '';
                          return (
                            <div key={f.id} className="p-3 space-y-2 text-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 break-words">{f.fullName}</div>
                                  {displayHusband ? (
                                    <div className="text-[11px] text-rose-700 font-semibold mt-0.5">
                                      الزوج: {displayHusband}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400 mt-0.5">غير مربوطة بزوج بعد</div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => {
                                      if (isEditing) {
                                        setEditingWifeId(null);
                                      } else {
                                        setEditingWifeId(f.id);
                                        setHusbandQuery('');
                                        setExternalHusbandText(linkedHusband ? '' : f.husbandName || '');
                                      }
                                    }}
                                    className="min-h-[32px] px-3 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[11px] transition cursor-pointer"
                                  >
                                    {isEditing ? 'إغلاق' : displayHusband ? 'تغيير الزوج' : '+ ربط بزوج'}
                                  </button>
                                  {displayHusband && (
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => handleBatchLinkWife(f, null)}
                                      className="min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 font-bold text-[11px] transition cursor-pointer"
                                    >
                                      فك الربط
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isEditing && (
                                <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200 space-y-2.5">
                                  <div className="space-y-1.5">
                                    <label className="block text-[11px] font-bold text-rose-900">
                                      اختر الزوج من أفراد الشجرة:
                                    </label>
                                    <input
                                      type="text"
                                      autoFocus
                                      value={husbandQuery}
                                      onChange={(e) => setHusbandQuery(e.target.value)}
                                      placeholder="اكتب اسم الزوج للبحث السريع..."
                                      className="w-full h-9 px-3 rounded-xl border border-rose-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-600"
                                    />
                                    <div className="max-h-36 overflow-y-auto rounded-xl border border-rose-200 bg-white divide-y divide-slate-100">
                                      {matchedMales.map((m) => (
                                        <button
                                          key={m.id}
                                          type="button"
                                          disabled={isSaving}
                                          onClick={() => handleBatchLinkWife(f, m)}
                                          className="w-full px-3 py-1.5 text-right hover:bg-emerald-50 flex items-center justify-between gap-2 transition cursor-pointer"
                                        >
                                          <span className="font-semibold text-slate-800 truncate">{m.fullName}</span>
                                          <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold shrink-0">
                                            ربط
                                          </span>
                                        </button>
                                      ))}
                                      {matchedMales.length === 0 && (
                                        <div className="p-2.5 text-center text-[11px] text-slate-400">
                                          لا يوجد ذكر مطابق بهذا الاسم في الشجرة
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="pt-2 border-t border-rose-200/70 flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={externalHusbandText}
                                      onChange={(e) => setExternalHusbandText(e.target.value)}
                                      placeholder="أو اكتب اسم زوج من خارج الشجرة..."
                                      className="flex-1 h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-600"
                                    />
                                    <button
                                      type="button"
                                      disabled={isSaving || !externalHusbandText.trim()}
                                      onClick={() => handleBatchLinkWife(f, null, externalHusbandText)}
                                      className="h-8 px-3 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-[11px] font-bold transition shrink-0"
                                    >
                                      حفظ كزوج خارجي
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Tab 2: Audit Log (Interactive Click-to-Restore on Any Edit) */}
              {activeTab === 'logs' && (() => {
                const actionLabelMap: Record<string, { label: string; cls: string }> = {
                  snapshot: { label: 'نسخة حقيقية 100%', cls: 'bg-emerald-700 text-white' },
                  create: { label: 'إضافة', cls: 'bg-emerald-100 text-emerald-800' },
                  update: { label: 'تعديل', cls: 'bg-blue-100 text-blue-800' },
                  delete: { label: 'حذف', cls: 'bg-red-100 text-red-800' },
                  add_father: { label: 'إضافة أصل/جد', cls: 'bg-amber-100 text-amber-900' },
                  merge: { label: 'دمج', cls: 'bg-purple-100 text-purple-800' },
                  restore: { label: 'استعادة', cls: 'bg-teal-100 text-teal-800' },
                  settings_change: { label: 'إعدادات', cls: 'bg-slate-100 text-slate-700' },
                  request_approved: { label: 'طلب تعديل', cls: 'bg-indigo-100 text-indigo-800' }
                };

                const normLogQuery = normalizeArabic(logsSearch.trim());
                const filteredLogs = normLogQuery
                  ? auditLogs.filter((log) => {
                      const clean = stripAuditMetaTag(log.description);
                      const dateStr = new Date(log.timestamp).toLocaleString('ar-SA');
                      return (
                        normalizeArabic(clean).includes(normLogQuery) ||
                        normalizeArabic(log.targetPersonName || '').includes(normLogQuery) ||
                        normalizeArabic(dateStr).includes(normLogQuery) ||
                        normalizeArabic(actionLabelMap[log.actionType]?.label || log.actionType).includes(normLogQuery)
                      );
                    })
                  : auditLogs;

                return (
                  <div className="p-4 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[#0F4C3A]">
                          سجل التعديلات والعمليات ({auditLogs.length})
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          اضغط على أي سجل تعديل لمعاينة الأشجار والأصول عند تلك اللحظة أو قبلها مباشرة، ثم استعادتها بضغطة واحدة.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadAdminData}
                        className="self-start sm:self-center min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:text-[#0F4C3A] flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                        <span>تحديث</span>
                      </button>
                    </div>

                    {restoreStatus && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          restoreStatus.type === 'success'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : restoreStatus.type === 'error'
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <span className="font-semibold leading-relaxed">{restoreStatus.message}</span>
                        {restoreStatus.type === 'success' && (
                          <button
                            type="button"
                            onClick={onClose}
                            className="self-start sm:self-center px-3 py-1 rounded-lg bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white text-[11px] font-bold transition shrink-0 cursor-pointer"
                          >
                            إغلاق وعرض الشجرة الآن
                          </button>
                        )}
                      </div>
                    )}

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={logsSearch}
                        onChange={(e) => setLogsSearch(e.target.value)}
                        placeholder="ابحث داخل سجل التعديلات بالاسم أو نوع العملية أو التاريخ..."
                        className="w-full h-9 pr-8 pl-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                      />
                    </div>

                    <div className="border border-slate-200 rounded-2xl max-h-[28rem] overflow-y-auto divide-y divide-slate-100 bg-white">
                      {filteredLogs.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                          {auditLogs.length === 0 ? 'لا توجد سجلات مسجلة بعد' : 'لا توجد سجلات مطابقة للبحث'}
                        </div>
                      ) : (
                        filteredLogs.map((log) => {
                          const isSelected = selectedLogId === log.id;
                          const badge = actionLabelMap[log.actionType] || {
                            label: log.actionType,
                            cls: 'bg-slate-100 text-slate-700'
                          };
                          const cleanDesc = stripAuditMetaTag(log.description);

                          return (
                            <div
                              key={log.id}
                              className={`transition ${isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectAuditLog(log)}
                                className="w-full p-3 text-right text-xs space-y-1 cursor-pointer block"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap text-slate-500">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                    <span className="font-semibold text-slate-700">{log.actor}</span>
                                    <span className="text-[10px] text-[#0F4C3A] font-bold">
                                      {isSelected ? '▲ إغلاق خيارات الاستعادة' : '▼ اضغط للاستعادة لهذا السجل'}
                                    </span>
                                  </div>
                                  <span className="text-[10px] tabular-nums">
                                    {new Date(log.timestamp).toLocaleString('ar-SA')}
                                  </span>
                                </div>
                                <p className="text-slate-900 font-medium leading-relaxed break-words">
                                  {cleanDesc}
                                </p>
                              </button>

                              {isSelected && selectedLogPoint && (
                                <div className="px-3 pb-3.5 pt-1">
                                  <div className="p-3.5 rounded-2xl bg-white border-2 border-[#0F4C3A]/30 space-y-3 shadow-xs text-xs">
                                    {/* Toggle: At this edit vs Right before this edit */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                                        <button
                                          type="button"
                                          onClick={() => handleSwitchSelectedLogMode(log, 'at')}
                                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                                            selectedLogMode === 'at'
                                              ? 'bg-[#0F4C3A] text-white'
                                              : 'text-slate-700 hover:bg-white'
                                          }`}
                                        >
                                          الحالة عند هذا التعديل (شاملةً له)
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSwitchSelectedLogMode(log, 'before')}
                                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                                            selectedLogMode === 'before'
                                              ? 'bg-amber-700 text-white'
                                              : 'text-slate-700 hover:bg-white'
                                          }`}
                                        >
                                          الحالة قبل هذا التعديل مباشرة
                                        </button>
                                      </div>

                                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0F4C3A] text-[10px] font-bold">
                                        {selectedLogPoint.rootsCount}{' '}
                                        {selectedLogPoint.rootsCount === 1
                                          ? 'شجرة'
                                          : selectedLogPoint.rootsCount === 2
                                          ? 'شجرتان'
                                          : selectedLogPoint.rootsCount <= 10
                                          ? 'أشجار'
                                          : 'شجرة'}{' '}
                                        · {selectedLogPoint.persons.length} فرداً
                                      </span>
                                    </div>

                                    {selectedLogPoint.persons.length > 0 && selectedLogPoint.isExactSnapshot && (
                                      <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-semibold">
                                        ✓ نسخة محفوظة بالكامل (الأصول والفروع وروابط الزوجات).
                                      </div>
                                    )}

                                    {selectedLogPoint.persons.length === 0 ? (
                                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                                        كانت الشجرة فارغة تماماً في هذه اللحظة (0 أفراد). جرّب التبديل إلى «الحالة قبل هذا التعديل مباشرة» أو اختيار سجل أقدم/أحدث.
                                      </div>
                                    ) : (
                                      <>
                                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                          <span>
                                            ({selectedLogPoint.maleCount} ذكور · {selectedLogPoint.femaleCount} إناث)
                                          </span>
                                          <span
                                            className={
                                              selectedLogPoint.wifeLinksCount > 0
                                                ? 'font-bold text-rose-700'
                                                : 'text-slate-400'
                                            }
                                          >
                                            · روابط الزوجات: {selectedLogPoint.wifeLinksCount}
                                          </span>
                                          {selectedLogPoint.motherLinksCount > 0 && (
                                            <span className="font-bold text-emerald-700">
                                              · الأمهات: {selectedLogPoint.motherLinksCount}
                                            </span>
                                          )}
                                          {selectedLogPoint.notesCount > 0 && (
                                            <span className="font-bold text-amber-700">
                                              · الملاحظات: {selectedLogPoint.notesCount}
                                            </span>
                                          )}
                                        </div>

                                        {selectedLogPoint.rootDetails.length > 0 && (
                                          <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-100 space-y-1">
                                            <div className="font-bold text-[#0F4C3A]">
                                              أصول الأشجار عند هذه اللحظة ({selectedLogPoint.rootsCount}):
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {selectedLogPoint.rootDetails.slice(0, 8).map((r) => (
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
                                              {selectedLogPoint.rootDetails.length > 8 && (
                                                <span className="px-2 py-0.5 text-[10px] text-slate-500 font-semibold">
                                                  +{selectedLogPoint.rootDetails.length - 8} أصول أخرى
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={isRestoring}
                                            onClick={() => handleRestoreTimeTravelPoint(selectedLogPoint)}
                                            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                                          >
                                            <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                                            <span>
                                              {selectedLogMode === 'before'
                                                ? 'استعادة الشجرة لما قبل هذا التعديل'
                                                : 'استعادة الشجرة لهذا التعديل'}
                                            </span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowLogPointPreview((v) => !v);
                                              setLogPreviewSearch('');
                                            }}
                                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                                          >
                                            {showLogPointPreview ? 'إخفاء الأسماء' : 'معاينة / فصل أصول'}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleDownloadTimeTravelJson(selectedLogPoint)}
                                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#0F4C3A]/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>حفظ JSON</span>
                                          </button>
                                        </div>

                                        {showLogPointPreview && (() => {
                                          const normPQ = normalizeArabic(logPreviewSearch.trim());
                                          const previewFiltered = normPQ
                                            ? selectedLogPoint.persons.filter((p) =>
                                                normalizeArabic(p.fullName).includes(normPQ)
                                              )
                                            : selectedLogPoint.persons;
                                          return (
                                            <div className="space-y-2 pt-1">
                                              <input
                                                type="text"
                                                value={logPreviewSearch}
                                                onChange={(e) => setLogPreviewSearch(e.target.value)}
                                                placeholder="ابحث بالاسم (مثال: علي بن راشد) لفصله كشجرة مستقلة قبل الاستعادة..."
                                                className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                                              />
                                              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 text-xs">
                                                {previewFiltered.slice(0, 120).map((p, idx) => (
                                                  <div
                                                    key={p.id}
                                                    className="px-3 py-1.5 flex items-center justify-between gap-2"
                                                  >
                                                    <span className="font-semibold text-slate-800 truncate">
                                                      {idx + 1}. {p.fullName}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      {p.gender === 'male' && p.fatherId && (
                                                        <button
                                                          type="button"
                                                          onClick={() => handleDetachInSelectedLogPoint(p.id)}
                                                          className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold transition cursor-pointer"
                                                        >
                                                          فصل كشجرة مستقلة
                                                        </button>
                                                      )}
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
                                                  </div>
                                                ))}
                                                {previewFiltered.length === 0 && (
                                                  <div className="px-3 py-3 text-center text-[11px] text-slate-500">
                                                    لا توجد نتائج مطابقة
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}

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

              {/* Tab 4: Backup & Restore (Simple & Direct) */}
              {activeTab === 'backup' && (
                <div className="p-4 sm:p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Save / Export Backup Card */}
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center gap-2 text-[#0F4C3A]">
                        <Download className="w-5 h-5 text-[#D4AF37]" />
                        <h4 className="font-bold text-sm">تصدير نسخة احتياطية</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        حفظ نسخة احتياطية كاملة من بيانات الشجرة بالصيغة التي تناسبك.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={downloadingFormat !== null}
                          onClick={() => handleDownloadBackup('excel')}
                          className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4 shrink-0" />
                          <span>{downloadingFormat === 'excel' ? 'جارٍ...' : 'إكسل'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={downloadingFormat !== null}
                          onClick={() => handleDownloadBackup('html')}
                          className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-60 text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <FileCode className="w-4 h-4 shrink-0" />
                          <span>{downloadingFormat === 'html' ? 'جارٍ...' : 'HTML'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={downloadingFormat !== null}
                          onClick={() => handleDownloadBackup('json')}
                          className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] disabled:opacity-60 text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <FileJson className="w-4 h-4 shrink-0" />
                          <span>{downloadingFormat === 'json' ? 'جارٍ...' : 'JSON'}</span>
                        </button>
                      </div>

                      {backupStatus && (
                        <div className="text-xs font-semibold text-[#0F4C3A] bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 leading-relaxed break-words">
                          {backupStatus}
                        </div>
                      )}
                    </div>

                    {/* Restore Backup Card */}
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center gap-2 text-[#0F4C3A]">
                        <Upload className="w-5 h-5 text-[#D4AF37]" />
                        <h4 className="font-bold text-sm">استعادة نسخة احتياطية</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        استيراد ملف نسخة احتياطية محفوظ مسبقاً (JSON أو HTML أو Excel).
                      </p>
                      <label className="w-full sm:w-auto min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs font-bold transition cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>{isRestoring ? 'جارٍ الاستعادة...' : 'اختيار ملف للاستعادة'}</span>
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
                          className={`text-xs font-semibold p-3 rounded-xl border leading-relaxed flex flex-col gap-2 ${
                            restoreStatus.type === 'success'
                              ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                              : restoreStatus.type === 'warning'
                              ? 'text-amber-900 bg-amber-50 border-amber-300'
                              : restoreStatus.type === 'error'
                              ? 'text-red-800 bg-red-50 border-red-200'
                              : 'text-slate-700 bg-slate-50 border-slate-200'
                          }`}
                        >
                          <span>{restoreStatus.message}</span>
                          {restoreStatus.type === 'success' && (
                            <button
                              type="button"
                              onClick={onClose}
                              className="self-start px-3 py-1 rounded-lg bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white text-[11px] font-bold transition cursor-pointer"
                            >
                              إغلاق وعرض الشجرة
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sample / Reset Section */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h5 className="text-xs font-bold text-slate-800">إدارة البيانات</h5>
                    <div className="grid grid-cols-1 sm:flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleResetSample}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer"
                      >
                        تحميل عينة نموذجية
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-300 bg-white text-red-600 hover:bg-red-50 text-xs font-semibold transition cursor-pointer"
                      >
                        تفريغ الشجرة
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
