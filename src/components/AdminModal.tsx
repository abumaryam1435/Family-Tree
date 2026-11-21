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
  Users,
  Heart,
  Search,
  Cloud
} from 'lucide-react';
import { AppSettings, AuditLog, ChangeRequest, MergeOperation, Person } from '../types/family';
import { apiClient } from '../api/client';
import { ConfirmModal } from './ConfirmModal';
import {
  parseBackupFile,
  reconstructFromCloudLogs,
  buildTimeTravelRestorePoints,
  reconstructAtTimestamp,
  detachPersonAsRootInSnapshot,
  stripAuditMetaTag,
  computeRootDetails,
  loadLocalSafetyBackups,
  extractCloudExactSnapshots,
  triggerJsonBackupDownload,
  CloudRecoverySummary,
  CloudExactSnapshot,
  TimeTravelRestorePoint,
  LocalSafetySnapshot
} from '../utils/backupRecovery';
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
  const [activeTab, setActiveTab] = useState<'status' | 'wives' | 'logs' | 'requests' | 'merges' | 'backup' | 'passcode'>('status');
  
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
  const [isSavingCloudSnapshot, setIsSavingCloudSnapshot] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [cloudRecovery, setCloudRecovery] = useState<CloudRecoverySummary | null>(null);
  const [cloudExactSnapshots, setCloudExactSnapshots] = useState<CloudExactSnapshot[]>([]);
  const [localSafetyBackups, setLocalSafetyBackups] = useState<LocalSafetySnapshot[]>([]);
  const [timeTravelPoints, setTimeTravelPoints] = useState<TimeTravelRestorePoint[]>([]);
  const [previewedPointId, setPreviewedPointId] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>('');
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
        setCloudExactSnapshots(extractCloudExactSnapshots(logs));
        setCurrentPersonsForEnrich(livePersons);
      } else if (activeTab === 'wives') {
        const livePersons = await apiClient.getPersons().catch(() => []);
        setCurrentPersonsForEnrich(livePersons);
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
        setCloudExactSnapshots(extractCloudExactSnapshots(logs));
        setCloudRecovery(reconstructFromCloudLogs(logs, merges));
        setTimeTravelPoints(buildTimeTravelRestorePoints(logs, merges, enrichmentPool, localSnaps));
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

  const handleSaveCloudSnapshotNow = async () => {
    setIsSavingCloudSnapshot(true);
    setRestoreStatus({
      type: 'info',
      message: 'جارٍ حفظ نقطة استعادة سحابية حقيقية مطابقة 100%...'
    });
    try {
      const res = await apiClient.saveCloudExactSnapshot('حفظ يدوي من المشرف');
      if (res.saved) {
        setRestoreStatus({
          type: 'success',
          message: `تم حفظ نسخة سحابية حقيقية مطابقة 100% (${res.personsCount} فرداً) بنجاح. يمكنك العودة إليها بدقة تامة من أي جهاز في أي وقت.`
        });
        await loadAdminData();
      } else {
        setRestoreStatus({
          type: 'warning',
          message: res.message || 'تعذر حفظ النقطة السحابية المطابقة.'
        });
      }
    } catch (err: any) {
      setRestoreStatus({
        type: 'error',
        message: err?.message || 'حدث خطأ أثناء حفظ النقطة السحابية'
      });
    } finally {
      setIsSavingCloudSnapshot(false);
    }
  };

  const handleRestoreCloudExactSnapshot = (snap: CloudExactSnapshot) => {
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
      title: 'استعادة نسخة سحابية حقيقية مطابقة 100%',
      message: `سيتم استعادة النسخة السحابية المحفوظة في (${savedLabel}) والتي تحتوي على ${snap.persons.length} فرداً في ${snap.rootsCount} أصول بكامل تفاصيلها الحقيقية (الآباء، الفروع، الزوجات، الأمهات، الملاحظات) بدون أي تخمين أو تعديل. سيتم حفظ الوضع الحالي تلقائياً قبل الاستعادة.`,
      isDestructive: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsRestoring(true);
        setRestoreStatus({
          type: 'info',
          message: `جارٍ استعادة النسخة السحابية الحقيقية (${snap.persons.length} فرداً)...`
        });
        try {
          const result = await apiClient.restoreBackup(snap.persons, {
            mode: 'replace',
            sourceLabel: `نسخة سحابية حقيقية 100% (${savedLabel})`
          });
          setRestoreStatus({
            type: 'success',
            message: `تمت الاستعادة الحقيقية (100%) بنجاح! (${result.restoredCount} فرداً، ${snap.rootsCount} أصول مطابقة تماماً).`
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

  const handleDownloadCloudExactSnapshotJson = (snap: CloudExactSnapshot) => {
    const filename = triggerJsonBackupDownload(
      {
        version: 2,
        source: 'cloud_exact_snapshot',
        savedAt: snap.savedAt,
        reason: snap.reason,
        exportedAt: new Date().toISOString(),
        personsCount: snap.persons.length,
        rootsCount: snap.rootsCount,
        persons: snap.persons
      },
      'family_tree_exact_cloud_snapshot'
    );
    setRestoreStatus({
      type: 'success',
      message: `تم تنزيل النسخة السحابية الحقيقية (${snap.persons.length} فرداً) بصيغة JSON: ${filename}`
    });
  };

  const handleDetachInTimeTravelPoint = (pointId: string, personId: string) => {
    if (customPoint && customPoint.id === pointId) {
      setCustomPoint((prev) => (prev ? detachPersonAsRootInSnapshot(prev, personId) : prev));
      return;
    }
    setTimeTravelPoints((prev) =>
      prev.map((pt) => (pt.id === pointId ? detachPersonAsRootInSnapshot(pt, personId) : pt))
    );
  };

  const handleCheckCustomDateTime = () => {
    if (!customDateTime) return;
    const ms = new Date(customDateTime).getTime();
    if (Number.isNaN(ms)) return;
    const enrichmentPool = buildEnrichmentPool(localSafetyBackups);
    const trustedRootIds = getTrustedRootIdsForCutoff(localSafetyBackups, ms);
    const snap = reconstructAtTimestamp(auditLogs, mergeOperations, ms, {
      ignoreClears: false,
      enrichmentPersons: enrichmentPool,
      trustedRootIds
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
      isBeforeToday: true,
      isExactSnapshot: snap.isExactSnapshot
    });
    setPreviewedPointId(`custom_${ms}`);
    setPreviewSearch('');
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

                                    {selectedLogPoint.persons.length > 0 && (
                                      selectedLogPoint.isExactSnapshot ? (
                                        <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-[11px] font-semibold">
                                          ✓ نسخة سحابية حقيقية مطابقة 100% — محفوظة بكامل الأصول والفروع وروابط الزوجات بدون أي تخمين.
                                        </div>
                                      ) : (
                                        <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                                          <strong>تنبيه دقة:</strong> هذا السجل قديم (قبل تفعيل النسخ السحابية المطابقة 100%) ولم يكن يحفظ معرّف الأب أو روابط الزوجات؛ لذلك تم تعطيل أي تخمين أو توزيع عشوائي والاكتفاء بالتطابق التام فقط.
                                        </div>
                                      )
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
                  {/* Live Database Current Roots Summary + 1-Click Cloud Exact Snapshot Button */}
                  {currentPersonsForEnrich.length > 0 && (() => {
                    const liveStats = computeRootDetails(currentPersonsForEnrich);
                    return (
                      <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-slate-800">
                            الأشجار الموجودة حالياً في قاعدة البيانات الآن ({liveStats.rootsCount} {liveStats.rootsCount === 1 ? 'شجرة' : liveStats.rootsCount === 2 ? 'شجرتان' : liveStats.rootsCount <= 10 ? 'أشجار' : 'شجرة'} · {currentPersonsForEnrich.length} فرداً):
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={isSavingCloudSnapshot}
                              onClick={handleSaveCloudSnapshotNow}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Cloud className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>
                                {isSavingCloudSnapshot
                                  ? 'جارٍ الحفظ السحابي...'
                                  : 'حفظ نقطة استعادة سحابية حقيقية (100%) الآن'}
                              </span>
                            </button>
                            {restoreStatus?.type === 'success' && (
                              <button
                                type="button"
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-lg bg-[#0F4C3A] hover:bg-[#0c3c2e] text-white text-[11px] font-bold transition cursor-pointer"
                              >
                                إغلاق وعرض الشجرة الآن
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {liveStats.rootDetails.slice(0, 8).map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-semibold text-[11px]"
                            >
                              <span>{r.fullName}</span>
                              <span className="text-[10px] text-emerald-700 font-bold">({r.branchCount} فرداً)</span>
                            </span>
                          ))}
                          {liveStats.rootDetails.length > 8 && (
                            <span className="text-[10px] text-slate-500 font-semibold px-1">
                              +{liveStats.rootDetails.length - 8} أصول أخرى
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cloud Exact 100% Verbatim Snapshots (Stored in Firestore across all devices) */}
                  {cloudExactSnapshots.length > 0 && (
                    <div className="p-4 sm:p-5 rounded-2xl border-2 border-[#0F4C3A] bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 space-y-3.5 shadow-xs">
                      <div className="flex items-start gap-2.5 text-[#0F4C3A]">
                        <div className="w-9 h-9 rounded-xl bg-[#0F4C3A] text-[#D4AF37] flex items-center justify-center shrink-0">
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-[#0F4C3A]">
                            النسخ السحابية الحقيقية المطابقة 100% ({cloudExactSnapshots.length})
                          </h4>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            نسخ كاملة محفوظة في قاعدة البيانات السحابية قبل كل حذف أو دمج أو تعديل أصل أو عند الحفظ اليدوي — تُستعاد حرفياً كما كانت 100% بكامل الأصول والفروع والزوجات والملاحظات بدون أي تخمين.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
                        {cloudExactSnapshots.map((snap) => {
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
                              className="p-3.5 rounded-2xl border border-emerald-300 bg-white space-y-2.5 shadow-xs"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold">
                                    نسخة سحابية حقيقية 100%
                                  </span>
                                  <span className="font-bold text-xs sm:text-sm text-[#0F4C3A]">
                                    {snap.reason}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0F4C3A] text-[10px] font-bold">
                                    {snap.rootsCount} {snap.rootsCount === 1 ? 'شجرة' : snap.rootsCount === 2 ? 'شجرتان' : snap.rootsCount <= 10 ? 'أشجار' : 'شجرة'} · {snap.persons.length} فرداً
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>تاريخ الحفظ: {savedFormatted} ({snap.maleCount} ذكور · {snap.femaleCount} إناث)</span>
                                  <span className="font-bold text-rose-700">· روابط الزوجات: {snap.wifeLinksCount}</span>
                                  <span className="font-bold text-emerald-700">· الأمهات: {snap.motherLinksCount}</span>
                                  <span className="font-bold text-amber-700">· الملاحظات: {snap.notesCount}</span>
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
                                  onClick={() => handleRestoreCloudExactSnapshot(snap)}
                                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  <span>استعادة هذه النسخة الحقيقية (100%) الآن</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPreviewedPointId(isPreviewOpen ? null : snap.id)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                                >
                                  {isPreviewOpen ? 'إخفاء الأسماء' : 'معاينة الأسماء'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadCloudExactSnapshotJson(snap)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#0F4C3A]/30 bg-white hover:bg-emerald-50 text-[#0F4C3A] text-xs font-bold flex items-center gap-1 transition cursor-pointer"
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
                            الاستعادة الزمنية — النقاط السحابية وسجل التعديلات
                          </h4>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                            النقاط الموسومة بـ <strong>«نسخة حقيقية 100%»</strong> محفوظة حرفياً بدون أي تخمين. أما السجلات القديمة التي سبقت تفعيل النسخ السحابية المطابقة فلم تكن تخزّن معرّفات الآباء أو الزوجات، ولذلك تم إلغاء أي تخمين أو توزيع عشوائي تماماً والاكتفاء بالتطابق التام فقط.
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
                                      {pt.isExactSnapshot ? (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold">
                                          نسخة حقيقية مطابقة 100%
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                                          سجل قديم (تطابق تام فقط — بدون تخمين)
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
                                    onClick={() => {
                                      setPreviewedPointId(isPreviewOpen ? null : pt.id);
                                      setPreviewSearch('');
                                    }}
                                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                                  >
                                    {isPreviewOpen ? 'إخفاء الأسماء' : 'معاينة / فصل أصول'}
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

                                {isPreviewOpen && (() => {
                                  const normQ = normalizeArabic(previewSearch.trim());
                                  const filtered = normQ
                                    ? pt.persons.filter((p) => normalizeArabic(p.fullName).includes(normQ))
                                    : pt.persons;
                                  return (
                                    <div className="space-y-2 pt-1">
                                      <input
                                        type="text"
                                        value={previewSearch}
                                        onChange={(e) => setPreviewSearch(e.target.value)}
                                        placeholder="ابحث بالاسم داخل النسخة (مثال: علي بن راشد) لفصله كشجرة مستقلة قبل الاستعادة..."
                                        className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                                      />
                                      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100 text-xs">
                                        {filtered.slice(0, 120).map((p, idx) => (
                                          <div key={p.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                            <span className="font-semibold text-slate-800 truncate">
                                              {idx + 1}. {p.fullName}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {p.gender === 'male' && p.fatherId && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleDetachInTimeTravelPoint(pt.id, p.id)}
                                                  className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold transition cursor-pointer"
                                                  title="فصل هذا الشخص وفروعه ليكون أصل شجرة مستقلة في هذه النسخة قبل الاستعادة"
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
                                        {filtered.length === 0 && (
                                          <div className="px-3 py-3 text-center text-[11px] text-slate-500">
                                            لا توجد نتائج مطابقة لهذا الاسم في هذه النسخة
                                          </div>
                                        )}
                                        {filtered.length > 120 && (
                                          <div className="px-3 py-1.5 text-center text-[11px] text-slate-500">
                                            ... و {filtered.length - 120} فرداً آخرين (استخدم مربع البحث أعلاه)
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
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
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {customPoint.isExactSnapshot ? (
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-700 text-white text-[10px] font-bold">
                                        نسخة حقيقية مطابقة 100%
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                                        سجل قديم (تطابق تام فقط — بدون تخمين)
                                      </span>
                                    )}
                                    <span className="font-bold text-[#0F4C3A]">
                                      {customPoint.label}: تم العثور على {customPoint.rootsCount} {customPoint.rootsCount === 1 ? 'شجرة' : customPoint.rootsCount === 2 ? 'شجرتين' : customPoint.rootsCount <= 10 ? 'أشجار' : 'شجرة'} و {customPoint.persons.length} فرداً ({customPoint.maleCount} ذكور · {customPoint.femaleCount} إناث)
                                    </span>
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
