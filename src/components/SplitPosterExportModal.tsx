import React, { useState, useMemo } from 'react';
import { Person } from '../types/family';
import {
  X,
  Printer,
  CheckSquare,
  Square,
  FileDown,
  Image as ImageIcon,
  FileCode,
  FolderArchive,
  Layers,
  Grid,
  Sparkles,
  Loader2,
  Check,
  Columns,
  Rows
} from 'lucide-react';
import {
  SplitPaperSize,
  SplitOrientation,
  SplitExportFormat,
  SplitLayoutType,
  computeSplitPosterGrid,
  executeSplitPosterExport
} from '../utils/splitPosterExport';
import { formatAppName } from '../utils/nameUtils';

interface SplitPosterExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  roots: Person[];
  initialSelectedRootIds: string[];
  getChildren: (personId: string) => Person[];
  initialMode: 'classic' | 'classic_vertical';
  initialShowFemales: boolean;
  collapsedNodes?: Set<string>;
}

export const SplitPosterExportModal: React.FC<SplitPosterExportModalProps> = ({
  isOpen,
  onClose,
  roots,
  initialSelectedRootIds,
  getChildren,
  initialMode,
  initialShowFemales,
  collapsedNodes = new Set<string>()
}) => {
  const [selectedRootIds, setSelectedRootIds] = useState<string[]>(() =>
    initialSelectedRootIds.length > 0
      ? initialSelectedRootIds
      : roots.length > 0
      ? [roots[0].id]
      : []
  );
  const [treeMode, setTreeMode] = useState<'classic' | 'classic_vertical'>(initialMode);
  const [includeFemales, setIncludeFemales] = useState<boolean>(initialShowFemales);
  const [paperSize, setPaperSize] = useState<SplitPaperSize>('A4');
  const [orientation, setOrientation] = useState<SplitOrientation>('auto');
  const [layoutType, setLayoutType] = useState<SplitLayoutType>('auto_smart');
  const [targetPagesCount, setTargetPagesCount] = useState<number>(4);
  const [customCols, setCustomCols] = useState<number>(2);
  const [customRows, setCustomRows] = useState<number>(2);
  const [format, setFormat] = useState<SplitExportFormat>('pdf');
  const [seamlesslyBorderless, setSeamlesslyBorderless] = useState<boolean>(true);
  const [showSubtleCornerBadge, setShowSubtleCornerBadge] = useState<boolean>(true);

  const [isExporting, setIsExporting] = useState(false);
  const [doneResult, setDoneResult] = useState<{
    filename: string;
    totalPages: number;
    cols: number;
    rows: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estimate total nodes in selected trees to feed into smart auto-grid calculation
  const estimatedNodesCount = useMemo(() => {
    const chosenRoots = roots.filter((r) => selectedRootIds.includes(r.id));
    const visited = new Set<string>();
    let count = 0;
    const traverse = (p: Person) => {
      if (visited.has(p.id)) return;
      visited.add(p.id);
      count++;
      if (collapsedNodes.has(p.id)) return;
      const kids = getChildren(p.id).filter((k) =>
        includeFemales ? true : k.gender === 'male'
      );
      for (const k of kids) traverse(k);
    };
    for (const r of chosenRoots) traverse(r);
    return Math.max(1, count);
  }, [roots, selectedRootIds, getChildren, includeFemales, collapsedNodes]);

  const gridPreview = useMemo(() => {
    const defaultAspect = treeMode === 'classic' ? 1.8 : 0.78;
    return computeSplitPosterGrid(
      {
        mode: treeMode,
        paperSize,
        orientation,
        layoutType,
        targetPagesCount,
        customCols,
        customRows
      },
      defaultAspect,
      estimatedNodesCount
    );
  }, [
    treeMode,
    paperSize,
    orientation,
    layoutType,
    targetPagesCount,
    customCols,
    customRows,
    estimatedNodesCount
  ]);

  if (!isOpen) return null;

  const toggleRoot = (id: string) => {
    setSelectedRootIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    setDoneResult(null);
  };

  const handleQuickPreset = (
    type: SplitLayoutType,
    pages: number,
    cols: number,
    rows: number
  ) => {
    setLayoutType(type);
    setTargetPagesCount(pages);
    setCustomCols(cols);
    setCustomRows(rows);
    setDoneResult(null);
  };

  const handleStartExport = async () => {
    const chosenRoots = roots.filter((r) => selectedRootIds.includes(r.id));
    if (chosenRoots.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);
    setDoneResult(null);

    try {
      const res = await executeSplitPosterExport(
        {
          roots: chosenRoots,
          getChildren,
          mode: treeMode,
          includeFemales,
          collapsedNodes,
          paperSize,
          orientation,
          layoutType,
          targetPagesCount,
          customCols,
          customRows,
          format,
          seamlesslyBorderless,
          showSubtleCornerBadge
        },
        estimatedNodesCount
      );
      setDoneResult(res);
    } catch (err: any) {
      console.error('Split Poster Export Error:', err);
      setErrorMsg(err?.message || 'حدث خطأ أثناء تجهيز التقسيم.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border-2 border-amber-400 overflow-hidden my-auto max-h-[94dvh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-950 via-emerald-900 to-teal-900 p-4 sm:p-5 text-white flex items-center justify-between border-b border-amber-500/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <Grid size={24} />
            </div>
            <div>
              <h3 className="text-sm sm:text-lg font-black text-amber-300">
                تصدير الشجرة مقسّمة على عدة أوراق متصلة (بدون هوامش)
              </h3>
              <p className="text-[11px] sm:text-xs text-emerald-100/90 mt-0.5">
                يمتلئ كل جزء بأكبر حجم ممكن في الورقة (A4 / A3) لتلصق جنباً إلى جنب كلوحة واحدة فائقة الوضوح
              </p>
            </div>
          </div>

          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title="إغلاق"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* 1. Tree Selection (Single or Combined Multi-Tree) */}
          {roots.length > 1 && (
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Layers size={15} className="text-emerald-700" />
                  <span>1. اختر شجرة مفردة أو دمج عدة أشجار معاً ({selectedRootIds.length} مختارة):</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRootIds(roots.map((r) => r.id));
                      setDoneResult(null);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900"
                  >
                    دمج جميع الأشجار ({roots.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (roots[0]) setSelectedRootIds([roots[0].id]);
                      setDoneResult(null);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800"
                  >
                    شجرة واحدة
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-0.5">
                {roots.map((r) => {
                  const isChecked = selectedRootIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRoot(r.id)}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-right transition-all ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-black'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare size={16} className="text-emerald-700 shrink-0" />
                      ) : (
                        <Square size={16} className="text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs truncate">شجرة: {formatAppName(r.fullName)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Tree Mode & Females */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
              <div className="text-xs font-black text-slate-800 mb-2">نمط تخطيط الشجرة:</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setTreeMode('classic');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    treeMode === 'classic'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  الهرمي صفوف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTreeMode('classic_vertical');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    treeMode === 'classic_vertical'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  الهرمي عمود
                </button>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
              <div className="text-xs font-black text-slate-800 mb-2">شمول الإناث (البنات):</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIncludeFemales(true);
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    includeFemales
                      ? 'bg-rose-700 text-white border-rose-800 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  مع الإناث
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIncludeFemales(false);
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    !includeFemales
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  الذكور فقط
                </button>
              </div>
            </div>
          </div>

          {/* 3. Method of Splitting & Number of Pages */}
          <div className="bg-amber-50/70 rounded-2xl p-3.5 border border-amber-300/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
                <Sparkles size={16} className="text-amber-600" />
                <span>طريقة التقسيم وعدد الأوراق / الصفحات:</span>
              </span>
              <span className="text-[11px] font-black bg-emerald-900 text-amber-300 px-2.5 py-0.5 rounded-full">
                الإجمالي: {gridPreview.totalPages} {gridPreview.totalPages <= 10 ? 'أوراق' : 'ورقة'} ({gridPreview.cols} × {gridPreview.rows})
              </span>
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLayoutType('auto_smart');
                  setDoneResult(null);
                }}
                className={`p-2 rounded-xl border text-center transition-all ${
                  layoutType === 'auto_smart'
                    ? 'bg-emerald-900 text-amber-300 border-emerald-950 font-black shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100/50 font-bold'
                }`}
              >
                <div className="text-xs">تلقائي ذكي</div>
                <div className="text-[9px] opacity-80">حسب حجم الشجرة</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLayoutType('horizontal_strip');
                  setDoneResult(null);
                }}
                className={`p-2 rounded-xl border text-center transition-all ${
                  layoutType === 'horizontal_strip'
                    ? 'bg-emerald-900 text-amber-300 border-emerald-950 font-black shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100/50 font-bold'
                }`}
              >
                <div className="text-xs flex items-center justify-center gap-1">
                  <Columns size={13} />
                  <span>جنباً إلى جنب</span>
                </div>
                <div className="text-[9px] opacity-80">شريط أوراق أفقي</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLayoutType('vertical_strip');
                  setDoneResult(null);
                }}
                className={`p-2 rounded-xl border text-center transition-all ${
                  layoutType === 'vertical_strip'
                    ? 'bg-emerald-900 text-amber-300 border-emerald-950 font-black shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100/50 font-bold'
                }`}
              >
                <div className="text-xs flex items-center justify-center gap-1">
                  <Rows size={13} />
                  <span>فوق بعضها</span>
                </div>
                <div className="text-[9px] opacity-80">شريط أوراق عمودي</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLayoutType('custom_grid');
                  setDoneResult(null);
                }}
                className={`p-2 rounded-xl border text-center transition-all ${
                  layoutType === 'custom_grid'
                    ? 'bg-emerald-900 text-amber-300 border-emerald-950 font-black shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-100/50 font-bold'
                }`}
              >
                <div className="text-xs flex items-center justify-center gap-1">
                  <Grid size={13} />
                  <span>شبكة (أعمدة×صفوف)</span>
                </div>
                <div className="text-[9px] opacity-80">تحديد حر للجانبين</div>
              </button>
            </div>

            {/* Dynamic Controls based on selected layoutType */}
            {layoutType === 'auto_smart' && (
              <div className="bg-white rounded-xl p-3 border border-amber-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div>
                  تم حساب التقسيم التلقائي الأمثل لـ <b>{estimatedNodesCount} فرداً</b> ليكون كل اسم واضحاً وكبيراً:
                </div>
                <span className="font-black text-emerald-900 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-300">
                  {gridPreview.cols} أعمدة × {gridPreview.rows} صفوف = {gridPreview.totalPages} صفحات
                </span>
              </div>
            )}

            {(layoutType === 'horizontal_strip' || layoutType === 'vertical_strip') && (
              <div className="bg-white rounded-xl p-3 border border-amber-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-black text-slate-800">
                    اكتب أو اختر عدد الأوراق / الصفحات المطلوب ({layoutType === 'horizontal_strip' ? 'تُلصق جنباً إلى جنب' : 'تُلصق فوق بعضها'}):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={targetPagesCount}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
                        setTargetPagesCount(val);
                        setDoneResult(null);
                      }}
                      className="w-20 px-2.5 py-1.5 text-center font-black text-sm rounded-xl border-2 border-emerald-700 bg-emerald-50/50 text-emerald-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="text-xs font-bold text-slate-600">ورقة / صفحة</span>
                  </div>
                </div>

                {/* Quick Page Count Buttons: 2, 3, 4, 5, 6, 8 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 ml-1">اختيار سريع:</span>
                  {[2, 3, 4, 5, 6, 8, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setTargetPagesCount(num);
                        setDoneResult(null);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-black border transition-all ${
                        targetPagesCount === num
                          ? 'bg-amber-400 text-slate-950 border-amber-600 shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      {num} أوراق
                    </button>
                  ))}
                </div>
              </div>
            )}

            {layoutType === 'custom_grid' && (
              <div className="bg-white rounded-xl p-3 border border-amber-200 space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-xs font-black text-slate-800">عدد الأوراق بالعرض (أعمدة):</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={customCols}
                      onChange={(e) => {
                        setCustomCols(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)));
                        setDoneResult(null);
                      }}
                      className="w-16 px-2 py-1 text-center font-black text-sm rounded-lg border-2 border-emerald-700 bg-white text-emerald-950"
                    />
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-xs font-black text-slate-800">عدد الأوراق بالطول (صفوف):</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={customRows}
                      onChange={(e) => {
                        setCustomRows(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)));
                        setDoneResult(null);
                      }}
                      className="w-16 px-2 py-1 text-center font-black text-sm rounded-lg border-2 border-emerald-700 bg-white text-emerald-950"
                    />
                  </div>
                </div>

                {/* Popular Grid Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 ml-1">شبكات جاهزة:</span>
                  {[
                    { c: 2, r: 2, label: '4 أوراق (2×2)' },
                    { c: 3, r: 2, label: '6 أوراق (3×2)' },
                    { c: 2, r: 3, label: '6 أوراق (2×3)' },
                    { c: 3, r: 3, label: '9 أوراق (3×3)' },
                    { c: 4, r: 2, label: '8 أوراق (4×2)' }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleQuickPreset('custom_grid', preset.c * preset.r, preset.c, preset.r)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all ${
                        customCols === preset.c && customRows === preset.r
                          ? 'bg-amber-400 text-slate-950 border-amber-600'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Paper Size (A4 / A3) & Page Orientation (Portrait / Landscape / Auto) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
              <div className="text-xs font-black text-slate-800 mb-2">مقاس الورقة عند الطباعة:</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaperSize('A4');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    paperSize === 'A4'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ورق A4 قياسي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaperSize('A3');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all ${
                    paperSize === 'A3'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ورق A3 كبير
                </button>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200">
              <div className="text-xs font-black text-slate-800 mb-2">اتجاه كل ورقة:</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOrientation('auto');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black border transition-all ${
                    orientation === 'auto'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  تلقائي ({gridPreview.resolvedOrientation === 'landscape' ? 'أفقي' : 'عمودي'})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrientation('portrait');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black border transition-all ${
                    orientation === 'portrait'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  عمودي (طولي)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrientation('landscape');
                    setDoneResult(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-black border transition-all ${
                    orientation === 'landscape'
                      ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  أفقي (عرضي)
                </button>
              </div>
            </div>
          </div>

          {/* 5. Export Format (PDF Multi-page, PNG ZIP, SVG ZIP, or All) */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
            <div className="text-xs font-black text-slate-800">اختر صيغة التصدير المقسّم:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormat('pdf');
                  setDoneResult(null);
                }}
                className={`p-2.5 rounded-xl border text-right flex items-center gap-2.5 transition-all ${
                  format === 'pdf'
                    ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileDown size={18} className={format === 'pdf' ? 'text-amber-300' : 'text-teal-600'} />
                <div>
                  <div className="text-xs font-black">ملف PDF واحد متعدد الصفحات ({gridPreview.totalPages} صفحات)</div>
                  <div className={`text-[10px] ${format === 'pdf' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    جاهز للطباعة المباشرة وكل صفحة تملأ الورقة بالكامل
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormat('png_zip');
                  setDoneResult(null);
                }}
                className={`p-2.5 rounded-xl border text-right flex items-center gap-2.5 transition-all ${
                  format === 'png_zip'
                    ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ImageIcon size={18} className={format === 'png_zip' ? 'text-amber-300' : 'text-amber-600'} />
                <div>
                  <div className="text-xs font-black">صور PNG مقسمة عالية الدقة ({gridPreview.totalPages} صور)</div>
                  <div className={`text-[10px] ${format === 'png_zip' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    تُحفظ مرتبة في ملف ZIP كل قطعة بصورة مستقلة
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormat('svg_zip');
                  setDoneResult(null);
                }}
                className={`p-2.5 rounded-xl border text-right flex items-center gap-2.5 transition-all ${
                  format === 'svg_zip'
                    ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileCode size={18} className={format === 'svg_zip' ? 'text-amber-300' : 'text-purple-600'} />
                <div>
                  <div className="text-xs font-black">ملفات فيكتور SVG مقسمة ({gridPreview.totalPages} ملفات)</div>
                  <div className={`text-[10px] ${format === 'svg_zip' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    دقة فيكتور لا نهائية للمطابع في ملف مضغوط
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormat('all_zip');
                  setDoneResult(null);
                }}
                className={`p-2.5 rounded-xl border text-right flex items-center gap-2.5 transition-all ${
                  format === 'all_zip'
                    ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FolderArchive size={18} className={format === 'all_zip' ? 'text-amber-300' : 'text-emerald-700'} />
                <div>
                  <div className="text-xs font-black">حقيبة شاملة لكل الصيغ المقسمة (PDF + PNG + SVG)</div>
                  <div className={`text-[10px] ${format === 'all_zip' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    يجمع ملف الـ PDF المقسم مع الصور والفيكتور معاً
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 6. Seamless Join Options & Live Physical Size Preview */}
          <div className="bg-emerald-50/70 rounded-2xl p-3.5 border border-emerald-200 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black text-emerald-950">
                معاينة حجم اللوحة الجدارية النهائية عند لصق الأوراق معاً:
              </div>
              <div className="text-xs font-black bg-white text-emerald-900 px-3 py-1 rounded-xl border border-emerald-300 shadow-2xs">
                العرض الكلي: {gridPreview.totalPosterWidthCm} سم × الارتفاع الكلي: {gridPreview.totalPosterHeightCm} سم
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={seamlesslyBorderless}
                  onChange={(e) => setSeamlesslyBorderless(e.target.checked)}
                  className="w-4 h-4 accent-emerald-800 rounded"
                />
                <span>اتصال احترافي مباشر بدون هوامش فاصلة بين الأوراق (Full-Bleed)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={showSubtleCornerBadge}
                  onChange={(e) => setShowSubtleCornerBadge(e.target.checked)}
                  className="w-4 h-4 accent-emerald-800 rounded"
                />
                <span>إضافة رقم ترتيب صغير في زاوية كل ورقة لتسهيل اللصق بالترتيب</span>
              </label>
            </div>
          </div>

          {/* Status Messages */}
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {doneResult && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-700 text-amber-300 flex items-center justify-center shrink-0">
                  <Check size={18} />
                </div>
                <div>
                  <div className="text-xs font-black">
                    تم تصدير الشجرة مقسّمة إلى {doneResult.totalPages} صفحات ({doneResult.cols}×{doneResult.rows}) بنجاح!
                  </div>
                  <div className="text-[11px] text-emerald-800 font-bold truncate max-w-md">
                    {doneResult.filename}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs sm:text-sm font-bold transition-colors disabled:opacity-50"
          >
            إغلاق
          </button>

          <button
            type="button"
            disabled={isExporting || selectedRootIds.length === 0}
            onClick={handleStartExport}
            className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-l from-emerald-950 via-emerald-900 to-teal-900 hover:from-emerald-900 hover:to-teal-800 text-amber-300 font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 border border-amber-400/50 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 size={18} className="animate-spin text-amber-300" />
                <span>جاري تقسيم وتجهيز {gridPreview.totalPages} صفحات بدقة فائقة...</span>
              </>
            ) : (
              <>
                <Printer size={18} />
                <span>
                  تصدير مقسّم ({gridPreview.totalPages} {gridPreview.totalPages <= 10 ? 'أوراق' : 'ورقة'} {paperSize} — {format === 'pdf' ? 'PDF' : format === 'png_zip' ? 'PNG' : format === 'svg_zip' ? 'SVG' : 'شامل'})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
