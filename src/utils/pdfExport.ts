import { Person } from '../types/family';
import { KinshipInfo } from './kinship';
import { extractGivenName, formatAppName, formatNameWithLimit } from './nameUtils';

/**
 * Pure TypeScript PDF-1.4 multi-page generator from High-DPI HTML5 Canvas pages.
 * Produces 100% native browser Arabic RTL typography, zero CORS issues, and zero oklch issues.
 */
function createPdfBlobFromJpegPages(
  pages: { jpegBytes: Uint8Array; widthPx: number; heightPx: number; pageWidthPt: number; pageHeightPt: number }[]
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0]; // index 0 is free object

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  // PDF Header
  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const pageCount = pages.length;
  const kidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');

  // 1 0 obj (Catalog)
  offsets[1] = offset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2 0 obj (Pages)
  offsets[2] = offset;
  pushStr(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [ ${kidsRefs} ] >>\nendobj\n`);

  for (let i = 0; i < pageCount; i++) {
    const p = pages[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;

    const wPt = p.pageWidthPt.toFixed(2);
    const hPt = p.pageHeightPt.toFixed(2);

    // Page Object
    offsets[pageObjId] = offset;
    pushStr(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${wPt} ${hPt} ] /Rotate 0 ` +
        `/Resources << /XObject << /Im${i} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    // Content Stream (draws image filling the page)
    const contentStream = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im${i} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    offsets[contentObjId] = offset;
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');

    // Image XObject
    offsets[imageObjId] = offset;
    pushStr(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\n` +
        `stream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr('\nendstream\nendobj\n');
  }

  // Xref table
  const totalObjects = 2 + pageCount * 3 + 1;
  const xrefOffset = offset;
  pushStr(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`);
  for (let objId = 1; objId < totalObjects; objId++) {
    const offStr = String(offsets[objId] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  // Trailer
  pushStr(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks as any[], { type: 'application/pdf' });
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number = 0.94): Uint8Array {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateRtlText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 4 && ctx.measureText(clipped + '...').width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + '...';
}

// ============================================================================
// 1. EXPORT VISUAL FAMILY TREE TO PDF (Both Hierarchical & Organic Modes)
//    - Displays ONLY the First Name (الاسم الأول فقط) in every node box
//    - Does NOT mention daughter's husband in PDF so the printed tree looks clean and distinctive
// ============================================================================
interface TreeLayoutNode {
  person: Person;
  depth: number;
  x: number;
  y: number;
  subtreeWidth: number;
  maleChildrenCount: number;
  femaleChildrenCount: number;
  childrenLayouts: TreeLayoutNode[];
}

export interface ExportTreePdfOptions {
  rootPerson: Person;
  getChildren: (personId: string) => Person[];
  mode: 'classic' | 'organic';
  organicDirection?: 'up' | 'down';
  collapsedNodes?: Set<string>;
  orientation?: 'landscape' | 'portrait' | 'auto';
  paperSize?: 'a4' | 'a3' | 'panoramic' | 'auto';
  maximizeSpace?: boolean;
  unconstrained?: boolean;
}

export async function ensureCairoFontLoaded() {
  const div = document.createElement('div');
  div.style.fontFamily = "'Cairo', 'Segoe UI', Tahoma, sans-serif";
  div.style.fontWeight = '900';
  div.style.position = 'fixed';
  div.style.left = '-9999px';
  div.style.top = '-9999px';
  div.style.visibility = 'hidden';
  div.innerText = 'شجرة العائلة الرقمية الموثقة 1234567890 بن بنت الجيل';
  document.body.appendChild(div);

  try {
    if (document.fonts) {
      await Promise.all([
        document.fonts.load("400 20px Cairo"),
        document.fonts.load("700 24px Cairo"),
        document.fonts.load("900 48px Cairo")
      ]);
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn('Font loading notice:', e);
  } finally {
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }
}

export async function renderTreeToCanvas(options: ExportTreePdfOptions): Promise<{
  canvas: HTMLCanvasElement;
  rootFirstName: string;
  isLandscape: boolean;
}> {
  const {
    rootPerson,
    getChildren,
    mode,
    organicDirection = 'up',
    collapsedNodes = new Set<string>(),
    orientation = 'portrait',
    unconstrained = false
  } = options;

  await ensureCairoFontLoaded();

  // 1. Initial measurement pass
  const visitedMeasure = new Set<string>();
  let maxDepth = 1;
  let totalNodes = 0;
  let leafCount = 0;
  let maxSiblingsInAnyNode = 0;

  function measureTree(person: Person, depth: number) {
    visitedMeasure.add(person.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    const kids = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter(c => !visitedMeasure.has(c.id));
    if (kids.length > maxSiblingsInAnyNode) {
      maxSiblingsInAnyNode = kids.length;
    }
    if (kids.length === 0) {
      leafCount++;
    } else {
      for (const kid of kids) {
        measureTree(kid, depth + 1);
      }
    }
  }
  measureTree(rootPerson, 1);

  // 2. Decide Target Ratio (Portrait or Landscape)
  const isLandscape = orientation === 'landscape';
  const targetRatio = isLandscape ? 1.41421356 : 0.70710678;

  // 3. Compact, Sleek, High-Definition Node Card Sizing (Adaptive based on tree density)
  let NODE_W = 380;
  let NODE_H = 170;
  let baseHGap = 44;

  if (unconstrained) {
    if (leafCount <= 6) {
      NODE_W = 440;
      NODE_H = 190;
      baseHGap = 52;
    } else if (leafCount <= 16) {
      NODE_W = 380;
      NODE_H = 175;
      baseHGap = 42;
    } else if (leafCount <= 32) {
      NODE_W = 330;
      NODE_H = 160;
      baseHGap = 32;
    } else if (leafCount <= 60) {
      NODE_W = 280;
      NODE_H = 145;
      baseHGap = 24;
    } else {
      NODE_W = 240;
      NODE_H = 130;
      baseHGap = 18;
    }
  } else if (leafCount <= 3) {
    NODE_W = 480;
    NODE_H = 200;
    baseHGap = 60;
  } else if (leafCount <= 8) {
    NODE_W = 420;
    NODE_H = 180;
    baseHGap = 48;
  } else if (leafCount <= 15) {
    NODE_W = 380;
    NODE_H = 170;
    baseHGap = 40;
  } else if (leafCount <= 28) {
    NODE_W = 340;
    NODE_H = 160;
    baseHGap = 32;
  } else {
    NODE_W = 310;
    NODE_H = 150;
    baseHGap = 26;
  }

  // Margins & Banners
  const isUpward = mode === 'organic' && organicDirection === 'up';
  const HEADER_H = unconstrained ? 250 : 220;
  const FOOTER_H = unconstrained ? 90 : 80;
  const SIDE_PAD = unconstrained ? 110 : 95;
  const TOP_TREE_PAD = unconstrained ? 80 : 70;
  const BOTTOM_TREE_PAD = isUpward ? (unconstrained ? 180 : 150) : (unconstrained ? 80 : 70);

  // 4. Determine Canvas Dimensions
  const minRequiredTreeW = leafCount * NODE_W + Math.max(0, leafCount - 1) * baseHGap;
  const minRequiredCanvasW = minRequiredTreeW + SIDE_PAD * 2;
  const treeLevelSpacing = unconstrained ? (leafCount > 30 ? 250 : 310) : 280;
  const minRequiredTreeH = Math.max(1, maxDepth - 1) * treeLevelSpacing + NODE_H;
  const minRequiredCanvasH = HEADER_H + TOP_TREE_PAD + minRequiredTreeH + BOTTOM_TREE_PAD + FOOTER_H;

  let logicalW: number;
  let logicalH: number;

  if (unconstrained) {
    logicalW = Math.max(3600, minRequiredCanvasW);
    logicalH = Math.max(2600, minRequiredCanvasH);
  } else if (isLandscape) {
    logicalW = Math.max(3600, minRequiredCanvasW);
    logicalH = Math.round(logicalW / targetRatio);

    if (logicalH < minRequiredCanvasH) {
      logicalH = minRequiredCanvasH;
      logicalW = Math.round(logicalH * targetRatio);
    }
  } else {
    // Portrait mode (Vertical page)
    logicalH = Math.max(4200, minRequiredCanvasH);
    logicalW = Math.round(logicalH * targetRatio);

    if (logicalW < minRequiredCanvasW) {
      logicalW = minRequiredCanvasW;
      logicalH = Math.round(logicalW / targetRatio);
    }
  }

  // 5. 100% Space Distribution
  const availTreeH = logicalH - HEADER_H - TOP_TREE_PAD - BOTTOM_TREE_PAD - FOOTER_H - NODE_H;
  const availTreeW = logicalW - SIDE_PAD * 2;

  const LEVEL_H = maxDepth > 1 ? Math.round(availTreeH / (maxDepth - 1)) : 0;

  let H_GAP = baseHGap;
  if (leafCount > 1) {
    const rawTreeW = leafCount * NODE_W + (leafCount - 1) * baseHGap;
    if (availTreeW > rawTreeW) {
      const extraGap = Math.floor((availTreeW - rawTreeW) / (leafCount - 1));
      H_GAP = baseHGap + extraGap;
    }
  }

  // 6. Recursive layout builder
  function buildLayoutWithGap(person: Person, depth: number, visitedSet: Set<string>): TreeLayoutNode {
    visitedSet.add(person.id);
    const children = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter(c => !visitedSet.has(c.id));
    const maleChildrenCount = children.filter(c => c.gender === 'male').length;
    const femaleChildrenCount = children.filter(c => c.gender === 'female').length;

    if (children.length === 0) {
      return {
        person,
        depth,
        x: 0,
        y: 0,
        subtreeWidth: NODE_W,
        maleChildrenCount,
        femaleChildrenCount,
        childrenLayouts: []
      };
    }

    const childrenLayouts = children.map(ch => buildLayoutWithGap(ch, depth + 1, visitedSet));
    const childrenTotalW =
      childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
      (childrenLayouts.length - 1) * H_GAP;

    return {
      person,
      depth,
      x: 0,
      y: 0,
      subtreeWidth: Math.max(NODE_W, childrenTotalW),
      maleChildrenCount,
      femaleChildrenCount,
      childrenLayouts
    };
  }

  const visitedLayout = new Set<string>();
  const rootLayout = buildLayoutWithGap(rootPerson, 1, visitedLayout);

  const flatNodes: TreeLayoutNode[] = [];
  const links: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    depth: number;
    childGender: 'male' | 'female';
    childHasChildren: boolean;
  }[] = [];

  function assignCoords(node: TreeLayoutNode, leftX: number) {
    node.x = leftX + node.subtreeWidth / 2;
    if (isUpward) {
      node.y = HEADER_H + TOP_TREE_PAD + (maxDepth - node.depth) * LEVEL_H + NODE_H / 2;
    } else {
      node.y = HEADER_H + TOP_TREE_PAD + (node.depth - 1) * LEVEL_H + NODE_H / 2;
    }
    flatNodes.push(node);

    if (node.childrenLayouts.length > 0) {
      const totalChildrenW =
        node.childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
        (node.childrenLayouts.length - 1) * H_GAP;

      let currentRight = leftX + (node.subtreeWidth + totalChildrenW) / 2;

      for (const ch of node.childrenLayouts) {
        const chLeft = currentRight - ch.subtreeWidth;
        assignCoords(ch, chLeft);
        currentRight = chLeft - H_GAP;

        const fromY = isUpward ? node.y - NODE_H / 2 : node.y + NODE_H / 2;
        const toY = isUpward ? ch.y + NODE_H / 2 : ch.y - NODE_H / 2;

        links.push({
          fromX: node.x,
          fromY,
          toX: ch.x,
          toY,
          depth: node.depth,
          childGender: ch.person.gender,
          childHasChildren: ch.childrenLayouts.length > 0
        });
      }
    }
  }

  assignCoords(rootLayout, (logicalW - rootLayout.subtreeWidth) / 2);

  // Browser hardware limits:
  // Mobile Safari / Android WebViews max texture dimension is 4096-8192 px and 16-24 Megapixels.
  // We clamp maximum dimension to 7200 px and max pixels to 22 Megapixels to ensure 100% stability without blank screens.
  const MAX_SAFE_CANVAS_DIM = 7200;
  const MAX_SAFE_CANVAS_PIXELS = 22_000_000;

  const maxLogicalDim = Math.max(logicalW, logicalH);
  const totalLogicalPixels = logicalW * logicalH;

  const maxDimScale = MAX_SAFE_CANVAS_DIM / maxLogicalDim;
  const maxAreaScale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / totalLogicalPixels);
  const upperScaleLimit = Math.min(maxDimScale, maxAreaScale);

  let targetScale = 2.0;
  if (maxLogicalDim > 3400) targetScale = 1.5;
  if (maxLogicalDim > 5200) targetScale = 1.0;

  const scale = Math.max(0.25, Math.min(targetScale, upperScaleLimit));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(100, Math.round(logicalW * scale));
  canvas.height = Math.max(100, Math.round(logicalH * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر حجز ذاكرة الرسم في المتصفح لكبر حجم الشجرة. يرجى تجربة تصدير ملف HTML التفاعلي.');
  }
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.5, '#FDFBF7');
  bgGrad.addColorStop(1, '#F6EFE5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Borders
  ctx.strokeStyle = '#064E3B';
  ctx.lineWidth = unconstrained ? 12 : 9;
  ctx.strokeRect(20, 20, logicalW - 40, logicalH - 40);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = unconstrained ? 6 : 4.5;
  ctx.strokeRect(32, 32, logicalW - 64, logicalH - 64);

  // Header Banner
  const bannerLeft = 50;
  const bannerTop = 40;
  const bannerW = logicalW - 100;
  const bannerH = HEADER_H - 24;

  ctx.fillStyle = '#064E3B';
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.fill();

  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.stroke();

  const rootFirstName = extractGivenName(rootPerson.fullName);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FDE68A';
  ctx.font = "900 28px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — سجل شجرة العائلة الرقمي الموثق', logicalW / 2, bannerTop + 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = "900 48px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";
  const modeTitle =
    mode === 'organic' ? 'شجرة العائلة (الجذر والأغصان والتفريعات)' : 'شجرة العائلة (المخطط الهرمي)';
  const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;
  ctx.fillText(`${modeTitle} — أصل الشجرة: ${fullRootTitle}`, logicalW / 2, bannerTop + 106);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = "900 24px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(
    `عدد الأفراد: ${totalNodes} فرداً · ${maxDepth} أجيال موثقة · تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}`,
    logicalW / 2,
    bannerTop + 154
  );

  // Organic Mode Trunk
  if (mode === 'organic') {
    const rx = rootLayout.x;
    const ry = rootLayout.y;

    if (isUpward) {
      ctx.fillStyle = 'rgba(92, 58, 33, 0.2)';
      ctx.beginPath();
      ctx.ellipse(rx, ry + Math.round(NODE_H * 0.72), 260, 36, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5C3A21';
      ctx.beginPath();
      ctx.moveTo(rx - 50, ry + Math.round(NODE_H * 0.72));
      ctx.quadraticCurveTo(rx - 28, ry + 70, rx - 18, ry + NODE_H / 2);
      ctx.lineTo(rx + 18, ry + NODE_H / 2);
      ctx.quadraticCurveTo(rx + 28, ry + 70, rx + 50, ry + Math.round(NODE_H * 0.72));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#4A2C11';
      ctx.lineCap = 'round';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(rx, ry + Math.round(NODE_H * 0.72));
      ctx.quadraticCurveTo(rx - 4, ry + 110, rx, ry + 130);
      ctx.stroke();

      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(rx + 24, ry + Math.round(NODE_H * 0.70));
      ctx.quadraticCurveTo(rx + 80, ry + 110, rx + 160, ry + 130);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx - 24, ry + Math.round(NODE_H * 0.70));
      ctx.quadraticCurveTo(rx - 80, ry + 110, rx - 160, ry + 130);
      ctx.stroke();

      ctx.fillStyle = '#4A2C11';
      ctx.font = "900 22px Cairo, 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('جذر الشجرة وأصلها الراسخ', rx, ry + Math.round(NODE_H * 0.72) + 28);
    }
  }

  // Connecting Lines (Thick High-Contrast Solid)
  for (const link of links) {
    if (mode === 'organic') {
      const ctrlY1 = link.fromY + (link.toY - link.fromY) * 0.45;
      const ctrlY2 = link.fromY + (link.toY - link.fromY) * 0.55;
      const strokeW = Math.max(6, 16 - link.depth * 1.5);

      ctx.strokeStyle =
        link.depth === 1
          ? '#5C3A21'
          : link.childGender === 'female' && !link.childHasChildren
          ? '#9F1239'
          : '#064E3B';
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(link.fromX, link.fromY);
      ctx.bezierCurveTo(link.fromX, ctrlY1, link.toX, ctrlY2, link.toX, link.toY);
      ctx.stroke();
    } else {
      const midY = (link.fromY + link.toY) / 2;
      ctx.strokeStyle = '#064E3B';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(link.fromX, link.fromY);
      ctx.lineTo(link.fromX, midY);
      ctx.lineTo(link.toX, midY);
      ctx.lineTo(link.toX, link.toY);
      ctx.stroke();
    }
  }

  // Helper for drawing Jet-Black Ultra-Sharp Text
  function drawInkText(text: string, x: number, y: number, color: string) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // Nodes Drawing (Giant, Bold, Ultra Clear Text)
  for (const node of flatNodes) {
    const { person, depth, x, y } = node;
    const isRoot = depth === 1;
    const left = x - NODE_W / 2;
    const top = y - NODE_H / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;

    if (isRoot) {
      const rootGrad = ctx.createLinearGradient(left, top, left, top + NODE_H);
      rootGrad.addColorStop(0, '#3E2410');
      rootGrad.addColorStop(1, '#063B2C');
      ctx.fillStyle = rootGrad;
    } else if (person.gender === 'male') {
      ctx.fillStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = '#FFF1F2';
    }

    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 22);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = isRoot ? 7 : 5;
    ctx.strokeStyle = isRoot
      ? '#F59E0B'
      : person.gender === 'male'
      ? '#064E3B'
      : '#BE123C';
    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 22);
    ctx.stroke();

    // Badges: Generation & Gender
    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const badgeFont = Math.min(26, Math.max(13, Math.floor(NODE_H * 0.16)));
    ctx.font = `900 ${badgeFont}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;

    const badgeY = top + Math.round(NODE_H * 0.22);
    const dividerY = top + Math.round(NODE_H * 0.33);

    // Right Badge
    ctx.textAlign = 'right';
    drawInkText(genLabel, left + NODE_W - 22, badgeY, isRoot ? '#FDE68A' : '#0F172A');

    // Left Badge
    ctx.textAlign = 'left';
    const genderColor = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';
    drawInkText(genderLabel, left + 22, badgeY, genderColor);

    // Inner dividing line
    ctx.strokeStyle = isRoot ? 'rgba(253, 230, 138, 0.6)' : 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(left + 18, dividerY);
    ctx.lineTo(left + NODE_W - 18, dividerY);
    ctx.stroke();

    // ------------------------------------------------------------------------
    // HIGH-DEFINITION CRYSTAL CLEAR NAME TYPOGRAPHY (First Name Only)
    // ------------------------------------------------------------------------
    const displayName = isRoot
      ? formatAppName(person.fullName)
      : extractGivenName(person.fullName);

    const maxTextWidth = NODE_W - 36;
    const textCenterX = left + NODE_W / 2;
    const cardTopContent = dividerY;
    const cardContentHeight = NODE_H - (dividerY - top);
    const textCenterY = cardTopContent + cardContentHeight / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Giant Font Sizing for single given name
    let nameFontSize = Math.min(68, Math.floor(NODE_H * 0.40));
    ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;

    while (nameFontSize > 24 && ctx.measureText(displayName).width > maxTextWidth) {
      nameFontSize -= 2;
      ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
    }

    drawInkText(displayName, textCenterX, textCenterY, isRoot ? '#FFFFFF' : '#0F172A');
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = "900 22px Cairo, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    'تم استخراج هذه الوثيقة آلياً من نظام شجرة العائلة الرقمي — وثيقة نسب معتمدة وموثقة',
    logicalW / 2,
    logicalH - 22
  );

  return { canvas, rootFirstName, isLandscape };
}

/**
 * Export Vector SVG Image (.svg) with Infinite Zoom and 100% Vector Crispness
 */
export async function exportTreeToSvg(options: ExportTreePdfOptions) {
  const {
    rootPerson,
    getChildren,
    mode,
    organicDirection = 'up',
    collapsedNodes = new Set<string>()
  } = options;

  await ensureCairoFontLoaded();

  const visitedMeasure = new Set<string>();
  let maxDepth = 1;
  let totalNodes = 0;
  let leafCount = 0;

  function measureTree(person: Person, depth: number) {
    visitedMeasure.add(person.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    const kids = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter(c => !visitedMeasure.has(c.id));
    if (kids.length === 0) {
      leafCount++;
    } else {
      for (const kid of kids) {
        measureTree(kid, depth + 1);
      }
    }
  }
  measureTree(rootPerson, 1);

  const NODE_W = 280;
  const NODE_H = 145;
  const baseHGap = 36;
  const HEADER_H = 200;
  const FOOTER_H = 70;
  const SIDE_PAD = 75;
  const TOP_TREE_PAD = 60;
  const BOTTOM_TREE_PAD = mode === 'organic' && organicDirection === 'up' ? 150 : 60;

  const minRequiredTreeW = leafCount * NODE_W + Math.max(0, leafCount - 1) * baseHGap;
  const logicalW = Math.max(3400, minRequiredTreeW + SIDE_PAD * 2);
  const minRequiredTreeH = Math.max(1, maxDepth - 1) * 260 + NODE_H;
  const logicalH = Math.max(2400, HEADER_H + TOP_TREE_PAD + minRequiredTreeH + BOTTOM_TREE_PAD + FOOTER_H);

  const availTreeH = logicalH - HEADER_H - TOP_TREE_PAD - BOTTOM_TREE_PAD - FOOTER_H - NODE_H;
  const availTreeW = logicalW - SIDE_PAD * 2;
  const LEVEL_H = maxDepth > 1 ? Math.round(availTreeH / (maxDepth - 1)) : 0;

  let H_GAP = baseHGap;
  if (leafCount > 1) {
    const rawTreeW = leafCount * NODE_W + (leafCount - 1) * baseHGap;
    if (availTreeW > rawTreeW) {
      const extraGap = Math.floor((availTreeW - rawTreeW) / (leafCount - 1));
      H_GAP = baseHGap + extraGap;
    }
  }

  const isUpward = mode === 'organic' && organicDirection === 'up';

  function buildLayout(person: Person, depth: number, visitedSet: Set<string>): TreeLayoutNode {
    visitedSet.add(person.id);
    const children = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter(c => !visitedSet.has(c.id));
    const maleChildrenCount = children.filter(c => c.gender === 'male').length;
    const femaleChildrenCount = children.filter(c => c.gender === 'female').length;

    if (children.length === 0) {
      return {
        person,
        depth,
        x: 0,
        y: 0,
        subtreeWidth: NODE_W,
        maleChildrenCount,
        femaleChildrenCount,
        childrenLayouts: []
      };
    }

    const childrenLayouts = children.map(ch => buildLayout(ch, depth + 1, visitedSet));
    const childrenTotalW =
      childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
      (childrenLayouts.length - 1) * H_GAP;

    return {
      person,
      depth,
      x: 0,
      y: 0,
      subtreeWidth: Math.max(NODE_W, childrenTotalW),
      maleChildrenCount,
      femaleChildrenCount,
      childrenLayouts
    };
  }

  const rootLayout = buildLayout(rootPerson, 1, new Set<string>());
  const flatNodes: TreeLayoutNode[] = [];
  const links: { fromX: number; fromY: number; toX: number; toY: number; depth: number }[] = [];

  function assignCoords(node: TreeLayoutNode, leftX: number) {
    node.x = leftX + node.subtreeWidth / 2;
    if (isUpward) {
      node.y = HEADER_H + TOP_TREE_PAD + (maxDepth - node.depth) * LEVEL_H + NODE_H / 2;
    } else {
      node.y = HEADER_H + TOP_TREE_PAD + (node.depth - 1) * LEVEL_H + NODE_H / 2;
    }
    flatNodes.push(node);

    if (node.childrenLayouts.length > 0) {
      const totalChildrenW =
        node.childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
        (node.childrenLayouts.length - 1) * H_GAP;

      let currentRight = leftX + (node.subtreeWidth + totalChildrenW) / 2;

      for (const ch of node.childrenLayouts) {
        const chLeft = currentRight - ch.subtreeWidth;
        assignCoords(ch, chLeft);
        currentRight = chLeft - H_GAP;

        const fromY = isUpward ? node.y - NODE_H / 2 : node.y + NODE_H / 2;
        const toY = isUpward ? ch.y + NODE_H / 2 : ch.y - NODE_H / 2;

        links.push({ fromX: node.x, fromY, toX: ch.x, toY, depth: node.depth });
      }
    }
  }

  assignCoords(rootLayout, (logicalW - rootLayout.subtreeWidth) / 2);

  const rootFirstName = extractGivenName(rootPerson.fullName);
  const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;

  let svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logicalW} ${logicalH}" width="${logicalW}" height="${logicalH}" dir="rtl">\n`;
  svgStr += `<defs>\n`;
  svgStr += `  <style>\n`;
  svgStr += `    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&amp;display=swap');\n`;
  svgStr += `    text { font-family: 'Cairo', 'Segoe UI', system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }\n`;
  svgStr += `  </style>\n`;
  svgStr += `  <linearGradient id="rootGrad" x1="0" y1="0" x2="0" y2="1">\n`;
  svgStr += `    <stop offset="0%" stop-color="#3E2410" />\n`;
  svgStr += `    <stop offset="100%" stop-color="#063B2C" />\n`;
  svgStr += `  </linearGradient>\n`;
  svgStr += `</defs>\n`;

  // Background
  svgStr += `<rect width="100%" height="100%" fill="#FAF8F5" />\n`;
  svgStr += `<rect x="20" y="20" width="${logicalW - 40}" height="${logicalH - 40}" fill="none" stroke="#064E3B" stroke-width="7" />\n`;
  svgStr += `<rect x="32" y="32" width="${logicalW - 64}" height="${logicalH - 64}" fill="none" stroke="#D97706" stroke-width="3.5" />\n`;

  // Header Banner
  const bannerLeft = 50;
  const bannerTop = 40;
  const bannerW = logicalW - 100;
  const bannerH = HEADER_H - 24;
  svgStr += `<rect x="${bannerLeft}" y="${bannerTop}" width="${bannerW}" height="${bannerH}" rx="22" fill="#064E3B" stroke="#D97706" stroke-width="3.5" />\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + 42}" font-size="26" font-weight="900" fill="#FDE68A">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — سجل شجرة العائلة الرقمي الموثق</text>\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + 96}" font-size="44" font-weight="900" fill="#FFFFFF">شجرة العائلة — أصل الشجرة: ${fullRootTitle}</text>\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + 138}" font-size="22" font-weight="700" fill="#E2E8F0">عدد الأفراد: ${totalNodes} فرداً · ${maxDepth} أجيال موثقة · تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}</text>\n`;

  // Links
  links.forEach(l => {
    const midY = (l.fromY + l.toY) / 2;
    svgStr += `<path d="M ${l.fromX} ${l.fromY} L ${l.fromX} ${midY} L ${l.toX} ${midY} L ${l.toX} ${l.toY}" fill="none" stroke="#064E3B" stroke-width="6" stroke-linecap="round" />\n`;
  });

  // Nodes
  flatNodes.forEach(node => {
    const { person, depth, x, y } = node;
    const isRoot = depth === 1;
    const left = x - NODE_W / 2;
    const top = y - NODE_H / 2;

    const fill = isRoot ? 'url(#rootGrad)' : person.gender === 'female' ? '#FFF1F2' : '#FFFFFF';
    const stroke = isRoot ? '#F59E0B' : person.gender === 'male' ? '#064E3B' : '#BE123C';
    const strokeW = isRoot ? 6 : 4.5;

    svgStr += `<g>\n`;
    svgStr += `  <rect x="${left}" y="${top}" width="${NODE_W}" height="${NODE_H}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" />\n`;

    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const genColor = isRoot ? '#FDE68A' : '#0F172A';
    const genderColor = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';

    svgStr += `  <text x="${left + NODE_W - 20}" y="${top + 34}" text-anchor="end" font-size="20" font-weight="900" fill="${genColor}">${genLabel}</text>\n`;
    svgStr += `  <text x="${left + 20}" y="${top + 34}" text-anchor="start" font-size="20" font-weight="900" fill="${genderColor}">${genderLabel}</text>\n`;
    svgStr += `  <line x1="${left + 16}" y1="${top + 46}" x2="${left + NODE_W - 16}" y2="${top + 46}" stroke="${isRoot ? 'rgba(253,230,138,0.6)' : 'rgba(15,23,42,0.25)'}" stroke-width="2" />\n`;

    const displayName = isRoot ? formatAppName(person.fullName) : formatNameWithLimit(person.fullName, 2);
    const textColor = isRoot ? '#FFFFFF' : '#000000';
    svgStr += `  <text x="${left + NODE_W / 2}" y="${top + 46 + (NODE_H - 46) / 2}" font-size="44" font-weight="900" fill="${textColor}">${displayName}</text>\n`;
    svgStr += `</g>\n`;
  });

  // Footer
  svgStr += `<text x="${logicalW / 2}" y="${logicalH - 24}" font-size="20" font-weight="700" fill="#0F172A">تم استخراج هذه الوثيقة آلياً من نظام شجرة العائلة الرقمي — وثيقة نسب معتمدة وموثقة</text>\n`;
  svgStr += `</svg>`;

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `شجرة_العائلة_متجهة_${rootFirstName}.svg`;
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Export a Multi-Page Tiled PDF Poster Grid (e.g. 2x2 = 4 pages, or 2x1 = 2 pages)
 * Slices a giant high-res canvas into multiple printable A4/A3 sheets that fit together!
 */
export async function exportTiledTreePdf(
  options: ExportTreePdfOptions,
  gridCols: number = 2,
  gridRows: number = 2
) {
  // 1. Render master canvas with huge unconstrained card sizes
  const { canvas: masterCanvas, rootFirstName } = await renderTreeToCanvas({
    ...options,
    unconstrained: true
  });

  const totalPages = gridCols * gridRows;
  const pdfPages: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[] = [];

  const tileWidthPx = Math.floor(masterCanvas.width / gridCols);
  const tileHeightPx = Math.floor(masterCanvas.height / gridRows);

  const isLandscape = tileWidthPx >= tileHeightPx;
  const pageWidthPt = isLandscape ? 1190.55 : 841.89;
  const pageHeightPt = isLandscape ? 841.89 : 1190.55;

  let pageIndex = 1;

  for (let r = 0; r < gridRows; r++) {
    // In RTL, iterate columns from Right to Left (c = gridCols - 1 down to 0)
    for (let colIdx = 0; colIdx < gridCols; colIdx++) {
      const c = gridCols - 1 - colIdx; // Rightmost column first
      const srcX = c * tileWidthPx;
      const srcY = r * tileHeightPx;

      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tileWidthPx;
      tileCanvas.height = tileHeightPx;
      const ctx = tileCanvas.getContext('2d')!;

      // Draw slice from master canvas
      ctx.drawImage(
        masterCanvas,
        srcX,
        srcY,
        tileWidthPx,
        tileHeightPx,
        0,
        0,
        tileWidthPx,
        tileHeightPx
      );

      // Section naming helper for Arabic RTL layout
      let hLabel = '';
      if (gridCols === 1) hLabel = '';
      else if (c === gridCols - 1) hLabel = 'الأيمن';
      else if (c === 0) hLabel = 'الأيسر';
      else hLabel = 'الأوسط';

      let vLabel = '';
      if (gridRows === 1) vLabel = '';
      else if (r === 0) vLabel = 'العلوي';
      else if (r === gridRows - 1) vLabel = 'السفلي';
      else vLabel = 'الأوسط';

      const sectionStr = [hLabel, vLabel].filter(Boolean).join(' ') || 'الكامل';
      const pageLabel = `صفحة (${pageIndex} من ${totalPages}) — القسم ${sectionStr}`;

      // Draw page numbering & alignment guide banner on top right
      ctx.direction = 'rtl';
      ctx.font = 'bold 24px Cairo, sans-serif';
      ctx.textAlign = 'right';

      const textW = ctx.measureText(pageLabel).width + 36;
      ctx.fillStyle = '#064E3B';
      drawRoundedRect(ctx, tileWidthPx - textW - 20, 16, textW, 46, 12);
      ctx.fill();

      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, tileWidthPx - textW - 20, 16, textW, 46, 12);
      ctx.stroke();

      ctx.fillStyle = '#FDE68A';
      ctx.fillText(pageLabel, tileWidthPx - 38, 48);

      // Draw assembly alignment guide lines on connecting edges
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);

      // If there is a section to the left, draw left edge guide
      if (c > 0) {
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(4, tileHeightPx);
        ctx.stroke();
      }
      // If there is a section below, draw bottom edge guide
      if (r < gridRows - 1) {
        ctx.beginPath();
        ctx.moveTo(0, tileHeightPx - 4);
        ctx.lineTo(tileWidthPx, tileHeightPx - 4);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const jpegBytes = canvasToJpegBytes(tileCanvas, 0.98);
      pdfPages.push({
        jpegBytes,
        widthPx: tileWidthPx,
        heightPx: tileHeightPx,
        pageWidthPt,
        pageHeightPt
      });

      pageIndex++;
    }
  }

  const pdfBlob = createPdfBlobFromJpegPages(pdfPages);
  triggerBlobDownload(pdfBlob, `شجرة_العائلة_مقسمة_${gridCols}x${gridRows}_${rootFirstName}.pdf`);
}

