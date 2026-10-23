import { Person } from '../types/family';
import { calculateKinship, getCoupleRelationship, KinshipInfo } from './kinship';
import { extractGivenName, formatAppName, formatBranchName, formatNameWithLimit } from './nameUtils';

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
  includeFemales?: boolean;
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

  function measureTree(person: Person, depth: number) {
    visitedMeasure.add(person.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    const kids = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter((c) => !visitedMeasure.has(c.id));
    if (kids.length === 0) {
      leafCount++;
    } else {
      for (const kid of kids) {
        measureTree(kid, depth + 1);
      }
    }
  }
  measureTree(rootPerson, 1);

  const isLandscape = orientation === 'landscape';

  // 2. High-Definition Node Card Sizing (All cards of each generation on the exact same row)
  let NODE_W = 320;
  let NODE_H = 152;
  let H_GAP = 32;

  if (leafCount <= 12) {
    NODE_W = 360;
    NODE_H = 168;
    H_GAP = 42;
  } else if (leafCount <= 25) {
    NODE_W = 310;
    NODE_H = 152;
    H_GAP = 32;
  } else if (leafCount <= 45) {
    NODE_W = 275;
    NODE_H = 142;
    H_GAP = 24;
  } else if (leafCount <= 75) {
    NODE_W = 248;
    NODE_H = 134;
    H_GAP = 20;
  } else {
    NODE_W = 228;
    NODE_H = 128;
    H_GAP = 16;
  }

  const isUpward = mode === 'organic' && organicDirection === 'up';
  const HEADER_H = 230;
  const FOOTER_H = 85;
  const SIDE_PAD = 90;
  const TOP_TREE_PAD = 80;
  const BOTTOM_TREE_PAD = isUpward ? 175 : 85;
  const LEVEL_H = Math.max(255, Math.round(NODE_H * 1.82));

  // 3. Recursive Layout Builder (Every generation strictly on its single horizontal row)
  function buildLayout(person: Person, depth: number, visitedSet: Set<string>): TreeLayoutNode {
    visitedSet.add(person.id);
    const children = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter((c) => !visitedSet.has(c.id));
    const maleChildrenCount = children.filter((c) => c.gender === 'male').length;
    const femaleChildrenCount = children.filter((c) => c.gender === 'female').length;

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

    const childrenLayouts = children.map((ch) => buildLayout(ch, depth + 1, visitedSet));
    const childrenTotalW =
      childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
      Math.max(0, childrenLayouts.length - 1) * H_GAP;

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
  const rootLayout = buildLayout(rootPerson, 1, visitedLayout);

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

  function getDepthCenterY(depth: number): number {
    if (isUpward) {
      return HEADER_H + TOP_TREE_PAD + (maxDepth - depth) * LEVEL_H + NODE_H / 2;
    }
    return HEADER_H + TOP_TREE_PAD + (depth - 1) * LEVEL_H + NODE_H / 2;
  }

  function assignCoords(node: TreeLayoutNode, leftX: number) {
    node.x = leftX + node.subtreeWidth / 2;
    node.y = getDepthCenterY(node.depth);
    flatNodes.push(node);

    if (node.childrenLayouts.length === 0) return;

    const totalChildrenW =
      node.childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
      Math.max(0, node.childrenLayouts.length - 1) * H_GAP;

    let currentRight = leftX + (node.subtreeWidth + totalChildrenW) / 2;
    const fromY = isUpward ? node.y - NODE_H / 2 : node.y + NODE_H / 2;

    for (const ch of node.childrenLayouts) {
      const chLeft = currentRight - ch.subtreeWidth;
      currentRight = chLeft - H_GAP;

      assignCoords(ch, chLeft);
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

  const initialLogicalW = Math.max(1800, rootLayout.subtreeWidth + SIDE_PAD * 2);
  assignCoords(rootLayout, (initialLogicalW - rootLayout.subtreeWidth) / 2);

  // 4. Verify Vertical & Horizontal Bounds
  let minNodeTop = Infinity;
  let maxNodeBottom = -Infinity;
  for (const n of flatNodes) {
    if (n.y - NODE_H / 2 < minNodeTop) minNodeTop = n.y - NODE_H / 2;
    if (n.y + NODE_H / 2 > maxNodeBottom) maxNodeBottom = n.y + NODE_H / 2;
  }

  const minTopAllowed = HEADER_H + TOP_TREE_PAD;
  if (minNodeTop < minTopAllowed) {
    const shiftDown = minTopAllowed - minNodeTop;
    for (const n of flatNodes) n.y += shiftDown;
    for (const l of links) {
      l.fromY += shiftDown;
      l.toY += shiftDown;
    }
    maxNodeBottom += shiftDown;
  }

  const logicalW = initialLogicalW;
  const logicalH = Math.max(920, Math.ceil(maxNodeBottom + BOTTOM_TREE_PAD + FOOTER_H));

  // 5. High-Resolution Canvas Allocation with Hardware Backing-Store Verification
  //    Because all cards of a generation sit on a single row, logicalH is compact,
  //    allowing wide high-DPI canvases up to 16,384 px / 20,480 px with crystal-clear text.
  const maxLogicalDim = Math.max(logicalW, logicalH);
  const totalLogicalPixels = logicalW * logicalH;

  const limitProfiles = [
    { maxDim: 20480, maxPixels: 50_000_000, desiredScale: 2.6 },
    { maxDim: 16384, maxPixels: 42_000_000, desiredScale: 2.4 },
    { maxDim: 12288, maxPixels: 34_000_000, desiredScale: 2.0 },
    { maxDim: 8192, maxPixels: 22_000_000, desiredScale: 1.6 }
  ];

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1.5;

  for (const profile of limitProfiles) {
    const maxDimScale = profile.maxDim / maxLogicalDim;
    const maxAreaScale = Math.sqrt(profile.maxPixels / totalLogicalPixels);
    const candidateScale = Math.max(0.35, Math.min(profile.desiredScale, maxDimScale, maxAreaScale));

    const testW = Math.max(100, Math.round(logicalW * candidateScale));
    const testH = Math.max(100, Math.round(logicalH * candidateScale));

    try {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = testW;
      testCanvas.height = testH;
      const testCtx = testCanvas.getContext('2d');
      if (testCtx) {
        // Verify GPU backing store is genuinely allocated at the far corner
        testCtx.fillStyle = '#000000';
        testCtx.fillRect(testW - 2, testH - 2, 2, 2);
        const pixel = testCtx.getImageData(testW - 1, testH - 1, 1, 1).data;
        if (pixel[3] === 255) {
          testCtx.clearRect(0, 0, testW, testH);
          canvas = testCanvas;
          ctx = testCtx;
          scale = candidateScale;
          break;
        }
      }
    } catch (e) {
      // Try next profile down
    }
  }

  if (!canvas || !ctx) {
    throw new Error('تعذر حجز ذاكرة الرسم في المتصفح لكبر حجم الشجرة.');
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
  ctx.lineWidth = unconstrained ? 10 : 8;
  ctx.strokeRect(20, 20, logicalW - 40, logicalH - 40);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = unconstrained ? 4 : 3.5;
  ctx.strokeRect(32, 32, logicalW - 64, logicalH - 64);

  // Header Banner
  const bannerLeft = 50;
  const bannerTop = 42;
  const bannerW = logicalW - 100;
  const bannerH = HEADER_H - 36;

  ctx.fillStyle = '#064E3B';
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.fill();

  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.stroke();

  const rootFirstName = extractGivenName(rootPerson.fullName);
  const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "900 52px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(`شجرة ${fullRootTitle}`, logicalW / 2, bannerTop + 72);

  ctx.fillStyle = '#FDE68A';
  ctx.font = "900 26px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(
    `إجمالي الأفراد: ${totalNodes} فرداً   ·   عدد الأجيال: ${maxDepth} أجيال   ·   تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`,
    logicalW / 2,
    bannerTop + 138
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

  // Standard Connecting Lines
  for (const link of links) {
    if (mode === 'organic') {
      const ctrlY1 = link.fromY + (link.toY - link.fromY) * 0.45;
      const ctrlY2 = link.fromY + (link.toY - link.fromY) * 0.55;
      const strokeW = Math.max(6, 15 - link.depth * 1.4);

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
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(link.fromX, link.fromY);
      ctx.lineTo(link.fromX, midY);
      ctx.lineTo(link.toX, midY);
      ctx.lineTo(link.toX, link.toY);
      ctx.stroke();
    }
  }

  // Nodes Drawing (Ultra-Clear, High-Contrast Cards)
  for (const node of flatNodes) {
    const { person, depth, x, y } = node;
    const isRoot = depth === 1;
    const left = x - NODE_W / 2;
    const top = y - NODE_H / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;

    if (isRoot) {
      const rootGrad = ctx.createLinearGradient(left, top, left, top + NODE_H);
      rootGrad.addColorStop(0, '#093829');
      rootGrad.addColorStop(1, '#0F4C3A');
      ctx.fillStyle = rootGrad;
    } else if (person.gender === 'male') {
      ctx.fillStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = '#FFF1F2';
    }

    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 20);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = isRoot ? 6.5 : 4.5;
    ctx.strokeStyle = isRoot
      ? '#D4AF37'
      : person.gender === 'male'
      ? '#064E3B'
      : '#BE123C';
    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 20);
    ctx.stroke();

    // Badges: Generation & Gender
    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const badgeFont = Math.min(24, Math.max(15, Math.floor(NODE_H * 0.155)));
    ctx.font = `900 ${badgeFont}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
    ctx.textBaseline = 'middle';

    const badgeY = top + Math.round(NODE_H * 0.20);
    const dividerY = top + Math.round(NODE_H * 0.34);

    // Right Badge (Generation)
    ctx.textAlign = 'right';
    ctx.fillStyle = isRoot ? '#FDE68A' : '#0F4C3A';
    ctx.fillText(genLabel, left + NODE_W - 20, badgeY);

    // Left Badge (Gender)
    ctx.textAlign = 'left';
    ctx.fillStyle = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';
    ctx.fillText(genderLabel, left + 20, badgeY);

    // Inner dividing line
    ctx.strokeStyle = isRoot ? 'rgba(253, 230, 138, 0.5)' : 'rgba(15, 23, 42, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 16, dividerY);
    ctx.lineTo(left + NODE_W - 16, dividerY);
    ctx.stroke();

    // ------------------------------------------------------------------------
    // HIGH-DEFINITION CRYSTAL CLEAR NAME TYPOGRAPHY
    // ------------------------------------------------------------------------
    const displayName = isRoot
      ? formatAppName(person.fullName)
      : extractGivenName(person.fullName);

    const maxTextWidth = NODE_W - 32;
    const textCenterX = left + NODE_W / 2;
    const cardContentHeight = NODE_H - (dividerY - top);
    const textCenterY = dividerY + cardContentHeight / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let nameFontSize = Math.min(62, Math.floor(NODE_H * 0.41));
    ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;

    while (nameFontSize > 22 && ctx.measureText(displayName).width > maxTextWidth) {
      nameFontSize -= 2;
      ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
    }

    ctx.fillStyle = isRoot ? '#FFFFFF' : '#000000';
    ctx.fillText(displayName, textCenterX, textCenterY);
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0F172A';
  ctx.font = "900 22px Cairo, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `شجرة ${fullRootTitle}`,
    logicalW / 2,
    logicalH - 36
  );

  return { canvas, rootFirstName, isLandscape };
}

/**
 * Export Vector SVG Image (.svg) with Infinite Zoom and 100% Vector Crispness
 */
export async function generateTreeSvgBlob(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
  rootFirstName: string;
}> {
  const {
    rootPerson,
    getChildren,
    mode,
    organicDirection = 'up',
    collapsedNodes = new Set<string>()
  } = options;

  await ensureCairoFontLoaded();

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const visitedMeasure = new Set<string>();
  let maxDepth = 1;
  let totalNodes = 0;

  function measureTree(person: Person, depth: number) {
    visitedMeasure.add(person.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;
    const kids = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter((c) => !visitedMeasure.has(c.id));
    for (const kid of kids) {
      measureTree(kid, depth + 1);
    }
  }
  measureTree(rootPerson, 1);

  const NODE_W = 300;
  const NODE_H = 150;
  const H_GAP = 32;
  const isUpward = mode === 'organic' && organicDirection === 'up';
  const HEADER_H = 230;
  const FOOTER_H = 85;
  const SIDE_PAD = 90;
  const TOP_TREE_PAD = 80;
  const BOTTOM_TREE_PAD = isUpward ? 175 : 85;
  const LEVEL_H = 270;

  function buildLayout(person: Person, depth: number, visitedSet: Set<string>): TreeLayoutNode {
    visitedSet.add(person.id);
    const children = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter((c) => !visitedSet.has(c.id));
    const maleChildrenCount = children.filter((c) => c.gender === 'male').length;
    const femaleChildrenCount = children.filter((c) => c.gender === 'female').length;

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

    const childrenLayouts = children.map((ch) => buildLayout(ch, depth + 1, visitedSet));
    const childrenTotalW =
      childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
      Math.max(0, childrenLayouts.length - 1) * H_GAP;

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
  const links: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    depth: number;
    childGender: 'male' | 'female';
    childHasChildren: boolean;
  }[] = [];

  function getDepthCenterY(depth: number): number {
    if (isUpward) {
      return HEADER_H + TOP_TREE_PAD + (maxDepth - depth) * LEVEL_H + NODE_H / 2;
    }
    return HEADER_H + TOP_TREE_PAD + (depth - 1) * LEVEL_H + NODE_H / 2;
  }

  function assignCoords(node: TreeLayoutNode, leftX: number) {
    node.x = leftX + node.subtreeWidth / 2;
    node.y = getDepthCenterY(node.depth);
    flatNodes.push(node);

    if (node.childrenLayouts.length > 0) {
      const totalChildrenW =
        node.childrenLayouts.reduce((acc, c) => acc + c.subtreeWidth, 0) +
        Math.max(0, node.childrenLayouts.length - 1) * H_GAP;

      let currentRight = leftX + (node.subtreeWidth + totalChildrenW) / 2;
      const fromY = isUpward ? node.y - NODE_H / 2 : node.y + NODE_H / 2;

      for (const ch of node.childrenLayouts) {
        const chLeft = currentRight - ch.subtreeWidth;
        assignCoords(ch, chLeft);
        currentRight = chLeft - H_GAP;

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

  const logicalW = Math.max(1800, rootLayout.subtreeWidth + SIDE_PAD * 2);
  assignCoords(rootLayout, (logicalW - rootLayout.subtreeWidth) / 2);

  let maxNodeBottom = 0;
  for (const n of flatNodes) {
    if (n.y + NODE_H / 2 > maxNodeBottom) maxNodeBottom = n.y + NODE_H / 2;
  }
  const logicalH = Math.max(920, Math.ceil(maxNodeBottom + BOTTOM_TREE_PAD + FOOTER_H));

  const rootFirstName = extractGivenName(rootPerson.fullName);
  const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;

  let svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svgStr += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logicalW} ${logicalH}" width="${logicalW}" height="${logicalH}" dir="rtl">\n`;
  svgStr += `<defs>\n`;
  svgStr += `  <style>\n`;
  svgStr += `    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&amp;display=swap');\n`;
  svgStr += `    text { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; dominant-baseline: central; }\n`;
  svgStr += `  </style>\n`;
  svgStr += `  <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">\n`;
  svgStr += `    <stop offset="0%" stop-color="#FFFFFF" />\n`;
  svgStr += `    <stop offset="50%" stop-color="#FDFBF7" />\n`;
  svgStr += `    <stop offset="100%" stop-color="#F6EFE5" />\n`;
  svgStr += `  </linearGradient>\n`;
  svgStr += `  <linearGradient id="rootGrad" x1="0" y1="0" x2="0" y2="1">\n`;
  svgStr += `    <stop offset="0%" stop-color="#093829" />\n`;
  svgStr += `    <stop offset="100%" stop-color="#0F4C3A" />\n`;
  svgStr += `  </linearGradient>\n`;
  svgStr += `</defs>\n`;

  // Background & Borders
  svgStr += `<rect width="100%" height="100%" fill="url(#bgGrad)" />\n`;
  svgStr += `<rect x="20" y="20" width="${logicalW - 40}" height="${logicalH - 40}" fill="none" stroke="#064E3B" stroke-width="10" />\n`;
  svgStr += `<rect x="32" y="32" width="${logicalW - 64}" height="${logicalH - 64}" fill="none" stroke="#D97706" stroke-width="4" />\n`;

  // Header Banner
  const bannerLeft = 50;
  const bannerTop = 42;
  const bannerW = logicalW - 100;
  const bannerH = HEADER_H - 36;
  svgStr += `<rect x="${bannerLeft}" y="${bannerTop}" width="${bannerW}" height="${bannerH}" rx="22" fill="#064E3B" stroke="#D97706" stroke-width="4" />\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + 72}" text-anchor="middle" font-size="52" font-weight="900" fill="#FFFFFF">${escapeXml(`شجرة ${fullRootTitle}`)}</text>\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + 138}" text-anchor="middle" font-size="26" font-weight="900" fill="#FDE68A">${escapeXml(`إجمالي الأفراد: ${totalNodes} فرداً   ·   عدد الأجيال: ${maxDepth} أجيال   ·   تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`)}</text>\n`;

  // Organic Trunk if applicable
  if (mode === 'organic' && isUpward) {
    const rx = rootLayout.x;
    const ry = rootLayout.y;
    const baseY = ry + Math.round(NODE_H * 0.72);
    svgStr += `<ellipse cx="${rx}" cy="${baseY}" rx="260" ry="36" fill="rgba(92, 58, 33, 0.2)" />\n`;
    svgStr += `<path d="M ${rx - 50} ${baseY} Q ${rx - 28} ${ry + 70} ${rx - 18} ${ry + NODE_H / 2} L ${rx + 18} ${ry + NODE_H / 2} Q ${rx + 28} ${ry + 70} ${rx + 50} ${baseY} Z" fill="#5C3A21" />\n`;
    svgStr += `<text x="${rx}" y="${baseY + 28}" text-anchor="middle" font-size="22" font-weight="900" fill="#4A2C11">جذر الشجرة وأصلها الراسخ</text>\n`;
  }

  // Links
  links.forEach((l) => {
    if (mode === 'organic') {
      const ctrlY1 = l.fromY + (l.toY - l.fromY) * 0.45;
      const ctrlY2 = l.fromY + (l.toY - l.fromY) * 0.55;
      const strokeW = Math.max(6, 15 - l.depth * 1.4);
      const strokeColor =
        l.depth === 1
          ? '#5C3A21'
          : l.childGender === 'female' && !l.childHasChildren
          ? '#9F1239'
          : '#064E3B';
      svgStr += `<path d="M ${l.fromX} ${l.fromY} C ${l.fromX} ${ctrlY1}, ${l.toX} ${ctrlY2}, ${l.toX} ${l.toY}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round" />\n`;
    } else {
      const midY = (l.fromY + l.toY) / 2;
      svgStr += `<path d="M ${l.fromX} ${l.fromY} L ${l.fromX} ${midY} L ${l.toX} ${midY} L ${l.toX} ${l.toY}" fill="none" stroke="#064E3B" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }
  });

  // Nodes
  flatNodes.forEach((node) => {
    const { person, depth, x, y } = node;
    const isRoot = depth === 1;
    const left = x - NODE_W / 2;
    const top = y - NODE_H / 2;

    const fill = isRoot ? 'url(#rootGrad)' : person.gender === 'female' ? '#FFF1F2' : '#FFFFFF';
    const stroke = isRoot ? '#D4AF37' : person.gender === 'male' ? '#064E3B' : '#BE123C';
    const strokeW = isRoot ? 6.5 : 4.5;

    const badgeY = top + Math.round(NODE_H * 0.20);
    const dividerY = top + Math.round(NODE_H * 0.34);
    const cardContentHeight = NODE_H - (dividerY - top);
    const textCenterY = dividerY + cardContentHeight / 2;

    svgStr += `<g>\n`;
    svgStr += `  <rect x="${left}" y="${top}" width="${NODE_W}" height="${NODE_H}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" />\n`;

    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const genColor = isRoot ? '#FDE68A' : '#0F4C3A';
    const genderColor = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';

    svgStr += `  <text x="${left + NODE_W - 20}" y="${badgeY}" text-anchor="start" font-size="22" font-weight="900" fill="${genColor}">${escapeXml(genLabel)}</text>\n`;
    svgStr += `  <text x="${left + 20}" y="${badgeY}" text-anchor="end" font-size="22" font-weight="900" fill="${genderColor}">${escapeXml(genderLabel)}</text>\n`;
    svgStr += `  <line x1="${left + 16}" y1="${dividerY}" x2="${left + NODE_W - 16}" y2="${dividerY}" stroke="${isRoot ? 'rgba(253,230,138,0.5)' : 'rgba(15,23,42,0.2)'}" stroke-width="2" />\n`;

    const displayName = isRoot ? formatAppName(person.fullName) : extractGivenName(person.fullName);
    const textColor = isRoot ? '#FFFFFF' : '#000000';
    const nameFontSize = displayName.length > 14 ? 36 : displayName.length > 10 ? 44 : 54;
    svgStr += `  <text x="${left + NODE_W / 2}" y="${textCenterY}" text-anchor="middle" font-size="${nameFontSize}" font-weight="900" fill="${textColor}">${escapeXml(displayName)}</text>\n`;
    svgStr += `</g>\n`;
  });

  // Footer
  svgStr += `<text x="${logicalW / 2}" y="${logicalH - 36}" text-anchor="middle" font-size="22" font-weight="900" fill="#0F172A">${escapeXml(`شجرة ${fullRootTitle}`)}</text>\n`;
  svgStr += `</svg>`;

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `شجرة_العائلة_للمطابع_${rootFirstName}.svg`.replace(/[\\/:*?"<>|]/g, '_');
  return { blob, filename, rootFirstName };
}

export async function exportTreeToSvg(options: ExportTreePdfOptions) {
  const { blob, filename } = await generateTreeSvgBlob(options);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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

export async function generateTreePdfBlob(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
  rootFirstName: string;
}> {
  const { rootPerson, getChildren, includeFemales = true } = options;

  await ensureCairoFontLoaded();

  const rootFirstName = extractGivenName(rootPerson.fullName);

  // ============================================================================
  // 1. COLLECT SEQUENTIAL FATHER BLOCKS FOR A4 REVIEW
  //    Traverses the entire tree starting from rootPerson (ignoring collapsed state
  //    so all fathers and branches are included for paper review).
  // ============================================================================
  interface ReviewChildItem {
    person: Person;
    firstName: string;
    hasBranches: boolean;
    childrenCount: number;
    branchSeq?: number; // Sequence number of this son's own Father Block
  }

  interface FatherReviewBlock {
    seq: number;
    father: Person;
    firstName: string;
    ancestorChainFirstNames: string[]; // First names of father, grandfather, etc. up to root
    depth: number;
    sons: ReviewChildItem[];
    daughters: ReviewChildItem[];
  }

  const fatherBlocks: FatherReviewBlock[] = [];
  const personToSeqMap = new Map<string, number>();
  const visitedIds = new Set<string>();
  let totalIndividualsCount = 0;

  // Pre-order traversal so each father is followed logically by his sons who have branches
  function collectFathersRecursive(person: Person, depth: number, ancestorFirstNames: string[]) {
    if (visitedIds.has(person.id)) return;
    visitedIds.add(person.id);
    totalIndividualsCount++;

    const rawChildren = getChildren(person.id).filter((c) => !visitedIds.has(c.id));
    const allChildren = includeFemales ? rawChildren : rawChildren.filter((c) => c.gender === 'male');
    const maleChildren = allChildren.filter((c) => c.gender === 'male');
    const femaleChildren = includeFemales ? allChildren.filter((c) => c.gender === 'female') : [];

    // Count leaf children towards total individuals
    const hasChildren = allChildren.length > 0;
    if (!hasChildren && depth > 1) {
      return;
    }

    const firstName = extractGivenName(person.fullName);
    const seq = fatherBlocks.length + 1;
    personToSeqMap.set(person.id, seq);

    const sons: ReviewChildItem[] = maleChildren.map((son) => {
      const sonChildren = getChildren(son.id);
      const filteredSonChildren = includeFemales ? sonChildren : sonChildren.filter((c) => c.gender === 'male');
      return {
        person: son,
        firstName: extractGivenName(son.fullName),
        hasBranches: filteredSonChildren.length > 0,
        childrenCount: filteredSonChildren.length
      };
    });

    const daughters: ReviewChildItem[] = femaleChildren.map((daughter) => {
      const daughterChildren = getChildren(daughter.id);
      return {
        person: daughter,
        firstName: extractGivenName(daughter.fullName),
        hasBranches: daughterChildren.length > 0,
        childrenCount: daughterChildren.length
      };
    });

    const block: FatherReviewBlock = {
      seq,
      father: person,
      firstName,
      ancestorChainFirstNames: ancestorFirstNames,
      depth,
      sons,
      daughters
    };

    fatherBlocks.push(block);

    const nextAncestors = [firstName, ...ancestorFirstNames];

    // Traverse each child who has branches (sons first, then any child with branches)
    for (const child of allChildren) {
      const grandChildren = getChildren(child.id);
      if (grandChildren.length > 0) {
        collectFathersRecursive(child, depth + 1, nextAncestors);
      } else {
        visitedIds.add(child.id);
        totalIndividualsCount++;
      }
    }
  }

  collectFathersRecursive(rootPerson, 1, []);

  // Link each son who has branches to his assigned Father Block sequence number (#seq)
  for (const block of fatherBlocks) {
    for (const son of block.sons) {
      const targetSeq = personToSeqMap.get(son.person.id);
      if (targetSeq) {
        son.branchSeq = targetSeq;
      }
    }
  }

  // ============================================================================
  // 2. PAGINATE & RENDER SEQUENTIAL A4 PORTRAIT SHEETS
  //    A4 Portrait Logical Size: 1240 x 1754 px (Scale 2x = 2480 x 3508 px @ 300 DPI)
  // ============================================================================
  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const SCALE = 2;

  const MARGIN_X = 56;
  const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1128 px
  const FOOTER_RESERVED_H = 86;
  const MAX_CONTENT_Y = PAGE_H - FOOTER_RESERVED_H;

  const COLS_PER_ROW = 4;
  const LABEL_COL_W = 158;
  const PILLS_AREA_W = CONTENT_W - LABEL_COL_W - 36; // 934 px
  const PILL_GAP_X = 12;
  const PILL_GAP_Y = 10;
  const PILL_W = Math.floor((PILLS_AREA_W - PILL_GAP_X * (COLS_PER_ROW - 1)) / COLS_PER_ROW);
  const PILL_H = 42;

  // Calculate exact pixel height of a FatherReviewBlock before drawing
  function measureFatherBlockHeight(block: FatherReviewBlock): number {
    const headerH = 58;
    const sonsRows = Math.max(1, Math.ceil(block.sons.length / COLS_PER_ROW));
    const sonsSectionH = sonsRows * PILL_H + (sonsRows - 1) * PILL_GAP_Y + 24;

    if (!includeFemales) {
      return headerH + sonsSectionH;
    }

    const daughtersRows = Math.max(1, Math.ceil(block.daughters.length / COLS_PER_ROW));
    const dividerH = 1;
    const daughtersSectionH = daughtersRows * PILL_H + (daughtersRows - 1) * PILL_GAP_Y + 24;

    return headerH + sonsSectionH + dividerH + daughtersSectionH;
  }

  // Group blocks into A4 pages without cutting any father block in half
  const pagesBlocks: FatherReviewBlock[][] = [];
  let currentPageList: FatherReviewBlock[] = [];
  const FIRST_PAGE_START_Y = 236;
  const NEXT_PAGE_START_Y = 132;
  const BLOCK_GAP_Y = 22;

  let testY = FIRST_PAGE_START_Y;

  for (const block of fatherBlocks) {
    const blockH = measureFatherBlockHeight(block);
    if (currentPageList.length > 0 && testY + blockH > MAX_CONTENT_Y) {
      pagesBlocks.push(currentPageList);
      currentPageList = [block];
      testY = NEXT_PAGE_START_Y + blockH + BLOCK_GAP_Y;
    } else {
      currentPageList.push(block);
      testY += blockH + BLOCK_GAP_Y;
    }
  }
  if (currentPageList.length > 0) {
    pagesBlocks.push(currentPageList);
  }

  const totalPages = Math.max(1, pagesBlocks.length);
  const dateStr = new Date().toLocaleDateString('ar-SA');

  const pdfPages: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[] = [];

  // Render each A4 page onto an offscreen canvas
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const blocksOnPage = pagesBlocks[pageIdx] || [];
    const isFirstPage = pageIdx === 0;

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W * SCALE;
    canvas.height = PAGE_H * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
    ctx.direction = 'rtl';

    // 1. Clean A4 Paper Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Subtle Outer & Inner Page Frame for A4 Print
    ctx.strokeStyle = '#0F4C3A';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, PAGE_W - 56, PAGE_H - 56);

    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(35, 35, PAGE_W - 70, PAGE_H - 70);

    let curY = 52;

    // 2. Page Header
    if (isFirstPage) {
      // Main Document Banner on Page 1
      const headerBoxH = 124;
      const headerGrad = ctx.createLinearGradient(MARGIN_X, curY, PAGE_W - MARGIN_X, curY + headerBoxH);
      headerGrad.addColorStop(0, '#093829');
      headerGrad.addColorStop(0.5, '#0F4C3A');
      headerGrad.addColorStop(1, '#145E48');

      ctx.fillStyle = headerGrad;
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, headerBoxH, 16);
      ctx.fill();

      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, headerBoxH, 16);
      ctx.stroke();

      // Right Side Title & Root Info
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 32px Cairo, sans-serif';
      ctx.fillText(`شجرة ${rootFirstName}`, PAGE_W - MARGIN_X - 24, curY + 46);

      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 16px Cairo, sans-serif';
      ctx.fillText(
        `الآباء وفروعهم بالتسلسل (أبناؤه الذكور ثم بناته الإناث بالاسم الأول)`,
        PAGE_W - MARGIN_X - 24,
        curY + 88
      );

      // Left Side Summary Badges
      const statsBoxW = 270;
      const statsBoxX = MARGIN_X + 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      drawRoundedRect(ctx, statsBoxX, curY + 16, statsBoxW, headerBoxH - 32, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, statsBoxX, curY + 16, statsBoxW, headerBoxH - 32, 12);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 15px Cairo, sans-serif';
      ctx.fillText(`عدد الآباء (أصحاب الفروع): ${fatherBlocks.length}`, statsBoxX + statsBoxW - 16, curY + 38);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px Cairo, sans-serif';
      ctx.fillText(`إجمالي الأفراد المسجلين: ${totalIndividualsCount}`, statsBoxX + statsBoxW - 16, curY + 64);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText(`تاريخ الإصدار: ${dateStr} م`, statsBoxX + statsBoxW - 16, curY + 88);

      curY += headerBoxH + 12;

      // Instruction / Color Legend Strip
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, 36, 10);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, 36, 10);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F4C3A';
      ctx.font = 'bold 14px Cairo, sans-serif';
      ctx.fillText('● اللون الأخضر: الأب وأبناؤه الذكور', PAGE_W - MARGIN_X - 18, curY + 18);

      ctx.fillStyle = '#9F1239';
      ctx.fillText('● اللون الوردي: بناته الإناث', PAGE_W - MARGIN_X - 270, curY + 18);

      ctx.fillStyle = '#92400E';
      ctx.fillText('● علامة (فروعه #...): تشير لرقم بطاقة الابن لاستكمال مراجعة أبنائه وبناته بالترتيب', PAGE_W - MARGIN_X - 480, curY + 18);

      curY = FIRST_PAGE_START_Y;
    } else {
      // Compact Running Header for Pages 2..N
      const runH = 60;
      ctx.fillStyle = '#F1F5F9';
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, runH, 12);
      ctx.fill();
      ctx.strokeStyle = '#0F4C3A';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, runH, 12);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0F4C3A';
      ctx.font = '900 22px Cairo, sans-serif';
      ctx.fillText(`شجرة ${rootFirstName}`, PAGE_W - MARGIN_X - 20, curY + 30);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 15px Cairo, sans-serif';
      ctx.fillText(`صفحة ${pageIdx + 1} من ${totalPages}`, MARGIN_X + 20, curY + 30);

      curY = NEXT_PAGE_START_Y;
    }

    // 3. Render Father Blocks Sequentially
    for (const block of blocksOnPage) {
      const blockH = measureFatherBlockHeight(block);
      const isRootBlock = block.depth === 1;

      const sonsRows = Math.max(1, Math.ceil(block.sons.length / COLS_PER_ROW));
      const daughtersRows = Math.max(1, Math.ceil(block.daughters.length / COLS_PER_ROW));
      const headerH = 58;
      const sonsSectionH = sonsRows * PILL_H + (sonsRows - 1) * PILL_GAP_Y + 24;
      const daughtersSectionH = daughtersRows * PILL_H + (daughtersRows - 1) * PILL_GAP_Y + 24;

      // Card Base Shadow & Fill
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, blockH, 14);
      ctx.fill();
      ctx.restore();

      // Top Header Strip for Father
      ctx.save();
      ctx.beginPath();
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, blockH, 14);
      ctx.clip();

      ctx.fillStyle = isRootBlock ? '#093829' : '#0F4C3A';
      ctx.fillRect(MARGIN_X, curY, CONTENT_W, headerH);

      // Gold bottom accent under father header
      ctx.fillStyle = '#D4AF37';
      ctx.fillRect(MARGIN_X, curY + headerH - 3, CONTENT_W, 3);

      // Sequence Number Badge on far right
      const seqBadgeW = 78;
      const seqBadgeH = 36;
      const seqBadgeX = PAGE_W - MARGIN_X - seqBadgeW - 16;
      const seqBadgeY = curY + (headerH - seqBadgeH) / 2;

      ctx.fillStyle = '#D4AF37';
      drawRoundedRect(ctx, seqBadgeX, seqBadgeY, seqBadgeW, seqBadgeH, 9);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 17px Cairo, sans-serif';
      ctx.fillText(`#${block.seq}`, seqBadgeX + seqBadgeW / 2, seqBadgeY + seqBadgeH / 2 + 1);

      // Father Name (First Name prominently + short ancestor chain for review clarity)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 23px Cairo, sans-serif';
      const fatherTitleText = `الأب: ${block.firstName}`;
      const fatherTitleRightX = seqBadgeX - 16;
      ctx.fillText(fatherTitleText, fatherTitleRightX, curY + headerH / 2);

      const fatherTitleW = ctx.measureText(fatherTitleText).width;

      // Ancestor lineage note next to father's first name so identical first names are never confused
      let lineageHint = '';
      if (isRootBlock) {
        lineageHint = '  (جذر العائلة / الأصل)';
      } else if (block.ancestorChainFirstNames.length > 0) {
        const chainPreview = block.ancestorChainFirstNames.slice(0, 4).join(' بن ');
        lineageHint = `  (ابن ${chainPreview})`;
      }

      if (lineageHint) {
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 16px Cairo, sans-serif';
        ctx.fillText(lineageHint, fatherTitleRightX - fatherTitleW - 6, curY + headerH / 2 + 1);
      }

      // Left Side Badges on Father Header: Generation + Counts
      ctx.textAlign = 'left';
      const statsSummary = includeFemales
        ? `الجيل ${block.depth}   |   أبناؤه: ${block.sons.length}   •   بناته: ${block.daughters.length}`
        : `الجيل ${block.depth}   |   أبناؤه الذكور: ${block.sons.length}`;
      ctx.font = 'bold 15px Cairo, sans-serif';
      const sumW = ctx.measureText(statsSummary).width + 28;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      drawRoundedRect(ctx, MARGIN_X + 16, curY + 12, sumW, 34, 8);
      ctx.fill();

      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(statsSummary, MARGIN_X + 30, curY + headerH / 2 + 1);

      // ======================================================================
      // ROW 1: أبناؤه (الذكور)
      // ======================================================================
      const sonsTopY = curY + headerH;
      ctx.fillStyle = '#F4FBF7';
      ctx.fillRect(MARGIN_X, sonsTopY, CONTENT_W, sonsSectionH);

      // Right Label Box for "أبناؤه"
      const labelBoxX = PAGE_W - MARGIN_X - LABEL_COL_W - 12;
      ctx.fillStyle = '#DCFCE7';
      drawRoundedRect(ctx, labelBoxX, sonsTopY + 12, LABEL_COL_W, sonsSectionH - 24, 10);
      ctx.fill();
      ctx.strokeStyle = '#15803D';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, labelBoxX, sonsTopY + 12, LABEL_COL_W, sonsSectionH - 24, 10);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#064E3B';
      ctx.font = '900 18px Cairo, sans-serif';
      ctx.fillText(`أبناؤه (${block.sons.length})`, labelBoxX + LABEL_COL_W / 2, sonsTopY + sonsSectionH / 2);

      // Sons Pills Grid (RTL from right to left)
      const pillsRightStart = labelBoxX - 14;
      if (block.sons.length === 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 16px Cairo, sans-serif';
        ctx.fillText('— لا يوجد أبناء ذكور مسجلون —', pillsRightStart - 8, sonsTopY + sonsSectionH / 2);
      } else {
        block.sons.forEach((son, idx) => {
          const row = Math.floor(idx / COLS_PER_ROW);
          const col = idx % COLS_PER_ROW;

          const pillRightX = pillsRightStart - col * (PILL_W + PILL_GAP_X);
          const pillLeftX = pillRightX - PILL_W;
          const pillTopY = sonsTopY + 12 + row * (PILL_H + PILL_GAP_Y);

          // Pill box background
          ctx.fillStyle = son.hasBranches ? '#ECFDF5' : '#FFFFFF';
          drawRoundedRect(ctx, pillLeftX, pillTopY, PILL_W, PILL_H, 10);
          ctx.fill();

          ctx.strokeStyle = son.hasBranches ? '#0F4C3A' : '#86EFAC';
          ctx.lineWidth = son.hasBranches ? 2 : 1.3;
          drawRoundedRect(ctx, pillLeftX, pillTopY, PILL_W, PILL_H, 10);
          ctx.stroke();

          // Son number + First Name on the right
          ctx.textAlign = 'right';
          ctx.fillStyle = '#0F172A';
          ctx.font = '900 17px Cairo, sans-serif';
          const maxNameW = son.branchSeq ? PILL_W - 92 : PILL_W - 24;
          const sonLabel = truncateRtlText(ctx, `${idx + 1}. ${son.firstName}`, maxNameW);
          ctx.fillText(sonLabel, pillRightX - 10, pillTopY + PILL_H / 2 + 1);

          // If son has branches, show reference badge on the left of his pill
          if (son.branchSeq) {
            const refText = `فروعه #${son.branchSeq}`;
            ctx.font = 'bold 12px Cairo, sans-serif';
            const refW = Math.min(80, ctx.measureText(refText).width + 14);
            const refX = pillLeftX + 6;
            const refY = pillTopY + 7;
            const refH = PILL_H - 14;

            ctx.fillStyle = '#0F4C3A';
            drawRoundedRect(ctx, refX, refY, refW, refH, 6);
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#FDE68A';
            ctx.fillText(refText, refX + refW / 2, refY + refH / 2 + 1);
          }
        });
      }

      if (includeFemales) {
        // Divider line between Sons and Daughters
        const divY = sonsTopY + sonsSectionH;
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(MARGIN_X, divY);
        ctx.lineTo(MARGIN_X + CONTENT_W, divY);
        ctx.stroke();

        // ======================================================================
        // ROW 2: بناته (الإناث)
        // ======================================================================
        const daughtersTopY = divY + 1;
        ctx.fillStyle = '#FFF9FA';
        ctx.fillRect(MARGIN_X, daughtersTopY, CONTENT_W, daughtersSectionH);

        // Right Label Box for "بناته"
        ctx.fillStyle = '#FFE4E6';
        drawRoundedRect(ctx, labelBoxX, daughtersTopY + 12, LABEL_COL_W, daughtersSectionH - 24, 10);
        ctx.fill();
        ctx.strokeStyle = '#BE123C';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, labelBoxX, daughtersTopY + 12, LABEL_COL_W, daughtersSectionH - 24, 10);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#881337';
        ctx.font = '900 18px Cairo, sans-serif';
        ctx.fillText(`بناته (${block.daughters.length})`, labelBoxX + LABEL_COL_W / 2, daughtersTopY + daughtersSectionH / 2);

        // Daughters Pills Grid (RTL from right to left)
        if (block.daughters.length === 0) {
          ctx.textAlign = 'right';
          ctx.fillStyle = '#94A3B8';
          ctx.font = 'bold 16px Cairo, sans-serif';
          ctx.fillText('— لا توجد بنات مسجلات —', pillsRightStart - 8, daughtersTopY + daughtersSectionH / 2);
        } else {
          block.daughters.forEach((daughter, idx) => {
            const row = Math.floor(idx / COLS_PER_ROW);
            const col = idx % COLS_PER_ROW;

            const pillRightX = pillsRightStart - col * (PILL_W + PILL_GAP_X);
            const pillLeftX = pillRightX - PILL_W;
            const pillTopY = daughtersTopY + 12 + row * (PILL_H + PILL_GAP_Y);

            ctx.fillStyle = '#FFFFFF';
            drawRoundedRect(ctx, pillLeftX, pillTopY, PILL_W, PILL_H, 10);
            ctx.fill();

            ctx.strokeStyle = '#FDA4AF';
            ctx.lineWidth = 1.4;
            drawRoundedRect(ctx, pillLeftX, pillTopY, PILL_W, PILL_H, 10);
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.fillStyle = '#881337';
            ctx.font = '900 17px Cairo, sans-serif';
            const daughterLabel = truncateRtlText(ctx, `${idx + 1}. ${daughter.firstName}`, PILL_W - 22);
            ctx.fillText(daughterLabel, pillRightX - 10, pillTopY + PILL_H / 2 + 1);
          });
        }
      }

      ctx.restore();

      // Card Outer Border
      ctx.strokeStyle = isRootBlock ? '#D4AF37' : '#0F4C3A';
      ctx.lineWidth = isRootBlock ? 2.5 : 1.8;
      drawRoundedRect(ctx, MARGIN_X, curY, CONTENT_W, blockH, 14);
      ctx.stroke();

      curY += blockH + BLOCK_GAP_Y;
    }

    // 4. Page Footer (Page Numbering & A4 Print Note)
    const footerLineY = PAGE_H - 72;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, footerLineY);
    ctx.lineTo(PAGE_W - MARGIN_X, footerLineY);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(
      `شجرة ${rootFirstName}`,
      PAGE_W - MARGIN_X,
      footerLineY + 24
    );

    // Center Page Badge
    const pageBadgeText = `صفحة ${pageIdx + 1} من ${totalPages}`;
    ctx.font = '900 15px Cairo, sans-serif';
    const pbW = ctx.measureText(pageBadgeText).width + 32;
    ctx.fillStyle = '#0F4C3A';
    drawRoundedRect(ctx, (PAGE_W - pbW) / 2, footerLineY + 7, pbW, 32, 8);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FDE68A';
    ctx.fillText(pageBadgeText, PAGE_W / 2, footerLineY + 24);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText(`تاريخ الإصدار: ${dateStr} م`, MARGIN_X, footerLineY + 24);

    const jpegBytes = canvasToJpegBytes(canvas, 0.94);
    pdfPages.push({
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt: 595.28, // Standard A4 Portrait Width in PDF Points
      pageHeightPt: 841.89 // Standard A4 Portrait Height in PDF Points
    });
  }

  const pdfBlob = createPdfBlobFromJpegPages(pdfPages);
  const filename = `شجرة_${rootFirstName}.pdf`.replace(/[\\/:*?"<>|]/g, '_');
  return { blob: pdfBlob, filename, rootFirstName };
}

export async function exportTreeToPdf(options: ExportTreePdfOptions) {
  const { blob, filename } = await generateTreePdfBlob(options);
  triggerBlobDownload(blob, filename);
}

export async function generateTreePngBlob(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
  rootFirstName: string;
}> {
  const { canvas, rootFirstName } = await renderTreeToCanvas({
    ...options,
    collapsedNodes: options.collapsedNodes ?? new Set<string>(),
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

  return { blob, filename: safeName, rootFirstName };
}

export async function exportTreeToPng(options: ExportTreePdfOptions) {
  const { blob, filename } = await generateTreePngBlob(options);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
}

// ============================================================================
// 2. EXPORT PERSON FULL DETAILS, LINEAGE & KINSHIP CERTIFICATE TO PDF
//    - Includes ALL details displayed in PersonModal (Identity, Full Lineage,
//      Origins, Spouse & Couple Relationship, Sons & Daughters, Extended Kinship,
//      and Notes) in a clean, organized multi-page A4 format.
// ============================================================================
function wrapArabicCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = (text || '').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [''];
}

export async function exportPersonCertificateToPdf(options: {
  person: Person;
  lineage: string;
  ancestors: Person[];
  children: Person[];
  kinship?: KinshipInfo;
  allPersons?: Person[];
}) {
  const { person, lineage, ancestors, children, allPersons = [] } = options;
  const kinship =
    options.kinship || (allPersons.length > 0 ? calculateKinship(person.id, allPersons) : undefined);

  await ensureCairoFontLoaded();

  const father = person.fatherId ? allPersons.find((p) => p.id === person.fatherId) || ancestors[0] : ancestors[0];
  const grandfather = father?.fatherId
    ? allPersons.find((p) => p.id === father.fatherId) || ancestors[1]
    : ancestors[1];

  const husbandPerson =
    person.gender === 'female' && person.husbandId
      ? allPersons.find((p) => p.id === person.husbandId)
      : undefined;

  const coupleRelationship =
    person.gender === 'female' && person.husbandId && allPersons.length > 0
      ? getCoupleRelationship(person.id, person.fatherId, person.husbandId, allPersons)
      : null;

  const sons = children.filter((c) => c.gender === 'male');
  const daughters = children.filter((c) => c.gender === 'female');
  const maleMotherChildren = kinship ? kinship.children.filter((c) => c.gender === 'male') : [];
  const femaleMotherChildren = kinship ? kinship.children.filter((c) => c.gender === 'female') : [];

  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_X = 64;
  const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1112px
  const BOTTOM_LIMIT_Y = PAGE_H - 96;

  // Measure scratch context for text wrapping
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = 400;
  scratchCanvas.height = 100;
  const sCtx = scratchCanvas.getContext('2d')!;
  sCtx.direction = 'rtl';

  interface GridCardItem {
    title: string;
    subtitle?: string;
    badge: string;
    theme: 'emerald' | 'rose' | 'amber' | 'slate';
  }

  interface RenderSectionBlock {
    height: number;
    draw: (ctx: CanvasRenderingContext2D, topY: number) => void;
  }

  const blocks: RenderSectionBlock[] = [];

  // Helper to build a titled 2-column grid card block
  function createGridSectionBlock(config: {
    headerTitle: string;
    headerStat?: string;
    headerSubnote?: string;
    headerBg: string;
    headerTextColor: string;
    borderColor: string;
    bodyBg: string;
    items: GridCardItem[];
    emptyText?: string;
  }): RenderSectionBlock {
    const COLS = 2;
    const GAP_X = 16;
    const GAP_Y = 12;
    const PAD = 18;
    const HEADER_H = config.headerSubnote ? 68 : 48;
    const CARD_W = Math.floor((CONTENT_W - PAD * 2 - GAP_X) / COLS);
    const hasSubtitles = config.items.some((it) => Boolean(it.subtitle));
    const CARD_H = hasSubtitles ? 64 : 48;
    const rows = Math.ceil(config.items.length / COLS);
    const bodyH =
      config.items.length === 0
        ? 54
        : PAD * 2 + rows * CARD_H + Math.max(0, rows - 1) * GAP_Y;
    const totalH = HEADER_H + bodyH;

    return {
      height: totalH,
      draw: (ctx, topY) => {
        ctx.save();
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, totalH, 14);
        ctx.clip();

        // Body background
        ctx.fillStyle = config.bodyBg;
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, totalH);

        // Header bar
        ctx.fillStyle = config.headerBg;
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, HEADER_H);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = config.headerTextColor;
        ctx.font = '900 18px Cairo, sans-serif';
        ctx.fillText(
          config.headerTitle,
          MARGIN_X + CONTENT_W - 20,
          config.headerSubnote ? topY + 24 : topY + HEADER_H / 2
        );

        if (config.headerSubnote) {
          ctx.font = 'bold 13px Cairo, sans-serif';
          ctx.fillStyle = '#FEF3C7';
          ctx.fillText(config.headerSubnote, MARGIN_X + CONTENT_W - 20, topY + 49);
        }

        if (config.headerStat) {
          ctx.textAlign = 'left';
          ctx.font = 'bold 14px Cairo, sans-serif';
          ctx.fillStyle = '#FDE68A';
          ctx.fillText(config.headerStat, MARGIN_X + 20, topY + HEADER_H / 2);
        }

        const contentStartY = topY + HEADER_H + PAD;

        if (config.items.length === 0) {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 15px Cairo, sans-serif';
          ctx.fillText(
            config.emptyText || '— لا توجد بيانات مسجلة —',
            MARGIN_X + CONTENT_W / 2,
            topY + HEADER_H + bodyH / 2
          );
        } else {
          config.items.forEach((item, idx) => {
            const r = Math.floor(idx / COLS);
            const c = idx % COLS;
            const cardRightX = MARGIN_X + CONTENT_W - PAD - c * (CARD_W + GAP_X);
            const cardLeftX = cardRightX - CARD_W;
            const cardTopY = contentStartY + r * (CARD_H + GAP_Y);

            let cardBg = '#FFFFFF';
            let cardBorder = '#CBD5E1';
            let badgeBg = '#F1F5F9';
            let badgeText = '#334155';

            if (item.theme === 'emerald') {
              cardBg = '#FFFFFF';
              cardBorder = '#86EFAC';
              badgeBg = '#ECFDF5';
              badgeText = '#0F4C3A';
            } else if (item.theme === 'rose') {
              cardBg = '#FFFFFF';
              cardBorder = '#FDA4AF';
              badgeBg = '#FFF1F2';
              badgeText = '#9F1239';
            } else if (item.theme === 'amber') {
              cardBg = '#FFFFFF';
              cardBorder = '#FCD34D';
              badgeBg = '#FFFBEB';
              badgeText = '#92400E';
            }

            ctx.fillStyle = cardBg;
            drawRoundedRect(ctx, cardLeftX, cardTopY, CARD_W, CARD_H, 10);
            ctx.fill();

            ctx.strokeStyle = cardBorder;
            ctx.lineWidth = 1.4;
            drawRoundedRect(ctx, cardLeftX, cardTopY, CARD_W, CARD_H, 10);
            ctx.stroke();

            // Badge on left
            ctx.font = 'bold 12px Cairo, sans-serif';
            const badgeW = Math.min(115, ctx.measureText(item.badge).width + 20);
            const badgeH = 26;
            const badgeX = cardLeftX + 10;
            const badgeY = cardTopY + (CARD_H - badgeH) / 2;

            ctx.fillStyle = badgeBg;
            drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.fillStyle = badgeText;
            ctx.fillText(item.badge, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

            // Title & optional subtitle on right
            const maxTextW = CARD_W - badgeW - 34;
            ctx.textAlign = 'right';
            ctx.fillStyle = '#0F172A';
            ctx.font = '900 16px Cairo, sans-serif';
            const clippedTitle = truncateRtlText(ctx, item.title, maxTextW);

            if (item.subtitle) {
              ctx.fillText(clippedTitle, cardRightX - 12, cardTopY + 21);
              ctx.fillStyle = item.theme === 'rose' ? '#9F1239' : '#64748B';
              ctx.font = 'bold 12.5px Cairo, sans-serif';
              const clippedSub = truncateRtlText(ctx, item.subtitle, maxTextW);
              ctx.fillText(clippedSub, cardRightX - 12, cardTopY + 45);
            } else {
              ctx.fillText(clippedTitle, cardRightX - 12, cardTopY + CARD_H / 2 + 1);
            }
          });
        }

        ctx.restore();

        ctx.strokeStyle = config.borderColor;
        ctx.lineWidth = 1.8;
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, totalH, 14);
        ctx.stroke();
      }
    };
  }

  // ==========================================================================
  // BLOCK 1: PRIMARY IDENTITY BANNER (الاسم الكامل، الجنس، الزوج، وسلسلة النسب)
  // ==========================================================================
  sCtx.font = 'bold 16px Cairo, sans-serif';
  const lineageLines = wrapArabicCanvasText(sCtx, lineage, CONTENT_W - 80);
  const identityH = 165 + lineageLines.length * 28;

  blocks.push({
    height: identityH,
    draw: (ctx, topY) => {
      const isMale = person.gender === 'male';
      ctx.fillStyle = isMale ? '#F2F8F5' : '#FFF5F7';
      drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, identityH, 16);
      ctx.fill();

      ctx.strokeStyle = isMale ? '#0F4C3A' : '#BE123C';
      ctx.lineWidth = 2.2;
      drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, identityH, 16);
      ctx.stroke();

      // Top metadata badges inside identity banner
      ctx.textBaseline = 'middle';
      const genderBadgeText = isMale ? 'الجنس: ذكر' : 'الجنس: أنثى';
      ctx.font = '900 14px Cairo, sans-serif';
      const gbW = ctx.measureText(genderBadgeText).width + 28;
      ctx.fillStyle = isMale ? '#0F4C3A' : '#9F1239';
      drawRoundedRect(ctx, MARGIN_X + CONTENT_W - gbW - 20, topY + 16, gbW, 32, 10);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE68A';
      ctx.fillText(genderBadgeText, MARGIN_X + CONTENT_W - gbW / 2 - 20, topY + 32);

      // Wife badge if female and married
      if (!isMale && (husbandPerson || person.husbandName)) {
        const hName = formatAppName(husbandPerson ? husbandPerson.fullName : person.husbandName);
        const wifeBadge = `زوجة: ${hName}`;
        ctx.font = 'bold 14px Cairo, sans-serif';
        const wbW = Math.min(480, ctx.measureText(wifeBadge).width + 28);
        const wbRight = MARGIN_X + CONTENT_W - gbW - 32;
        ctx.fillStyle = '#FFE4E6';
        drawRoundedRect(ctx, wbRight - wbW, topY + 16, wbW, 32, 10);
        ctx.fill();
        ctx.strokeStyle = '#FDA4AF';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, wbRight - wbW, topY + 16, wbW, 32, 10);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#881337';
        ctx.fillText(truncateRtlText(ctx, wifeBadge, wbW - 20), wbRight - wbW / 2, topY + 32);
      }

      // First name badge on the left
      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 14px Cairo, sans-serif';
      ctx.fillText(
        `الاسم الشخصي: ${extractGivenName(person.fullName)}`,
        MARGIN_X + 22,
        topY + 32
      );

      // Center Full Name
      ctx.textAlign = 'center';
      ctx.fillStyle = isMale ? '#0F4C3A' : '#881337';
      ctx.font = '900 28px Cairo, sans-serif';
      ctx.fillText(
        `« ${formatAppName(person.fullName)} »`,
        MARGIN_X + CONTENT_W / 2,
        topY + 80
      );

      // Lineage Box
      const lBoxY = topY + 114;
      const lBoxH = identityH - 130;
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, MARGIN_X + 24, lBoxY, CONTENT_W - 48, lBoxH, 12);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      drawRoundedRect(ctx, MARGIN_X + 24, lBoxY, CONTENT_W - 48, lBoxH, 12);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText('سلسلة النسب الكاملة:', MARGIN_X + CONTENT_W / 2, lBoxY + 18);

      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 16px Cairo, sans-serif';
      lineageLines.forEach((line, idx) => {
        ctx.fillText(line, MARGIN_X + CONTENT_W / 2, lBoxY + 44 + idx * 26);
      });
    }
  });

  // ==========================================================================
  // BLOCK 2: DIRECT ORIGINS (الأب، الجد، الأم)
  // ==========================================================================
  blocks.push({
    height: 142,
    draw: (ctx, topY) => {
      ctx.save();
      drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, 142, 14);
      ctx.clip();

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(MARGIN_X, topY, CONTENT_W, 142);

      // Header
      ctx.fillStyle = '#0F4C3A';
      ctx.fillRect(MARGIN_X, topY, CONTENT_W, 46);

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 18px Cairo, sans-serif';
      ctx.fillText(
        'أولاً: نسب الفرد والأصول المباشرة (الأب، الجد، الأم)',
        MARGIN_X + CONTENT_W - 20,
        topY + 23
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 14px Cairo, sans-serif';
      ctx.fillText(`عدد الأجيال الصاعدة: ${ancestors.length + 1}`, MARGIN_X + 20, topY + 23);

      const boxGap = 14;
      const boxW = Math.floor((CONTENT_W - 36 - boxGap * 2) / 3);
      const boxH = 68;
      const boxY = topY + 60;

      const origins = [
        {
          label: 'الأب المباشر:',
          value: father ? formatAppName(father.fullName) : 'غير مسجل (بداية شجرة مستقلة)',
          color: '#0F172A'
        },
        {
          label: 'الجد المباشر:',
          value: grandfather ? formatAppName(grandfather.fullName) : 'غير مسجل',
          color: '#0F172A'
        },
        {
          label: 'الأم (الوالدة):',
          value: kinship?.mother ? formatAppName(kinship.mother.fullName) : 'غير مسجلة في الشجرة',
          color: kinship?.mother ? '#881337' : '#64748B'
        }
      ];

      origins.forEach((orig, idx) => {
        const rightX = MARGIN_X + CONTENT_W - 18 - idx * (boxW + boxGap);
        const leftX = rightX - boxW;

        ctx.fillStyle = '#FFFFFF';
        drawRoundedRect(ctx, leftX, boxY, boxW, boxH, 10);
        ctx.fill();
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, leftX, boxY, boxW, boxH, 10);
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 12.5px Cairo, sans-serif';
        ctx.fillText(orig.label, rightX - 12, boxY + 21);

        ctx.fillStyle = orig.color;
        ctx.font = '900 15px Cairo, sans-serif';
        ctx.fillText(truncateRtlText(ctx, orig.value, boxW - 24), rightX - 12, boxY + 46);
      });

      ctx.restore();
      ctx.strokeStyle = '#0F4C3A';
      ctx.lineWidth = 1.8;
      drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, 142, 14);
      ctx.stroke();
    }
  });

  // ==========================================================================
  // BLOCK 2B: ANCESTORS STEPPER CHAIN (تسلسل الآباء والأجداد صعوداً)
  // ==========================================================================
  if (ancestors.length > 0) {
    const chainItems: GridCardItem[] = [
      {
        title: `1. ${extractGivenName(person.fullName)}`,
        subtitle: formatAppName(person.fullName),
        badge: 'صاحب البطاقة',
        theme: 'emerald'
      },
      ...ancestors.map((anc, idx) => ({
        title: `${idx + 2}. ${extractGivenName(anc.fullName)}`,
        subtitle: formatAppName(anc.fullName),
        badge: idx === 0 ? 'الأب المباشر' : idx === 1 ? 'الجد الأول' : `الجد (${idx + 1})`,
        theme: 'slate' as const
      }))
    ];

    blocks.push(
      createGridSectionBlock({
        headerTitle: 'تسلسل الآباء والأجداد صعوداً',
        headerStat: `${ancestors.length + 1} أجيال`,
        headerBg: '#1E293B',
        headerTextColor: '#FFFFFF',
        borderColor: '#475569',
        bodyBg: '#F8FAFC',
        items: chainItems
      })
    );
  }

  // ==========================================================================
  // BLOCK 3: HUSBAND & COUPLE RELATIONSHIP (للأنثى المتزوجة)
  // ==========================================================================
  if (person.gender === 'female' && (husbandPerson || person.husbandName)) {
    const husbandFullName = formatAppName(
      husbandPerson ? husbandPerson.fullName : person.husbandName
    );
    sCtx.font = 'bold 14px Cairo, sans-serif';
    const relDescLines = coupleRelationship
      ? wrapArabicCanvasText(sCtx, coupleRelationship.description, CONTENT_W - 60)
      : [];
    const spouseBlockH = coupleRelationship ? 145 + relDescLines.length * 24 : 108;

    blocks.push({
      height: spouseBlockH,
      draw: (ctx, topY) => {
        ctx.save();
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, spouseBlockH, 14);
        ctx.clip();

        ctx.fillStyle = '#FFF5F7';
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, spouseBlockH);

        ctx.fillStyle = '#881337';
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, 46);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 18px Cairo, sans-serif';
        ctx.fillText(
          'بيانات الزوج وصلة القرابة بين الزوجين',
          MARGIN_X + CONTENT_W - 20,
          topY + 23
        );

        // Husband row
        ctx.fillStyle = '#FFFFFF';
        drawRoundedRect(ctx, MARGIN_X + 18, topY + 58, CONTENT_W - 36, 38, 8);
        ctx.fill();
        ctx.strokeStyle = '#FDA4AF';
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, MARGIN_X + 18, topY + 58, CONTENT_W - 36, 38, 8);
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.fillStyle = '#9F1239';
        ctx.font = 'bold 14px Cairo, sans-serif';
        ctx.fillText('الزوج المسجل:', MARGIN_X + CONTENT_W - 32, topY + 77);

        ctx.fillStyle = '#0F172A';
        ctx.font = '900 16px Cairo, sans-serif';
        ctx.fillText(husbandFullName, MARGIN_X + CONTENT_W - 145, topY + 77);

        if (coupleRelationship) {
          const relBoxY = topY + 104;
          const relBoxH = spouseBlockH - 116;
          ctx.fillStyle = '#FFFFFF';
          drawRoundedRect(ctx, MARGIN_X + 18, relBoxY, CONTENT_W - 36, relBoxH, 8);
          ctx.fill();
          ctx.strokeStyle = '#86EFAC';
          ctx.lineWidth = 1.2;
          drawRoundedRect(ctx, MARGIN_X + 18, relBoxY, CONTENT_W - 36, relBoxH, 8);
          ctx.stroke();

          ctx.textAlign = 'right';
          ctx.fillStyle = '#0F4C3A';
          ctx.font = '900 15px Cairo, sans-serif';
          ctx.fillText(
            `صلة القرابة بينهما: ${coupleRelationship.relationToHusband}`,
            MARGIN_X + CONTENT_W - 32,
            relBoxY + 20
          );

          ctx.fillStyle = '#334155';
          ctx.font = 'bold 13.5px Cairo, sans-serif';
          relDescLines.forEach((line, i) => {
            ctx.fillText(line, MARGIN_X + CONTENT_W - 32, relBoxY + 46 + i * 22);
          });
        }

        ctx.restore();
        ctx.strokeStyle = '#BE123C';
        ctx.lineWidth = 1.8;
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, spouseBlockH, 14);
        ctx.stroke();
      }
    });
  }

  // ==========================================================================
  // BLOCK 4: DESCENDANTS / CHILDREN (ثانياً: الفروع والأبناء)
  // ==========================================================================
  if (person.gender === 'male') {
    const sonItems: GridCardItem[] = sons.map((s, idx) => ({
      title: `${idx + 1}. ${formatBranchName(s.fullName)}`,
      subtitle: formatAppName(s.fullName),
      badge: 'ذكر (ابن)',
      theme: 'emerald'
    }));

    blocks.push(
      createGridSectionBlock({
        headerTitle: `ثانياً: الفروع — الأبناء الذكور (${sons.length})`,
        headerStat: `إجمالي الفروع: ${children.length} (${sons.length} ذكور · ${daughters.length} إناث)`,
        headerBg: '#0F4C3A',
        headerTextColor: '#FFFFFF',
        borderColor: '#0F4C3A',
        bodyBg: '#F4FBF7',
        items: sonItems,
        emptyText: '— لا يوجد أبناء ذكور مسجلون لهذا الاسم —'
      })
    );

    const daughterItems: GridCardItem[] = daughters.map((d, idx) => {
      const dHusb = d.husbandId ? allPersons.find((p) => p.id === d.husbandId) : undefined;
      const husbLabel =
        dHusb || d.husbandName
          ? `زوجة: ${formatAppName(dHusb ? dHusb.fullName : d.husbandName)}`
          : undefined;
      return {
        title: `${idx + 1}. ${formatBranchName(d.fullName)}`,
        subtitle: husbLabel,
        badge: 'أنثى (ابنة)',
        theme: 'rose'
      };
    });

    blocks.push(
      createGridSectionBlock({
        headerTitle: `ثانياً (تابع): الفروع — البنات الإناث (${daughters.length})`,
        headerStat: `${daughters.length} إناث`,
        headerBg: '#881337',
        headerTextColor: '#FFFFFF',
        borderColor: '#BE123C',
        bodyBg: '#FFF9FA',
        items: daughterItems,
        emptyText: '— لا توجد بنات مسجلات لهذا الاسم —'
      })
    );
  } else {
    const motherChildrenItems: GridCardItem[] = (kinship?.children || []).map((ch, idx) => ({
      title: `${idx + 1}. ${formatAppName(ch.fullName)}`,
      badge: ch.gender === 'male' ? 'ابنها' : 'ابنتها',
      theme: ch.gender === 'male' ? 'emerald' : 'rose'
    }));

    blocks.push(
      createGridSectionBlock({
        headerTitle: `ثانياً: الفروع — أبناؤها وبناتها من زوجها (${motherChildrenItems.length})`,
        headerStat: `${maleMotherChildren.length} ذكور · ${femaleMotherChildren.length} إناث`,
        headerSubnote:
          'يُنسب الأبناء لآبائهم في عمود النسب وتُحفظ صلتهم بأمهم وأخوالهم وخالاتهم في سجل القرابة',
        headerBg: '#881337',
        headerTextColor: '#FFFFFF',
        borderColor: '#BE123C',
        bodyBg: '#FFF9FA',
        items: motherChildrenItems,
        emptyText: '— لا يوجد أبناء مسجلون لها في الشجرة حالياً —'
      })
    );
  }

  // ==========================================================================
  // BLOCK 5: EXTENDED KINSHIP & RELATED DATA (ثالثاً: صلات القرابة والبيانات المتعلقة بالاسم)
  // ==========================================================================
  if (kinship) {
    // 5.1 Wives (for male)
    if (person.gender === 'male' && kinship.wives.length > 0) {
      const wifeItems: GridCardItem[] = kinship.wives.map((w, idx) => {
        const rel =
          allPersons.length > 0
            ? getCoupleRelationship(w.id, w.fatherId, person.id, allPersons)
            : null;
        return {
          title: `${idx + 1}. ${formatAppName(w.fullName)}`,
          subtitle: rel ? `صلة القرابة: ${rel.relationToHusband}` : undefined,
          badge: 'زوجة مسجلة',
          theme: 'rose'
        };
      });

      blocks.push(
        createGridSectionBlock({
          headerTitle: `الزوجات المسجلات في الشجرة (${kinship.wives.length})`,
          headerBg: '#881337',
          headerTextColor: '#FFFFFF',
          borderColor: '#BE123C',
          bodyBg: '#FFF9FA',
          items: wifeItems
        })
      );
    }

    // 5.2 Siblings (الإخوة والأخوات)
    if (kinship.siblings.length > 0) {
      const sibItems: GridCardItem[] = kinship.siblings.map((sib, idx) => ({
        title: `${idx + 1}. ${formatAppName(sib.fullName)}`,
        badge: sib.gender === 'male' ? 'أخ' : 'أخت',
        theme: sib.gender === 'male' ? 'emerald' : 'rose'
      }));

      blocks.push(
        createGridSectionBlock({
          headerTitle: `الإخوة والأخوات (${kinship.siblings.length})`,
          headerStat: `${kinship.brothers.length} ذكور · ${kinship.sisters.length} إناث`,
          headerBg: '#0F4C3A',
          headerTextColor: '#FFFFFF',
          borderColor: '#0F4C3A',
          bodyBg: '#F8FAFC',
          items: sibItems
        })
      );
    }

    // 5.3 Paternal Uncles & Aunts (الأعمام والعمات)
    if (kinship.paternalUncles.length > 0 || kinship.paternalAunts.length > 0) {
      const patItems: GridCardItem[] = [
        ...kinship.paternalUncles.map((u, idx) => ({
          title: `${idx + 1}. ${formatAppName(u.fullName)}`,
          badge: 'عم',
          theme: 'emerald' as const
        })),
        ...kinship.paternalAunts.map((a, idx) => ({
          title: `${kinship.paternalUncles.length + idx + 1}. ${formatAppName(a.fullName)}`,
          badge: 'عمة',
          theme: 'rose' as const
        }))
      ];

      blocks.push(
        createGridSectionBlock({
          headerTitle: `الأعمام والعمات — إخوة وأخوات الأب (${patItems.length})`,
          headerStat: `${kinship.paternalUncles.length} أعمام · ${kinship.paternalAunts.length} عمات`,
          headerBg: '#0F4C3A',
          headerTextColor: '#FFFFFF',
          borderColor: '#0F4C3A',
          bodyBg: '#F4FBF7',
          items: patItems
        })
      );
    }

    // 5.4 Maternal Uncles & Aunts (الأخوال والخالات)
    if (kinship.maternalUncles.length > 0 || kinship.maternalAunts.length > 0) {
      const matItems: GridCardItem[] = [
        ...kinship.maternalUncles.map((u, idx) => ({
          title: `${idx + 1}. ${formatAppName(u.fullName)}`,
          badge: 'خال',
          theme: 'amber' as const
        })),
        ...kinship.maternalAunts.map((a, idx) => ({
          title: `${kinship.maternalUncles.length + idx + 1}. ${formatAppName(a.fullName)}`,
          badge: 'خالة',
          theme: 'amber' as const
        }))
      ];

      blocks.push(
        createGridSectionBlock({
          headerTitle: `الأخوال والخالات — إخوة وأخوات الأم (${matItems.length})`,
          headerStat: `${kinship.maternalUncles.length} أخوال · ${kinship.maternalAunts.length} خالات`,
          headerSubnote: kinship.mother
            ? `الأم (الوالدة): ${formatAppName(kinship.mother.fullName)}`
            : undefined,
          headerBg: '#78350F',
          headerTextColor: '#FFFFFF',
          borderColor: '#D97706',
          bodyBg: '#FFFBEB',
          items: matItems
        })
      );
    }

    // 5.5 Paternal Uncle To (عم لـ)
    if (person.gender === 'male' && kinship.isPaternalUncleTo.length > 0) {
      const items: GridCardItem[] = kinship.isPaternalUncleTo.map((n, idx) => ({
        title: `${idx + 1}. ${formatAppName(n.fullName)}`,
        badge: n.gender === 'male' ? 'ابن أخ' : 'ابنة أخ',
        theme: 'emerald'
      }));

      blocks.push(
        createGridSectionBlock({
          headerTitle: `عم لـ — أبناء وبنات إخوته الذكور (${items.length})`,
          headerBg: '#0F4C3A',
          headerTextColor: '#FFFFFF',
          borderColor: '#0F4C3A',
          bodyBg: '#F4FBF7',
          items
        })
      );
    }

    // 5.6 Paternal Aunt To (عمة لـ)
    if (person.gender === 'female' && kinship.isPaternalAuntTo.length > 0) {
      const items: GridCardItem[] = kinship.isPaternalAuntTo.map((n, idx) => ({
        title: `${idx + 1}. ${formatAppName(n.fullName)}`,
        badge: n.gender === 'male' ? 'ابن أخ' : 'ابنة أخ',
        theme: 'emerald'
      }));

      blocks.push(
        createGridSectionBlock({
          headerTitle: `عمة لـ — أبناء وبنات إخوتها الذكور (${items.length})`,
          headerBg: '#0F4C3A',
          headerTextColor: '#FFFFFF',
          borderColor: '#0F4C3A',
          bodyBg: '#F4FBF7',
          items
        })
      );
    }

    // 5.7 Maternal Uncle To (خال لـ)
    if (person.gender === 'male' && kinship.isMaternalUncleTo.length > 0) {
      const items: GridCardItem[] = kinship.isMaternalUncleTo.map((n, idx) => ({
        title: `${idx + 1}. ${formatAppName(n.fullName)}`,
        badge: n.gender === 'male' ? 'ابن أخت' : 'ابنة أخت',
        theme: 'amber'
      }));

      blocks.push(
        createGridSectionBlock({
          headerTitle: `خال لـ — أبناء وبنات أخواته (${items.length})`,
          headerBg: '#78350F',
          headerTextColor: '#FFFFFF',
          borderColor: '#D97706',
          bodyBg: '#FFFBEB',
          items
        })
      );
    }

    // 5.8 Maternal Aunt To (خالة لـ)
    if (person.gender === 'female' && kinship.isMaternalAuntTo.length > 0) {
      const items: GridCardItem[] = kinship.isMaternalAuntTo.map((n, idx) => ({
        title: `${idx + 1}. ${formatAppName(n.fullName)}`,
        badge: n.gender === 'male' ? 'ابن أخت' : 'ابنة أخت',
        theme: 'amber'
      }));

      blocks.push(
        createGridSectionBlock({
          headerTitle: `خالة لـ — أبناء وبنات أخواتها (${items.length})`,
          headerBg: '#78350F',
          headerTextColor: '#FFFFFF',
          borderColor: '#D97706',
          bodyBg: '#FFFBEB',
          items
        })
      );
    }

    // 5.9 Maternal Uncles/Aunts of her children (if female with children)
    if (
      person.gender === 'female' &&
      kinship.children.length > 0 &&
      (kinship.brothers.length > 0 || kinship.sisters.length > 0)
    ) {
      const items: GridCardItem[] = [
        ...kinship.brothers.map((b, idx) => ({
          title: `${idx + 1}. ${formatAppName(b.fullName)}`,
          badge: 'خال الأبناء',
          theme: 'rose' as const
        })),
        ...kinship.sisters.map((s, idx) => ({
          title: `${kinship.brothers.length + idx + 1}. ${formatAppName(s.fullName)}`,
          badge: 'خالة الأبناء',
          theme: 'rose' as const
        }))
      ];

      blocks.push(
        createGridSectionBlock({
          headerTitle: `أخوال وخالات أبنائها — إخوة وأخوات أمهم هذه (${items.length})`,
          headerBg: '#881337',
          headerTextColor: '#FFFFFF',
          borderColor: '#BE123C',
          bodyBg: '#FFF9FA',
          items
        })
      );
    }

    // 5.10 Excluded Husband Children (if any)
    if (person.gender === 'female' && kinship.excludedHusbandChildren.length > 0) {
      const items: GridCardItem[] = kinship.excludedHusbandChildren.map(
        ({ child, otherMother }, idx) => ({
          title: `${idx + 1}. ${formatAppName(child.fullName)}`,
          subtitle: otherMother ? `الأم: ${formatAppName(otherMother.fullName)}` : undefined,
          badge: 'من أم أخرى',
          theme: 'slate'
        })
      );

      blocks.push(
        createGridSectionBlock({
          headerTitle: `أبناء الزوج المستثنون من أمومتها (${items.length})`,
          headerBg: '#334155',
          headerTextColor: '#FFFFFF',
          borderColor: '#64748B',
          bodyBg: '#F8FAFC',
          items
        })
      );
    }
  }

  // ==========================================================================
  // BLOCK 6: NOTES / BIOGRAPHY (رابعاً: نبذة وملاحظات مسجلة)
  // ==========================================================================
  if (person.notes && person.notes.trim()) {
    sCtx.font = 'bold 15px Cairo, sans-serif';
    const noteLines = wrapArabicCanvasText(sCtx, person.notes.trim(), CONTENT_W - 48);
    const notesBlockH = 72 + noteLines.length * 26;

    blocks.push({
      height: notesBlockH,
      draw: (ctx, topY) => {
        ctx.save();
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, notesBlockH, 14);
        ctx.clip();

        ctx.fillStyle = '#FBF9F5';
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, notesBlockH);

        ctx.fillStyle = '#0F4C3A';
        ctx.fillRect(MARGIN_X, topY, CONTENT_W, 44);

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 17px Cairo, sans-serif';
        ctx.fillText('نبذة وملاحظات مسجلة', MARGIN_X + CONTENT_W - 20, topY + 22);

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 15px Cairo, sans-serif';
        noteLines.forEach((line, idx) => {
          ctx.fillText(line, MARGIN_X + CONTENT_W - 24, topY + 68 + idx * 26);
        });

        ctx.restore();
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 1.8;
        drawRoundedRect(ctx, MARGIN_X, topY, CONTENT_W, notesBlockH, 14);
        ctx.stroke();
      }
    });
  }

  // ==========================================================================
  // PAGINATE BLOCKS INTO A4 PAGES
  // ==========================================================================
  const BLOCK_GAP = 20;
  const pagesBlocks: RenderSectionBlock[][] = [];
  let currentList: RenderSectionBlock[] = [];
  let curY = 210; // first page top start after header

  for (const blk of blocks) {
    const startYForNewPage = 135;
    if (curY + blk.height > BOTTOM_LIMIT_Y && currentList.length > 0) {
      pagesBlocks.push(currentList);
      currentList = [blk];
      curY = startYForNewPage + blk.height + BLOCK_GAP;
    } else {
      currentList.push(blk);
      curY += blk.height + BLOCK_GAP;
    }
  }
  if (currentList.length > 0) {
    pagesBlocks.push(currentList);
  }

  const totalPages = Math.max(1, pagesBlocks.length);
  const dateStr = new Date().toLocaleDateString('ar-SA');
  const personFirstName = extractGivenName(person.fullName);

  const pdfPages: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[] = [];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageList = pagesBlocks[pIdx] || [];
    const lastBlockBottom =
      (pIdx === 0 ? 210 : 135) +
      pageList.reduce((acc, b) => acc + b.height + BLOCK_GAP, 0);
    const dynamicPageH = Math.max(PAGE_H, lastBlockBottom + 110);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W * scale;
    canvas.height = dynamicPageH * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.direction = 'rtl';

    // Page Background
    ctx.fillStyle = '#FFFDF9';
    ctx.fillRect(0, 0, PAGE_W, dynamicPageH);

    // Ornate Double Page Frame
    ctx.strokeStyle = '#0F4C3A';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, PAGE_W - 48, dynamicPageH - 48);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(32, 32, PAGE_W - 64, dynamicPageH - 64);

    let drawY = 135;
    if (pIdx === 0) {
      // Main Header Banner on Page 1
      ctx.fillStyle = '#0F4C3A';
      drawRoundedRect(ctx, MARGIN_X, 52, CONTENT_W, 134, 18);
      ctx.fill();
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, MARGIN_X, 52, CONTENT_W, 134, 18);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 30px Cairo, sans-serif';
      ctx.fillText(
        'بطاقة التفصيل الكامل للنسب والفروع وصلات القرابة',
        PAGE_W / 2,
        100
      );

      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 17px Cairo, sans-serif';
      ctx.fillText(
        `صاحب البطاقة: ${formatAppName(person.fullName)}`,
        PAGE_W / 2,
        148
      );

      drawY = 210;
    } else {
      // Compact Header on Continuation Pages
      ctx.fillStyle = '#0F4C3A';
      drawRoundedRect(ctx, MARGIN_X, 50, CONTENT_W, 64, 14);
      ctx.fill();
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 1.8;
      drawRoundedRect(ctx, MARGIN_X, 50, CONTENT_W, 64, 14);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 20px Cairo, sans-serif';
      ctx.fillText(
        `تابع بطاقة تفاصيل: ${formatAppName(person.fullName)}`,
        PAGE_W - MARGIN_X - 22,
        82
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 15px Cairo, sans-serif';
      ctx.fillText(`صفحة ${pIdx + 1} من ${totalPages}`, MARGIN_X + 22, 82);

      drawY = 135;
    }

    for (const blk of pageList) {
      blk.draw(ctx, drawY);
      drawY += blk.height + BLOCK_GAP;
    }

    // Page Footer
    const footerLineY = dynamicPageH - 72;
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, footerLineY);
    ctx.lineTo(PAGE_W - MARGIN_X, footerLineY);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(
      `بطاقة تفاصيل: ${formatAppName(person.fullName)}`,
      PAGE_W - MARGIN_X,
      footerLineY + 24
    );

    const pageBadgeText = `صفحة ${pIdx + 1} من ${totalPages}`;
    ctx.font = '900 14px Cairo, sans-serif';
    const pbW = ctx.measureText(pageBadgeText).width + 30;
    ctx.fillStyle = '#0F4C3A';
    drawRoundedRect(ctx, (PAGE_W - pbW) / 2, footerLineY + 8, pbW, 30, 8);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FDE68A';
    ctx.fillText(pageBadgeText, PAGE_W / 2, footerLineY + 23);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText(`تاريخ الاستخراج: ${dateStr} م`, MARGIN_X, footerLineY + 24);

    const jpegBytes = canvasToJpegBytes(canvas, 0.94);
    pdfPages.push({
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt: 595.28,
      pageHeightPt: Math.round((dynamicPageH / PAGE_W) * 595.28)
    });
  }

  const pdfBlob = createPdfBlobFromJpegPages(pdfPages);
  triggerBlobDownload(pdfBlob, `تفاصيل_${personFirstName}.pdf`);
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
