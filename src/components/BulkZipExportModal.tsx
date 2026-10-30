import React, { useState } from 'react';
import { Person } from '../types/family';
import {
  Archive,
  X,
  Check,
  CheckSquare,
  Square,
  FileImage,
  FileText,
  Globe,
  FileCode,
  Sparkles,
  Loader2,
  FolderArchive,
  Users,
  Network,
  Layers
} from 'lucide-react';
import {
  BulkExportFormat,
  BulkTreeModeChoice,
  BulkFemalesChoice,
  BulkGroupingChoice,
  calculateBulkExportTasksCount,
  generateBulkTreesZip
} from '../utils/zipExport';

interface BulkZipExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  roots?: Person[];
  treeRoots?: Person[];
  currentRootId?: string;
  getChildren: (personId: string) => Person[];
  getAllPersons?: () => Person[];
  initialMode?: 'classic' | 'classic_vertical' | 'organic_tree';
  initialShowFemales?: boolean;
}

export const BulkZipExportModal: React.FC<BulkZipExportModalProps> = ({
  isOpen,
  onClose,
  roots: rootsProp,
  treeRoots,
  currentRootId,
  getChildren,
  initialMode = 'classic',
  initialShowFemales = true
}) => {
  const roots = rootsProp || treeRoots || [];
  const [selectedRootIds, setSelectedRootIds] = useState<string[]>(() =>
    roots.length > 0 ? roots.map((r) => r.id) : []
  );
  const [groupingChoice, setGroupingChoice] = useState<BulkGroupingChoice>('both');
  const [modeChoice, setModeChoice] = useState<BulkTreeModeChoice>(
    initialMode === 'classic_vertical' ? 'classic_vertical' : 'both'
  );
  const [femalesChoice, setFemalesChoice] = useState<BulkFemalesChoice>(
    initialShowFemales ? 'both' : 'males_only'
  );
  const [selectedFormats, setSelectedFormats] = useState<BulkExportFormat[]>([
    'png',
    'pdf_poster',
    'pdf',
    'html',
    'svg'
  ]);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{
    currentStep: number;
    totalSteps: number;
    treeName: string;
    detailLabel: string;
  } | null>(null);
  const [doneResult, setDoneResult] = useState<{
    zipFilename: string;
    totalFilesGenerated: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleRoot = (id: string) => {
    setSelectedRootIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setDoneResult(null);
  };

  const selectAllRoots = () => {
    setSelectedRootIds(roots.map((r) => r.id));
    setDoneResult(null);
  };

  const selectCurrentRootOnly = () => {
    if (currentRootId) {
      setSelectedRootIds([currentRootId]);
    } else if (roots[0]) {
      setSelectedRootIds([roots[0].id]);
    }
    setDoneResult(null);
  };

  const allFormats: BulkExportFormat[] = ['png', 'pdf_poster', 'pdf', 'html', 'svg'];

  const toggleFormat = (fmt: BulkExportFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((x) => x !== fmt) : [...prev, fmt]
    );
    setDoneResult(null);
  };

  const selectAllFormats = () => {
    setSelectedFormats(allFormats);
    setDoneResult(null);
  };

  const totalFilesToGenerate = calculateBulkExportTasksCount({
    rootsCount: selectedRootIds.length,
    groupingChoice,
    modeChoice,
    femalesChoice,
    formatsCount: selectedFormats.length
  });

  const handleStartExport = async () => {
    if (selectedRootIds.length === 0 || selectedFormats.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);
    setDoneResult(null);

    try {
      const chosenRoots = roots.filter((r) => selectedRootIds.includes(r.id));
      const res = await generateBulkTreesZip({
        roots: chosenRoots,
        getChildren,
        groupingChoice,
        modeChoice,
        femalesChoice,
        formats: selectedFormats,
        onProgress: (info) => {
          setProgress(info);
        }
      });

      setDoneResult({
        zipFilename: res.zipFilename,
        totalFilesGenerated: res.totalFilesGenerated
      });
    } catch (err: any) {
      console.error('Bulk ZIP export error:', err);
      setErrorMsg(err?.message || 'حدث خطأ غير متوقع أثناء تجهيز الملف المضغوط.');
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-amber-300 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-950 via-emerald-900 to-teal-900 p-4 sm:p-5 text-white flex items-center justify-between border-b border-amber-500/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <FolderArchive size={24} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-amber-300">
                تصدير حقيبة أشجار العائلة في ملف مضغوط واحد (ZIP)
              </h3>
              <p className="text-[11px] sm:text-xs text-emerald-100/90 mt-0.5">
                يدعم تجميع الأشجار في ملف واحد أو مفردة، مع الإناث وبدون إناث، وبجميع الصيغ
              </p>
            </div>
          </div>

          {!isExporting && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title="إغلاق"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* 1. Choose Trees */}
          <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-emerald-700" />
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  1. اختيار الأشجار ({selectedRootIds.length} من {roots.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={selectAllRoots}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 transition-colors"
                >
                  تحديد كل الأشجار ({roots.length})
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={selectCurrentRootOnly}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
                >
                  الشجرة الحالية فقط
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
              {roots.map((root) => {
                const isChecked = selectedRootIds.includes(root.id);
                return (
                  <button
                    key={root.id}
                    type="button"
                    disabled={isExporting}
                    onClick={() => toggleRoot(root.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${
                      isChecked
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare size={18} className="text-emerald-700 shrink-0" />
                    ) : (
                      <Square size={18} className="text-slate-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black truncate">
                        شجرة {root.fullName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Grouping Choice: Separate, Combined in 1 file, or Both */}
          <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2.5">
              <Layers size={18} className="text-emerald-700" />
              <span className="text-xs sm:text-sm font-black text-slate-800">
                2. تجميع الأشجار أو فصلها (المفردة والمجمّعة)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'separate' as BulkGroupingChoice,
                  title: 'مفردة (كل شجرة بملف)',
                  sub: 'ملف مستقل لكل شجرة محددة'
                },
                {
                  id: 'combined' as BulkGroupingChoice,
                  title: 'تجميع في ملف واحد',
                  sub: 'جمع كل الأشجار المحددة بملف واحد'
                },
                {
                  id: 'both' as BulkGroupingChoice,
                  title: 'كلاهما معاً (شامل)',
                  sub: 'الأشجار مفردة + مجمّعة في ملف واحد'
                }
              ].map((opt) => {
                const active = groupingChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isExporting}
                    onClick={() => {
                      setGroupingChoice(opt.id);
                      setDoneResult(null);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      active
                        ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">{opt.title}</span>
                      {active && <Check size={15} className="text-amber-300" />}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        active ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Choose Tree Mode */}
          <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles size={18} className="text-amber-600" />
              <span className="text-xs sm:text-sm font-black text-slate-800">
                3. شكل وتصميم الشجرة
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'classic' as BulkTreeModeChoice,
                  title: 'الهرمي صفوف',
                  sub: 'كل جيل في صف أفقي مستقل'
                },
                {
                  id: 'classic_vertical' as BulkTreeModeChoice,
                  title: 'الهرمي عمود',
                  sub: 'عمودي مدمج · كل جيل بلون'
                },
                {
                  id: 'both' as BulkTreeModeChoice,
                  title: 'كلاهما معاً (التصميمان)',
                  sub: 'يُصدّر الهرمي صفوف + الهرمي عمود'
                }
              ].map((opt) => {
                const active = modeChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isExporting}
                    onClick={() => {
                      setModeChoice(opt.id);
                      setDoneResult(null);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      active
                        ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">{opt.title}</span>
                      {active && <Check size={15} className="text-amber-300" />}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        active ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Choose Females Option */}
          <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2.5">
              <Users size={18} className="text-rose-700" />
              <span className="text-xs sm:text-sm font-black text-slate-800">
                4. خيارات عرض الإناث (مع الإناث / بدون إناث)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  id: 'males_only' as BulkFemalesChoice,
                  title: 'بدون إناث (الذكور فقط)',
                  sub: 'شجرة الآباء والأبناء الذكور'
                },
                {
                  id: 'with_females' as BulkFemalesChoice,
                  title: 'مع الإناث',
                  sub: 'شاملة للذكور والبنات معاً'
                },
                {
                  id: 'both' as BulkFemalesChoice,
                  title: 'النسختان معاً',
                  sub: 'نسخة مع الإناث + نسخة بدون إناث'
                }
              ].map((opt) => {
                const active = femalesChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isExporting}
                    onClick={() => {
                      setFemalesChoice(opt.id);
                      setDoneResult(null);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      active
                        ? 'bg-rose-800 text-white border-rose-950 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">{opt.title}</span>
                      {active && <Check size={15} className="text-amber-200" />}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        active ? 'text-rose-100' : 'text-slate-500'
                      }`}
                    >
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Choose Formats */}
          <div className="bg-slate-50 rounded-2xl p-3.5 sm:p-4 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Archive size={18} className="text-indigo-700" />
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  5. صيغ الملفات المطلوبة ({selectedFormats.length} من 5 صيغ)
                </span>
              </div>
              <button
                type="button"
                disabled={isExporting}
                onClick={selectAllFormats}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-900 transition-colors"
              >
                تحديد جميع الصيغ (5 صيغ)
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: 'png' as BulkExportFormat,
                  title: 'صورة عالية الدقة (PNG)',
                  sub: 'جاهزة للعرض والطباعة والمشاركة',
                  icon: <FileImage size={18} className="text-amber-600" />
                },
                {
                  id: 'pdf_poster' as BulkExportFormat,
                  title: 'ملف PDF (لوحة الشجرة المصورة)',
                  sub: 'بوستر كامل للشجرة في صفحة واحدة',
                  icon: <FileText size={18} className="text-teal-700" />
                },
                {
                  id: 'pdf' as BulkExportFormat,
                  title: 'ملف PDF (سجل مراجعة A4)',
                  sub: 'دفتر مراجعة وتدقيق متسلسل للآباء والأبناء',
                  icon: <FileText size={18} className="text-emerald-700" />
                },
                {
                  id: 'html' as BulkExportFormat,
                  title: 'ملف تفاعلي (HTML)',
                  sub: 'يفتح في أي متصفح مع بحث وتكبير وطي الفروع',
                  icon: <Globe size={18} className="text-indigo-600" />
                },
                {
                  id: 'svg' as BulkExportFormat,
                  title: 'ملف فيكتور للمطابع (SVG)',
                  sub: 'دقة لا نهائية للبنرات واللوحات الجدارية',
                  icon: <FileCode size={18} className="text-purple-700" />
                }
              ].map((fmt) => {
                const checked = selectedFormats.includes(fmt.id);
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    disabled={isExporting}
                    onClick={() => toggleFormat(fmt.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${
                      checked
                        ? 'bg-white border-emerald-600 ring-2 ring-emerald-500/20 text-slate-900'
                        : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-white'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare size={18} className="text-emerald-700 shrink-0" />
                    ) : (
                      <Square size={18} className="text-slate-400 shrink-0" />
                    )}
                    <div className="shrink-0">{fmt.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black">{fmt.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">{fmt.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progress Bar while exporting */}
          {isExporting && progress && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 space-y-2.5 animate-pulse">
              <div className="flex items-center justify-between text-xs font-black text-amber-950">
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-amber-700" />
                  جاري تجهيز: {progress.treeName}
                </span>
                <span>
                  {progress.currentStep} / {progress.totalSteps}
                </span>
              </div>
              <div className="text-[11px] font-bold text-amber-800">
                {progress.detailLabel}
              </div>
              <div className="w-full h-3 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-emerald-700 to-amber-600 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (progress.currentStep / Math.max(1, progress.totalSteps)) * 100
                    )}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Success Banner */}
          {doneResult && !isExporting && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs sm:text-sm font-black text-emerald-950">
                  تم تجهيز وتنزيل الحقيبة المضغوطة بنجاح ({doneResult.totalFilesGenerated} ملفاً)!
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5 font-bold">
                  اسم الملف: {doneResult.zipFilename}
                </div>
              </div>
              <Check size={24} className="text-emerald-700 shrink-0" />
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5 text-xs font-bold text-rose-800">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-slate-700">
            إجمالي الملفات التي سيتم توليدها داخل الملف المضغوط:{' '}
            <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-900 text-amber-300 font-black">
              {totalFilesToGenerate} ملف
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              إغلاق
            </button>
            <button
              type="button"
              disabled={isExporting || totalFilesToGenerate === 0}
              onClick={handleStartExport}
              className="px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-l from-amber-400 via-amber-300 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 shadow-md border border-amber-500 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري ضغط وتوليد الملفات...</span>
                </>
              ) : (
                <>
                  <FolderArchive size={17} />
                  <span>توليد وتنزيل الملف المضغوط (.ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