export async function exportTreeToPdf(options: ExportTreePdfOptions) {
  const { canvas, rootFirstName, isLandscape } = await renderTreeToCanvas({
    ...options,
    unconstrained: true
  });
  const jpegBytes = canvasToJpegBytes(canvas, 0.98);

  let pageWidthPt: number;
  let pageHeightPt: number;

  if (isLandscape) {
    pageWidthPt = 1190.55;
    pageHeightPt = 841.89;
  } else {
    pageWidthPt = 841.89;
    pageHeightPt = 1190.55;
  }

  const pdfBlob = createPdfBlobFromJpegPages([
    {
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt,
      pageHeightPt
    }
  ]);

  triggerBlobDownload(pdfBlob, `شجرة_العائلة_${rootFirstName}.pdf`);
}

export async function exportTreeToPng(options: ExportTreePdfOptions) {
  const { canvas, rootFirstName } = await renderTreeToCanvas({
    ...options,
    unconstrained: true,
    orientation: 'portrait'
  });

  const filename = `شجرة_العائلة_${rootFirstName}.png`;
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');

  // Convert canvas to binary blob safely without huge base64 strings
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b && b.size > 0) {
        resolve(b);
      } else {
        try {
          const dataUrl = canvas.toDataURL('image/png', 0.95);
          if (dataUrl && dataUrl.length > 50) {
            fetch(dataUrl)
              .then((res) => res.blob())
              .then(resolve)
              .catch(reject);
            return;
          }
        } catch (e) {
          // ignore
        }
        reject(new Error('فشل إنشاء ملف الصورة'));
      }
    }, 'image/png');
  });

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
}

