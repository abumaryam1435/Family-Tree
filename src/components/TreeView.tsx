import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Person } from '../types/family';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Plus,
  Users,
  ChevronDown,
  ChevronUp,
  Search,
  UserPlus,
  Filter,
  Sparkles,
  FileDown,
  Maximize,
  Minimize,
  Printer,
  Image as ImageIcon,
  Globe,
  FileCode,
  FolderArchive,
  CheckSquare,
  Square,
  Layers,
  GitMerge,
  ArrowUp,
  Maximize2,
  ChevronsDownUp,
  ChevronsUpDown,
  Info
} from 'lucide-react';
import {
  exportTreeToPdf,
  exportTreeToPng,
  exportTiledTreePdf,
  exportTreeToSvg,
  exportVisualTreePosterToPdf
} from '../utils/pdfExport';
import { exportTreeToInteractiveHtml } from '../utils/htmlExport';
import { BulkZipExportModal } from './BulkZipExportModal';
import { computeVerticalPyramidLayout } from '../utils/verticalPyramidLayout';
import {
  extractGivenName,
  formatAppName,
  formatNameWithLimit
} from '../utils/nameUtils';

export interface TreeViewProps {
  persons: Person[];
  treeRoots: Person[];
  selectedTreeRootId: string | null;
  setSelectedTreeRootId: (id: string) => void;
  onSelectPerson: (id: string) => void;
  onOpenAddModalWithFather: (fatherId: string) => void;
  onOpenAddFather: (personId: string) => void;
  onOpenMergeModal: (sourceId?: string) => void;
  onExecuteMerge?: (sourceId: string, targetId: string) => Promise<any>;
  onOpenEditPerson?: (person: Person) => void;
  onDeletePerson?: (id: string) => void;
  onToggleGender?: (id: string) => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  getPerson: (id: string) => Person | undefined;
  getChildren: (personId: string) => Person[];
  getAncestors: (personId: string) => Person[];
  getLineageString: (personId: string) => string;
}

interface VerticalPyramidTreeCanvasProps {
  rootPerson: Person;
  getChildren: (personId: string) => Person[];
  collapsedNodes: Set<string>;
  includeFemales: boolean;
  focusedId: string | null;
  onSelectPerson: (person: Person) => void;
  onToggleCollapse: (id: string) => void;
}

