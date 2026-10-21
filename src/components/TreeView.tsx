import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  User,
  ChevronDown,
  ChevronUp,
  TreeDeciduous,
  Plus,
  Minus,
  Search,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  GitMerge,
  LayoutGrid,
  Maximize2,
  Move,
  FileDown,
  X,
  Sparkles,
  Smartphone,
  Image,
  FileText,
  Globe
} from 'lucide-react';
import { Person } from '../types/family';
import {
  advancedArabicMatch,
  formatAppName,
  formatBranchName,
  formatDropdownName
} from '../utils/nameUtils';
import { exportTreeToPdf, exportTreeToPng, exportTreeToSvg } from '../utils/pdfExport';
import { exportTreeToInteractiveHtml } from '../utils/htmlExport';

interface TreeViewProps {
  persons: Person[];
  treeRoots: Person[];
  selectedTreeRootId: string | null;
  setSelectedTreeRootId: (id: string) => void;
  onSelectPerson: (id: string) => void;
  onOpenAddModalWithFather?: (fatherId: string) => void;
  onOpenAddFather?: (personId: string) => void;
  onOpenMergeModal?: (personId?: string) => void;
  onExecuteMerge?: (sourcePersonId: string, targetPersonId: string) => Promise<{ targetPerson: Person; movedCount: number; mergeOpId: string }>;
  onOpenEditPerson?: (person: Person) => void;
  onDeletePerson?: (id: string) => void;
  onToggleGender?: (id: string) => void;
  editingEnabled: boolean;
  isAdmin: boolean;
  getPerson: (id: string) => Person | undefined;
  getChildren: (personId: string) => Person[];
  getAncestors: (personId: string) => Person[];
  getLineageString: (id: string) => string;
}