// ============================================================================
// 2. EXPORT PERSON LINEAGE & KINSHIP CERTIFICATE TO PDF
//    - Uses First Name (الاسم الأول) in boxes and omits female's husband in PDF
// ============================================================================
export async function exportPersonCertificateToPdf(options: {
  person: Person;
  lineage: string;
  ancestors: Person[];
  children: Person[];
  kinship?: KinshipInfo;
}) {
  const { person, ancestors, children, kinship } = options;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const W = 1000;
  const extraRows = Math.max(0, ancestors.length + Math.ceil(children.length / 2) - 6) * 32;
  const H = Math.max(1414, 1300 + extraRows);
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';

  // Parchment Background
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, W, H);

  // Double Ornate Border
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8C6D1F';
  ctx.font = 'bold 16px Cairo, sans-serif';
  ctx.fillText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', W / 2, 86);

  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 30px Cairo, sans-serif';
  ctx.fillText('وثيقة إثبات النسب وصلات القرابة', W / 2, 130);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 14px Cairo, sans-serif';
  ctx.fillText('مستخرجة من السجل الرقمي الموثق لشجرة العائلة', W / 2, 158);

  const personFirstName = extractGivenName(person.fullName);

  // Name Banner Box
  ctx.fillStyle = '#F2F8F5';
  drawRoundedRect(ctx, 70, 185, W - 140, 115, 18);
  ctx.fill();
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 70, 185, W - 140, 115, 18);
  ctx.stroke();

  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText('الاسم الأول للفرد (صاحب الوثيقة):', W / 2, 215);

  ctx.font = 'bold 24px Cairo, sans-serif';
  ctx.fillText(`« ${personFirstName} »`, W / 2, 255);

  if (kinship?.mother) {
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(`الأم (الوالدة): ${extractGivenName(kinship.mother.fullName)}`, W / 2, 285);
  }

  let curY = 340;

  // Ancestors Table (First name only in each row)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText('سلسلة الآباء والأجداد صعوداً (الاسم الأول في كل خانة):', W - 70, curY);
  curY += 20;

  const chainRows = [{ label: 'الفرد (صاحب الوثيقة)', name: personFirstName }].concat(
    ancestors.map((anc, idx) => ({
      label: idx === 0 ? 'الأب المباشر' : idx === 1 ? 'الجد الأول' : `الجد (الجيل ${idx + 2})`,
      name: extractGivenName(anc.fullName)
    }))
  );

  for (let i = 0; i < chainRows.length; i++) {
    const row = chainRows[i];
    ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    drawRoundedRect(ctx, 70, curY, W - 140, 38, 8);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(row.label, W - 88, curY + 25);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 15px Cairo, sans-serif';
    ctx.fillText(row.name, 90, curY + 25);
    curY += 42;
  }

  // Kinship Summary if provided (First names only)
  if (kinship) {
    curY += 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText('ملخص صلات القرابة المباشرة:', W - 70, curY);
    curY += 20;

    const kRows: { title: string; val: string }[] = [];
    if (kinship.mother) kRows.push({ title: 'الأم (الوالدة):', val: extractGivenName(kinship.mother.fullName) });
    if (kinship.brothers.length > 0)
      kRows.push({ title: `الإخوة الذكور (${kinship.brothers.length}):`, val: kinship.brothers.map(b => extractGivenName(b.fullName)).join('، ') });
    if (kinship.sisters.length > 0)
      kRows.push({ title: `الأخوات (${kinship.sisters.length}):`, val: kinship.sisters.map(s => extractGivenName(s.fullName)).join('، ') });
    if (kinship.paternalUncles.length > 0)
      kRows.push({ title: `الأعمام (${kinship.paternalUncles.length}):`, val: kinship.paternalUncles.map(u => extractGivenName(u.fullName)).join('، ') });
    if (kinship.paternalAunts.length > 0)
      kRows.push({ title: `العمات (${kinship.paternalAunts.length}):`, val: kinship.paternalAunts.map(a => extractGivenName(a.fullName)).join('، ') });
    if (kinship.maternalUncles.length > 0)
      kRows.push({ title: `الأخوال (${kinship.maternalUncles.length}):`, val: kinship.maternalUncles.map(u => extractGivenName(u.fullName)).join('، ') });
    if (kinship.maternalAunts.length > 0)
      kRows.push({ title: `الخالات (${kinship.maternalAunts.length}):`, val: kinship.maternalAunts.map(a => extractGivenName(a.fullName)).join('، ') });

    for (const kr of kRows) {
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRect(ctx, 70, curY, W - 140, 36, 8);
      ctx.fill();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F4C3A';
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText(kr.title, W - 88, curY + 23);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E293B';
      ctx.font = '600 13px Cairo, sans-serif';
      ctx.fillText(truncateRtlText(ctx, kr.val, W - 360), 90, curY + 23);
      curY += 42;
    }
  }

  // Children List (First name only in each box, no husband mentioned for daughters)
  if (children.length > 0) {
    curY += 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText(`الفروع (الأبناء والبنات) (${children.length}):`, W - 70, curY);
    curY += 20;

    for (let i = 0; i < children.length; i += 2) {
      const c1 = children[i];
      const c2 = children[i + 1];

      ctx.fillStyle = '#F2F8F5';
      drawRoundedRect(ctx, W / 2 + 10, curY, W / 2 - 80, 36, 8);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px Cairo, sans-serif';
      ctx.fillText(
        `${i + 1}. ${extractGivenName(c1.fullName)} (${c1.gender === 'male' ? 'ابن' : 'ابنة'})`,
        W - 85,
        curY + 23
      );

      if (c2) {
        ctx.fillStyle = '#F2F8F5';
        drawRoundedRect(ctx, 70, curY, W / 2 - 80, 36, 8);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(
          `${i + 2}. ${extractGivenName(c2.fullName)} (${c2.gender === 'male' ? 'ابن' : 'ابنة'})`,
          W / 2 - 25,
          curY + 23
        );
      }
      curY += 42;
    }
  }

  // Footer Seal
  const footerY = H - 85;
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(70, footerY - 25);
  ctx.lineTo(W - 70, footerY - 25);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 13px Cairo, sans-serif';
  ctx.fillText(`تاريخ التوثيق والاستخراج: ${new Date().toLocaleDateString('ar-SA')} م`, W - 70, footerY + 5);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F4C3A';
  ctx.fillText('ختم سجل شجرة العائلة الرقمي الموثق', 70, footerY + 5);

  const jpegBytes = canvasToJpegBytes(canvas, 0.94);
  const pdfBlob = createPdfBlobFromJpegPages([
    {
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt: 595.28,
      pageHeightPt: Math.round((H / W) * 595.28)
    }
  ]);

  triggerBlobDownload(pdfBlob, `وثيقة_نسب_${personFirstName}.pdf`);
}

