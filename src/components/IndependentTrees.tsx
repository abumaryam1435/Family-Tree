import React, { useState } from 'react';
import { TreeDeciduous, GitMerge, Users, ChevronLeft, Plus, Info, Layers, ArrowUp, FolderArchive } from 'lucide-react';
import { Person } from '../types/family';
import { formatAppName } from '../utils/nameUtils';
import { BulkZipExportModal } from './BulkZipExportModal';

interface IndependentTreesProps {
  treeRoots: Person[];
  persons: Person[];
  getChildren: (personId: string) => Person[];
  onSelectTree: (rootId: string) => void;
  onOpenMergeModal: () => void;
  onOpenAddModal: () => void;
  onOpenAddFather?: (rootId: string) => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  getDescendantsCount: (personId: string) => { total: number; males: number; females: number; maxDepth: number };
}

export const IndependentTrees: React.FC<IndependentTreesProps> = ({
  treeRoots,
  persons,
  getChildren,
  onSelectTree,
  onOpenMergeModal,
  onOpenAddModal,
  onOpenAddFather,
  isAdmin,
  getDescendantsCount
}) => {
  const [showBulkZipModal, setShowBulkZipModal] = useState(false);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Intro Header */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#0F4C3A] font-display flex items-center gap-2">
            <TreeDeciduous className="w-5 h-5 text-[#D4AF37] shrink-0" />
            <span>الأشجار والفروع العائلية المستقلة ({treeRoots.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            يمكن استعراض أو تصدير جميع الأشجار العائلية دفعة واحدة في ملف مضغوط (ZIP)، كما يمكن للمشرف إضافة أصل أعلى ودمج الأشجار معاً.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          {treeRoots.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkZipModal(true)}
              className="min-h-[42px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#093829] to-[#0F4C3A] text-white border border-[#D4AF37]/50 font-bold text-xs shadow-sm hover:brightness-110 transition cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-[#FDE68A] shrink-0" />
              <span>تصدير شامل للأشجار (ZIP)</span>
            </button>
          )}

          {isAdmin && (
            <>
              {onOpenAddFather && treeRoots.length > 0 && (
                <button
                  onClick={() => onOpenAddFather(treeRoots[0].id)}
                  className="min-h-[42px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#0F4C3A]/30 bg-emerald-50 text-[#0F4C3A] hover:bg-emerald-100 font-bold text-xs transition cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4 shrink-0" />
                  <span>إضافة أصل للأصول الموجودة</span>
                </button>
              )}

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <button
                  onClick={onOpenMergeModal}
                  className="min-h-[42px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B89738] text-[#0A3327] font-bold text-xs shadow-sm hover:brightness-105 transition cursor-pointer"
                >
                  <GitMerge className="w-4 h-4 shrink-0" />
                  <span>دمج الأشجار</span>
                </button>

                <button
                  onClick={onOpenAddModal}
                  className="min-h-[42px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition bg-[#0F4C3A] text-white hover:bg-[#0c3c2e] cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>إضافة شجرة جديدة</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grid of Trees */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {treeRoots.map((root) => {
          const stats = getDescendantsCount(root.id);

          return (
            <div
              key={root.id}
              className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-6 shadow-xs hover:border-[#0F4C3A]/50 hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3.5 sm:mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
                    <TreeDeciduous className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                    أصل الشجرة
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1 break-words leading-snug">
                  {formatAppName(root.fullName)}
                </h3>

                {root.notes && (
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-4 bg-[#FBF9F5] p-3 rounded-xl border border-slate-100 break-words">
                    {root.notes}
                  </p>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 my-3.5 sm:my-4">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <div className="text-base font-bold text-[#0F4C3A] tabular-nums">
                      {stats.total + 1}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">إجمالي الأفراد</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <div className="text-base font-bold text-[#0F4C3A] tabular-nums">
                      {stats.maxDepth + 1}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">الأجيال المتسلسلة</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <button
                  onClick={() => onSelectTree(root.id)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#0F4C3A]/5 hover:bg-[#0F4C3A]/10 flex items-center justify-center gap-1.5 text-xs font-bold text-[#0F4C3A] transition cursor-pointer"
                >
                  <span>استعراض الفروع في الشجرة</span>
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                </button>

                {isAdmin && onOpenAddFather && (
                  <button
                    type="button"
                    onClick={() => onOpenAddFather(root.id)}
                    className="min-h-[40px] flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-xs font-bold transition cursor-pointer"
                    title={`إضافة أصل أعلى (أب / جد) فوق ${formatAppName(root.fullName)}`}
                  >
                    <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                    <span>+ إضافة أصل لهذا الأصل</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BulkZipExportModal
        isOpen={showBulkZipModal}
        onClose={() => setShowBulkZipModal(false)}
        treeRoots={treeRoots}
        getChildren={getChildren}
        getAllPersons={() => persons}
      />
    </div>
  );
};


