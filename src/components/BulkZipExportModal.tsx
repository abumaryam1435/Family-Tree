import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FolderArchive,
  X,
  Check,
  TreeDeciduous,
  LayoutGrid,
  Sparkles,
  Globe,
  Smartphone,
  FileText,
  Maximize2,
  Share2,
  Download,
  Users,
  CheckSquare,
  Square
} from 'lucide-react';
import { Person } from '../types/family';
import { formatAppName } from '../utils/nameUtils';
import {
  BulkExportFormat,
  BulkTreeModeChoice,
  BulkFemalesChoice,
  BulkZipResult,
  calculateBulkExportTasksCount,
  generateBulkTreesZip,
  downloadZipBlob,
  shareBulkResultToWhatsApp
} from '../utils/zipExport';

interface BulkZipExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  treeRoots: Person[];
  currentRoot?: Person | null;
  defaultMode?: 'classic' | 'organic';
  defaultShowFemales?: boolean;
  organicDirection?: 'up' | 'down';
  getChildren: (personId: string) => Person[];
  getAllPersons: () => Person[];
}

export const BulkZipExportModal: React.FC<BulkZipExportModalProps> = ({
  isOpen,
  onClose,
  treeRoots,
  currentRoot,
  defaultMode = 'classic',
  defaultShowFemales = false,
  organicDirection = 'up',
  getChildren,
  getAllPersons
}) => {
  // Combine treeRoots and currentRoot (if currentRoot is a sub-branch not in treeRoots)
  const availableTrees = useMemo(() => {
    const list: Person[] = [...treeRoots];
    if (currentRoot && !list.some((r) => r.id === currentRoot.id)) {
      list.unshift(currentRoot);
    }
    return list;
  }, [treeRoots, currentRoot]);

  const [selectedRootIds, setSelectedRootIds] = useState<string[]>([]);
  const [modeChoice, setModeChoice] = useState<BulkTreeModeChoice>('both');
  const [femalesChoice, setFemalesChoice] = useState<BulkFemalesChoice>(
    defaultShowFemales ? 'with_females' : 'males_only'
  );
  const [selectedFormats, setSelectedFormats] = useState<BulkExportFormat[]>([
    'png',
    'html',
    'pdf',
    'svg'
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    label: string;
  } | null>(null);
  const [generatedResult, setGeneratedResult] = useState<BulkZipResult | null>(null);
  const [readyToSharePrompt, setReadyToSharePrompt] = useState(false);
  const [shareUnsupportedMsg, setShareUnsupportedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const readyCardRef = useRef<HTMLDivElement | null>(null);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      if (availableTrees.length > 0) {
        setSelectedRootIds(availableTrees.map((t) => t.id));
      }
      setFemalesChoice(defaultShowFemales ? 'with_females' : 'males_only');
      setGeneratedResult(null);
      setReadyToSharePrompt(false);
      setShareUnsupportedMsg(null);
      setErrorMsg(null);
      setProgress(null);
    }
  }, [isOpen, availableTrees, defaultShowFemales, defaultMode]);

  // Clear cached result whenever options change
  useEffect(() => {
    setGeneratedResult(null);
    setReadyToSharePrompt(false);
    setShareUnsupportedMsg(null);
    setErrorMsg(null);
  }, [selectedRootIds, modeChoice, femalesChoice, selectedFormats]);

  // Scroll the prepared ZIP card into view when generation completes
  useEffect(() => {
    if (generatedResult && readyCardRef.current) {
      setTimeout(() => {
        readyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    }
  }, [generatedResult, readyToSharePrompt, shareUnsupportedMsg]);

  // Calculate member counts per tree
  const treeMemberCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const root of availableTrees) {
      const visited = new Set<string>();
      const queue = [root.id];
      visited.add(root.id);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const kids = getChildren(curr);
        for (const k of kids) {
          if (!visited.has(k.id)) {
            visited.add(k.id);
            queue.push(k.id);
          }
        }
      }
      map.set(root.id, visited.size);
    }
    return map;
  }, [availableTrees, getChildren]);

  const totalFilesToGenerate = useMemo(() => {
    return calculateBulkExportTasksCount(
      selectedRootIds.length,
      modeChoice,
      femalesChoice,
      selectedFormats
    );
  }, [selectedRootIds.length, modeChoice, femalesChoice, selectedFormats]);

  if (!isOpen) return null;

  const toggleTreeRoot = (id: string) => {
    setSelectedRootIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllTrees = () => {
    setSelectedRootIds(availableTrees.map((t) => t.id));
  };

  const selectCurrentTreeOnly = () => {
    if (currentRoot) {
      setSelectedRootIds([currentRoot.id]);
    } else if (availableTrees[0]) {
      setSelectedRootIds([availableTrees[0].id]);
    }
  };

  const toggleFormat = (fmt: BulkExportFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const selectAllFormats = () => {
    if (selectedFormats.length === 4) {
      setSelectedFormats(['png']);
    } else {
      setSelectedFormats(['png', 'html', 'pdf', 'svg']);
    }
  };

  // Synchronous handler for when files are already generated in memory (0ms user gesture -> navigator.share)
  const handleImmediateShare = async (cached: BulkZipResult) => {
    // MUST invoke shareBulkResultToWhatsApp(cached, true) synchronously on the first line before any state updates or awaits
    const sharePromise = shareBulkResultToWhatsApp(cached, true);
    setErrorMsg(null);
    setShareUnsupportedMsg(null);

    const outcome = await sharePromise;
    if (outcome === 'shared_zip' || outcome === 'shared_files') {
      setReadyToSharePrompt(false);
    } else if (
      outcome === 'downloaded_fallback' ||
      outcome === 'unsupported' ||
      outcome === 'need_user_gesture'
    ) {
      setReadyToSharePrompt(false);
      setShareUnsupportedMsg(
        `تم حفظ الملف المضغوط (${cached.zipFilename}) على جهازك؛ يمكنك إرساله مباشرة عبر الواتساب أو أي تطبيق آخر بكامل دقته الأصلية.`
      );
    }
  };

  const handleRunExport = async (action: 'download' | 'share') => {
    // If sharing and files are already generated, trigger navigator.share synchronously in this click event!
    if (action === 'share' && generatedResult) {
      await handleImmediateShare(generatedResult);
      return;
    }

    if (action === 'download' && generatedResult) {
      downloadZipBlob(generatedResult.zipBlob, generatedResult.zipFilename);
      return;
    }

    const rootsToExport = availableTrees.filter((t) =>
      selectedRootIds.includes(t.id)
    );
    if (rootsToExport.length === 0 || selectedFormats.length === 0) return;

    setIsGenerating(true);
    setErrorMsg(null);
    setShareUnsupportedMsg(null);
    setReadyToSharePrompt(false);

    try {
      const result = await generateBulkTreesZip({
        roots: rootsToExport,
        modeChoice,
        femalesChoice,
        formats: selectedFormats,
        organicDirection,
        getChildren,
        getAllPersons,
        onProgress: (completed, total, label) => {
          setProgress({ completed, total, label });
        }
      });
      setGeneratedResult(result);

      if (action === 'share') {
        const outcome = await shareBulkResultToWhatsApp(result, false);
        if (outcome === 'need_user_gesture' || outcome === 'unsupported') {
          // Browser expired the click activation while rendering canvases — show 1-tap synchronous WhatsApp share button
          setReadyToSharePrompt(true);
        }
      } else {
        setReadyToSharePrompt(true);
        downloadZipBlob(result.zipBlob, result.zipFilename);
      }
    } catch (err: any) {
      console.error('Bulk ZIP export error:', err);
      setErrorMsg(err?.message || 'حدث خطأ أثناء تجهيز الملف المضغوط.');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCards: {
    id: BulkExportFormat;
    title: string;
    badge: string;
    desc: string;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      id: 'png',
      title: 'صورة فائقة الوضوح (PNG)',
      badge: 'بدون ضغط الواتساب',
      desc: 'صورة عالية الدقة؛ وجودها داخل ملف ZIP يمنع الواتساب من ضغطها أو إضعاف جودتها.',
      icon: <Smartphone className="w-4 h-4 text-[#D4AF37]" />,
      activeClass: 'border-emerald-600 bg-emerald-50/90 text-[#0F4C3A]'
    },
    {
      id: 'html',
      title: 'شجرة تفاعلية (HTML)',
      badge: 'تفاعلي للهاتف والحاسوب',
      desc: 'ملف يعمل في أي متصفح ويسمح بتوسيع وطي الأفرع والبحث وإظهار/إخفاء البنات.',
      icon: <Globe className="w-4 h-4 text-amber-300" />,
      activeClass: 'border-amber-500 bg-amber-50/90 text-amber-950'
    },
    {
      id: 'pdf',
      title: 'سجل المراجعة والطباعة (PDF)',
      badge: 'صفحات A4 تسلسلية',
      desc: 'سجل ورقي مرتب يعرض كل أب متبوعاً بأبنائه وبناته وأرقام فروعهم للمراجعة.',
      icon: <FileText className="w-4 h-4 text-[#D4AF37]" />,
      activeClass: 'border-teal-600 bg-teal-50/90 text-teal-950'
    },
    {
      id: 'svg',
      title: 'ملف فيكتور للمطابع (SVG)',
      badge: 'للّوحات الجدارية الكبرى',
      desc: 'ملف متجه (Vector) يقبل التكبير لأي مقاس جداري في المطابع دون فقدان أي دقة.',
      icon: <Maximize2 className="w-4 h-4 text-indigo-200" />,
      activeClass: 'border-indigo-600 bg-indigo-50/90 text-indigo-950'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#093829] via-[#0F4C3A] to-[#15664F] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center text-[#FDE68A] shrink-0 shadow-sm">
              <FolderArchive className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black font-display leading-snug">
                تصدير شامل لجميع ملفات الأشجار في ملف مضغوط (ZIP)
              </h3>
              <p className="text-[11px] text-amber-200/95 font-semibold mt-0.5">
                مثالي للإرسال عبر الواتساب كملف واحد مع الحفاظ على دقة الصور 100% دون أي ضغط
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          {/* WhatsApp Quality Preservation Info Banner */}
          <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-start gap-2.5 text-xs text-amber-950">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-black">لماذا التصدير في ملف مضغوط (ZIP)؟ </span>
              عند إرسال الصور مباشرة بالواتساب يقوم التطبيق بضغطها وتقليل جودتها، بينما إرسال هذا الملف المضغوط عبر الواتساب يحفظ الصور والملفات بكامل دقتها الأصلية الفائقة.
            </div>
          </div>

          {/* 1. Select Trees */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-lg bg-[#0F4C3A] text-[#FDE68A] text-[11px] flex items-center justify-center font-black">
                  1
                </span>
                <span>اختيار الأشجار المطلوب تصديرها ({selectedRootIds.length} من {availableTrees.length})</span>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={selectAllTrees}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-[11px] font-bold transition cursor-pointer"
                >
                  تحديد جميع الأشجار
                </button>
                {availableTrees.length > 1 && (
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={selectCurrentTreeOnly}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                  >
                    الشجرة الحالية فقط
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
              {availableTrees.map((tree) => {
                const isSelected = selectedRootIds.includes(tree.id);
                const count = treeMemberCounts.get(tree.id) || 1;
                const isCurrent = currentRoot?.id === tree.id;

                return (
                  <button
                    key={tree.id}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => toggleTreeRoot(tree.id)}
                    className={`p-2.5 rounded-xl border-2 text-right transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'border-[#0F4C3A] bg-emerald-50/70 text-slate-900 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition ${
                          isSelected
                            ? 'bg-[#0F4C3A] text-[#FDE68A]'
                            : 'border border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-black truncate">
                          {formatAppName(tree.fullName)}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                          <Users className="w-3 h-3 inline" />
                          <span>{count} فرداً</span>
                          {isCurrent && (
                            <span className="text-[#0F4C3A] font-bold">• (المعروضة حالياً)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Select Tree Style (Classic / Organic / Both) */}
          <div className="space-y-2.5">
            <label className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-[#0F4C3A] text-[#FDE68A] text-[11px] flex items-center justify-center font-black">
                2
              </span>
              <span>اختيار نوع تصميم الشجرة (الهرمي أو الغصون أو كليهما)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setModeChoice('classic')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer flex items-center gap-2.5 ${
                  modeChoice === 'classic'
                    ? 'border-[#0F4C3A] bg-emerald-50/80 text-[#0F4C3A] shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4 shrink-0 text-[#0F4C3A]" />
                <div>
                  <div className="text-xs font-black">المخطط الهرمي فقط</div>
                  <div className="text-[10px] text-slate-500 font-semibold">بطاقات هرمية متدرجة</div>
                </div>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setModeChoice('organic')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer flex items-center gap-2.5 ${
                  modeChoice === 'organic'
                    ? 'border-[#0F4C3A] bg-emerald-50/80 text-[#0F4C3A] shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <TreeDeciduous className="w-4 h-4 shrink-0 text-amber-700" />
                <div>
                  <div className="text-xs font-black">الجذور والغصون فقط</div>
                  <div className="text-[10px] text-slate-500 font-semibold">جذر وأغصان شجرية</div>
                </div>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setModeChoice('both')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer flex items-center gap-2.5 ${
                  modeChoice === 'both'
                    ? 'border-[#D4AF37] bg-amber-50/90 text-amber-950 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0 text-amber-600" />
                <div>
                  <div className="text-xs font-black">كلاهما معاً (الهرمي + الغصون)</div>
                  <div className="text-[10px] text-slate-600 font-semibold">تصدير التصميمين معاً</div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Include Daughters / Females Option */}
          <div className="space-y-2.5">
            <label className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-lg bg-[#0F4C3A] text-[#FDE68A] text-[11px] flex items-center justify-center font-black">
                3
              </span>
              <span>خيار تضمين البنات (الإناث) في الملفات المصدرة</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setFemalesChoice('males_only')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer ${
                  femalesChoice === 'males_only'
                    ? 'border-[#0F4C3A] bg-emerald-50/80 text-[#0F4C3A] shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-xs font-black">الذكور فقط</div>
                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  عرض وتصدير الآباء والأبناء الذكور فقط
                </div>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setFemalesChoice('with_females')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer ${
                  femalesChoice === 'with_females'
                    ? 'border-rose-600 bg-rose-50/80 text-rose-950 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-xs font-black">تضمين البنات (الذكور والإناث)</div>
                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  إظهار جميع الأبناء والبنات في الشجرة
                </div>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setFemalesChoice('both')}
                className={`p-3 rounded-xl border-2 text-right transition cursor-pointer ${
                  femalesChoice === 'both'
                    ? 'border-[#D4AF37] bg-amber-50/90 text-amber-950 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="text-xs font-black">النسختان معاً</div>
                <div className="text-[10px] text-slate-600 font-semibold mt-0.5">
                  تصدير نسخة للذكور فقط + نسخة مع البنات
                </div>
              </button>
            </div>
          </div>

          {/* 4. Select File Formats (HTML, PNG, PDF, SVG or All) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-lg bg-[#0F4C3A] text-[#FDE68A] text-[11px] flex items-center justify-center font-black">
                  4
                </span>
                <span>أنواع الملفات المطلوبة ({selectedFormats.length} من 4 صيغ)</span>
              </label>

              <button
                type="button"
                disabled={isGenerating}
                onClick={selectAllFormats}
                className="px-2.5 py-1 rounded-lg bg-amber-100/80 hover:bg-amber-200/80 text-amber-950 border border-amber-300 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              >
                {selectedFormats.length === 4 ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>محدد جميع الصيغ (الكل)</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>تحديد جميع الصيغ (HTML, PNG, PDF, SVG)</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {formatCards.map((card) => {
                const active = selectedFormats.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => toggleFormat(card.id)}
                    className={`p-3 rounded-2xl border-2 text-right transition flex items-start gap-2.5 cursor-pointer ${
                      active
                        ? card.activeClass
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        active ? 'bg-[#0F4C3A] text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {card.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black">{card.title}</span>
                        <span
                          className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                            active
                              ? 'bg-[#0F4C3A] text-[#FDE68A]'
                              : 'border border-slate-300 bg-white text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      </div>
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/5 mt-0.5">
                        {card.badge}
                      </span>
                      <p className="text-[10px] text-slate-600 leading-snug mt-1">
                        {card.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progress or Summary Box */}
          {isGenerating && progress ? (
            <div className="p-4 rounded-2xl bg-emerald-950 text-white space-y-2.5 border border-[#D4AF37]/40 shadow-md">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#FDE68A]">{progress.label}</span>
                <span>
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D4AF37] to-emerald-400 transition-all duration-200"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((progress.completed / Math.max(1, progress.total)) * 100)
                    )}%`
                  }}
                />
              </div>
              <p className="text-[11px] text-white/80 text-center">
                يرجى الانتظار... جارٍ رسم وتجهيز الملفات بدقة عالية وتغليفها في ملف ZIP
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                إجمالي الملفات التي سيتم إنشاؤها في الملف المضغوط:{' '}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#0F4C3A] text-[#FDE68A] font-black text-sm mx-1">
                  {totalFilesToGenerate}
                </span>{' '}
                ملف
              </div>
              {selectedRootIds.length > 1 && (
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-lg">
                  مرتبة تلقائياً في مجلد خاص لكل شجرة
                </span>
              )}
            </div>
          )}

          {generatedResult && (
            <div
              ref={readyCardRef}
              className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-600 shadow-md space-y-2.5 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="text-xs font-black text-emerald-950 text-center">
                ✅ تم تجهيز وضغط الملفات بنجاح ({generatedResult.filesCount} ملف بكامل الدقة الأصلية)!
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleImmediateShare(generatedResult)}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  <span>مشاركة الملف المضغوط (واتساب أو غيره)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadZipBlob(generatedResult.zipBlob, generatedResult.zipFilename)
                  }
                  className="w-full py-3 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#093829] text-white font-black text-xs sm:text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#FDE68A] shrink-0" />
                  <span>حفظ الملف المضغوط (ZIP)</span>
                </button>
              </div>
            </div>
          )}

          {shareUnsupportedMsg && generatedResult && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold text-center leading-relaxed space-y-2">
              <p>{shareUnsupportedMsg}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    downloadZipBlob(generatedResult.zipBlob, generatedResult.zipFilename)
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black text-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#0F4C3A]" />
                  <span>تحميل ملف الـ ZIP</span>
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold text-center">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
          >
            إغلاق
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Share directly via Mobile Share Sheet (WhatsApp or any other app) */}
            <button
              type="button"
              disabled={isGenerating || totalFilesToGenerate === 0}
              onClick={() => handleRunExport('share')}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>
                {generatedResult
                  ? 'فتح نافذة المشاركة الآن (واتساب أو غيره)'
                  : 'مشاركة الملف المضغوط (واتساب أو غيره)'}
              </span>
            </button>

            {/* Download ZIP directly */}
            <button
              type="button"
              disabled={isGenerating || totalFilesToGenerate === 0}
              onClick={() => handleRunExport('download')}
              className="px-5 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#093829] text-white font-black text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[#FDE68A] shrink-0" />
              <span>تصدير وتحميل الملف المضغوط (ZIP)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