// ============================================================================
// 3. EXPORT RELATIONSHIP BETWEEN TWO PERSONS TO PDF
//    - Uses First Name (الاسم الأول) in boxes
// ============================================================================
export async function exportRelationshipReportToPdf(options: {
  personA: Person;
  personB: Person;
  headline: string;
  relationBtoA: string;
  relationAtoB: string;
  commonAncestor: Person | null;
  summaryDescription: string;
  additionalTies: string[];
  pathA: Person[];
  pathB: Person[];
}) {
  const {
    personA,
    personB,
    headline,
    relationBtoA,
    relationAtoB,
    commonAncestor,
    summaryDescription,
    additionalTies,
    pathA,
    pathB
  } = options;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const firstA = extractGivenName(personA.fullName);
  const firstB = extractGivenName(personB.fullName);

  const W = 1000;
  const maxSteps = Math.max(pathA.length, pathB.length, 3);
  const H = Math.max(1350, 920 + maxSteps * 55 + additionalTies.length * 40);
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';

  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8C6D1F';
  ctx.font = 'bold 15px Cairo, sans-serif';
  ctx.fillText('بسم الله الرحمن الرحيم — سجل شجرة العائلة', W / 2, 82);

  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 28px Cairo, sans-serif';
  ctx.fillText('تقرير إثبات صلة القرابة بين فردين من العائلة', W / 2, 122);

  // Two Persons Cards (First Name in each box)
  // Right card: Person A
  ctx.fillStyle = '#F2F8F5';
  drawRoundedRect(ctx, W / 2 + 20, 155, W / 2 - 90, 95, 16);
  ctx.fill();
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, W / 2 + 20, 155, W / 2 - 90, 95, 16);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 13px Cairo, sans-serif';
  ctx.fillText('الطرف الأول:', W - 90, 185);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText(firstA, W - 90, 218);

  // Left card: Person B
  ctx.fillStyle = '#F2F8F5';
  drawRoundedRect(ctx, 70, 155, W / 2 - 90, 95, 16);
  ctx.fill();
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, 70, 155, W / 2 - 90, 95, 16);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 13px Cairo, sans-serif';
  ctx.fillText('الطرف الثاني:', W / 2 - 40, 185);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText(firstB, W / 2 - 40, 218);

  // Primary Result Banner
  ctx.fillStyle = '#0F4C3A';
  drawRoundedRect(ctx, 70, 275, W - 140, 115, 18);
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 70, 275, W - 140, 115, 18);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText('نتيجة صلة القرابة المعتمدة:', W / 2, 305);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Cairo, sans-serif';
  ctx.fillText(truncateRtlText(ctx, headline, W - 180), W / 2, 342);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 14px Cairo, sans-serif';
  ctx.fillText(truncateRtlText(ctx, summaryDescription, W - 180), W / 2, 372);

  let curY = 415;

  // Mutual Directions
  ctx.fillStyle = '#FFFBEB';
  drawRoundedRect(ctx, 70, curY, W - 140, 90, 14);
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, 70, curY, W - 140, 90, 14);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#78350F';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText(
    `• صلة (${firstB}) بالنسبة لـ (${firstA}):  ${relationBtoA}`,
    W - 95,
    curY + 35
  );
  ctx.fillText(
    `• صلة (${firstA}) بالنسبة لـ (${firstB}):  ${relationAtoB}`,
    W - 95,
    curY + 68
  );
  curY += 115;

  // Common Ancestor if present
  if (commonAncestor) {
    ctx.fillStyle = '#F2F8F5';
    drawRoundedRect(ctx, 70, curY, W - 140, 58, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 16px Cairo, sans-serif';
    ctx.fillText(`الجد المشترك الجامع للنسب: « ${extractGivenName(commonAncestor.fullName)} »`, W / 2, curY + 35);
    curY += 80;
  }

  // Step-by-step Lineage Columns (First Name only in each box)
  if (pathA.length > 0 || pathB.length > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 17px Cairo, sans-serif';
    ctx.fillText('التسلسل النسبي للطرفين حتى نقطة الالتقاء (الاسم الأول في كل خانة):', W - 70, curY);
    curY += 22;

    const rows = Math.max(pathA.length, pathB.length);
    for (let i = 0; i < rows; i++) {
      const pA = pathA[i];
      const pB = pathB[i];

      if (pA) {
        ctx.fillStyle = pA.id === commonAncestor?.id ? '#FEF3C7' : '#F8FAFC';
        drawRoundedRect(ctx, W / 2 + 15, curY, W / 2 - 85, 40, 8);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 14px Cairo, sans-serif';
        ctx.fillText(
          `${i === 0 ? 'الطرف الأول' : `الجيل +${i}`}: ${extractGivenName(pA.fullName)}`,
          W - 88,
          curY + 25
        );
      }

      if (pB) {
        ctx.fillStyle = pB.id === commonAncestor?.id ? '#FEF3C7' : '#F8FAFC';
        drawRoundedRect(ctx, 70, curY, W / 2 - 85, 40, 8);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 14px Cairo, sans-serif';
        ctx.fillText(
          `${i === 0 ? 'الطرف الثاني' : `الجيل +${i}`}: ${extractGivenName(pB.fullName)}`,
          W / 2 - 32,
          curY + 25
        );
      }
      curY += 46;
    }
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px Cairo, sans-serif';
  ctx.fillText(
    `تاريخ استخراج تقرير القرابة: ${new Date().toLocaleDateString('ar-SA')} م — سجل شجرة العائلة`,
    W / 2,
    H - 48
  );

  const jpegBytes = canvasToJpegBytes(canvas, 0.94);
  const pdfBlob = createPdfBlobFromJpegPages([
    {
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt: 595.28,
      pageHeightPt: Math.round((H / W) * 595.28)
    }
  ]);

  triggerBlobDownload(
    pdfBlob,
    `صلة_القرابة_${firstA}_و_${firstB}.pdf`
  );
}

// ============================================================================
// 4. EXPORT FULL FAMILY REGISTRY LIST TO MULTI-PAGE PDF
//    - Uses First Name only and does NOT mention female's husband in PDF
// ============================================================================
export async function exportMembersListToPdf(options: {
  persons: Person[];
  getPerson: (id: string) => Person | undefined;
  getChildren: (id: string) => Person[];
}) {
  const { persons, getPerson, getChildren } = options;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const W = 1000;
  const H = 1414; // A4 aspect ratio
  const ROWS_PER_PAGE = 22;
  const totalPages = Math.max(1, Math.ceil(persons.length / ROWS_PER_PAGE));
  const pagesData: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const slice = persons.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';

    ctx.fillStyle = '#FFFDF9';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#0F4C3A';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // Header
    ctx.fillStyle = '#0F4C3A';
    drawRoundedRect(ctx, 48, 44, W - 96, 85, 14);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Cairo, sans-serif';
    ctx.fillText('السجل العام لأفراد شجرة العائلة (الذكور ثم الإناث هجائياً)', W / 2, 82);

    ctx.fillStyle = '#D4AF37';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText(
      `إجمالي المسجلين: ${persons.length} فرداً — الصفحة ${pageIdx + 1} من ${totalPages}`,
      W / 2,
      110
    );

    // Table Header
    let curY = 150;
    ctx.fillStyle = '#E2E8F0';
    drawRoundedRect(ctx, 48, curY, W - 96, 38, 8);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText('#', W - 64, curY + 24);
    ctx.fillText('الاسم الأول', W - 110, curY + 24);
    ctx.fillText('الجنس', 420, curY + 24);
    ctx.fillText('الأب المباشر', 330, curY + 24);
    ctx.fillText('عدد الفروع', 155, curY + 24);
    curY += 44;

    for (let i = 0; i < slice.length; i++) {
      const p = slice[i];
      const globalNum = pageIdx * ROWS_PER_PAGE + i + 1;
      const father = p.fatherId ? getPerson(p.fatherId) : undefined;
      const kids = getChildren(p.id);

      ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      drawRoundedRect(ctx, 48, curY, W - 96, 46, 6);
      ctx.fill();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.fillText(String(globalNum), W - 64, curY + 28);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 14px Cairo, sans-serif';
      ctx.fillText(extractGivenName(p.fullName), W - 110, curY + 28);

      ctx.fillStyle = p.gender === 'male' ? '#065F46' : '#9F1239';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.fillText(p.gender === 'male' ? 'ذكر' : 'أنثى', 420, curY + 28);

      ctx.fillStyle = '#334155';
      ctx.font = '600 13px Cairo, sans-serif';
      ctx.fillText(
        father ? extractGivenName(father.fullName) : 'أصل شجرة',
        330,
        curY + 28
      );

      ctx.fillStyle = '#0F4C3A';
      ctx.font = 'bold 12px Cairo, sans-serif';
      const extraInfo = p.gender === 'male' ? `${kids.length} أبناء` : '—';
      ctx.fillText(extraInfo, 155, curY + 28);

      curY += 50;
    }

    // Page Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 12px Cairo, sans-serif';
    ctx.fillText(
      `سجل شجرة العائلة — تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')} م — صفحة ${pageIdx + 1} / ${totalPages}`,
      W / 2,
      H - 42
    );

    pagesData.push({
      jpegBytes: canvasToJpegBytes(canvas, 0.92),
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt: 595.28,
      pageHeightPt: 841.89
    });
  }

  const pdfBlob = createPdfBlobFromJpegPages(pagesData);
  triggerBlobDownload(pdfBlob, 'سجل_أفراد_شجرة_العائلة.pdf');
}