const VerticalPyramidTreeCanvas: React.FC<VerticalPyramidTreeCanvasProps> = ({
  rootPerson,
  getChildren,
  collapsedNodes,
  includeFemales,
  focusedId,
  onSelectPerson,
  onToggleCollapse
}) => {
  const layout = useMemo(
    () =>
      computeVerticalPyramidLayout({
        rootPerson,
        getChildren,
        collapsedNodes,
        includeFemales,
        forScreen: true
      }),
    [rootPerson, getChildren, collapsedNodes, includeFemales]
  );

  const {
    nodes,
    links,
    logicalW,
    logicalH,
    nodeW,
    nodeH,
    generationsList
  } = layout;

  return (
    <div className="flex flex-col items-center">
      {/* Generation Color Legend Bar */}
      <div
        className="mb-4 flex flex-wrap items-center justify-center gap-1.5 bg-white/95 px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm"
        dir="rtl"
      >
        <span className="text-xs font-black text-slate-700 ml-1">ألوان الأجيال:</span>
        {generationsList.map((gen) => (
          <span
            key={gen.depth}
            style={{
              backgroundColor: gen.badgeBg,
              color: gen.badgeText,
              borderColor: gen.border
            }}
            className="px-2.5 py-0.5 rounded-lg text-[11px] font-black border shadow-2xs"
          >
            {gen.depth === 1 ? 'الجيل 1 (الأصل)' : `الجيل ${gen.depth}`}
          </span>
        ))}
      </div>

      {/* Interactive SVG + HTML Hybrid Pyramid Canvas */}
      <div
        className="relative"
        style={{ width: `${logicalW}px`, height: `${logicalH}px` }}
      >
        <svg
          width={logicalW}
          height={logicalH}
          viewBox={`0 0 ${logicalW} ${logicalH}`}
          className="absolute inset-0 pointer-events-none"
        >
          {links.map((link) => (
            <path
              key={link.id}
              d={link.svgPath}
              fill="none"
              stroke={link.color}
              strokeWidth={4.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {nodes.map((node) => {
          const { person, depth, x, y, theme, totalDirectChildren, isCollapsed } = node;
          const isRoot = depth === 1;
          const isFocused = focusedId === person.id;
          const left = x - nodeW / 2;
          const top = y - nodeH / 2;
          const displayName = isRoot
            ? formatAppName(person.fullName)
            : extractGivenName(person.fullName);

          return (
            <div
              key={person.id}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${nodeW}px`,
                height: `${nodeH}px`,
                background: `linear-gradient(180deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)`,
                borderColor: theme.border,
                borderWidth: isRoot ? '4px' : '3px'
              }}
              onClick={() => {
                if (totalDirectChildren > 0) {
                  onToggleCollapse(person.id);
                } else {
                  onSelectPerson(person);
                }
              }}
              className={`absolute rounded-2xl shadow-md hover:shadow-xl cursor-pointer transition-transform hover:-translate-y-0.5 flex flex-col justify-between p-1.5 sm:p-2 select-none ${
                isFocused ? 'ring-4 ring-amber-400 scale-105 z-30' : 'z-10'
              }`}
              dir="rtl"
            >
              {/* Top Row: Generation Badge, Info Details Button & Gender */}
              <div
                className="flex items-center justify-between border-b pb-0.5"
                style={{ borderColor: theme.divider }}
              >
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span
                    style={{
                      backgroundColor: theme.badgeBg,
                      color: theme.badgeText
                    }}
                    className="px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black leading-none"
                  >
                    {isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`}
                  </span>
                  {/* Small Info / Details Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPerson(person);
                    }}
                    className="px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black flex items-center gap-0.5 shadow-2xs transition-all hover:scale-105"
                    style={{
                      backgroundColor: isRoot ? 'rgba(253, 230, 138, 0.25)' : 'rgba(0, 0, 0, 0.08)',
                      color: isRoot ? '#FDE68A' : theme.nameText,
                      border: `1px solid ${isRoot ? 'rgba(253, 230, 138, 0.4)' : theme.divider}`
                    }}
                    title="عرض بيانات وتفاصيل الشخص"
                  >
                    <Info size={10} />
                    <span>تفاصيل</span>
                  </button>
                </div>

                <span
                  style={{
                    color: isRoot
                      ? '#FDE68A'
                      : person.gender === 'female'
                      ? '#BE123C'
                      : theme.subText
                  }}
                  className="text-[9px] sm:text-[10px] font-black leading-none"
                >
                  {person.gender === 'male' ? 'ذكر' : 'أنثى'}
                </span>
              </div>

              {/* Center Name: Prominently large, bold and clearly filling the card */}
              <div className="flex-1 flex items-center justify-center text-center px-1">
                <span
                  style={{ color: theme.nameText }}
                  className={`font-black leading-tight line-clamp-2 ${
                    isRoot
                      ? 'text-xl sm:text-2xl md:text-3xl tracking-wide'
                      : 'text-lg sm:text-2xl md:text-[25px]'
                  }`}
                  title={person.fullName}
                >
                  {displayName}
                </span>
              </div>

              {/* Collapse / Expand Button if person has children */}
              {totalDirectChildren > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(person.id);
                  }}
                  className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-md border transition-transform hover:scale-110 ${
                    isCollapsed
                      ? 'bg-amber-500 text-white border-amber-200 animate-pulse'
                      : 'bg-white text-emerald-900 border-emerald-400'
                  }`}
                  title={
                    isCollapsed
                      ? `إظهار الفروع (${totalDirectChildren})`
                      : 'طي الفروع'
                  }
                >
                  {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TreeNodeProps {
  person: Person;
  getChildren: (personId: string) => Person[];
  onSelect: (person: Person) => void;
  onQuickAddChild: (fatherId: string) => void;
  onOpenAddFather: (personId: string) => void;
  canEdit?: boolean;
  depth?: number;
  isRoot?: boolean;
  collapsedNodes: Set<string>;
  toggleCollapse: (id: string) => void;
  visitedIds?: Set<string>;
  showFemales: boolean;
  focusedId: string | null;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  person,
  getChildren,
  onSelect,
  onQuickAddChild,
  onOpenAddFather,
  canEdit = false,
  depth = 1,
  isRoot = false,
  collapsedNodes,
  toggleCollapse,
  visitedIds = new Set<string>(),
  showFemales,
  focusedId
}) => {
  if (visitedIds.has(person.id)) {
    return null;
  }

  const nextVisitedIds = new Set(visitedIds);
  nextVisitedIds.add(person.id);

  const rawChildren = getChildren(person.id).filter((child) => !nextVisitedIds.has(child.id));
  const children = showFemales ? rawChildren : rawChildren.filter((c) => c.gender === 'male');
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedNodes.has(person.id);
  const isFocused = focusedId === person.id;

  const maleChildren = children.filter((c) => c.gender === 'male').length;
  const femaleChildren = children.filter((c) => c.gender === 'female').length;

  return (
    <div className="flex flex-col items-center relative">
      {/* Node Card Container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Classic Mode Card */}
        <div
          id={`node-${person.id}`}
          onClick={() => {
            if (hasChildren) {
              toggleCollapse(person.id);
            } else {
              onSelect(person);
            }
          }}
          className={`
            group relative flex flex-col items-center pt-2.5 pb-2 px-2.5 sm:px-3 rounded-xl sm:rounded-2xl cursor-pointer
            transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
            w-36 sm:w-48 text-center backdrop-blur-md
            ${
              isRoot
                ? 'bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 text-white shadow-xl shadow-emerald-900/30 border-2 border-amber-400/80 ring-4 ring-amber-400/20'
                : person.gender === 'male'
                ? 'bg-white/95 text-slate-800 border-2 border-emerald-700/20 shadow-md hover:border-emerald-600'
                : 'bg-rose-50/95 text-slate-800 border-2 border-rose-300 shadow-md hover:border-rose-400'
            }
            ${isFocused ? 'ring-4 ring-amber-500 scale-105 shadow-2xl z-30' : ''}
          `}
        >
          {/* Generation Badge */}
          <div
            className={`
              absolute -top-2.5 right-2 sm:right-3 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase shadow-xs
              ${
                isRoot
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black border border-amber-200'
                  : person.gender === 'male'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-100 text-rose-900 border border-rose-300'
              }
            `}
          >
            {isRoot ? 'جذر العائلة' : `الجيل ${depth}`}
          </div>

          {/* Gender Badge */}
          <div
            className={`
              absolute -top-2.5 left-2 sm:left-3 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold shadow-xs
              ${
                isRoot
                  ? 'bg-emerald-950/90 text-amber-300 border border-amber-400/40'
                  : person.gender === 'male'
                  ? 'bg-slate-100 text-slate-700 border border-slate-300'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }
            `}
          >
            {person.gender === 'male' ? 'ذكر' : 'أنثى'}
          </div>

          {/* Person Name: Prominently large, bold and filling the card */}
          <h3
            className={`font-black mt-1 mb-0.5 line-clamp-2 leading-tight ${
              isRoot ? 'text-amber-50 text-lg sm:text-2xl tracking-wide' : 'text-slate-900 text-base sm:text-xl'
            }`}
            title={person.fullName}
          >
            {isRoot ? formatNameWithLimit(person.fullName, 5) : extractGivenName(person.fullName)}
          </h3>

          {/* Details Button + Children Count Summary */}
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(person);
              }}
              className={`
                px-1.5 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold flex items-center gap-0.5 transition-all hover:scale-105 shadow-2xs
                ${
                  isRoot
                    ? 'bg-emerald-950/80 hover:bg-emerald-900 text-amber-300 border border-amber-400/40'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                }
              `}
              title="عرض بيانات وتفاصيل الشخص"
            >
              <Info size={10} />
              <span>تفاصيل</span>
            </button>

            {hasChildren && (
              <div
                className={`flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold ${
                  isRoot
                    ? 'bg-emerald-950/70 text-amber-300 border border-amber-400/30'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title={`عدد الأبناء (${maleChildren} ذكور${showFemales ? ` · ${femaleChildren} إناث` : ''})`}
              >
                <Users size={10} />
                <span>{children.length}</span>
              </div>
            )}
          </div>

          {/* Quick Add Buttons on Hover (only if canEdit) */}
          {canEdit && (
            <div className="mt-1.5 sm:mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAddChild(person.id);
                }}
                className={`
                  px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center gap-1
                  ${
                    isRoot
                      ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }
                `}
                title="إضافة ابن / ابنة"
              >
                <UserPlus size={10} />
                <span>إضافة فرع</span>
              </button>
              {isRoot && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAddFather(person.id);
                  }}
                  className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-950 text-amber-300 border border-amber-400/50 hover:bg-emerald-900 flex items-center gap-0.5"
                  title="إضافة أب أعلى لهذا الجذر"
                >
                  <ArrowUp size={10} />
                  <span>أب أعلى</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Collapse / Expand Toggle Button */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(person.id);
            }}
            className={`
              -mt-2.5 z-20 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center
              shadow-md border transition-transform hover:scale-110
              ${
                isCollapsed
                  ? 'bg-amber-500 text-white border-amber-300 animate-pulse'
                  : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-50'
              }
            `}
            title={isCollapsed ? `إظهار الفروع (${children.length})` : 'طي الفروع'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
      </div>

      {/* Children Branches */}
      {hasChildren && !isCollapsed && (
        <div className="flex flex-col items-center">
          {/* Vertical Stem from Parent */}
          <div className="w-0.5 sm:w-1 bg-gradient-to-b from-emerald-800 to-emerald-600 h-6 sm:h-10" />

          {/* Children Row */}
          <div className="flex items-start justify-center relative">
            {children.map((child, index) => {
              const isFirst = index === 0;
              const isLast = index === children.length - 1;
              const isOnly = children.length === 1;

              return (
                <div key={child.id} className="flex flex-col items-center relative px-1.5 sm:px-3">
                  {/* Horizontal Connecting Bar (RTL Aware) */}
                  {!isOnly && (
                    <>
                      {!isFirst && (
                        <div className="absolute top-0 right-0 w-1/2 border-t-2 border-emerald-700" />
                      )}
                      {!isLast && (
                        <div className="absolute top-0 left-0 w-1/2 border-t-2 border-emerald-700" />
                      )}
                    </>
                  )}

                  {/* Vertical Drop Line to Child */}
                  <div className="w-0.5 sm:w-1 bg-emerald-700 h-5 sm:h-8" />

                  <TreeNode
                    person={child}
                    getChildren={getChildren}
                    onSelect={onSelect}
                    onQuickAddChild={onQuickAddChild}
                    onOpenAddFather={onOpenAddFather}
                    canEdit={canEdit}
                    depth={depth + 1}
                    collapsedNodes={collapsedNodes}
                    toggleCollapse={toggleCollapse}
                    visitedIds={nextVisitedIds}
                    showFemales={showFemales}
                    focusedId={focusedId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const TreeView: React.FC<TreeViewProps> = ({
  persons,
  treeRoots,
  selectedTreeRootId,
  setSelectedTreeRootId,
  onSelectPerson,
  onOpenAddModalWithFather,
  onOpenAddFather,
  onOpenMergeModal,
  editingEnabled,
  getChildren
}) => {
  const roots = treeRoots;
  const allPeople = persons;
  const canEdit = editingEnabled;

  // Multi-tree display selection on screen: can hold 1 tree ID, multiple tree IDs, or all tree IDs
  const [displayedRootIds, setDisplayedRootIds] = useState<string[]>(() => {
    if (selectedTreeRootId && roots.some((r) => r.id === selectedTreeRootId)) {
      return [selectedTreeRootId];
    }
    return roots[0]?.id ? [roots[0].id] : [];
  });
  const [isTreeDropdownOpen, setIsTreeDropdownOpen] = useState(false);

  const [scale, setScale] = useState(0.85);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Only Two Modes: 'classic' (الهرمي صفوف) and 'classic_vertical' (الهرمي عمود)
  const [treeMode, setTreeMode] = useState<'classic' | 'classic_vertical'>('classic');
  const [showFemales, setShowFemales] = useState(true);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPosterPdf, setIsExportingPosterPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingSvg, setIsExportingSvg] = useState(false);
  const [isExportingTiled, setIsExportingTiled] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isBulkZipModalOpen, setIsBulkZipModalOpen] = useState(false);
  const [pendingSingleExportType, setPendingSingleExportType] = useState<
    'png' | 'pdf_poster' | 'pdf_review' | 'html' | 'svg' | null
  >(null);
  const [selectedExportRootIds, setSelectedExportRootIds] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const treeContentRef = useRef<HTMLDivElement>(null);
  const treeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close tree & export dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        treeDropdownRef.current &&
        !treeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsTreeDropdownOpen(false);
        setShowExportMenu(false);
      }
    };
    if (isTreeDropdownOpen || showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTreeDropdownOpen, showExportMenu]);

  // Sync when parent changes selectedTreeRootId externally (e.g. from IndependentTrees tab)
  useEffect(() => {
    if (selectedTreeRootId && roots.some((r) => r.id === selectedTreeRootId)) {
      setDisplayedRootIds((prev) => {
        if (prev.length <= 1) {
          return [selectedTreeRootId];
        }
        return prev.includes(selectedTreeRootId) ? prev : [selectedTreeRootId, ...prev];
      });
    }
  }, [selectedTreeRootId, roots]);

  // Keep displayedRootIds valid when roots list updates
  useEffect(() => {
    if (roots.length === 0) {
      setDisplayedRootIds([]);
      return;
    }
    const validIds = new Set(roots.map((r) => r.id));
    setDisplayedRootIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      if (filtered.length > 0) return filtered;
      const fallbackId =
        selectedTreeRootId && validIds.has(selectedTreeRootId)
          ? selectedTreeRootId
          : roots[0].id;
      return [fallbackId];
    });
  }, [roots, selectedTreeRootId]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  // Fit tree content inside the current screen/viewport (الاحتواء)
  const handleFitToScreen = () => {
    const viewport = canvasViewportRef.current;
    const content = treeContentRef.current;
    if (!viewport || !content) {
      setScale(0.85);
      setPosition({ x: 0, y: 0 });
      return;
    }
    const vw = Math.max(viewport.clientWidth - 28, 200);
    const vh = Math.max(viewport.clientHeight - 28, 200);
    const cw = content.scrollWidth || content.offsetWidth || 600;
    const ch = content.scrollHeight || content.offsetHeight || 400;

    const scaleX = vw / cw;
    const scaleY = vh / ch;
    const nextScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.18), 1.2);

    setScale(Number(nextScale.toFixed(2)));
    setPosition({ x: 0, y: 0 });
  };

  const currentRoot =
    roots.find((r) => r.id === selectedTreeRootId) ||
    roots.find((r) => displayedRootIds.includes(r.id)) ||
    roots[0];
  const displayedRoots = roots.filter((r) => displayedRootIds.includes(r.id));
  const activeDisplayedRoots =
    displayedRoots.length > 0 ? displayedRoots : currentRoot ? [currentRoot] : [];

  // Helpers for selecting 1 tree, multiple trees, or all trees on screen
  const selectSingleRootOnScreen = (rootId: string) => {
    setSelectedTreeRootId(rootId);
    setDisplayedRootIds([rootId]);
    setPosition({ x: 0, y: 0 });
    setIsTreeDropdownOpen(false);
  };

  const toggleDisplayedRootOnScreen = (rootId: string) => {
    setDisplayedRootIds((prev) => {
      const exists = prev.includes(rootId);
      if (exists) {
        if (prev.length <= 1) return prev; // keep at least 1 tree displayed
        const next = prev.filter((id) => id !== rootId);
        if (selectedTreeRootId === rootId) {
          setSelectedTreeRootId(next[0]);
        }
        return next;
      } else {
        setSelectedTreeRootId(rootId);
        return [...prev, rootId];
      }
    });
    setPosition({ x: 0, y: 0 });
  };

  const selectAllRootsOnScreen = () => {
    const allIds = roots.map((r) => r.id);
    setDisplayedRootIds(allIds);
    if (roots[0] && !selectedTreeRootId) {
      setSelectedTreeRootId(roots[0].id);
    }
    setPosition({ x: 0, y: 0 });
    setIsTreeDropdownOpen(false);
  };

  // Compute dropdown button label
  const getTreeDropdownButtonLabel = () => {
    if (!currentRoot) return 'لا توجد أشجار';
    if (roots.length > 1 && activeDisplayedRoots.length === roots.length) {
      return `عرض جميع الأشجار (${roots.length} أشجار)`;
    }
    if (activeDisplayedRoots.length > 1) {
      const previewNames = activeDisplayedRoots
        .slice(0, 2)
        .map((r) => extractGivenName(r.fullName))
        .join('، ');
      return `عرض ${activeDisplayedRoots.length} أشجار (${previewNames}${
        activeDisplayedRoots.length > 2 ? '...' : ''
      })`;
    }
    return `شجرة: ${formatAppName(activeDisplayedRoots[0].fullName)}`;
  };

  const openSingleExportSelector = (
    type: 'png' | 'pdf_poster' | 'pdf_review' | 'html' | 'svg'
  ) => {
    setShowExportMenu(false);
    if (!currentRoot) return;
    if (roots.length <= 1) {
      executeSingleExport(type, [currentRoot]);
      return;
    }
    setSelectedExportRootIds(
      activeDisplayedRoots.length > 0
        ? activeDisplayedRoots.map((r) => r.id)
        : [currentRoot.id]
    );
    setPendingSingleExportType(type);
  };

  const executeSingleExport = async (
    type: 'png' | 'pdf_poster' | 'pdf_review' | 'html' | 'svg',
    chosenRoots: Person[]
  ) => {
    if (chosenRoots.length === 0) return;
    setPendingSingleExportType(null);
    const primaryRoot = chosenRoots[0];
    const multiRoots = chosenRoots.length > 1 ? chosenRoots : undefined;

    if (type === 'html') {
      const filteredGetChildren = (personId: string) => {
        const kids = getChildren(personId);
        return showFemales ? kids : kids.filter((c) => c.gender === 'male');
      };
      exportTreeToInteractiveHtml({
        rootPerson: primaryRoot,
        rootPersons: multiRoots,
        getChildren: filteredGetChildren,
        getAllPersons: () => allPeople,
        mode: treeMode,
        includeFemales: showFemales
      });
      return;
    }

    if (type === 'png') {
      if (isExportingPng) return;
      try {
        setIsExportingPng(true);
        const filteredGetChildren = (personId: string) => {
          const kids = getChildren(personId);
          return showFemales ? kids : kids.filter((c) => c.gender === 'male');
        };
        await exportTreeToPng({
          rootPerson: primaryRoot,
          rootPersons: multiRoots,
          getChildren: filteredGetChildren,
          mode: treeMode,
          collapsedNodes,
          unconstrained: true,
          orientation: 'portrait',
          includeFemales: showFemales
        });
      } catch (err) {
        console.error('PNG Export Error:', err);
      } finally {
        setIsExportingPng(false);
      }
      return;
    }

    if (type === 'pdf_poster') {
      if (isExportingPosterPdf) return;
      try {
        setIsExportingPosterPdf(true);
        const filteredGetChildren = (personId: string) => {
          const kids = getChildren(personId);
          return showFemales ? kids : kids.filter((c) => c.gender === 'male');
        };
        await exportVisualTreePosterToPdf({
          rootPerson: primaryRoot,
          rootPersons: multiRoots,
          getChildren: filteredGetChildren,
          mode: treeMode,
          collapsedNodes,
          unconstrained: true,
          orientation: 'portrait',
          includeFemales: showFemales
        });
      } catch (err) {
        console.error('Poster PDF Export Error:', err);
      } finally {
        setIsExportingPosterPdf(false);
      }
      return;
    }

    if (type === 'pdf_review') {
      if (isExportingPdf) return;
      try {
        setIsExportingPdf(true);
        const filteredGetChildren = (personId: string) => {
          const kids = getChildren(personId);
          return showFemales ? kids : kids.filter((c) => c.gender === 'male');
        };
        await exportTreeToPdf({
          rootPerson: primaryRoot,
          rootPersons: multiRoots,
          getChildren: filteredGetChildren,
          mode: treeMode,
          collapsedNodes,
          includeFemales: showFemales
        });
      } catch (err) {
        console.error('PDF Export Error:', err);
      } finally {
        setIsExportingPdf(false);
      }
      return;
    }

    if (type === 'svg') {
      if (isExportingSvg) return;
      try {
        setIsExportingSvg(true);
        const filteredGetChildren = (personId: string) => {
          const kids = getChildren(personId);
          return showFemales ? kids : kids.filter((c) => c.gender === 'male');
        };
        await exportTreeToSvg({
          rootPerson: primaryRoot,
          rootPersons: multiRoots,
          getChildren: filteredGetChildren,
          mode: treeMode,
          collapsedNodes,
          includeFemales: showFemales
        });
      } catch (err) {
        console.error('SVG Export Error:', err);
      } finally {
        setIsExportingSvg(false);
      }
    }
  };

  const handleExportPdf = () => openSingleExportSelector('pdf_review');
  const handleExportPosterPdf = () => openSingleExportSelector('pdf_poster');
  const handleExportPng = () => openSingleExportSelector('png');
  const handleExportSvg = () => openSingleExportSelector('svg');
  const handleExportHtml = () => openSingleExportSelector('html');

  const handleExportTiledPdf = async (cols: number, rows: number) => {
    if (!currentRoot || isExportingTiled) return;
    try {
      setIsExportingTiled(true);
      setShowExportMenu(false);
      const filteredGetChildren = (personId: string) => {
        const kids = getChildren(personId);
        return showFemales ? kids : kids.filter((c) => c.gender === 'male');
      };
      await exportTiledTreePdf(
        {
          rootPerson: activeDisplayedRoots[0] || currentRoot,
          rootPersons: activeDisplayedRoots.length > 1 ? activeDisplayedRoots : undefined,
          getChildren: filteredGetChildren,
          mode: treeMode,
          collapsedNodes,
          unconstrained: true,
          includeFemales: showFemales
        },
        cols,
        rows
      );
    } catch (err) {
      console.error('Tiled PDF Export Error:', err);
    } finally {
      setIsExportingTiled(false);
    }
  };

  const isAnyExportBusy =
    isExportingPng ||
    isExportingPosterPdf ||
    isExportingPdf ||
    isExportingSvg ||
    isExportingTiled;

  // Shared Unified Export Dropdown Menu (for both Mobile and Desktop)
  const renderExportDropdownMenu = () => {
    if (!showExportMenu) return null;

    return (
      <div
        className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 max-h-[82dvh] overflow-y-auto bg-white text-slate-800 rounded-2xl shadow-2xl border-2 border-amber-400 p-2.5 z-50 space-y-1.5"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-1">
          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
            <FileDown size={15} className="text-amber-600" />
            <span>خيارات التصدير والطباعة</span>
          </span>
          <button
            type="button"
            onClick={() => setShowExportMenu(false)}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded-lg"
          >
            إغلاق ✕
          </button>
        </div>

        {/* 1. Bulk ZIP Archive */}
        <button
          type="button"
          onClick={() => {
            setShowExportMenu(false);
            setIsBulkZipModalOpen(true);
          }}
          className="w-full text-right p-2.5 rounded-xl bg-gradient-to-l from-amber-400 via-amber-300 to-yellow-200 hover:from-amber-300 hover:to-yellow-100 text-slate-950 border border-amber-500 shadow-xs flex items-center justify-between gap-2 transition-all"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-950/10 flex items-center justify-center shrink-0">
              <FolderArchive size={17} className="text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black truncate">حقيبة مضغوطة شاملة (ZIP)</div>
              <div className="text-[10px] font-bold text-slate-800/80 truncate">
                مفردة ومجمعة · مع/بدون إناث · كل الصيغ
              </div>
            </div>
          </div>
          <span className="text-[10px] font-black bg-slate-950 text-amber-300 px-2 py-0.5 rounded-full shrink-0">
            شامل
          </span>
        </button>

        <div className="text-[10px] font-black text-slate-400 px-1.5 pt-1">
          تصدير مباشر (شجرة أو عدة أشجار):
        </div>

        {/* 2. PNG High-Res Image */}
        <button
          type="button"
          onClick={handleExportPng}
          disabled={isExportingPng}
          className="w-full text-right px-2.5 py-2 rounded-xl hover:bg-amber-50 border border-slate-100 hover:border-amber-300 flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <ImageIcon size={15} className="text-amber-600 shrink-0" />
            <div>
              <div className="text-xs font-black text-slate-900">
                {isExportingPng ? 'جاري تجهيز الصورة...' : 'صورة عالية الدقة (PNG)'}
              </div>
              <div className="text-[10px] text-slate-500">لوحة مصورة واضحة للجوال والمشاركة</div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
            PNG
          </span>
        </button>

        {/* 3. PDF Visual Tree Poster */}
        <button
          type="button"
          onClick={handleExportPosterPdf}
          disabled={isExportingPosterPdf}
          className="w-full text-right px-2.5 py-2 rounded-xl hover:bg-teal-50 border border-slate-100 hover:border-teal-300 flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <FileDown size={15} className="text-teal-600 shrink-0" />
            <div>
              <div className="text-xs font-black text-slate-900">
                {isExportingPosterPdf ? 'جاري التجهيز...' : 'لوحة الشجرة المصورة (PDF)'}
              </div>
              <div className="text-[10px] text-slate-500">ملف PDF مطابق لتصميم الشجرة</div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-teal-100 text-teal-900 px-2 py-0.5 rounded-full">
            PDF لوحة
          </span>
        </button>

        {/* 4. PDF A4 Review Register */}
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="w-full text-right px-2.5 py-2 rounded-xl hover:bg-emerald-50 border border-slate-100 hover:border-emerald-300 flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <FileDown size={15} className="text-emerald-700 shrink-0" />
            <div>
              <div className="text-xs font-black text-slate-900">
                {isExportingPdf ? 'جاري التجهيز...' : 'سجل المراجعة الورقي (PDF A4)'}
              </div>
              <div className="text-[10px] text-slate-500">جداول تفصيلية للمراجعة والتدقيق</div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">
            PDF سجل
          </span>
        </button>

        {/* 5. Interactive HTML */}
        <button
          type="button"
          onClick={handleExportHtml}
          className="w-full text-right px-2.5 py-2 rounded-xl hover:bg-indigo-50 border border-slate-100 hover:border-indigo-300 flex items-center justify-between gap-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-indigo-600 shrink-0" />
            <div>
              <div className="text-xs font-black text-slate-900">ملف تفاعلي مستقل (HTML)</div>
              <div className="text-[10px] text-slate-500">يفتح في أي متصفح مع البحث والطي</div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full">
            HTML
          </span>
        </button>

        {/* 6. Vector SVG for Print Shops */}
        <button
          type="button"
          onClick={handleExportSvg}
          disabled={isExportingSvg}
          className="w-full text-right px-2.5 py-2 rounded-xl hover:bg-purple-50 border border-slate-100 hover:border-purple-300 flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <FileCode size={15} className="text-purple-600 shrink-0" />
            <div>
              <div className="text-xs font-black text-slate-900">
                {isExportingSvg ? 'جاري التجهيز...' : 'ملف فيكتور للمطابع (SVG)'}
              </div>
              <div className="text-[10px] text-slate-500">دقة لا نهائية للوحات الجدارية الكبيرة</div>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full">
            SVG
          </span>
        </button>

        {/* 7. Multi-page Tiled Poster Print */}
        <div className="border-t border-slate-100 pt-2 mt-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-950 px-1.5 mb-1.5">
            <Printer size={13} className="text-emerald-700" />
            <span>طباعة لوحة جدارية مقسمة (تُجمع جنباً إلى جنب):</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={isExportingTiled}
              onClick={() => handleExportTiledPdf(2, 1)}
              className="px-2 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 text-center transition-colors disabled:opacity-50"
            >
              <div className="text-[11px] font-black text-slate-900">2 × 1</div>
              <div className="text-[9px] text-slate-500 font-bold">ورقتان</div>
            </button>
            <button
              type="button"
              disabled={isExportingTiled}
              onClick={() => handleExportTiledPdf(2, 2)}
              className="px-2 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 text-center transition-colors disabled:opacity-50"
            >
              <div className="text-[11px] font-black text-slate-900">2 × 2</div>
              <div className="text-[9px] text-slate-500 font-bold">4 أوراق</div>
            </button>
            <button
              type="button"
              disabled={isExportingTiled}
              onClick={() => handleExportTiledPdf(3, 2)}
              className="px-2 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 text-center transition-colors disabled:opacity-50"
            >
              <div className="text-[11px] font-black text-slate-900">3 × 2</div>
              <div className="text-[9px] text-slate-500 font-bold">6 أوراق</div>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const collapseAll = () => {
    const allIds = new Set(allPeople.map((p) => p.id));
    for (const r of activeDisplayedRoots) {
      allIds.delete(r.id);
    }
    setCollapsedNodes(allIds);
  };

  const expandAll = () => {
    setCollapsedNodes(new Set());
  };

  // Search matching people in tree
  const searchMatches =
    treeSearch.trim().length > 1
      ? allPeople
          .filter((p) => p.fullName.toLowerCase().includes(treeSearch.trim().toLowerCase()))
          .slice(0, 6)
      : [];

  const focusOnPerson = (person: Person) => {
    setCollapsedNodes(new Set());
    setFocusedId(person.id);
    setTreeSearch('');
    setPosition({ x: 0, y: 0 });
    setTimeout(() => {
      setFocusedId(null);
    }, 4000);
  };

  // References to keep fresh state in native listeners without recreating them
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const positionRef = useRef(position);
  positionRef.current = position;

  const [isInteracting, setIsInteracting] = useState(false);
  const touchStateRef = useRef<{
    isPinching: boolean;
    isDragging: boolean;
    initialDistance: number;
    initialScale: number;
    initialPosition: { x: number; y: number };
    initialCenter: { x: number; y: number };
    dragStart: { x: number; y: number };
    startTouchPos: { x: number; y: number };
  }>({
    isPinching: false,
    isDragging: false,
    initialDistance: 0,
    initialScale: 0.85,
    initialPosition: { x: 0, y: 0 },
    initialCenter: { x: 0, y: 0 },
    dragStart: { x: 0, y: 0 },
    startTouchPos: { x: 0, y: 0 }
  });
  const preventClickRef = useRef(false);

  // Suppress click events if the touch gesture moved or pinched
  const handleClickCapture = (e: React.MouseEvent) => {
    if (preventClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      preventClickRef.current = false;
    }
  };

  // Wheel zoom (mouse wheel + Ctrl / trackpad pinch) centered around cursor
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = Math.exp(-e.deltaY * 0.005);
      const newScale = Math.min(Math.max(0.18, scale * zoomFactor), 2.5);

      const viewport = canvasViewportRef.current;
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        const vx = rect.left + rect.width / 2;
        const vy = rect.top;
        const newX = e.clientX - vx - (newScale / scale) * (e.clientX - vx - position.x);
        const newY = e.clientY - vy - (newScale / scale) * (e.clientY - vy - position.y);
        setScale(Number(newScale.toFixed(3)));
        setPosition({ x: Math.round(newX), y: Math.round(newY) });
      } else {
        setScale(Number(newScale.toFixed(3)));
      }
    }
  };

  // Mouse pan handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('#node-card, button, select, input')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Native non-passive touch listeners for mobile two-finger pinch-to-zoom and smooth panning
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // Two fingers -> Start pinch-to-zoom immediately!
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        touchStateRef.current = {
          isPinching: true,
          isDragging: false,
          initialDistance: Math.max(dist, 10),
          initialScale: scaleRef.current,
          initialPosition: { ...positionRef.current },
          initialCenter: { x: midX, y: midY },
          dragStart: { x: 0, y: 0 },
          startTouchPos: { x: midX, y: midY }
        };
        preventClickRef.current = true;
        setIsInteracting(true);
      } else if (e.touches.length === 1) {
        // Single finger -> Start potential pan
        const t = e.touches[0];
        touchStateRef.current = {
          isPinching: false,
          isDragging: true,
          initialDistance: 0,
          initialScale: scaleRef.current,
          initialPosition: { ...positionRef.current },
          initialCenter: { x: 0, y: 0 },
          dragStart: {
            x: t.clientX - positionRef.current.x,
            y: t.clientY - positionRef.current.y
          },
          startTouchPos: { x: t.clientX, y: t.clientY }
        };
        preventClickRef.current = false;
        setIsInteracting(true);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // Two fingers moving -> Zoom & pan centered on the fingers!
        e.preventDefault();
        preventClickRef.current = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        if (!touchStateRef.current.isPinching) {
          touchStateRef.current.isPinching = true;
          touchStateRef.current.isDragging = false;
          touchStateRef.current.initialDistance = Math.max(dist, 10);
          touchStateRef.current.initialScale = scaleRef.current;
          touchStateRef.current.initialPosition = { ...positionRef.current };
          touchStateRef.current.initialCenter = { x: midX, y: midY };
          return;
        }

        const initialDist = touchStateRef.current.initialDistance;
        const initialScale = touchStateRef.current.initialScale;
        const factor = dist / initialDist;
        const newScale = Math.min(Math.max(0.18, initialScale * factor), 2.5);

        const rect = viewport.getBoundingClientRect();
        const vx = rect.left + rect.width / 2;
        const vy = rect.top;
        const s0 = initialScale;
        const p0 = touchStateRef.current.initialPosition;
        const m0 = touchStateRef.current.initialCenter;

        const newX = midX - vx - (newScale / s0) * (m0.x - vx - p0.x);
        const newY = midY - vy - (newScale / s0) * (m0.y - vy - p0.y);

        setScale(Number(newScale.toFixed(3)));
        setPosition({ x: Math.round(newX), y: Math.round(newY) });
      } else if (e.touches.length === 1 && touchStateRef.current.isDragging) {
        const t = e.touches[0];
        const moveDist = Math.hypot(
          t.clientX - touchStateRef.current.startTouchPos.x,
          t.clientY - touchStateRef.current.startTouchPos.y
        );

        if (moveDist > 6) {
          preventClickRef.current = true;
        }

        // Prevent browser page bounce/pull while panning the tree
        e.preventDefault();

        const newX = t.clientX - touchStateRef.current.dragStart.x;
        const newY = t.clientY - touchStateRef.current.dragStart.y;
        setPosition({ x: Math.round(newX), y: Math.round(newY) });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // One finger lifted: seamlessly continue single-finger pan with remaining finger
        const t = e.touches[0];
        touchStateRef.current.isPinching = false;
        touchStateRef.current.isDragging = true;
        touchStateRef.current.dragStart = {
          x: t.clientX - positionRef.current.x,
          y: t.clientY - positionRef.current.y
        };
        touchStateRef.current.startTouchPos = { x: t.clientX, y: t.clientY };
      } else if (e.touches.length === 0) {
        touchStateRef.current.isPinching = false;
        touchStateRef.current.isDragging = false;
        setIsInteracting(false);
      }
    };

    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: false });
    viewport.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Shared Multi-Tree Dropdown Menu Popup content
  const renderTreeDropdownMenu = () => {
    if (!isTreeDropdownOpen || roots.length === 0) return null;
    const isAllSelected =
      roots.length > 1 && activeDisplayedRoots.length === roots.length;

    return (
      <div
        className="absolute top-full right-0 mt-1.5 w-80 sm:w-96 bg-white text-slate-800 rounded-2xl shadow-2xl border-2 border-amber-400 p-3 z-50 space-y-2.5"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5 text-emerald-950 font-black text-xs sm:text-sm">
            <Layers size={16} className="text-amber-600" />
            <span>اختيار الأشجار المعروضة على الشاشة</span>
          </div>
          <button
            type="button"
            onClick={() => setIsTreeDropdownOpen(false)}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded-lg"
          >
            إغلاق ✕
          </button>
        </div>

        {/* Quick Actions: All Trees vs Single Tree */}
        {roots.length > 1 && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={selectAllRootsOnScreen}
              className={`px-2.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all ${
                isAllSelected
                  ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-300'
              }`}
            >
              <Layers size={14} />
              <span>عرض جميع الأشجار ({roots.length})</span>
            </button>
            <button
              type="button"
              onClick={() => selectSingleRootOnScreen(currentRoot?.id || roots[0].id)}
              className={`px-2.5 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all ${
                activeDisplayedRoots.length === 1
                  ? 'bg-emerald-900 text-amber-300 border-emerald-950 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
            >
              <Users size={14} />
              <span>شجرة واحدة بمفردها</span>
            </button>
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-medium px-1">
          اضغط <b>عرض بمفردها</b> لعرض شجرة واحدة، أو ضع علامة (✓) لعرضها <b>مع غيرها</b>:
        </div>

        {/* List of Trees */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
          {roots.map((r) => {
            const isChecked = displayedRootIds.includes(r.id);
            const isSolo =
              activeDisplayedRoots.length === 1 && activeDisplayedRoots[0]?.id === r.id;

            return (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-all ${
                  isChecked
                    ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {/* Checkbox to include/exclude with other trees */}
                <button
                  type="button"
                  onClick={() => toggleDisplayedRootOnScreen(r.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-right"
                  title="تحديد أو إلغاء تحديد هذه الشجرة للعرض مع غيرها"
                >
                  {isChecked ? (
                    <CheckSquare size={18} className="text-emerald-700 shrink-0" />
                  ) : (
                    <Square size={18} className="text-slate-400 shrink-0" />
                  )}
                  <span className="text-xs font-black truncate">
                    شجرة: {formatAppName(r.fullName)}
                  </span>
                </button>

                {/* Quick button to display ONLY this tree alone */}
                <button
                  type="button"
                  onClick={() => selectSingleRootOnScreen(r.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 transition-colors ${
                    isSolo
                      ? 'bg-emerald-800 text-amber-300'
                      : 'bg-white hover:bg-amber-100 text-emerald-900 border border-emerald-300'
                  }`}
                >
                  {isSolo ? 'معروضة بمفردها' : 'عرض بمفردها'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[520px] bg-gradient-to-b from-white to-stone-50 rounded-3xl shadow-sm border border-stone-200/80 p-8 text-center">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-800 mb-5 shadow-inner border border-emerald-200/60">
          <Users size={44} />
        </div>
        <h3 className="text-2xl font-black text-slate-900 mb-2">لا توجد بيانات في الشجرة بعد</h3>
        <p className="text-slate-500 max-w-md mb-6 leading-relaxed">
          ابدأ ببناء شجرة العائلة عبر إضافة الجد المؤسس (الجذر)، ثم أضف الأبناء والأحفاد لتتشكل الشجرة التفاعلية.
        </p>
        {canEdit && (
          <button
            onClick={() => onOpenAddModalWithFather('')}
            className="flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white px-7 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-900/20"
          >
            <Plus size={20} />
            <span>إضافة الجد المؤسس</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-stone-100 overflow-hidden shadow-inner border border-stone-200/90 relative ${
        isFullscreen
          ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
          : 'h-[calc(100dvh-130px)] min-h-[420px] sm:h-[780px] rounded-2xl sm:rounded-3xl'
      }`}
    >
      {/* Top Toolbar */}
      <div
        ref={treeDropdownRef}
        className="bg-emerald-950 text-white p-1.5 sm:p-3.5 border-b border-emerald-800/80 z-30 shadow-md"
      >
        {/* Mobile Ultra-Compact 2-Row Bar (< 640px) */}
        <div className="flex flex-col gap-1.5 sm:hidden">
          {/* Row 1: Multi-Tree Dropdown + Mode Switcher */}
          <div className="flex items-center gap-1.5">
            {/* Multi-Tree Dropdown Button */}
            <div className="relative flex-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setShowExportMenu(false);
                  setIsTreeDropdownOpen((prev) => !prev);
                }}
                className="w-full bg-emerald-900/90 border border-emerald-700/80 text-amber-50 rounded-lg px-2 py-1 text-[11px] font-bold flex items-center justify-between gap-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <span className="truncate">{getTreeDropdownButtonLabel()}</span>
                <ChevronDown
                  size={14}
                  className={`text-amber-300 shrink-0 transition-transform ${
                    isTreeDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {renderTreeDropdownMenu()}
            </div>

            {/* Only Two Modes: الهرمي صفوف & الهرمي عمود */}
            <div className="flex items-center bg-emerald-900/90 p-0.5 rounded-lg border border-emerald-700/70 shrink-0">
              <button
                onClick={() => {
                  setTreeMode('classic');
                  setPosition({ x: 0, y: 0 });
                }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                  treeMode === 'classic' ? 'bg-amber-400 text-slate-950' : 'text-emerald-100'
                }`}
              >
                الهرمي صفوف
              </button>
              <button
                onClick={() => {
                  setTreeMode('classic_vertical');
                  setPosition({ x: 0, y: 0 });
                }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                  treeMode === 'classic_vertical'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-emerald-100'
                }`}
              >
                الهرمي عمود
              </button>
            </div>
          </div>

          {/* Row 2: Search + Females + Expand/Collapse + Single Export Dropdown */}
          <div className="flex items-center justify-between gap-1">
            <div className="relative flex-1 min-w-[65px]">
              <Search
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-300"
              />
              <input
                type="text"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="ابحث..."
                className="w-full bg-emerald-900/80 border border-emerald-700/80 text-white placeholder-emerald-300/60 rounded-lg pr-6 pl-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              {searchMatches.length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                  {searchMatches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => focusOnPerson(m)}
                      className="w-full text-right px-3 py-1.5 hover:bg-emerald-50 flex items-center justify-between text-[11px] border-b border-slate-100 last:border-0"
                    >
                      <span className="font-bold text-slate-900">
                        {formatAppName(m.fullName)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Females Toggle */}
              <button
                onClick={() => setShowFemales(!showFemales)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                  showFemales
                    ? 'bg-rose-800/80 border-rose-600 text-rose-100'
                    : 'bg-emerald-900/60 border-emerald-800 text-emerald-300'
                }`}
                title="إظهار أو إخفاء الإناث"
              >
                {showFemales ? 'الإناث' : 'الذكور'}
              </button>

              {/* Expand All (توسيع) */}
              <button
                onClick={expandAll}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-900/80 border border-emerald-700/80 text-emerald-100 flex items-center gap-0.5"
                title="توسيع جميع الفروع"
              >
                <ChevronsUpDown size={11} />
                <span>توسيع</span>
              </button>

              {/* Collapse All (طي) */}
              <button
                onClick={collapseAll}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-900/80 border border-emerald-700/80 text-emerald-100 flex items-center gap-0.5"
                title="طي جميع الفروع"
              >
                <ChevronsDownUp size={11} />
                <span>طي</span>
              </button>

              {/* Single Unified Export Dropdown Button (تصدير) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsTreeDropdownOpen(false);
                    setShowExportMenu((prev) => !prev);
                  }}
                  disabled={isAnyExportBusy}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center gap-1 shadow-xs disabled:opacity-60"
                  title="خيارات التصدير والطباعة"
                >
                  <FileDown size={12} />
                  <span>{isAnyExportBusy ? '...' : 'تصدير'}</span>
                  <ChevronDown
                    size={11}
                    className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`}
                  />
                </button>
                {renderExportDropdownMenu()}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop & Tablet Full Toolbar (>= 640px) */}
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-3">
          {/* Root Selector Dropdown & Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Multi-Tree Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowExportMenu(false);
                  setIsTreeDropdownOpen((prev) => !prev);
                }}
                className="bg-emerald-900/90 hover:bg-emerald-900 border border-emerald-700/80 text-amber-50 rounded-xl px-3.5 py-2 text-sm font-bold flex items-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-inner transition-colors"
              >
                <Layers size={16} className="text-amber-300 shrink-0" />
                <span>{getTreeDropdownButtonLabel()}</span>
                <ChevronDown
                  size={16}
                  className={`text-amber-300 shrink-0 transition-transform ${
                    isTreeDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {renderTreeDropdownMenu()}
            </div>

            {/* Only Two Modes: الهرمي صفوف & الهرمي عمود */}
            <div className="flex items-center bg-emerald-900/90 p-1 rounded-xl border border-emerald-700/70">
              <button
                onClick={() => {
                  setTreeMode('classic');
                  setPosition({ x: 0, y: 0 });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  treeMode === 'classic'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-emerald-100 hover:text-white'
                }`}
                title="تخطيط هرمي أفقي (كل جيل في صف)"
              >
                <span>الهرمي صفوف</span>
              </button>
              <button
                onClick={() => {
                  setTreeMode('classic_vertical');
                  setPosition({ x: 0, y: 0 });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  treeMode === 'classic_vertical'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-emerald-100 hover:text-white'
                }`}
                title="تخطيط هرمي عمودي مدمج (كل جيل بلون مميز)"
              >
                <Sparkles size={13} />
                <span>الهرمي عمود</span>
              </button>
            </div>
          </div>

          {/* Search inside Tree */}
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <div className="relative">
              <Search
                size={15}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-300"
              />
              <input
                type="text"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="ابحث عن شخص في الشجرة..."
                className="w-full bg-emerald-900/80 border border-emerald-700/80 text-white placeholder-emerald-300/60 rounded-xl pr-9 pl-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {searchMatches.length > 0 && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                {searchMatches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => focusOnPerson(m)}
                    className="w-full text-right px-3 py-2 hover:bg-emerald-50 flex items-center justify-between text-xs border-b border-slate-100 last:border-0"
                  >
                    <span className="font-bold text-slate-900">
                      {formatAppName(m.fullName)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {m.gender === 'male' ? 'ذكر' : 'أنثى'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Filters, Expand/Collapse & Single Export Dropdown */}
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && roots.length > 1 && (
              <button
                onClick={() => onOpenMergeModal(currentRoot?.id)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 text-amber-200 flex items-center gap-1 transition-all"
                title="ربط ودمج شجرتين"
              >
                <GitMerge size={13} />
                <span>دمج شجرتين</span>
              </button>
            )}

            <button
              onClick={() => setShowFemales(!showFemales)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
                showFemales
                  ? 'bg-rose-800/80 border-rose-600 text-rose-100'
                  : 'bg-emerald-900/50 border-emerald-800 text-emerald-400'
              }`}
              title="إظهار أو إخفاء الإناث في الشجرة"
            >
              <Filter size={13} />
              <span>{showFemales ? 'مع الإناث' : 'الذكور فقط'}</span>
            </button>

            <button
              onClick={expandAll}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/80 text-emerald-100 transition-colors flex items-center gap-1"
              title="توسيع جميع الفروع"
            >
              <ChevronsUpDown size={13} />
              <span>توسيع</span>
            </button>

            <button
              onClick={collapseAll}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/80 text-emerald-100 transition-colors flex items-center gap-1"
              title="طي جميع الفروع"
            >
              <ChevronsDownUp size={13} />
              <span>طي</span>
            </button>

            {/* Single Unified Export Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsTreeDropdownOpen(false);
                  setShowExportMenu((prev) => !prev);
                }}
                disabled={isAnyExportBusy}
                className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-l from-amber-400 via-amber-300 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 border border-amber-500 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-60"
                title="تصدير الشجرة (صورة، PDF، تفاعلي، للمطابع، طباعة مقسمة، حقيبة ZIP)"
              >
                <FileDown size={15} />
                <span>{isAnyExportBusy ? 'جاري التجهيز...' : 'تصدير'}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`}
                />
              </button>
              {renderExportDropdownMenu()}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Zoom & Screen Controls (+ / % / - / احتواء / ملء الشاشة / إعادة الضبط) */}
      <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 sm:p-1.5 rounded-xl sm:rounded-2xl shadow-xl border border-slate-200/90">
        <button
          onClick={() => setScale((s) => Math.min(s + 0.12, 2.2))}
          className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors"
          title="تكبير"
        >
          <ZoomIn size={16} />
        </button>
        <span className="text-[10px] sm:text-xs font-bold text-slate-600 px-1.5 min-w-[38px] sm:min-w-[46px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.max(s - 0.12, 0.2))}
          className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors"
          title="تصغير"
        >
          <ZoomOut size={16} />
        </button>
        <div className="w-px h-4 sm:h-5 bg-slate-200 mx-0.5" />
        <button
          onClick={handleFitToScreen}
          className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors flex items-center gap-1"
          title="احتواء الشجرة بالكامل في الشاشة"
        >
          <Maximize2 size={15} />
          <span className="hidden sm:inline text-[11px] font-bold">احتواء</span>
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors"
          title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>
        <button
          onClick={() => {
            setScale(0.85);
            setPosition({ x: 0, y: 0 });
          }}
          className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors"
          title="إعادة الضبط"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* Active Multi-Tree Banner Badge (when displaying > 1 tree on screen) */}
      {activeDisplayedRoots.length > 1 && (
        <div className="absolute top-16 sm:top-20 right-3 sm:right-5 z-20 bg-emerald-950/90 backdrop-blur-md text-amber-300 border border-amber-400/50 px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-2 text-[11px] sm:text-xs font-bold">
          <Layers size={14} className="text-amber-400 shrink-0" />
          <span>
            معروض حالياً: {activeDisplayedRoots.length} أشجار معاً (
            {treeMode === 'classic' ? 'الهرمي صفوف' : 'الهرمي عمود'})
          </span>
        </div>
      )}

      {/* Interactive Tree Canvas */}
      <div
        ref={canvasViewportRef}
        onClickCapture={handleClickCapture}
        style={{ touchAction: 'none' }}
        className={`flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none relative flex justify-center items-start touch-none ${
          treeMode === 'classic_vertical'
            ? 'bg-gradient-to-b from-[#FFFFFF] via-[#FCFBF7] to-[#F5EFE4]'
            : 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] bg-stone-50/70'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'top center',
            transition: isDragging || isInteracting ? 'none' : 'transform 0.15s ease-out'
          }}
          className="min-w-max min-h-max p-6 sm:p-16 flex flex-col items-center justify-center"
        >
          <div ref={treeContentRef} className="p-4 sm:p-10 rounded-3xl">
            {activeDisplayedRoots.length > 0 &&
              (treeMode === 'classic_vertical' ? (
                activeDisplayedRoots.length === 1 ? (
                  <VerticalPyramidTreeCanvas
                    rootPerson={activeDisplayedRoots[0]}
                    getChildren={getChildren}
                    collapsedNodes={collapsedNodes}
                    includeFemales={showFemales}
                    focusedId={focusedId}
                    onSelectPerson={(person) => onSelectPerson(person.id)}
                    onToggleCollapse={toggleCollapse}
                  />
                ) : (
                  /* Multiple Vertical Pyramids displayed side-by-side (جنباً إلى جنب) */
                  <div className="flex flex-row items-start justify-center gap-10" dir="rtl">
                    {activeDisplayedRoots.map((rootItem, idx) => (
                      <div
                        key={rootItem.id}
                        className="flex flex-col items-center bg-white/80 rounded-3xl p-4 sm:p-6 border-2 border-amber-400/60 shadow-xl"
                      >
                        <div className="mb-4 px-5 py-2 rounded-2xl bg-emerald-950 text-amber-300 font-black text-sm sm:text-base border border-amber-400/50 shadow-sm flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs flex items-center justify-center font-black">
                            {idx + 1}
                          </span>
                          <span>شجرة: {formatAppName(rootItem.fullName)}</span>
                        </div>
                        <VerticalPyramidTreeCanvas
                          rootPerson={rootItem}
                          getChildren={getChildren}
                          collapsedNodes={collapsedNodes}
                          includeFemales={showFemales}
                          focusedId={focusedId}
                          onSelectPerson={(person) => onSelectPerson(person.id)}
                          onToggleCollapse={toggleCollapse}
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : activeDisplayedRoots.length === 1 ? (
                <TreeNode
                  person={activeDisplayedRoots[0]}
                  getChildren={getChildren}
                  onSelect={(person) => onSelectPerson(person.id)}
                  onQuickAddChild={(fatherId) => onOpenAddModalWithFather(fatherId)}
                  onOpenAddFather={(personId) => onOpenAddFather(personId)}
                  canEdit={canEdit}
                  isRoot={true}
                  collapsedNodes={collapsedNodes}
                  toggleCollapse={toggleCollapse}
                  showFemales={showFemales}
                  focusedId={focusedId}
                />
              ) : (
                /* Multiple Horizontal Pyramid Trees stacked cleanly (الهرمي صفوف) */
                <div className="flex flex-col items-center gap-14" dir="rtl">
                  {activeDisplayedRoots.map((rootItem, idx) => (
                    <div
                      key={rootItem.id}
                      className="flex flex-col items-center bg-white/75 backdrop-blur-xs rounded-3xl p-6 sm:p-10 border-2 border-emerald-800/25 shadow-xl w-full"
                    >
                      <div className="mb-6 px-6 py-2.5 rounded-2xl bg-gradient-to-l from-emerald-950 via-emerald-900 to-teal-900 text-amber-300 font-black text-sm sm:text-lg border border-amber-400/60 shadow-md flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 text-xs flex items-center justify-center font-black">
                          {idx + 1}
                        </span>
                        <span>شجرة: {formatAppName(rootItem.fullName)}</span>
                      </div>
                      <TreeNode
                        person={rootItem}
                        getChildren={getChildren}
                        onSelect={(person) => onSelectPerson(person.id)}
                        onQuickAddChild={(fatherId) => onOpenAddModalWithFather(fatherId)}
                        onOpenAddFather={(personId) => onOpenAddFather(personId)}
                        canEdit={canEdit}
                        isRoot={true}
                        collapsedNodes={collapsedNodes}
                        toggleCollapse={toggleCollapse}
                        showFemales={showFemales}
                        focusedId={focusedId}
                      />
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Single-File Multi-Tree Selection Modal */}
      {pendingSingleExportType && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          dir="rtl"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-amber-300 overflow-hidden">
            <div className="bg-gradient-to-l from-emerald-950 via-emerald-900 to-teal-900 p-4 text-white flex items-center justify-between border-b border-amber-500/30">
              <div>
                <h3 className="text-sm sm:text-base font-black text-amber-300">
                  اختيار الأشجار للتصدير في ملف واحد
                </h3>
                <p className="text-[11px] text-emerald-100/90 mt-0.5">
                  {treeMode === 'classic'
                    ? 'التصميم الهرمي صفوف: تصطف كل شجرة فوق الأخرى في لوحة واحدة'
                    : 'التصميم الهرمي عمود: يصطف كل هرم بجانب الآخر في لوحة واحدة'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingSingleExportType(null)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800">
                  حدد شجرة واحدة أو عدة أشجار ({selectedExportRootIds.length} من {roots.length}):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedExportRootIds(roots.map((r) => r.id))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900"
                  >
                    تحديد جميع الأشجار ({roots.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedExportRootIds(currentRoot ? [currentRoot.id] : [])
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-800"
                  >
                    الشجرة الحالية فقط
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                {roots.map((r) => {
                  const checked = selectedExportRootIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setSelectedExportRootIds((prev) =>
                          prev.includes(r.id)
                            ? prev.filter((id) => id !== r.id)
                            : [...prev, r.id]
                        )
                      }
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-right transition-all ${
                        checked
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-black shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 font-bold'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="w-4 h-4 accent-emerald-700 rounded pointer-events-none"
                      />
                      <span className="text-xs truncate">شجرة {r.fullName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPendingSingleExportType(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={selectedExportRootIds.length === 0}
                onClick={() => {
                  const chosen = roots.filter((r) =>
                    selectedExportRootIds.includes(r.id)
                  );
                  executeSingleExport(pendingSingleExportType, chosen);
                }}
                className="px-5 py-2 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-l from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 border border-amber-500 shadow-sm disabled:opacity-50"
              >
                {selectedExportRootIds.length > 1
                  ? `تصدير (${selectedExportRootIds.length}) أشجار مجمّعة في ملف واحد`
                  : 'تصدير الشجرة المحددة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk ZIP Archive Export Modal */}
      <BulkZipExportModal
        isOpen={isBulkZipModalOpen}
        onClose={() => setIsBulkZipModalOpen(false)}
        roots={roots}
        currentRootId={currentRoot?.id}
        getChildren={getChildren}
        initialMode={treeMode}
        initialShowFemales={showFemales}
      />
    </div>
  );
};