interface OrganicNodeLayout {
  person: Person;
  depth: number;
  x: number;
  y: number;
  subtreeWidth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  maleChildrenCount: number;
  femaleChildrenCount: number;
  totalChildrenCount: number;
  childrenLayouts: OrganicNodeLayout[];
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.4;

export const TreeView: React.FC<TreeViewProps> = ({
  persons,
  treeRoots,
  selectedTreeRootId,
  setSelectedTreeRootId,
  onSelectPerson,
  onOpenAddModalWithFather,
  onOpenAddFather,
  onOpenMergeModal,
  onExecuteMerge,
  onOpenEditPerson,
  onDeletePerson,
  onToggleGender,
  isAdmin,
  getPerson,
  getChildren
}) => {
  // Tree display mode:
  // 1. 'classic' -> المخطط الهرمي (البطاقات)
  // 2. 'organic' -> الشجرة (جذر وأغصان وتفريعات)
  const [treeDisplayMode, setTreeDisplayMode] = useState<'classic' | 'organic'>('classic');
  // In organic mode, allow growing from root at bottom upward ('up') or from root at top downward ('down')
  const [organicDirection, setOrganicDirection] = useState<'up' | 'down'>('up');

  // Display zoom percentage for UI badge (updated without re-rendering tree on every drag frame)
  const [zoomDisplay, setZoomDisplay] = useState<number>(100);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  const handleExportTreeFormat = async (format: 'png' | 'pdf' | 'html') => {
    if (!currentRoot) return;
    setIsExportingPdf(true);
    try {
      if (format === 'html') {
        exportTreeToInteractiveHtml({
          rootPerson: currentRoot,
          getChildren,
          getAllPersons: () => persons,
          mode: treeDisplayMode
        });
      } else if (format === 'png') {
        await exportTreeToPng({
          rootPerson: currentRoot,
          getChildren,
          mode: treeDisplayMode,
          organicDirection,
          collapsedNodes,
          orientation: 'portrait',
          unconstrained: true
        });
      } else {
        await exportTreeToPdf({
          rootPerson: currentRoot,
          getChildren,
          mode: treeDisplayMode,
          organicDirection,
          collapsedNodes,
          orientation: 'portrait'
        });
      }
      setShowExportModal(false);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Hardware-accelerated camera state stored in refs for 60/120fps zero-re-render panning & inertia
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const transformLayerRef = useRef<HTMLDivElement>(null);
  const contentBoxRef = useRef<HTMLDivElement>(null);

  // Dragging & momentum inertia refs
  const isDraggingRef = useRef<boolean>(false);
  const didDragRef = useRef<boolean>(false);
  const dragOriginRef = useRef<{ startX: number; startY: number; camX: number; camY: number }>({
    startX: 0,
    startY: 0,
    camX: 0,
    camY: 0
  });
  const velocityRef = useRef<{ vx: number; vy: number; lastX: number; lastY: number; lastTime: number }>({
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0
  });
  const inertiaFrameRef = useRef<number | null>(null);
  const rafTransformRef = useRef<number | null>(null);

  // Touch pinch-to-zoom state
  const pinchStateRef = useRef<{
    active: boolean;
    initialDist: number;
    initialZoom: number;
    lastMidX: number;
    lastMidY: number;
  }>({
    active: false,
    initialDist: 0,
    initialZoom: 1,
    lastMidX: 0,
    lastMidY: 0
  });

  // Collapsed branches set (IDs of nodes whose children are hidden)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Search filter inside tree view
  const [localSearch, setLocalSearch] = useState<string>('');

  // Drag & Drop Merging States
  const [draggedPerson, setDraggedPerson] = useState<Person | null>(null);
  const [dragOverPersonId, setDragOverPersonId] = useState<string | null>(null);
  const [confirmMergeDrag, setConfirmMergeDrag] = useState<{
    source: Person;
    target: Person;
  } | null>(null);
  const [isMergingLoading, setIsMergingLoading] = useState<boolean>(false);

  // Side-by-Side Multi-Tree Comparison Mode States
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);
  const [compareTreeRootId, setCompareTreeRootId] = useState<string | null>(null);

  const currentRoot = useMemo(() => {
    if (!selectedTreeRootId) return treeRoots[0] || null;
    return getPerson(selectedTreeRootId) || treeRoots[0] || null;
  }, [selectedTreeRootId, treeRoots, getPerson]);

  const compareRoot = useMemo(() => {
    if (compareTreeRootId) {
      return getPerson(compareTreeRootId) || null;
    }
    const second = treeRoots.find(r => r.id !== selectedTreeRootId) || treeRoots[1];
    return second || null;
  }, [compareTreeRootId, selectedTreeRootId, treeRoots, getPerson]);

  // Drag & Drop Event Handlers
  const handleCardDragStart = (e: React.DragEvent, person: Person) => {
    e.stopPropagation();
    setDraggedPerson(person);
    e.dataTransfer.setData('text/plain', person.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDragOver = (e: React.DragEvent, targetPersonId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedPerson && draggedPerson.id !== targetPersonId) {
      e.dataTransfer.dropEffect = 'move';
      if (dragOverPersonId !== targetPersonId) {
        setDragOverPersonId(targetPersonId);
      }
    }
  };

  const handleCardDragLeave = (e: React.DragEvent, targetPersonId: string) => {
    e.stopPropagation();
    if (dragOverPersonId === targetPersonId) {
      setDragOverPersonId(null);
    }
  };

  const handleCardDrop = (e: React.DragEvent, targetPerson: Person) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPersonId(null);

    const sourceId = e.dataTransfer.getData('text/plain') || draggedPerson?.id;
    if (!sourceId || sourceId === targetPerson.id) {
      setDraggedPerson(null);
      return;
    }

    const sourcePerson = getPerson(sourceId) || draggedPerson;
    if (!sourcePerson) return;

    setConfirmMergeDrag({
      source: sourcePerson,
      target: targetPerson
    });
    setDraggedPerson(null);
  };

  const executeConfirmDragMerge = async () => {
    if (!confirmMergeDrag) return;
    setIsMergingLoading(true);
    try {
      if (onExecuteMerge) {
        await onExecuteMerge(confirmMergeDrag.source.id, confirmMergeDrag.target.id);
      } else if (onOpenMergeModal) {
        onOpenMergeModal(confirmMergeDrag.source.id);
      }
      setConfirmMergeDrag(null);
    } catch (err) {
      console.error('Merge execution error:', err);
    } finally {
      setIsMergingLoading(false);
    }
  };

  // Apply camera transform directly to DOM layer for instant GPU compositing
  const applyCameraTransform = useCallback((animate: boolean = false) => {
    const layer = transformLayerRef.current;
    if (!layer) return;
    const { x, y, zoom } = cameraRef.current;
    layer.style.transition = animate
      ? 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none';
    layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  // Center the root node smoothly in the viewport
  const centerOnRoot = useCallback(
    (animate: boolean = true, targetZoom: number = 1) => {
      stopInertia();
      const container = containerRef.current;
      const content = contentBoxRef.current;
      if (!container || !content) {
        cameraRef.current = { x: 0, y: 0, zoom: targetZoom };
        setZoomDisplay(Math.round(targetZoom * 100));
        applyCameraTransform(animate);
        return;
      }

      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const contentW = content.offsetWidth || viewW;
      const contentH = content.offsetHeight || viewH;

      const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
      const newX = (viewW - contentW * clampedZoom) / 2;
      const newY =
        treeDisplayMode === 'organic' && organicDirection === 'up'
          ? Math.min(viewH - contentH * clampedZoom - 20, (viewH - contentH * clampedZoom) / 2)
          : 28;

      cameraRef.current = { x: newX, y: newY, zoom: clampedZoom };
      setZoomDisplay(Math.round(clampedZoom * 100));
      applyCameraTransform(animate);
    },
    [applyCameraTransform, stopInertia, treeDisplayMode, organicDirection]
  );

  // Fit the entire tree inside the viewport
  const fitTreeToScreen = useCallback(
    (animate: boolean = true) => {
      stopInertia();
      const container = containerRef.current;
      const content = contentBoxRef.current;
      if (!container || !content) return;

      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const contentW = Math.max(1, content.offsetWidth);
      const contentH = Math.max(1, content.offsetHeight);

      const isMobile = window.innerWidth < 640;
      const pad = isMobile ? 18 : 48;
      const scaleX = (viewW - pad * 2) / contentW;
      const scaleY = (viewH - pad * 2) / contentH;
      const fitZoom = Math.min(1.15, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));

      const newX = (viewW - contentW * fitZoom) / 2;
      const newY =
        treeDisplayMode === 'organic' && organicDirection === 'up'
          ? Math.max(16, viewH - contentH * fitZoom - (isMobile ? 18 : 28))
          : Math.max(16, (viewH - contentH * fitZoom) / 2);

      cameraRef.current = { x: newX, y: newY, zoom: fitZoom };
      setZoomDisplay(Math.round(fitZoom * 100));
      applyCameraTransform(animate);
    },
    [applyCameraTransform, stopInertia, treeDisplayMode, organicDirection]
  );

  // Zoom around a specific focal point (px, py) relative to the container viewport
  const zoomAroundPoint = useCallback(
    (newZoomRaw: number, focalX: number, focalY: number, animate: boolean = false) => {
      stopInertia();
      const oldZoom = cameraRef.current.zoom;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoomRaw));
      if (Math.abs(newZoom - oldZoom) < 0.001) return;

      const contentX = (focalX - cameraRef.current.x) / oldZoom;
      const contentY = (focalY - cameraRef.current.y) / oldZoom;

      cameraRef.current = {
        x: focalX - contentX * newZoom,
        y: focalY - contentY * newZoom,
        zoom: newZoom
      };
      setZoomDisplay(Math.round(newZoom * 100));
      applyCameraTransform(animate);
    },
    [applyCameraTransform, stopInertia]
  );

  const handleStepZoom = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      const cx = container ? container.clientWidth / 2 : 400;
      const cy = container ? container.clientHeight / 2 : 350;
      zoomAroundPoint(cameraRef.current.zoom + delta, cx, cy, true);
    },
    [zoomAroundPoint]
  );

  const handleDirectionalPan = useCallback(
    (dx: number, dy: number) => {
      stopInertia();
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + dx,
        y: cameraRef.current.y + dy
      };
      applyCameraTransform(true);
    },
    [applyCameraTransform, stopInertia]
  );

  const resetView = useCallback(() => {
    centerOnRoot(true, 1);
  }, [centerOnRoot]);

  // Re-center or auto-fit smoothly when root, display mode, or direction changes
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        fitTreeToScreen(false);
      } else {
        centerOnRoot(false, 1);
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [currentRoot?.id, treeDisplayMode, organicDirection, centerOnRoot, fitTreeToScreen]);

  // Start momentum coasting after pointer/touch release
  const startInertiaCoast = useCallback(() => {
    stopInertia();
    const now = performance.now();
    // If pointer stayed still for > 65ms before release, skip coasting
    if (now - velocityRef.current.lastTime > 65) return;

    let vx = velocityRef.current.vx;
    let vy = velocityRef.current.vy;
    if (Math.hypot(vx, vy) < 1.5) return;

    // Clamp max initial velocity for pleasant control
    const maxSpeed = 42;
    const speed = Math.hypot(vx, vy);
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }

    const step = () => {
      vx *= 0.92;
      vy *= 0.92;
      if (Math.hypot(vx, vy) < 0.35) {
        inertiaFrameRef.current = null;
        return;
      }
      cameraRef.current.x += vx;
      cameraRef.current.y += vy;
      applyCameraTransform(false);
      inertiaFrameRef.current = requestAnimationFrame(step);
    };

    inertiaFrameRef.current = requestAnimationFrame(step);
  }, [applyCameraTransform, stopInertia]);

  // Mouse pan handlers with window-level tracking & velocity recording
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    // Ignore if clicking directly on a button, select, or input
    const target = e.target as HTMLElement;
    if (target.closest('button, select, input, a')) return;

    stopInertia();
    isDraggingRef.current = true;
    didDragRef.current = false;
    containerRef.current?.classList.add('cursor-grabbing');

    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      camX: cameraRef.current.x,
      camY: cameraRef.current.y
    };
    velocityRef.current = {
      vx: 0,
      vy: 0,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: performance.now()
    };
  };

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const dx = e.clientX - dragOriginRef.current.startX;
      const dy = e.clientY - dragOriginRef.current.startY;

      if (!didDragRef.current && Math.hypot(dx, dy) > 5) {
        didDragRef.current = true;
      }

      const now = performance.now();
      const dt = Math.max(1, now - velocityRef.current.lastTime);
      const instVx = ((e.clientX - velocityRef.current.lastX) / dt) * 16;
      const instVy = ((e.clientY - velocityRef.current.lastY) / dt) * 16;

      velocityRef.current = {
        vx: velocityRef.current.vx * 0.35 + instVx * 0.65,
        vy: velocityRef.current.vy * 0.35 + instVy * 0.65,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTime: now
      };

      cameraRef.current.x = dragOriginRef.current.camX + dx;
      cameraRef.current.y = dragOriginRef.current.camY + dy;

      if (rafTransformRef.current === null) {
        rafTransformRef.current = requestAnimationFrame(() => {
          rafTransformRef.current = null;
          applyCameraTransform(false);
        });
      }
    };

    const onWindowMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      containerRef.current?.classList.remove('cursor-grabbing');
      startInertiaCoast();
    };

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    window.addEventListener('mouseup', onWindowMouseUp, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [applyCameraTransform, startInertiaCoast]);

  // Consolidated Smooth Wheel Zoom, Trackpad 2D Pan, and Native Touch Pan/Pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopInertia();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Trackpad pinch (ctrlKey) or mouse wheel zoom
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) === 0) {
        const zoomFactor = Math.exp(-e.deltaY * 0.0018);
        zoomAroundPoint(cameraRef.current.zoom * zoomFactor, mouseX, mouseY, false);
      } else {
        // 2-finger trackpad pan
        cameraRef.current.x -= e.deltaX;
        cameraRef.current.y -= e.deltaY;
        applyCameraTransform(false);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, select, input, a')) return;
      stopInertia();

      if (e.touches.length === 2) {
        isDraggingRef.current = false;
        didDragRef.current = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const rect = container.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        pinchStateRef.current = {
          active: true,
          initialDist: Math.max(10, dist),
          initialZoom: cameraRef.current.zoom,
          lastMidX: midX,
          lastMidY: midY
        };
        e.preventDefault();
      } else if (e.touches.length === 1) {
        pinchStateRef.current.active = false;
        isDraggingRef.current = true;
        didDragRef.current = false;
        const t = e.touches[0];
        dragOriginRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          camX: cameraRef.current.x,
          camY: cameraRef.current.y
        };
        velocityRef.current = {
          vx: 0,
          vy: 0,
          lastX: t.clientX,
          lastY: t.clientY,
          lastTime: performance.now()
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current.active) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const rect = container.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        cameraRef.current.x += midX - pinchStateRef.current.lastMidX;
        cameraRef.current.y += midY - pinchStateRef.current.lastMidY;
        pinchStateRef.current.lastMidX = midX;
        pinchStateRef.current.lastMidY = midY;

        const scaleFactor = dist / pinchStateRef.current.initialDist;
        zoomAroundPoint(pinchStateRef.current.initialZoom * scaleFactor, midX, midY, false);
        return;
      }

      if (e.touches.length === 1 && isDraggingRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - dragOriginRef.current.startX;
        const dy = t.clientY - dragOriginRef.current.startY;

        if (!didDragRef.current && Math.hypot(dx, dy) > 5) {
          didDragRef.current = true;
        }

        if (e.cancelable) {
          e.preventDefault();
        }

        const now = performance.now();
        const dt = Math.max(1, now - velocityRef.current.lastTime);
        const instVx = ((t.clientX - velocityRef.current.lastX) / dt) * 16;
        const instVy = ((t.clientY - velocityRef.current.lastY) / dt) * 16;

        velocityRef.current = {
          vx: velocityRef.current.vx * 0.35 + instVx * 0.65,
          vy: velocityRef.current.vy * 0.35 + instVy * 0.65,
          lastX: t.clientX,
          lastY: t.clientY,
          lastTime: now
        };

        cameraRef.current.x = dragOriginRef.current.camX + dx;
        cameraRef.current.y = dragOriginRef.current.camY + dy;

        if (rafTransformRef.current === null) {
          rafTransformRef.current = requestAnimationFrame(() => {
            rafTransformRef.current = null;
            applyCameraTransform(false);
          });
        }
      }
    };

    const onTouchEnd = () => {
      if (pinchStateRef.current.active) {
        pinchStateRef.current.active = false;
        return;
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        startInertiaCoast();
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyCameraTransform, stopInertia, zoomAroundPoint, startInertiaCoast]);

  // Prevent accidental card clicks when releasing a drag gesture
  const handleCanvasClickCapture = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.stopPropagation();
      e.preventDefault();
      didDragRef.current = false;
    }
  };

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const wasCollapsed = collapsedNodes.has(id);
    const targetElement = e.currentTarget as HTMLElement;

    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    if (wasCollapsed) {
      setTimeout(() => {
        if (!containerRef.current || !targetElement) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        const currentCenterX = targetRect.left + targetRect.width / 2;
        const currentCenterY = targetRect.top + targetRect.height / 2;

        const containerCenterX = containerRect.left + containerRect.width / 2;
        const containerCenterY = containerRect.top + Math.min(220, containerRect.height * 0.35);

        const deltaX = containerCenterX - currentCenterX;
        const deltaY = containerCenterY - currentCenterY;

        cameraRef.current.x += deltaX;
        cameraRef.current.y += deltaY;

        applyCameraTransform(true);
      }, 60);
    }
  };

  const expandAll = () => {
    setCollapsedNodes(new Set());
  };

  const collapseAll = () => {
    if (!currentRoot) return;
    const allParentIds = new Set<string>();
    for (const p of persons) {
      if (getChildren(p.id).length > 0) {
        allParentIds.add(p.id);
      }
    }
    setCollapsedNodes(allParentIds);
  };

  const handleExportTreePdf = async () => {
    if (!currentRoot) return;
    setIsExportingPdf(true);
    try {
      await exportTreeToPdf({
        rootPerson: currentRoot,
        getChildren,
        mode: treeDisplayMode,
        organicDirection,
        collapsedNodes
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ============================================================================
  // MODE 2 ENGINE: Organic Botanical Tree Layout (جذر وأغصان وتفريعات)
  // ============================================================================
  const organicTreeData = useMemo(() => {
    if (!currentRoot) return null;

    const NODE_WIDTH = 215;
    const H_GAP = 34;
    const LEVEL_HEIGHT = 185;
    const visited = new Set<string>();
    let maxDepth = 1;

    function buildMeasure(person: Person, depth: number): OrganicNodeLayout {
      visited.add(person.id);
      if (depth > maxDepth) maxDepth = depth;

      const allChildren = getChildren(person.id).filter(c => !visited.has(c.id));
      const hasChildren = allChildren.length > 0;
      const isCollapsed = collapsedNodes.has(person.id);
      const maleChildrenCount = allChildren.filter(c => c.gender === 'male').length;
      const femaleChildrenCount = allChildren.filter(c => c.gender === 'female').length;

      if (!hasChildren || isCollapsed) {
        return {
          person,
          depth,
          x: 0,
          y: 0,
          subtreeWidth: NODE_WIDTH,
          hasChildren,
          isCollapsed,
          maleChildrenCount,
          femaleChildrenCount,
          totalChildrenCount: allChildren.length,
          childrenLayouts: []
        };
      }

      const childrenLayouts = allChildren.map(ch => buildMeasure(ch, depth + 1));
      const totalChildrenWidth =
        childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
        (childrenLayouts.length - 1) * H_GAP;

      return {
        person,
        depth,
        x: 0,
        y: 0,
        subtreeWidth: Math.max(NODE_WIDTH, totalChildrenWidth),
        hasChildren,
        isCollapsed,
        maleChildrenCount,
        femaleChildrenCount,
        totalChildrenCount: allChildren.length,
        childrenLayouts
      };
    }

    const rootLayout = buildMeasure(currentRoot, 1);
    const canvasWidth = Math.max(960, rootLayout.subtreeWidth + 180);
    const TOP_PAD = organicDirection === 'up' ? 110 : 170;
    const BOTTOM_PAD = organicDirection === 'up' ? 230 : 120;
    const canvasHeight = Math.max(640, (maxDepth - 1) * LEVEL_HEIGHT + TOP_PAD + BOTTOM_PAD);

    const flatNodes: OrganicNodeLayout[] = [];
    const branchLinks: {
      id: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      depth: number;
      childGender: 'male' | 'female';
      childHasChildren: boolean;
    }[] = [];

    function assignPositions(node: OrganicNodeLayout, leftX: number) {
      node.x = leftX + node.subtreeWidth / 2;
      if (organicDirection === 'up') {
        // Root at bottom, branches grow upward
        node.y = TOP_PAD + (maxDepth - node.depth) * LEVEL_HEIGHT;
      } else {
        // Root at top, branches grow downward
        node.y = TOP_PAD + (node.depth - 1) * LEVEL_HEIGHT;
      }

      flatNodes.push(node);

      if (node.childrenLayouts.length > 0) {
        const totalChildrenWidth =
          node.childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
          (node.childrenLayouts.length - 1) * H_GAP;

        // Place first child on the RIGHT and proceed LEFTWARD (Arabic RTL order: Males first then Females alphabetically)
        let currentRightEdge = leftX + (node.subtreeWidth + totalChildrenWidth) / 2;

        for (const childNode of node.childrenLayouts) {
          const childLeftX = currentRightEdge - childNode.subtreeWidth;
          assignPositions(childNode, childLeftX);
          currentRightEdge = childLeftX - H_GAP;

          const startY = organicDirection === 'up' ? node.y - 38 : node.y + 38;
          const endY = organicDirection === 'up' ? childNode.y + 42 : childNode.y - 42;

          branchLinks.push({
            id: `${node.person.id}->${childNode.person.id}`,
            fromX: node.x,
            fromY: startY,
            toX: childNode.x,
            toY: endY,
            depth: node.depth,
            childGender: childNode.person.gender,
            childHasChildren: childNode.hasChildren
          });
        }
      }
    }

    const startLeft = (canvasWidth - rootLayout.subtreeWidth) / 2;
    assignPositions(rootLayout, startLeft);

    return {
      rootLayout,
      flatNodes,
      branchLinks,
      canvasWidth,
      canvasHeight,
      maxDepth
    };
  }, [currentRoot, getChildren, collapsedNodes, organicDirection]);

  // ============================================================================
  // MODE 1 RENDERER: Classic Hierarchical Cards (المخطط الهرمي - البطاقات)
  // ============================================================================
  const renderClassicNode = (person: Person, depth: number = 1): React.ReactNode => {
    const children = getChildren(person.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedNodes.has(person.id);
    const isHighlighted = Boolean(localSearch.trim() && advancedArabicMatch(person.fullName, localSearch));

    const maleChildrenCount = children.filter(c => c.gender === 'male').length;
    const femaleChildrenCount = children.filter(c => c.gender === 'female').length;

    return (
      <div key={person.id} className="flex flex-col items-center">
        {/* Upward Add Root Ancestor Button above the Root Node (Admin only) */}
        {depth === 1 && isAdmin && onOpenAddFather && (
          <div className="flex flex-col items-center mb-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddFather(person.id);
              }}
              className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#0F4C3A] to-[#15664F] text-white text-[11px] font-bold shadow-md hover:brightness-110 transition flex items-center gap-1.5 border border-[#D4AF37]/50"
              title={`إضافة أصل أعلى (أب / جد) فوق ${formatAppName(person.fullName)}`}
            >
              <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>+ إضافة أصل أعلى لـ ({formatAppName(person.fullName)})</span>
            </button>
            <div className="w-0.5 h-4 bg-[#0F4C3A]/40" />
          </div>
        )}

        {/* Person Card */}
        <div
          onClick={() => onSelectPerson(person.id)}
          draggable={isAdmin}
          onDragStart={(e) => handleCardDragStart(e, person)}
          onDragOver={(e) => handleCardDragOver(e, person.id)}
          onDragLeave={(e) => handleCardDragLeave(e, person.id)}
          onDrop={(e) => handleCardDrop(e, person)}
          className={`relative group cursor-pointer transition-all duration-200 select-none ${
            isHighlighted ? 'ring-4 ring-[#D4AF37] scale-105' : ''
          } ${
            draggedPerson?.id === person.id ? 'opacity-40 border-2 border-dashed border-amber-500 scale-95' : ''
          } ${
            dragOverPersonId === person.id ? 'ring-4 ring-amber-500 scale-105 shadow-xl z-30' : ''
          }`}
        >
          {/* Active Drop Target Overlay Banner */}
          {dragOverPersonId === person.id && (
            <div className="absolute inset-0 z-40 bg-amber-500/95 text-slate-950 rounded-2xl flex flex-col items-center justify-center p-2 text-center shadow-xl animate-in fade-in duration-150 backdrop-blur-xs">
              <GitMerge className="w-6 h-6 text-slate-950 mb-1 animate-bounce" />
              <span className="text-xs font-black">إفلات لدمج الجد ({formatAppName(person.fullName)})</span>
              <span className="text-[10px] font-bold text-amber-950">سيتم نقل جميع فروع الجد المسحوب لهذا الجد</span>
            </div>
          )}
          <div
            className={`w-52 sm:w-60 p-3.5 rounded-2xl border transition shadow-sm hover:shadow-md ${
              person.gender === 'male'
                ? 'bg-gradient-to-b from-white to-[#F2F8F5] border-[#0F4C3A]/25 hover:border-[#0F4C3A]'
                : 'bg-gradient-to-b from-white to-[#FFF6F6] border-rose-200 hover:border-rose-400'
            }`}
          >
            {/* Header / Generation Tag & Direct Actions */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                person.gender === 'male'
                  ? 'bg-[#0F4C3A]/10 text-[#0F4C3A]'
                  : 'bg-rose-100/70 text-rose-800'
              }`}>
                {depth === 1 ? 'الأصل' : `الجيل ${depth}`}
              </span>

              {/* Action Buttons: Gender Badge/Switch + Edit + Delete (Admin Only) */}
              <div className="flex items-center gap-1">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleGender) {
                          onToggleGender(person.id);
                        } else if (onOpenEditPerson) {
                          onOpenEditPerson(person);
                        }
                      }}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition flex items-center gap-1 ${
                        person.gender === 'male'
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300/60'
                          : 'bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300/60'
                      }`}
                      title="انقر لتعديل الجنس (ذكر أو أنثى)"
                    >
                      <span>{person.gender === 'male' ? 'ذكر' : 'أنثى'}</span>
                    </button>

                    {onOpenAddFather && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAddFather(person.id);
                        }}
                        className="p-1 rounded-md text-[#0F4C3A] hover:text-emerald-800 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition"
                        title="نقل الابن وفروعه إلى جد أعلى / إضافة جد أعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {onOpenEditPerson && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditPerson(person);
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition"
                        title="تعديل"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {onDeletePerson && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePerson(person.id);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
                        title="حذف الاسم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                ) : (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      person.gender === 'male'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                        : 'bg-rose-50 text-rose-800 border border-rose-200/60'
                    }`}
                  >
                    {person.gender === 'male' ? 'ذكر' : 'أنثى'}
                  </span>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="flex items-start gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  person.gender === 'male'
                    ? 'bg-[#0F4C3A] text-[#D4AF37]'
                    : 'bg-rose-500 text-white'
                }`}
              >
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4
                  className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0F4C3A] transition break-words leading-snug line-clamp-2"
                  title={formatAppName(person.fullName)}
                >
                  {depth === 1 ? formatAppName(person.fullName) : formatBranchName(person.fullName)}
                </h4>
              </div>
            </div>

            {/* Notes snippet if exists */}
            {person.notes && (
              <p className="text-[11px] text-slate-500 mt-1.5 truncate">
                {person.notes}
              </p>
            )}

            {/* Footer / Children or Spouse Indicators */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              {person.gender === 'male' ? (
                <span>
                  {hasChildren ? (
                    <strong className="text-[#0F4C3A]">
                      {maleChildrenCount} أبناء · {femaleChildrenCount} بنات
                    </strong>
                  ) : (
                    <span className="text-slate-400">لا يوجد أبناء مسجلون</span>
                  )}
                </span>
              ) : (
                <span>
                  {person.husbandName ? (
                    <span className="text-rose-700 font-bold text-[10px] break-words line-clamp-1 block max-w-[180px]">
                      زوجة: {formatAppName(person.husbandName)}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">أنثى</span>
                  )}
                </span>
              )}

              {/* Expand / Collapse Button if has children */}
              {hasChildren && (
                <button
                  onClick={(e) => toggleCollapse(person.id, e)}
                  className="p-1 rounded-md hover:bg-slate-200/70 text-[#0F4C3A] transition"
                  title={isCollapsed ? 'توسيع الفروع' : 'طي الفروع'}
                >
                  {isCollapsed ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Quick add son/daughter button beneath male card (Admin only) */}
          {person.gender === 'male' && isAdmin && onOpenAddModalWithFather && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddModalWithFather(person.id);
              }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-[#0F4C3A] text-white flex items-center justify-center shadow-md hover:scale-110 z-20"
              title="إضافة ابن أو بنت"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Children Branches & Connecting Lines */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col items-center">
            {/* Vertical stem from parent card down */}
            <div className="w-[2.5px] h-6 bg-[#0F4C3A]" />

            {/* Children container with seamless horizontal & vertical connectors */}
            <div className="relative flex justify-center gap-6 sm:gap-8 pt-0">
              {children.map((child, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === children.length - 1;
                const hasMultiple = children.length > 1;

                return (
                  <div key={child.id} className="relative flex flex-col items-center">
                    {/* Horizontal Connector Bar Arms (Meeting seamlessly at center-x) */}
                    {hasMultiple && (
                      <>
                        {/* Left arm toward left sibling */}
                        {!isLast && (
                          <div className="absolute top-0 left-0 right-1/2 -left-3 sm:-left-4 h-[2.5px] bg-[#0F4C3A]" />
                        )}
                        {/* Right arm toward right sibling */}
                        {!isFirst && (
                          <div className="absolute top-0 right-0 left-1/2 -right-3 sm:-right-4 h-[2.5px] bg-[#0F4C3A]" />
                        )}
                      </>
                    )}

                    {/* Vertical branch stem down into child card */}
                    <div className="w-[2.5px] h-5 bg-[#0F4C3A] mb-0" />
                    {renderClassicNode(child, depth + 1)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsed badge pill */}
        {hasChildren && isCollapsed && (
          <button
            onClick={(e) => toggleCollapse(person.id, e)}
            className="mt-2 text-[10px] font-bold bg-[#0F4C3A]/10 text-[#0F4C3A] hover:bg-[#0F4C3A]/20 px-2.5 py-0.5 rounded-full transition flex items-center gap-1 shadow-2xs"
          >
            <span>+{children.length} فروع مخفية</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  // ============================================================================
  // MODE 2 RENDERER: Organic Tree (الشجرة: جذر وأغصان وتفريعات)
  // ============================================================================
  const renderOrganicTree = () => {
    if (!organicTreeData || !currentRoot) return null;

    const { rootLayout, flatNodes, branchLinks, canvasWidth, canvasHeight } = organicTreeData;
    const rootX = rootLayout.x;
    const rootY = rootLayout.y;

    return (
      <div
        className="relative select-none"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`
        }}
      >
        {/* Master SVG Layer for Roots, Trunk, Curved Wood Branches, and Botanical Leaves */}
        <svg
          width={canvasWidth}
          height={canvasHeight}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="absolute inset-0 pointer-events-none overflow-visible"
        >
          <defs>
            {/* Rich Wood Trunk & Main Boughs Gradient */}
            <linearGradient id="trunkWoodGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4A2C11" />
              <stop offset="45%" stopColor="#6E4726" />
              <stop offset="100%" stopColor="#8B5A2B" />
            </linearGradient>

            {/* Sub-branch Emerald-Wood Transition Gradient */}
            <linearGradient id="branchGreenWoodGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#6E4726" />
              <stop offset="55%" stopColor="#2D5A3C" />
              <stop offset="100%" stopColor="#0F4C3A" />
            </linearGradient>

            {/* Female Twig Warm Rose-Wood Gradient */}
            <linearGradient id="twigRoseGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#6E4726" />
              <stop offset="65%" stopColor="#9E3B56" />
              <stop offset="100%" stopColor="#BE4B6A" />
            </linearGradient>

            {/* Canopy Soft Glow */}
            <radialGradient id="canopyGlow" cx="50%" cy="45%" r="50%">
              <stop offset="0%" stopColor="#0F4C3A" stopOpacity="0.08" />
              <stop offset="70%" stopColor="#15664F" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#0F4C3A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft Botanical Canopy Aura behind the tree */}
          <ellipse
            cx={canvasWidth / 2}
            cy={canvasHeight / 2}
            rx={Math.min(canvasWidth * 0.45, 700)}
            ry={Math.min(canvasHeight * 0.42, 420)}
            fill="url(#canopyGlow)"
          />

          {/* ============================================================== */}
          {/* TREE TRUNK & DEEP EARTH ROOTS (جذر الشجرة والجذع الرئيسي)      */}
          {/* ============================================================== */}
          {organicDirection === 'up' ? (
            <g>
              {/* Soil / Earth Horizon Mound */}
              <ellipse
                cx={rootX}
                cy={rootY + 132}
                rx={195}
                ry={22}
                fill="#5C3A21"
                fillOpacity="0.14"
              />
              <path
                d={`M ${rootX - 170} ${rootY + 130} Q ${rootX} ${rootY + 112} ${rootX + 170} ${rootY + 130}`}
                fill="none"
                stroke="#7A4E2D"
                strokeWidth="3"
                strokeDasharray="6 4"
                opacity="0.55"
              />

              {/* Main Carved Tree Trunk from Soil up to Root Ancestor */}
              <path
                d={`M ${rootX - 28} ${rootY + 130}
                    C ${rootX - 20} ${rootY + 92}, ${rootX - 15} ${rootY + 62}, ${rootX - 12} ${rootY + 32}
                    L ${rootX + 12} ${rootY + 32}
                    C ${rootX + 15} ${rootY + 62}, ${rootX + 20} ${rootY + 92}, ${rootX + 28} ${rootY + 130} Z`}
                fill="url(#trunkWoodGrad)"
              />

              {/* Spreading Underground Roots (الجذور الضاربة في الأرض) */}
              {/* Center Deep Root */}
              <path
                d={`M ${rootX} ${rootY + 125} C ${rootX - 5} ${rootY + 150}, ${rootX + 6} ${rootY + 172}, ${rootX} ${rootY + 190}`}
                fill="none"
                stroke="#4A2C11"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Right Spreading Roots */}
              <path
                d={`M ${rootX + 16} ${rootY + 122} C ${rootX + 55} ${rootY + 138}, ${rootX + 95} ${rootY + 152}, ${rootX + 138} ${rootY + 165}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              <path
                d={`M ${rootX + 65} ${rootY + 142} C ${rootX + 82} ${rootY + 162}, ${rootX + 95} ${rootY + 175}, ${rootX + 108} ${rootY + 185}`}
                fill="none"
                stroke="#6E4726"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d={`M ${rootX + 10} ${rootY + 126} C ${rootX + 32} ${rootY + 150}, ${rootX + 48} ${rootY + 170}, ${rootX + 62} ${rootY + 188}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Left Spreading Roots */}
              <path
                d={`M ${rootX - 16} ${rootY + 122} C ${rootX - 55} ${rootY + 138}, ${rootX - 95} ${rootY + 152}, ${rootX - 138} ${rootY + 165}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              <path
                d={`M ${rootX - 65} ${rootY + 142} C ${rootX - 82} ${rootY + 162}, ${rootX - 95} ${rootY + 175}, ${rootX - 108} ${rootY + 185}`}
                fill="none"
                stroke="#6E4726"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d={`M ${rootX - 10} ${rootY + 126} C ${rootX - 32} ${rootY + 150}, ${rootX - 48} ${rootY + 170}, ${rootX - 62} ${rootY + 188}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Root Label in the Soil */}
              <text
                x={rootX}
                y={rootY + 155}
                textAnchor="middle"
                className="fill-[#5C3A21] font-bold text-[11px]"
              >
                جذر الشجرة وأصلها الراسخ
              </text>
            </g>
          ) : (
            <g>
              {/* Top Root Crown when growing downward */}
              <ellipse
                cx={rootX}
                cy={rootY - 95}
                rx={165}
                ry={18}
                fill="#5C3A21"
                fillOpacity="0.14"
              />
              <path
                d={`M ${rootX - 22} ${rootY - 95}
                    L ${rootX - 11} ${rootY - 35}
                    L ${rootX + 11} ${rootY - 35}
                    L ${rootX + 22} ${rootY - 95} Z`}
                fill="url(#trunkWoodGrad)"
              />
              <path
                d={`M ${rootX + 12} ${rootY - 92} C ${rootX + 45} ${rootY - 108}, ${rootX + 85} ${rootY - 118}, ${rootX + 120} ${rootY - 125}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d={`M ${rootX - 12} ${rootY - 92} C ${rootX - 45} ${rootY - 108}, ${rootX - 85} ${rootY - 118}, ${rootX - 120} ${rootY - 125}`}
                fill="none"
                stroke="#5C3A21"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* ============================================================== */}
          {/* CURVED BOTANICAL BRANCHES & SUB-BRANCHES (الأغصان والتفريعات)  */}
          {/* ============================================================== */}
          {branchLinks.map((link) => {
            const midY = (link.fromY + link.toY) / 2;
            const ctrlY1 = link.fromY + (link.toY - link.fromY) * 0.45;
            const ctrlY2 = link.fromY + (link.toY - link.fromY) * 0.55;
            const pathD = `M ${link.fromX} ${link.fromY} C ${link.fromX} ${ctrlY1}, ${link.toX} ${ctrlY2}, ${link.toX} ${link.toY}`;

            // Taper branch thickness by generation depth: thick boughs near root, delicate twigs at leaves
            const strokeWidth = Math.max(2.4, 10.5 - link.depth * 2.1);

            const strokeColor =
              link.depth === 1
                ? 'url(#trunkWoodGrad)'
                : link.childGender === 'female' && !link.childHasChildren
                ? 'url(#twigRoseGrad)'
                : 'url(#branchGreenWoodGrad)';

            // Decorative leaf midpoint along the branch
            const midX = (link.fromX + link.toX) / 2;
            const leafAngle = link.toX >= link.fromX ? 28 : -28;

            return (
              <g key={link.id}>
                {/* Subtle shadow under branch */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="rgba(15, 76, 58, 0.10)"
                  strokeWidth={strokeWidth + 2.5}
                  strokeLinecap="round"
                />
                {/* Main organic curved branch */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                {/* Branch junction knot */}
                <circle
                  cx={link.fromX}
                  cy={link.fromY}
                  r={Math.max(3, strokeWidth * 0.55)}
                  fill="#6E4726"
                />
                {/* Small sprouting botanical leaf along the branch */}
                <g transform={`translate(${midX}, ${midY}) rotate(${leafAngle})`}>
                  <path
                    d="M 0 0 C 5 -6, 12 -6, 15 0 C 12 6, 5 6, 0 0 Z"
                    fill={link.childGender === 'female' ? '#E11D48' : '#15803D'}
                    fillOpacity="0.65"
                  />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Upward Add Root Ancestor Button at the Root Base (Admin only) */}
        {isAdmin && onOpenAddFather && (
          <div
            className="absolute z-30 -translate-x-1/2"
            style={{
              left: `${rootX}px`,
              top: organicDirection === 'up' ? `${rootY + 168}px` : `${rootY - 148}px`
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddFather(currentRoot.id);
              }}
              className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#5C3A21] to-[#0F4C3A] text-white text-[11px] font-bold shadow-md hover:brightness-110 transition flex items-center gap-1.5 border border-[#D4AF37]/70 whitespace-nowrap"
              title={`إضافة جذر / أصل أعلى لـ ${formatAppName(currentRoot.fullName)}`}
            >
              <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>+ إضافة جذر / أصل أعلى لـ ({formatAppName(currentRoot.fullName)})</span>
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* INTERACTIVE NODES: ROOT, BOUGHS (الأغصان), AND LEAVES (الأوراق) */}
        {/* ============================================================== */}
        {flatNodes.map((node) => {
          const { person, depth, x, y, hasChildren, isCollapsed, maleChildrenCount, femaleChildrenCount, totalChildrenCount } = node;
          const isRoot = depth === 1;
          const isBough = depth > 1 && hasChildren;
          const isHighlighted = Boolean(
            localSearch.trim() && advancedArabicMatch(person.fullName, localSearch)
          );

          // Role label in the organic tree
          const roleLabel = isRoot
            ? 'جذر الشجرة (الأصل)'
            : isBough
            ? `غصن (الجيل ${depth})`
            : person.gender === 'male'
            ? `فرع / ابن (الجيل ${depth})`
            : `فرع / ابنة (الجيل ${depth})`;

          return (
            <div
              key={person.id}
              onClick={() => onSelectPerson(person.id)}
              draggable={isAdmin}
              onDragStart={(e) => handleCardDragStart(e, person)}
              onDragOver={(e) => handleCardDragOver(e, person.id)}
              onDragLeave={(e) => handleCardDragLeave(e, person.id)}
              onDrop={(e) => handleCardDrop(e, person)}
              style={{
                left: `${x}px`,
                top: `${y}px`
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer transition-all duration-200 ${
                isHighlighted ? 'ring-4 ring-[#D4AF37] scale-110 z-30 rounded-3xl' : ''
              } ${
                draggedPerson?.id === person.id ? 'opacity-40 border-2 border-dashed border-amber-500 scale-95' : ''
              } ${
                dragOverPersonId === person.id ? 'ring-4 ring-amber-500 scale-110 shadow-2xl z-40' : ''
              }`}
            >
              {/* Active Drop Target Overlay Banner for Organic View */}
              {dragOverPersonId === person.id && (
                <div className="absolute inset-0 z-40 bg-amber-500/95 text-slate-950 rounded-2xl flex flex-col items-center justify-center p-2 text-center shadow-xl animate-in fade-in duration-150 backdrop-blur-xs">
                  <GitMerge className="w-6 h-6 text-slate-950 mb-1 animate-bounce" />
                  <span className="text-xs font-black">إفلات لدمج الجد ({formatAppName(person.fullName)})</span>
                </div>
              )}
              <div
                className={`w-[202px] px-3 py-2.5 transition-all shadow-md hover:shadow-xl relative ${
                  isRoot
                    ? 'rounded-3xl bg-gradient-to-b from-[#4A2C11] via-[#3A230E] to-[#0F4C3A] text-white border-2 border-[#D4AF37] ring-4 ring-[#D4AF37]/20'
                    : isBough
                    ? 'rounded-2xl bg-gradient-to-b from-[#F4FBF7] via-white to-[#EBF5EE] text-slate-900 border-2 border-[#2D5A3C]/50 hover:border-[#0F4C3A]'
                    : person.gender === 'male'
                    ? 'rounded-tl-3xl rounded-br-3xl rounded-tr-xl rounded-bl-xl bg-gradient-to-br from-[#E9F7EF] via-white to-[#D8F3E5] text-slate-900 border-2 border-emerald-500/50 hover:border-[#0F4C3A]'
                    : 'rounded-tl-3xl rounded-br-3xl rounded-tr-xl rounded-bl-xl bg-gradient-to-br from-[#FFF0F3] via-white to-[#FFE4E9] text-slate-900 border-2 border-rose-300 hover:border-rose-500'
                }`}
              >
                {/* Decorative Leaf Icon on corner for non-root nodes */}
                {!isRoot && (
                  <span
                    aria-hidden="true"
                    className={`absolute -top-2 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-2xs border ${
                      isBough
                        ? 'bg-[#6E4726] text-[#F5E6B8] border-[#D4AF37]/50'
                        : person.gender === 'male'
                        ? 'bg-emerald-600 text-white border-emerald-200'
                        : 'bg-rose-500 text-white border-rose-200'
                    }`}
                  >
                    <TreeDeciduous className="w-3 h-3" />
                  </span>
                )}

                {/* Top row: Role label + Admin controls */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      isRoot
                        ? 'bg-[#D4AF37]/25 text-[#F5E6B8] border border-[#D4AF37]/40'
                        : isBough
                        ? 'bg-[#6E4726]/12 text-[#5C3A21]'
                        : person.gender === 'male'
                        ? 'bg-emerald-100/90 text-[#0F4C3A]'
                        : 'bg-rose-100/90 text-rose-800'
                    }`}
                  >
                    {roleLabel}
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-0.5">
                      {onOpenAddFather && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAddFather(person.id);
                          }}
                          className={`p-0.5 rounded transition ${
                            isRoot
                              ? 'text-[#F5E6B8] hover:text-white hover:bg-white/15'
                              : 'text-[#0F4C3A] hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                          title="نقل الابن وفروعه إلى جد أعلى / إضافة جد أعلى"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                      )}
                      {person.gender === 'male' && onOpenMergeModal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenMergeModal(person.id);
                          }}
                          className={`p-0.5 rounded transition ${
                            isRoot
                              ? 'text-[#F5E6B8] hover:text-white hover:bg-white/15'
                              : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50'
                          }`}
                          title="دمج هذا الجد مع جد آخر بنفس الاسم"
                        >
                          <GitMerge className="w-3 h-3" />
                        </button>
                      )}
                      {onOpenEditPerson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEditPerson(person);
                          }}
                          className={`p-0.5 rounded transition ${
                            isRoot
                              ? 'text-white/80 hover:text-white hover:bg-white/15'
                              : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title="تعديل"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      {onDeletePerson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePerson(person.id);
                          }}
                          className={`p-0.5 rounded transition ${
                            isRoot
                              ? 'text-red-300 hover:text-red-100 hover:bg-red-500/20'
                              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title="حذف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Person Name */}
                <h4
                  className={`text-xs font-bold leading-snug truncate ${
                    isRoot ? 'text-white font-display text-sm' : 'text-slate-900 group-hover:text-[#0F4C3A]'
                  }`}
                  title={formatAppName(person.fullName)}
                >
                  {isRoot ? formatAppName(person.fullName) : formatBranchName(person.fullName)}
                </h4>

                {/* Footer Info: Branches count or spouse */}
                <div
                  className={`mt-1.5 pt-1 border-t flex items-center justify-between text-[10px] ${
                    isRoot ? 'border-white/15 text-emerald-100' : 'border-slate-200/70 text-slate-600'
                  }`}
                >
                  {person.gender === 'male' ? (
                    hasChildren ? (
                      <span className={isRoot ? 'text-[#F5E6B8] font-bold' : 'text-[#0F4C3A] font-bold'}>
                        يتفرع منه: {maleChildrenCount} ذكور · {femaleChildrenCount} إناث
                      </span>
                    ) : (
                      <span className={isRoot ? 'text-white/70' : 'text-slate-400'}>ورقة طرفية</span>
                    )
                  ) : person.husbandName ? (
                    <span className="text-rose-700 font-bold truncate max-w-[155px]">
                      زوجة: {formatAppName(person.husbandName)}
                    </span>
                  ) : (
                    <span className="text-rose-700/80">ابنة / فرع</span>
                  )}

                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => toggleCollapse(person.id, e)}
                      className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] transition flex items-center gap-0.5 ${
                        isRoot
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : 'bg-[#0F4C3A]/10 hover:bg-[#0F4C3A]/20 text-[#0F4C3A]'
                      }`}
                      title={isCollapsed ? 'توسيع الأغصان المتفرعة' : 'طي الأغصان المتفرعة'}
                    >
                      {isCollapsed ? (
                        <>
                          <span>+{totalChildrenCount}</span>
                          <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Admin quick-add branch button on male nodes */}
              {person.gender === 'male' && isAdmin && onOpenAddModalWithFather && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAddModalWithFather(person.id);
                  }}
                  className={`absolute ${
                    organicDirection === 'up' ? '-top-3' : '-bottom-3'
                  } left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-[#0F4C3A] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shadow-md hover:scale-110 z-30`}
                  title="إضافة غصن / ابن أو ابنة"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tree View Mode Selector Banner: 1. المخطط الهرمي (البطاقات) | 2. الشجرة (جذر وأغصان وتفريعات) */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 shrink-0">طريقة استعراض الشجرة:</span>
          <div className="flex-1 sm:flex-initial inline-flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setTreeDisplayMode('classic');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                treeDisplayMode === 'classic'
                  ? 'bg-[#0F4C3A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>1. المخطط الهرمي (البطاقات)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTreeDisplayMode('organic');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                treeDisplayMode === 'organic'
                  ? 'bg-[#0F4C3A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <TreeDeciduous className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>2. الشجرة (جذر وأغصان وتفريعات)</span>
            </button>
          </div>
        </div>

        {/* Direction sub-toggle when in Organic Tree Mode */}
        {treeDisplayMode === 'organic' && (
          <div className="flex items-center gap-2 self-end md:self-center">
            <span className="text-[11px] font-semibold text-slate-500">اتجاه الأغصان:</span>
            <div className="inline-flex items-center gap-1 p-1 bg-amber-50/80 rounded-xl border border-amber-200/80 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setOrganicDirection('up');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  organicDirection === 'up'
                    ? 'bg-[#5C3A21] text-white shadow-2xs'
                    : 'text-amber-900 hover:bg-amber-100/60'
                }`}
              >
                جذر بالأسفل وأغصان صاعدة
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrganicDirection('down');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  organicDirection === 'down'
                    ? 'bg-[#5C3A21] text-white shadow-2xs'
                    : 'text-amber-900 hover:bg-amber-100/60'
                }`}
              >
                جذر بالأعلى وتفريعات نازلة
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tree View Controls Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Tree Root Selector & Root Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <TreeDeciduous className="w-4 h-4 text-[#0F4C3A] shrink-0" />
          <span className="text-xs font-bold text-slate-700 hidden sm:inline">أصل الشجرة:</span>
          <select
            value={selectedTreeRootId || ''}
            onChange={(e) => setSelectedTreeRootId(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
          >
            {treeRoots.map((root) => (
              <option key={root.id} value={root.id}>
                {formatDropdownName(root.fullName)}
              </option>
            ))}
          </select>

          {isAdmin && currentRoot && onOpenAddFather && (
            <button
              type="button"
              onClick={() => onOpenAddFather(currentRoot.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#0F4C3A] border border-emerald-200 text-xs font-bold transition"
              title="نقل الابن وفروعه إلى الجد الأعلى أو إضافة جد أو أكثر من جد"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>+ إضافة جد أعلى / نقل فرع لجد أعلى</span>
            </button>
          )}

          {isAdmin && treeRoots.length > 1 && onOpenMergeModal && (
            <button
              type="button"
              onClick={() => onOpenMergeModal()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#8C6D1F] border border-[#D4AF37]/40 text-xs font-bold transition"
              title="دمج الأشجار عند التوصل لأصل مشترك"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>دمج الأشجار</span>
            </button>
          )}

          {treeRoots.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setIsCompareMode(!isCompareMode);
                if (!compareTreeRootId && treeRoots.length > 1) {
                  const second = treeRoots.find(r => r.id !== selectedTreeRootId) || treeRoots[1];
                  if (second) setCompareTreeRootId(second.id);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                isCompareMode
                  ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
              }`}
              title="عرض أكثر من شجرة في الشاشة جنباً إلى جنب للمقارنة والدمج"
            >
              <GitMerge className="w-4 h-4 text-amber-900" />
              <span>{isCompareMode ? 'إغلاق وضع المقارنة' : 'مقارنة شجرتين (شاشة مقسومة)'}</span>
            </button>
          )}
        </div>

        {/* Local Tree Search */}
        <div className="relative w-44 sm:w-56">
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="تمييز اسم في الشجرة..."
            className="w-full h-8 pr-7 pl-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5" />
        </div>

        {/* Zoom & Expand Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleStepZoom(0.18)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-bold text-slate-600 min-w-[42px] text-center select-none">
            {zoomDisplay}%
          </span>
          <button
            type="button"
            onClick={() => handleStepZoom(-0.18)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
            title="تصغير"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => fitTreeToScreen(true)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
            title="ملاءمة الشجرة بالكامل داخل الشاشة"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#0F4C3A]" />
            <span className="hidden sm:inline">احتواء الشجرة</span>
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
            title="إعادة ضبط الرؤية وتوسيط الجد"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => {
              expandAll();
              setTimeout(() => centerOnRoot(true, cameraRef.current.zoom), 40);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            توسيع الكل
          </button>
          <button
            type="button"
            onClick={() => {
              collapseAll();
              setTimeout(() => centerOnRoot(true, 1), 40);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            طي الكل
          </button>
          {currentRoot && (
            <>
              <div className="h-4 w-px bg-slate-200 mx-1" />
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => setShowExportModal(true)}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#0F4C3A] hover:bg-[#0c3c2e] active:bg-[#08281f] text-white flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-60"
                title="تصدير الشجرة كصورة عالية الدقة للجوال أو ملف PDF للطباعة"
              >
                <FileDown className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{isExportingPdf ? 'جارٍ معالجة الملف...' : 'تصدير الشجرة'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Side-by-Side Multi-Tree Comparison Mode Viewport Banner & Split Grid */}
      {isCompareMode ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Comparison Mode Info Banner */}
          <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 rounded-2xl text-slate-950 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <GitMerge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black font-display">
                  وضع مقارنة الشجرات (عرض متجاور)
                </h3>
                <p className="text-xs font-bold text-slate-900 mt-0.5">
                  تصفح شجرتين مختلفتين جنبًا إلى جنب مع إمكانية دمج أي جد بالسحب والإفلات المباشر 🎯
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCompareMode(false)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 text-amber-400 hover:bg-slate-900 text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              <X className="w-4 h-4" />
              <span>إغلاق المقارنة</span>
            </button>
          </div>

          {/* Split Screen Grid (2 Column Containers) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tree Container 1 (Primary Selected Root) */}
            <div className="bg-white p-3.5 rounded-2xl border-2 border-[#0F4C3A]/30 shadow-sm flex flex-col space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#0F4C3A]" />
                  <span className="text-xs font-black text-slate-800">الشجرة الأولى (أ)</span>
                </div>
                <select
                  value={selectedTreeRootId || ''}
                  onChange={(e) => setSelectedTreeRootId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0F4C3A]"
                >
                  {treeRoots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {formatDropdownName(root.fullName)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Viewport for Tree A */}
              <div
                dir="ltr"
                className="relative w-full h-[520px] overflow-auto rounded-xl border border-slate-200 bg-[#FAF8F5] p-6 flex flex-col items-center justify-center select-none"
                style={{
                  backgroundImage: 'radial-gradient(rgba(15, 76, 58, 0.08) 1px, transparent 1px)',
                  backgroundSize: '20px 20px'
                }}
              >
                {currentRoot ? (
                  <div dir="rtl" className="w-max">
                    {renderClassicNode(currentRoot, 1)}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400">لا توجد شجرة أ</p>
                )}
              </div>
            </div>

            {/* Tree Container 2 (Compare Tree Root) */}
            <div className="bg-white p-3.5 rounded-2xl border-2 border-amber-400/50 shadow-sm flex flex-col space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-xs font-black text-slate-800">الشجرة الثانية للمقارنة (ب)</span>
                </div>
                <select
                  value={compareTreeRootId || ''}
                  onChange={(e) => setCompareTreeRootId(e.target.value)}
                  className="text-xs font-bold bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {treeRoots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {formatDropdownName(root.fullName)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Viewport for Tree B */}
              <div
                dir="ltr"
                className="relative w-full h-[520px] overflow-auto rounded-xl border border-amber-200 bg-[#FFFDF9] p-6 flex flex-col items-center justify-center select-none"
                style={{
                  backgroundImage: 'radial-gradient(rgba(212, 175, 55, 0.1) 1px, transparent 1px)',
                  backgroundSize: '20px 20px'
                }}
              >
                {compareRoot ? (
                  <div dir="rtl" className="w-max">
                    {renderClassicNode(compareRoot, 1)}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400">اختر شجرة ثانية للمقارنة</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Main Smooth Pan/Zoom Viewport (dir="ltr" for pure screen-space 2D coordinates) */
        <div
          ref={containerRef}
          dir="ltr"
          onMouseDown={handleMouseDown}
          onClickCapture={handleCanvasClickCapture}
          className={`relative w-full h-[72vh] min-h-[500px] sm:h-[780px] overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/80 cursor-grab select-none touch-none overscroll-none ${
            treeDisplayMode === 'organic'
              ? 'bg-gradient-to-b from-[#F4F9F5] via-[#FBF9F5] to-[#F3ECE1]'
              : 'bg-[#FAF8F5]'
          }`}
          style={{
            backgroundImage: 'radial-gradient(rgba(15, 76, 58, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            touchAction: 'none'
          }}
        >
          {/* Helper overlay hint on top right */}
          <div
            dir="rtl"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 bg-white/95 backdrop-blur-xs px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200/70 text-[10px] sm:text-[11px] text-slate-600 shadow-2xs pointer-events-none flex items-center gap-1.5"
          >
            <Move className="w-3.5 h-3.5 text-[#0F4C3A]" />
            <span>اسحب للتحريك · قرّب بأصبعين للتكبير</span>
            <span className="text-[#0F4C3A] font-bold hidden sm:inline">
              · {treeDisplayMode === 'organic' ? 'الشجرة (جذر وأغصان وتفريعات)' : 'المخطط الهرمي (البطاقات)'}
            </span>
          </div>

          {/* Floating Touch-Ergonomic Control Pad on Bottom Left */}
          <div
            dir="rtl"
            className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 bg-white/95 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border border-slate-200/80 shadow-md flex items-center gap-1 sm:gap-1.5"
          >
            {/* Zoom In */}
            <button
              type="button"
              onClick={() => handleStepZoom(0.2)}
              className="w-8 h-8 sm:w-8 sm:h-8 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 flex items-center justify-center transition cursor-pointer"
              title="تكبير الشجرة"
              aria-label="تكبير"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              onClick={() => handleStepZoom(-0.2)}
              className="w-8 h-8 sm:w-8 sm:h-8 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 flex items-center justify-center transition cursor-pointer"
              title="تصغير الشجرة"
              aria-label="تصغير"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="h-5 w-px bg-slate-200 mx-0.5" />

            {/* Fit entire tree to screen */}
            <button
              type="button"
              onClick={() => fitTreeToScreen(true)}
              className="h-8 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-[#0F4C3A] text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              title="احتواء الشجرة كاملة داخل الشاشة"
              aria-label="احتواء الشجرة"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>احتواء</span>
            </button>

            {/* Center Root */}
            <button
              type="button"
              onClick={() => centerOnRoot(true, 1)}
              className="h-8 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
              title="توسيط الأصل"
              aria-label="توسيط الجد أو الأصل"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">الأصل</span>
            </button>

            {/* Directional Nudge Pad (hidden on small phone screens) */}
            <div className="hidden sm:flex items-center gap-0.5 border-r border-slate-200 pr-1 mr-0.5">
              <button
                type="button"
                onClick={() => handleDirectionalPan(0, 140)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 transition"
                title="تحريك للأعلى"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDirectionalPan(0, -140)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 transition"
                title="تحريك للأسفل"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDirectionalPan(-160, 0)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 transition"
                title="تحريك لليمين"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDirectionalPan(160, 0)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-700 transition"
                title="تحريك لليسار"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Legend for Organic Tree Mode */}
          {treeDisplayMode === 'organic' && (
            <div
              dir="rtl"
              className="absolute bottom-4 right-4 z-20 bg-white/90 backdrop-blur-xs px-3 py-2 rounded-xl border border-slate-200/80 text-[10px] text-slate-700 shadow-2xs pointer-events-none hidden sm:flex flex-wrap items-center gap-3"
            >
              <span className="flex items-center gap-1 font-bold text-[#4A2C11]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#5C3A21] border border-[#D4AF37]" />
                <span>الجذر (الأصل)</span>
              </span>
              <span className="flex items-center gap-1 font-bold text-[#2D5A3C]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#6E4726]" />
                <span>غصن متفرع</span>
              </span>
              <span className="flex items-center gap-1 font-bold text-[#0F4C3A]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>تفريع / ابن (ذكر)</span>
              </span>
              <span className="flex items-center gap-1 font-bold text-rose-800">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>تفريع / ابنة (أنثى)</span>
              </span>
            </div>
          )}

          {/* GPU-Accelerated Transform Layer (0,0 origin for exact focal zoom & smooth panning) */}
          <div
            ref={transformLayerRef}
            className="absolute top-0 left-0 origin-top-left"
            style={{
              willChange: 'transform',
              transform: 'translate3d(0px, 0px, 0) scale(1)',
              backfaceVisibility: 'hidden'
            }}
          >
            <div
              ref={contentBoxRef}
              dir="rtl"
              className="w-max p-12 flex flex-col items-center justify-center"
            >
              {currentRoot ? (
                treeDisplayMode === 'classic' ? (
                  renderClassicNode(currentRoot, 1)
                ) : (
                  renderOrganicTree()
                )
              ) : (
                <div className="text-center py-24 px-12 text-slate-400">
                  <TreeDeciduous className="w-12 h-12 mx-auto mb-2 opacity-50 text-[#0F4C3A]" />
                  <p className="text-sm font-semibold">لا توجد شجرة مسجلة بعد</p>
                  <p className="text-xs mt-1">ابدأ بإضافة الجد الأول للشجرة</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Drag & Drop Merge Modal */}
      {confirmMergeDrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-md">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black font-display leading-snug">
                    تأكيد دمج الأجداد بسحب البطاقة
                  </h3>
                  <p className="text-[11px] font-bold text-slate-900 mt-0.5">
                    سحب وإفلات تفاعلي لتوحيد الشجرتين والأفرع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmMergeDrag(null)}
                className="w-8 h-8 rounded-full bg-slate-950/10 hover:bg-slate-950/20 text-slate-950 flex items-center justify-center transition shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-4">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs font-bold text-amber-950 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  هل ترغب في دمج الجد الأول بالسحب وإلحاق كافة أبنائه وفروعه بالجد الثاني المستهدف؟
                </span>
              </div>

              {/* Source vs Target Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Source (the dragged card) */}
                <div className="p-3.5 rounded-2xl border-2 border-red-300 bg-red-50/60 text-right space-y-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800">
                    الجد المسحوب (المراد نقله وإلغاؤه):
                  </span>
                  <h4 className="text-sm font-black text-slate-900 mt-1">
                    {formatAppName(confirmMergeDrag.source.fullName)}
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    عدد الأبناء المباشرين: {getChildren(confirmMergeDrag.source.id).length}
                  </p>
                </div>

                {/* Target (the drop card) */}
                <div className="p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 text-right space-y-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                    الجد المستهدف (الأصل المعتمد):
                  </span>
                  <h4 className="text-sm font-black text-slate-900 mt-1">
                    {formatAppName(confirmMergeDrag.target.fullName)}
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    سيتم استقبال جميع أبناء وفروع الجد الأول هنا
                  </p>
                </div>
              </div>

              {isMergingLoading && (
                <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl font-bold text-center border border-amber-200 animate-pulse">
                  جارٍ تنفيذ عملية الدمج ونقل الفروع بالكامل... يرجى الانتظار
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmMergeDrag(null)}
                disabled={isMergingLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeConfirmDragMerge}
                disabled={isMergingLoading}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <GitMerge className="w-4 h-4" />
                <span>تأكيد دمج الجدين فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Modal */}
      {showExportModal && currentRoot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-right my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F4C3A] via-[#15664F] to-[#0F4C3A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-display leading-snug">
                    تصدير شجرة العائلة
                  </h3>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    أصل الشجرة: {formatAppName(currentRoot.fullName)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-xs font-bold text-slate-800">اختر صيغة التصدير المناسبة لاستخدامك (جميع الصيغ بدقة فائقة):</p>

              {/* Option 1: Interactive HTML File */}
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => handleExportTreeFormat('html')}
                className="w-full p-3.5 rounded-2xl border-2 border-amber-500/40 bg-amber-50/80 hover:bg-amber-100/90 text-right transition flex items-start gap-3 cursor-pointer group disabled:opacity-50 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-[#8C6D1F] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Globe className="w-5 h-5 text-[#FDE68A]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-amber-950">1. ملف شجرة تفاعلية (HTML)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#D4AF37]/30 text-[#78350F]">
                      تفاعلي ومشاركة مباشرة (واتساب)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-snug mt-1">
                    ملف تفاعلي محمول يُفتح في أي متصفح بالهاتف/الحاسوب، يُتيح النقر على البطاقات لتوسيع وطي الأفرع، مع فتح أدوات المشاركة المباشرة عبر الواتساب.
                  </p>
                </div>
              </button>

              {/* Option 2: Ultra High-Res PNG Image */}
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => handleExportTreeFormat('png')}
                className="w-full p-3.5 rounded-2xl border-2 border-emerald-600/40 bg-emerald-50/80 hover:bg-emerald-100/90 text-right transition flex items-start gap-3 cursor-pointer group disabled:opacity-50 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-[#0F4C3A] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Smartphone className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-[#0F4C3A]">2. صورة فائقة الوضوح (PNG)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#D4AF37]/30 text-[#8C6D1F]">
                      دقة فائقة (300 DPI)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-snug mt-1">
                    صورة رقمية فائقة الوضوح والنقاء (4800px)، تناسب شاشات الجوال والحاسوب وتصلح للطباعة بأي حجم (A4, A3، واللوحات الجدارية الضخمة).
                  </p>
                </div>
              </button>

              {/* Option 3: Print Ready PDF Document */}
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => handleExportTreeFormat('pdf')}
                className="w-full p-3.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-right transition flex items-start gap-3 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-5 h-5 text-[#0F4C3A]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 block">3. وثيقة جاهزة للطباعة (PDF)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      طباعة A4, A3 والجداريات
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug mt-1">
                    ملف PDF عالي الجودة بمقاييس قياسية واضحة، جاهز للطباعة المباشرة على الورق وبوسترات الحائط دون تقطيع.
                  </p>
                </div>
              </button>

              {isExportingPdf && (
                <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl font-bold text-center border border-amber-200 animate-pulse">
                  جارٍ معالجة وتجهيز الملف بدقة فائقة... يرجى الانتظار لحظة
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



