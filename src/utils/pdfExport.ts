import { Person } from '../types/family';
import { calculateKinship, getCoupleRelationship, KinshipInfo } from './kinship';
import { extractGivenName, formatAppName, formatBranchName, formatNameWithLimit, formatQuadrupleName } from './nameUtils';
import {
  computeVerticalPyramidLayout,
  getGenerationColorTheme
} from './verticalPyramidLayout';

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

function encodeCanvasToSafeJpegPage(
  sourceCanvas: HTMLCanvasElement,
  quality: number = 0.94,
  pageWidthPt: number = 595.28,
  pageHeightPt: number = 841.89
): {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
} {
  // High-DPI JPEG stream limit for crisp vector-like text in PDF viewers
  const MAX_SAFE_DIM = 5400;
  const MAX_SAFE_PIXELS = 16_500_000;

  let targetCanvas = sourceCanvas;
  const srcW = sourceCanvas.width || 1240;
  const srcH = sourceCanvas.height || 1754;
  const maxDimRatio = MAX_SAFE_DIM / Math.max(srcW, srcH);
  const maxAreaRatio = Math.sqrt(MAX_SAFE_PIXELS / (srcW * srcH));
  const downscale = Math.min(1, maxDimRatio, maxAreaRatio);

  const tryEncode = (c: HTMLCanvasElement, q: number): Uint8Array => {
    try {
      const dataUrl = c.toDataURL('image/jpeg', q);
      const base64 = dataUrl.split(',')[1] || '';
      if (base64.length < 100) return new Uint8Array(0);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      return new Uint8Array(0);
    }
  };

  if (downscale < 0.999) {
    const safeW = Math.max(200, Math.round(srcW * downscale));
    const safeH = Math.max(200, Math.round(srcH * downscale));
    const scaled = document.createElement('canvas');
    scaled.width = safeW;
    scaled.height = safeH;
    const sCtx = scaled.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#FCFBF7';
      sCtx.fillRect(0, 0, safeW, safeH);
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(sourceCanvas, 0, 0, safeW, safeH);
      targetCanvas = scaled;
    }
  }

  let bytes = tryEncode(targetCanvas, quality);

  // Fallback downscale if mobile browser rejected encoding at initial size
  if (bytes.length < 200) {
    const fallbackW = Math.min(1654, targetCanvas.width);
    const fallbackH = Math.max(200, Math.round((targetCanvas.height / targetCanvas.width) * fallbackW));
    const fbCanvas = document.createElement('canvas');
    fbCanvas.width = fallbackW;
    fbCanvas.height = fallbackH;
    const fbCtx = fbCanvas.getContext('2d');
    if (fbCtx) {
      fbCtx.fillStyle = '#FCFBF7';
      fbCtx.fillRect(0, 0, fallbackW, fallbackH);
      fbCtx.drawImage(sourceCanvas, 0, 0, fallbackW, fallbackH);
      targetCanvas = fbCanvas;
      bytes = tryEncode(targetCanvas, 0.9);
    }
  }

  return {
    jpegBytes: bytes,
    widthPx: targetCanvas.width,
    heightPx: targetCanvas.height,
    pageWidthPt,
    pageHeightPt
  };
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number = 0.94): Uint8Array {
  return encodeCanvasToSafeJpegPage(canvas, quality).jpegBytes;
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
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
// 1. EXPORT VISUAL FAMILY TREE TO PDF (Horizontal Rows & Vertical Column Modes)
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
  rootPersons?: Person[];
  getChildren: (personId: string) => Person[];
  mode: 'classic' | 'classic_vertical';
  collapsedNodes?: Set<string>;
  orientation?: 'landscape' | 'portrait' | 'auto';
  paperSize?: 'a4' | 'a3' | 'panoramic' | 'auto';
  maximizeSpace?: boolean;
  unconstrained?: boolean;
  includeFemales?: boolean;
  maxTargetDim?: number;
  maxTargetPixels?: number;
  targetAspectRatio?: number;
  tileViewport?: {
    col: number;
    row: number;
    cols: number;
    rows: number;
    tileWidthPx: number;
    tileHeightPx: number;
  };
}

let cairoFontReadyCache = false;

export async function ensureCairoFontLoaded() {
  if (cairoFontReadyCache) return;
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
        document.fonts.load('400 20px Cairo'),
        document.fonts.load('700 24px Cairo'),
        document.fonts.load('900 64px Cairo')
      ]);
      await document.fonts.ready;
      cairoFontReadyCache = true;
    }
  } catch (e) {
    console.warn('Font loading notice:', e);
  } finally {
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }
}

function applyTargetAspectRatioToVerticalPyramid(
  layout: ReturnType<typeof computeVerticalPyramidLayout>,
  targetAspectRatio?: number
) {
  if (!targetAspectRatio || targetAspectRatio <= 0.05) {
    return layout;
  }

  let {
    nodes,
    links,
    logicalW,
    logicalH,
    nodeW,
    nodeH,
    headerHeight,
    legendHeight,
    footerHeight
  } = layout;

  const currentAspect = logicalW / Math.max(1, logicalH);
  const treeTopY = headerHeight + legendHeight + 20;

  if (currentAspect > targetAspectRatio * 1.005) {
    // Expand vertically so the vertical pyramid fills 100% of the page height from top to bottom
    const targetH = Math.round(logicalW / targetAspectRatio);
    const newTreeBottomY = targetH - footerHeight - 20;

    let oldMinY = Infinity;
    let oldMaxY = -Infinity;
    for (const n of nodes) {
      if (n.y < oldMinY) oldMinY = n.y;
      if (n.y > oldMaxY) oldMaxY = n.y;
    }

    const oldSpanY = Math.max(1, oldMaxY - oldMinY);
    const availTreeH = Math.max(nodeH, newTreeBottomY - treeTopY);
    if (oldMaxY > oldMinY) {
      const vFactor = Math.max(1, (availTreeH - nodeH) / oldSpanY);
      nodeH = Math.min(
        Math.round(nodeW * 0.76),
        Math.round(nodeH * Math.min(1.48, Math.sqrt(vFactor)))
      );
      const newMinY = treeTopY + nodeH / 2;
      const newMaxY = Math.max(newMinY, newTreeBottomY - nodeH / 2);
      const mapY = (y: number) =>
        newMinY + ((y - oldMinY) / oldSpanY) * (newMaxY - newMinY);

      const nodeById = new Map<string, (typeof nodes)[0]>();
      for (const n of nodes) {
        n.y = mapY(n.y);
        n.height = nodeH;
        nodeById.set(n.person.id, n);
      }

      for (const l of links) {
        for (const pt of l.points) {
          pt.y = mapY(pt.y);
        }
        const pNode = nodeById.get(l.parentId);
        const cNode = nodeById.get(l.childId);
        if (pNode && l.points.length >= 2) {
          l.points[0].y = pNode.y + nodeH / 2;
        }
        if (cNode && l.points.length >= 2) {
          l.points[l.points.length - 1].y = cNode.y - nodeH / 2;
        }
        l.svgPath = l.points
          .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(' ');
      }
    } else if (nodes.length > 0) {
      const centerY = (treeTopY + newTreeBottomY) / 2;
      for (const n of nodes) n.y = centerY;
    }

    logicalH = targetH;
  } else if (currentAspect < targetAspectRatio * 0.995) {
    // Expand horizontally so the pyramid fills 100% of the page width from right to left
    const targetW = Math.round(logicalH * targetAspectRatio);
    const sidePad = 32;
    const treeLeftX = sidePad;
    const treeRightX = targetW - sidePad;

    let oldMinX = Infinity;
    let oldMaxX = -Infinity;
    for (const n of nodes) {
      if (n.x < oldMinX) oldMinX = n.x;
      if (n.x > oldMaxX) oldMaxX = n.x;
    }

    const oldSpanX = Math.max(1, oldMaxX - oldMinX);
    const availTreeW = Math.max(nodeW, treeRightX - treeLeftX);
    if (oldMaxX > oldMinX) {
      const hFactor = Math.max(1, (availTreeW - nodeW) / oldSpanX);
      nodeW = Math.min(
        Math.round(nodeW * 1.52),
        Math.round(nodeW * Math.min(1.52, Math.sqrt(hFactor)))
      );
      const newMinX = treeLeftX + nodeW / 2;
      const newMaxX = Math.max(newMinX, treeRightX - nodeW / 2);
      const mapX = (x: number) =>
        newMinX + ((x - oldMinX) / oldSpanX) * (newMaxX - newMinX);

      for (const n of nodes) {
        n.x = mapX(n.x);
        n.width = nodeW;
      }
      for (const l of links) {
        for (const pt of l.points) {
          pt.x = mapX(pt.x);
        }
        l.svgPath = l.points
          .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(' ');
      }
    } else if (nodes.length > 0) {
      const centerX = targetW / 2;
      for (const n of nodes) n.x = centerX;
    }

    logicalW = targetW;
  }

  return {
    ...layout,
    nodes,
    links,
    logicalW,
    logicalH,
    nodeW,
    nodeH
  };
}

export async function renderVerticalPyramidToCanvas(options: ExportTreePdfOptions): Promise<{
  canvas: HTMLCanvasElement;
  rootFirstName: string;
  isLandscape: boolean;
  logicalW: number;
  logicalH: number;
}> {
  const {
    rootPerson,
    getChildren,
    collapsedNodes = new Set<string>(),
    includeFemales = true,
    maxTargetDim = 9600,
    maxTargetPixels = 32_000_000
  } = options;

  await ensureCairoFontLoaded();

  const rawLayout = computeVerticalPyramidLayout({
    rootPerson,
    getChildren,
    collapsedNodes,
    includeFemales,
    forScreen: false
  });

  const layout = applyTargetAspectRatioToVerticalPyramid(rawLayout, options.targetAspectRatio);

  const {
    nodes,
    links,
    logicalW,
    logicalH,
    maxDepth,
    totalNodes,
    nodeW,
    nodeH,
    headerHeight,
    legendHeight,
    generationsList
  } = layout;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1.0;

  if (options.tileViewport) {
    const { tileWidthPx, tileHeightPx } = options.tileViewport;
    canvas = document.createElement('canvas');
    canvas.width = tileWidthPx;
    canvas.height = tileHeightPx;
    ctx = canvas.getContext('2d');
  } else {
    const maxLogicalDim = Math.max(logicalW, logicalH);
    const totalLogicalPixels = logicalW * logicalH;

    const limitProfiles = [
      { maxDim: maxTargetDim, maxPixels: maxTargetPixels, desiredScale: 3.0 },
      { maxDim: Math.min(7680, maxTargetDim), maxPixels: Math.min(24_000_000, maxTargetPixels), desiredScale: 2.5 },
      { maxDim: Math.min(5400, maxTargetDim), maxPixels: Math.min(16_500_000, maxTargetPixels), desiredScale: 2.0 },
      { maxDim: Math.min(3800, maxTargetDim), maxPixels: Math.min(10_500_000, maxTargetPixels), desiredScale: 1.5 },
      { maxDim: 2480, maxPixels: 5_500_000, desiredScale: 1.15 }
    ];

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
      } catch {
        // try next profile
      }
    }
  }

  if (!canvas || !ctx) {
    throw new Error('تعذر حجز ذاكرة الرسم للتخطيط الهرمي العمودي.');
  }

  if (options.tileViewport) {
    const { col, row, cols, rows, tileWidthPx, tileHeightPx } = options.tileViewport;
    const sliceW = logicalW / cols;
    const sliceH = logicalH / rows;
    ctx.scale(tileWidthPx / sliceW, tileHeightPx / sliceH);
    ctx.translate(-col * sliceW, -row * sliceH);
  } else {
    ctx.scale(scale, scale);
  }

  ctx.direction = 'rtl';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Portrait Sheet Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
  bgGrad.addColorStop(0, '#FFFFFF');
  bgGrad.addColorStop(0.55, '#FCFBF7');
  bgGrad.addColorStop(1, '#F5EFE4');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // 2. Ornate Portrait Borders
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, logicalW - 32, logicalH - 32);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3.2;
  ctx.strokeRect(26, 26, logicalW - 52, logicalH - 52);

  // 3. Header Banner
  const bannerLeft = 38;
  const bannerTop = 34;
  const bannerW = logicalW - 76;
  const bannerH = headerHeight - 38;

  const hdrGrad = ctx.createLinearGradient(bannerLeft, bannerTop, bannerLeft + bannerW, bannerTop + bannerH);
  hdrGrad.addColorStop(0, '#093829');
  hdrGrad.addColorStop(0.5, '#0F4C3A');
  hdrGrad.addColorStop(1, '#145E48');
  ctx.fillStyle = hdrGrad;
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.fill();

  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3.5;
  drawRoundedRect(ctx, bannerLeft, bannerTop, bannerW, bannerH, 22);
  ctx.stroke();

  const rootFirstName = extractGivenName(rootPerson.fullName);
  const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  const titleFontSz = Math.min(48, Math.max(28, Math.round(logicalW * 0.032)));
  ctx.font = `900 ${titleFontSz}px Cairo, 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(`شجرة ${fullRootTitle}`, logicalW / 2, bannerTop + bannerH * 0.40);

  ctx.fillStyle = '#FDE68A';
  const subFontSz = Math.min(24, Math.max(15, Math.round(logicalW * 0.016)));
  ctx.font = `bold ${subFontSz}px Cairo, 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(
    `التخطيط الهرمي العمودي المدمج · كل جيل مميز بلون خاص (${totalNodes} فرداً · ${maxDepth} أجيال)`,
    logicalW / 2,
    bannerTop + bannerH * 0.76
  );

  // 4. Generation Color Legend Bar (`مفتاح ألوان الأجيال`)
  const legendTop = bannerTop + bannerH + 10;
  const legendBoxH = Math.max(48, legendHeight - 14);
  ctx.fillStyle = '#F8FAFC';
  drawRoundedRect(ctx, bannerLeft, legendTop, bannerW, legendBoxH, 14);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, bannerLeft, legendTop, bannerW, legendBoxH, 14);
  ctx.stroke();

  const chipGap = 12;
  const chipH = 34;
  const chipW = Math.min(138, Math.max(88, Math.floor((bannerW - 180 - generationsList.length * chipGap) / Math.max(1, generationsList.length))));
  const totalLegendContentW = generationsList.length * chipW + Math.max(0, generationsList.length - 1) * chipGap;
  let curChipRight = (logicalW + totalLegendContentW) / 2;
  const chipCenterY = legendTop + legendBoxH / 2;

  for (const genTheme of generationsList) {
    const chipLeft = curChipRight - chipW;
    ctx.fillStyle = genTheme.badgeBg;
    drawRoundedRect(ctx, chipLeft, chipCenterY - chipH / 2, chipW, chipH, 10);
    ctx.fill();
    ctx.strokeStyle = genTheme.border;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, chipLeft, chipCenterY - chipH / 2, chipW, chipH, 10);
    ctx.stroke();

    ctx.fillStyle = genTheme.badgeText;
    ctx.font = `900 ${Math.min(16, Math.max(11, Math.round(chipW * 0.13)))}px Cairo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(genTheme.depth === 1 ? 'الجيل 1 (الأصل)' : `الجيل ${genTheme.depth}`, chipLeft + chipW / 2, chipCenterY);

    curChipRight = chipLeft - chipGap;
  }

  // 5. Orthogonal Connector Lines (colored by parent's generation color)
  for (const link of links) {
    if (link.points.length < 2) continue;
    ctx.strokeStyle = link.color;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(link.points[0].x, link.points[0].y);
    for (let i = 1; i < link.points.length; i++) {
      ctx.lineTo(link.points[i].x, link.points[i].y);
    }
    ctx.stroke();
  }

  // 6. Generation-Colored Cards
  for (const node of nodes) {
    const { person, depth, x, y, theme } = node;
    const isRoot = depth === 1;
    const left = x - nodeW / 2;
    const top = y - nodeH / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    const cardGrad = ctx.createLinearGradient(left, top, left, top + nodeH);
    cardGrad.addColorStop(0, theme.bgStart);
    cardGrad.addColorStop(1, theme.bgEnd);
    ctx.fillStyle = cardGrad;
    drawRoundedRect(ctx, left, top, nodeW, nodeH, 18);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = isRoot ? 6 : 4.2;
    ctx.strokeStyle = theme.border;
    drawRoundedRect(ctx, left, top, nodeW, nodeH, 18);
    ctx.stroke();

    // Compact Top Header Strip inside Card (28% of card height so 72% is dedicated to the large name!)
    const badgeY = top + Math.round(nodeH * 0.165);
    const dividerY = top + Math.round(nodeH * 0.285);

    // Generation Pill on the Right
    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const pillFont = Math.min(22, Math.max(15, Math.floor(nodeH * 0.135)));
    ctx.font = `900 ${pillFont}px Cairo, sans-serif`;
    const pillW = Math.min(nodeW * 0.56, ctx.measureText(genLabel).width + 20);
    const pillH = Math.round(nodeH * 0.21);
    const pillLeft = left + nodeW - 12 - pillW;
    const pillTop = badgeY - pillH / 2;

    ctx.fillStyle = theme.badgeBg;
    drawRoundedRect(ctx, pillLeft, pillTop, pillW, pillH, 7);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.badgeText;
    ctx.fillText(genLabel, pillLeft + pillW / 2, badgeY);

    // Gender Pill on the Left
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const genderW = Math.max(50, ctx.measureText(genderLabel).width + 18);
    const genderLeft = left + 12;
    ctx.fillStyle = isRoot
      ? 'rgba(253, 230, 138, 0.18)'
      : person.gender === 'female'
      ? 'rgba(190, 18, 60, 0.10)'
      : 'rgba(15, 23, 42, 0.06)';
    drawRoundedRect(ctx, genderLeft, pillTop, genderW, pillH, 7);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = isRoot ? '#FDE68A' : person.gender === 'female' ? '#BE123C' : theme.subText;
    ctx.font = `900 ${pillFont}px Cairo, sans-serif`;
    ctx.fillText(genderLabel, genderLeft + genderW / 2, badgeY);

    // Divider line
    ctx.strokeStyle = theme.divider;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 12, dividerY);
    ctx.lineTo(left + nodeW - 12, dividerY);
    ctx.stroke();

    // High-Definition Crystal-Clear Large Name Typography (72% of card height)
    const displayName = extractGivenName(person.fullName);
    const maxTextWidth = nodeW - 14;
    const textCenterX = left + nodeW / 2;
    const textCenterY = dividerY + (nodeH - (dividerY - top)) / 2;

    let nameFontSize = Math.min(82, Math.floor(nodeH * 0.56));
    ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, sans-serif`;
    while (nameFontSize > 24 && ctx.measureText(displayName).width > maxTextWidth) {
      nameFontSize -= 1;
      ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, sans-serif`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.nameText;
    ctx.fillText(displayName, textCenterX, textCenterY);
  }

  // 7. Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0F172A';
  ctx.font = `900 ${Math.max(16, Math.round(logicalW * 0.012))}px Cairo, sans-serif`;
  ctx.fillText(
    `شجرة ${fullRootTitle} — التخطيط الهرمي العمودي (كل جيل مميز بلون خاص)`,
    logicalW / 2,
    logicalH - 28
  );

  return {
    canvas,
    rootFirstName,
    isLandscape: logicalW > logicalH,
    logicalW,
    logicalH
  };
}

export async function renderCombinedTreesToCanvas(
  options: ExportTreePdfOptions,
  roots: Person[]
): Promise<{
  canvas: HTMLCanvasElement;
  rootFirstName: string;
  isLandscape: boolean;
  logicalW: number;
  logicalH: number;
}> {
  await ensureCairoFontLoaded();

  // - 'classic' (هرمي أفقي - كل جيل في صف): تكديس عمودي (كل شجرة فوق الأخرى)
  // - 'classic_vertical' (هرمي عمودي): اصطفاف كل هرم عمودي بجانب الآخر (جنب الآخر)
  const isVerticalStack = options.mode === 'classic';
  const GAP = 44;
  const OUTER_PAD = 36;
  const MASTER_HEADER_H = 160;

  // Per-tree pixel cap so rendering multiple trees sequentially stays ultra-sharp
  const perTreeMaxDim = Math.max(3200, Math.min(5400, Math.floor(9600 / Math.sqrt(Math.max(1, roots.length)))));
  const perTreeMaxPixels = Math.max(6_500_000, Math.floor(28_000_000 / Math.max(1, roots.length)));

  const subTreeTargetAspect = options.targetAspectRatio
    ? isVerticalStack
      ? options.targetAspectRatio * roots.length * 1.05
      : options.targetAspectRatio / Math.max(1, roots.length)
    : undefined;

  // Render each selected tree with a high-DPI budget
  const subItems: {
    canvas: HTMLCanvasElement;
    root: Person;
    logicalW: number;
    logicalH: number;
  }[] = [];

  for (const r of roots) {
    const res = await renderTreeToCanvas({
      ...options,
      rootPerson: r,
      rootPersons: undefined,
      targetAspectRatio: subTreeTargetAspect,
      tileViewport: undefined,
      maxTargetDim: perTreeMaxDim,
      maxTargetPixels: perTreeMaxPixels
    });
    subItems.push({
      canvas: res.canvas,
      root: r,
      logicalW: res.logicalW || res.canvas.width,
      logicalH: res.logicalH || res.canvas.height
    });
  }

  let rawMasterW = 0;
  let rawMasterH = 0;

  if (isVerticalStack) {
    // Vertical stacking: each tree above the next using consistent logical dimensions
    const maxSubW = Math.max(...subItems.map((s) => s.logicalW));
    const sumSubH =
      subItems.reduce((acc, s) => acc + s.logicalH, 0) +
      Math.max(0, subItems.length - 1) * GAP;
    rawMasterW = maxSubW + OUTER_PAD * 2;
    rawMasterH = MASTER_HEADER_H + sumSubH + OUTER_PAD * 2;
  } else {
    // Side-by-side alignment (RTL: first tree on the right, next to its left)
    const sumSubW =
      subItems.reduce((acc, s) => acc + s.logicalW, 0) +
      Math.max(0, subItems.length - 1) * GAP;
    const maxSubH = Math.max(...subItems.map((s) => s.logicalH));
    rawMasterW = sumSubW + OUTER_PAD * 2;
    rawMasterH = MASTER_HEADER_H + maxSubH + OUTER_PAD * 2;
  }

  const maxRawDim = Math.max(rawMasterW, rawMasterH);
  const totalRawPixels = rawMasterW * rawMasterH;

  // Use high-resolution canvas dimensions for crisp combined trees
  const limitProfiles = [
    { maxDim: 7680, maxPixels: 24_000_000 },
    { maxDim: 6144, maxPixels: 18_000_000 },
    { maxDim: 4096, maxPixels: 12_000_000 },
    { maxDim: 3508, maxPixels: 8_800_000 }
  ];

  let masterCanvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1.0;

  for (const profile of limitProfiles) {
    const dimScale = profile.maxDim / maxRawDim;
    const areaScale = Math.sqrt(profile.maxPixels / totalRawPixels);
    const candidateScale = Math.min(2.0, dimScale, areaScale);

    const testW = Math.max(200, Math.round(rawMasterW * candidateScale));
    const testH = Math.max(200, Math.round(rawMasterH * candidateScale));

    try {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = testW;
      testCanvas.height = testH;
      const testCtx = testCanvas.getContext('2d');
      if (testCtx) {
        testCtx.fillStyle = '#000000';
        testCtx.fillRect(testW - 2, testH - 2, 2, 2);
        const pixel = testCtx.getImageData(testW - 1, testH - 1, 1, 1).data;
        if (pixel[3] === 255) {
          testCtx.clearRect(0, 0, testW, testH);
          masterCanvas = testCanvas;
          ctx = testCtx;
          scale = candidateScale;
          break;
        }
      }
    } catch {
      // try next profile
    }
  }

  if (!masterCanvas || !ctx) {
    throw new Error('تعذر حجز ذاكرة الرسم لتجميع الأشجار في صورة واحدة.');
  }

  ctx.scale(scale, scale);
  ctx.direction = 'rtl';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, rawMasterH);
  bgGrad.addColorStop(0, '#FCFBF7');
  bgGrad.addColorStop(0.5, '#F8F5EC');
  bgGrad.addColorStop(1, '#EFE6D5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, rawMasterW, rawMasterH);

  // Outer Double Frame
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, rawMasterW - 36, rawMasterH - 36);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, rawMasterW - 64, rawMasterH - 64);

  // Master Unified Header Banner
  const bannerX = OUTER_PAD;
  const bannerY = 42;
  const bannerW = rawMasterW - OUTER_PAD * 2;
  const bannerH = MASTER_HEADER_H - 32;

  ctx.fillStyle = '#0F4C3A';
  drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 22);
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 22);
  ctx.stroke();

  const treeNamesSummary = roots.map((r) => extractGivenName(r.fullName)).join(' · ');
  const layoutDesc =
    options.mode === 'classic'
      ? 'التصميم الهرمي الأفقي (كل جيل في صف) — اصطفاف كل شجرة فوق الأخرى'
      : 'التصميم الهرمي العمودي (كل جيل بلون) — اصطفاف كل هرم بجانب الآخر';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 ${Math.min(50, Math.max(28, Math.round(rawMasterW * 0.022)))}px Cairo, sans-serif`;
  ctx.fillText(
    `اللوحة المجمّعة لأشجار العائلة (${roots.length} أشجار): ${treeNamesSummary}`,
    rawMasterW / 2,
    bannerY + bannerH * 0.40
  );

  ctx.fillStyle = '#FDE68A';
  ctx.font = `bold ${Math.min(26, Math.max(16, Math.round(rawMasterW * 0.012)))}px Cairo, sans-serif`;
  ctx.fillText(
    `${layoutDesc}   ·   تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')} م`,
    rawMasterW / 2,
    bannerY + bannerH * 0.76
  );

  if (isVerticalStack) {
    // Draw each tree stacked vertically (one above the other) and release sub-canvas memory immediately
    let curY = MASTER_HEADER_H + OUTER_PAD;
    for (let i = 0; i < subItems.length; i++) {
      const item = subItems[i];
      const drawX = (rawMasterW - item.logicalW) / 2;
      ctx.drawImage(item.canvas, drawX, curY, item.logicalW, item.logicalH);
      // Free sub-canvas backing store immediately
      item.canvas.width = 1;
      item.canvas.height = 1;

      if (i < subItems.length - 1) {
        const divY = curY + item.logicalH + GAP / 2;
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.moveTo(OUTER_PAD + 50, divY);
        ctx.lineTo(rawMasterW - OUTER_PAD - 50, divY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      curY += item.logicalH + GAP;
    }
  } else {
    // Draw each vertical pyramid or botanical tree side-by-side from right to left (RTL)
    let curRightX = rawMasterW - OUTER_PAD;
    const contentTopY = MASTER_HEADER_H + OUTER_PAD;
    const maxSubH = Math.max(...subItems.map((s) => s.logicalH));

    for (let i = 0; i < subItems.length; i++) {
      const item = subItems[i];
      const drawX = curRightX - item.logicalW;
      // For vertical pyramids (`classic_vertical`), roots are at the top so align tops at `contentTopY`!
      const drawY = contentTopY;
      ctx.drawImage(item.canvas, drawX, drawY, item.logicalW, item.logicalH);
      // Free sub-canvas backing store immediately
      item.canvas.width = 1;
      item.canvas.height = 1;

      if (i < subItems.length - 1) {
        const divX = drawX - GAP / 2;
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 12]);
        ctx.beginPath();
        ctx.moveTo(divX, contentTopY + 36);
        ctx.lineTo(divX, contentTopY + maxSubH - 36);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      curRightX = drawX - GAP;
    }
  }

  const combinedTitle =
    roots.length === 1
      ? extractGivenName(roots[0].fullName)
      : `مجمعة_${roots.length}_أشجار_${roots
          .slice(0, 3)
          .map((r) => extractGivenName(r.fullName))
          .join('_')}`;

  return {
    canvas: masterCanvas,
    rootFirstName: combinedTitle,
    isLandscape: rawMasterW > rawMasterH,
    logicalW: rawMasterW,
    logicalH: rawMasterH
  };
}

export async function renderTreeToCanvas(options: ExportTreePdfOptions): Promise<{
  canvas: HTMLCanvasElement;
  rootFirstName: string;
  isLandscape: boolean;
  logicalW: number;
  logicalH: number;
}> {
  if (options.rootPersons && options.rootPersons.length > 1) {
    return renderCombinedTreesToCanvas(options, options.rootPersons);
  }
  if (options.mode === 'classic_vertical') {
    return renderVerticalPyramidToCanvas(options);
  }

  const {
    rootPerson,
    getChildren,
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
  let NODE_W = 330;
  let NODE_H = 156;
  let H_GAP = 22;

  if (leafCount <= 12) {
    NODE_W = 370;
    NODE_H = 172;
    H_GAP = 28;
  } else if (leafCount <= 25) {
    NODE_W = 330;
    NODE_H = 158;
    H_GAP = 22;
  } else if (leafCount <= 45) {
    NODE_W = 296;
    NODE_H = 146;
    H_GAP = 18;
  } else if (leafCount <= 75) {
    NODE_W = 270;
    NODE_H = 138;
    H_GAP = 14;
  } else {
    NODE_W = 248;
    NODE_H = 132;
    H_GAP = 12;
  }

  const isSplitFill = Boolean(options.targetAspectRatio && options.targetAspectRatio > 0.05);
  const HEADER_H = isSplitFill ? 156 : 196;
  const FOOTER_H = isSplitFill ? 46 : 58;
  const SIDE_PAD = isSplitFill ? 28 : 48;
  const TOP_TREE_PAD = isSplitFill ? 24 : 38;
  const BOTTOM_TREE_PAD = isSplitFill ? 26 : 42;
  const LEVEL_H = Math.max(236, Math.round(NODE_H * 1.68));

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
    const fromY = node.y + NODE_H / 2;

    for (const ch of node.childrenLayouts) {
      const chLeft = currentRight - ch.subtreeWidth;
      currentRight = chLeft - H_GAP;

      assignCoords(ch, chLeft);
      const toY = ch.y - NODE_H / 2;
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

  const initialLogicalW = Math.max(isSplitFill ? 820 : 1120, rootLayout.subtreeWidth + SIDE_PAD * 2);
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

  let logicalW = initialLogicalW;
  let logicalH = Math.ceil(maxNodeBottom + BOTTOM_TREE_PAD + FOOTER_H);

  // If targetAspectRatio is specified (Split Poster mode), expand the tree to fill 100% of every page from top to bottom!
  if (options.targetAspectRatio && options.targetAspectRatio > 0.05) {
    const targetAspect = options.targetAspectRatio;
    const currentAspect = logicalW / Math.max(1, logicalH);

    if (currentAspect > targetAspect * 1.005) {
      logicalH = Math.round(logicalW / targetAspect);
      const treeAreaTop = HEADER_H + TOP_TREE_PAD;
      const treeAreaBottom = logicalH - FOOTER_H - BOTTOM_TREE_PAD;
      const availTreeH = Math.max(NODE_H, treeAreaBottom - treeAreaTop);

      NODE_H = Math.max(
        NODE_H,
        Math.min(
          Math.round(NODE_W * 0.78),
          Math.floor((availTreeH / Math.max(1, maxDepth)) * 0.70)
        )
      );

      const minCenterY = treeAreaTop + NODE_H / 2;
      const maxCenterY = Math.max(minCenterY, treeAreaBottom - NODE_H / 2);

      for (const n of flatNodes) {
        n.y =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + ((n.depth - 1) / (maxDepth - 1)) * (maxCenterY - minCenterY);
      }
      for (const l of links) {
        const parentY =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + ((l.depth - 1) / (maxDepth - 1)) * (maxCenterY - minCenterY);
        const childY =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + (l.depth / (maxDepth - 1)) * (maxCenterY - minCenterY);
        l.fromY = parentY + NODE_H / 2;
        l.toY = childY - NODE_H / 2;
      }
    } else if (currentAspect < targetAspect * 0.995) {
      logicalW = Math.round(logicalH * targetAspect);
      let oldMinX = Infinity;
      let oldMaxX = -Infinity;
      for (const n of flatNodes) {
        if (n.x < oldMinX) oldMinX = n.x;
        if (n.x > oldMaxX) oldMaxX = n.x;
      }
      if (oldMaxX > oldMinX) {
        const oldSpanX = oldMaxX - oldMinX;
        const availW = Math.max(NODE_W, logicalW - SIDE_PAD * 2);
        const hFactor = Math.max(1, (availW - NODE_W) / oldSpanX);
        NODE_W = Math.min(Math.round(NODE_W * 1.48), Math.round(NODE_W * Math.sqrt(hFactor)));
        const newMinX = SIDE_PAD + NODE_W / 2;
        const newMaxX = Math.max(newMinX, logicalW - SIDE_PAD - NODE_W / 2);
        const mapX = (x: number) =>
          newMinX + ((x - oldMinX) / oldSpanX) * (newMaxX - newMinX);
        for (const n of flatNodes) n.x = mapX(n.x);
        for (const l of links) {
          l.fromX = mapX(l.fromX);
          l.toX = mapX(l.toX);
        }
      } else {
        for (const n of flatNodes) n.x = logicalW / 2;
      }
    }
  }

  // 5. High-Resolution Canvas Allocation with Hardware Backing-Store Verification
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let scale = 1.5;

  if (options.tileViewport) {
    const { tileWidthPx, tileHeightPx } = options.tileViewport;
    canvas = document.createElement('canvas');
    canvas.width = tileWidthPx;
    canvas.height = tileHeightPx;
    ctx = canvas.getContext('2d');
  } else {
    const maxLogicalDim = Math.max(logicalW, logicalH);
    const totalLogicalPixels = logicalW * logicalH;

    const targetMaxDim = options.maxTargetDim || 9600;
    const targetMaxPixels = options.maxTargetPixels || 32_000_000;

    const limitProfiles = [
      { maxDim: targetMaxDim, maxPixels: targetMaxPixels, desiredScale: 3.0 },
      { maxDim: Math.min(7680, targetMaxDim), maxPixels: Math.min(24_000_000, targetMaxPixels), desiredScale: 2.5 },
      { maxDim: Math.min(5400, targetMaxDim), maxPixels: Math.min(16_500_000, targetMaxPixels), desiredScale: 2.0 },
      { maxDim: Math.min(3800, targetMaxDim), maxPixels: Math.min(10_500_000, targetMaxPixels), desiredScale: 1.5 },
      { maxDim: Math.min(2480, targetMaxDim), maxPixels: Math.min(5_500_000, targetMaxPixels), desiredScale: 1.15 }
    ];

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
  }

  if (!canvas || !ctx) {
    throw new Error('تعذر حجز ذاكرة الرسم في المتصفح لكبر حجم الشجرة.');
  }

  if (options.tileViewport) {
    const { col, row, cols, rows, tileWidthPx, tileHeightPx } = options.tileViewport;
    const sliceW = logicalW / cols;
    const sliceH = logicalH / rows;
    ctx.scale(tileWidthPx / sliceW, tileHeightPx / sliceH);
    ctx.translate(-col * sliceW, -row * sliceH);
  } else {
    ctx.scale(scale, scale);
  }

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
  ctx.strokeRect(16, 16, logicalW - 32, logicalH - 32);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = unconstrained ? 4 : 3.5;
  ctx.strokeRect(26, 26, logicalW - 52, logicalH - 52);

  // Header Banner
  const bannerLeft = 38;
  const bannerTop = 34;
  const bannerW = logicalW - 76;
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
  const hdrTitleFont = Math.min(52, Math.max(32, Math.round(bannerH * 0.36)));
  ctx.font = `900 ${hdrTitleFont}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
  ctx.fillText(`شجرة ${fullRootTitle}`, logicalW / 2, bannerTop + bannerH * 0.40);

  ctx.fillStyle = '#FDE68A';
  const hdrSubFont = Math.min(26, Math.max(17, Math.round(bannerH * 0.18)));
  ctx.font = `900 ${hdrSubFont}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
  ctx.fillText(
    `إجمالي الأفراد: ${totalNodes} فرداً   ·   عدد الأجيال: ${maxDepth} أجيال   ·   تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`,
    logicalW / 2,
    bannerTop + bannerH * 0.76
  );

  // Standard Connecting Lines
  for (const link of links) {
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

    // Compact Top Header Strip inside Card (28% of card height so 72% is dedicated to the large name!)
    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const badgeFont = Math.min(24, Math.max(15, Math.floor(NODE_H * 0.145)));
    ctx.font = `900 ${badgeFont}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
    ctx.textBaseline = 'middle';

    const badgeY = top + Math.round(NODE_H * 0.165);
    const dividerY = top + Math.round(NODE_H * 0.285);

    // Right Badge (Generation)
    ctx.textAlign = 'right';
    ctx.fillStyle = isRoot ? '#FDE68A' : '#0F4C3A';
    ctx.fillText(genLabel, left + NODE_W - 16, badgeY);

    // Left Badge (Gender)
    ctx.textAlign = 'left';
    ctx.fillStyle = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';
    ctx.fillText(genderLabel, left + 16, badgeY);

    // Inner dividing line
    ctx.strokeStyle = isRoot ? 'rgba(253, 230, 138, 0.5)' : 'rgba(15, 23, 42, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 12, dividerY);
    ctx.lineTo(left + NODE_W - 12, dividerY);
    ctx.stroke();

    // ------------------------------------------------------------------------
    // HIGH-DEFINITION CRYSTAL CLEAR NAME TYPOGRAPHY (72% of Card Height)
    // ------------------------------------------------------------------------
    const displayName = extractGivenName(person.fullName);

    const maxTextWidth = NODE_W - 14;
    const textCenterX = left + NODE_W / 2;
    const cardContentHeight = NODE_H - (dividerY - top);
    const textCenterY = dividerY + cardContentHeight / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let nameFontSize = Math.min(86, Math.floor(NODE_H * 0.56));
    ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;

    while (nameFontSize > 24 && ctx.measureText(displayName).width > maxTextWidth) {
      nameFontSize -= 1;
      ctx.font = `900 ${nameFontSize}px Cairo, 'Segoe UI', Tahoma, Arial, sans-serif`;
    }

    ctx.fillStyle = isRoot ? '#FFFFFF' : '#000000';
    ctx.fillText(displayName, textCenterX, textCenterY);
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0F172A';
  ctx.font = "900 20px Cairo, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(
    `شجرة ${fullRootTitle}`,
    logicalW / 2,
    logicalH - 24
  );

  return { canvas, rootFirstName, isLandscape, logicalW, logicalH };
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
    collapsedNodes = new Set<string>(),
    includeFemales = true
  } = options;

  await ensureCairoFontLoaded();

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  if (options.rootPersons && options.rootPersons.length > 1) {
    const roots = options.rootPersons;
    const isVerticalStack = mode === 'classic';
    const GAP = 48;
    const OUTER_PAD = 40;
    const MASTER_HEADER_H = 168;

    const subTreeTargetAspect = options.targetAspectRatio
      ? isVerticalStack
        ? options.targetAspectRatio * roots.length * 1.05
        : options.targetAspectRatio / Math.max(1, roots.length)
      : undefined;

    const subSvgs: { content: string; w: number; h: number }[] = [];
    for (let i = 0; i < roots.length; i++) {
      const subBlobRes = await generateTreeSvgBlob({
        ...options,
        rootPerson: roots[i],
        rootPersons: undefined,
        targetAspectRatio: subTreeTargetAspect
      });
      const rawSvgText = await subBlobRes.blob.text();
      // Prefix gradient IDs per tree so nested SVGs never collide
      const scopedSvg = rawSvgText
        .replace(/<\?xml[^>]*\?>\s*/i, '')
        .replace(/id="(bgGrad|rootGrad)"/g, `id="$1_${i}"`)
        .replace(/url\(#(bgGrad|rootGrad)\)/g, `url(#$1_${i})`);

      const wMatch = scopedSvg.match(/width="(\d+)"/);
      const hMatch = scopedSvg.match(/height="(\d+)"/);
      const w = wMatch ? parseInt(wMatch[1], 10) : 1600;
      const h = hMatch ? parseInt(hMatch[1], 10) : 2200;
      subSvgs.push({ content: scopedSvg, w, h });
    }

    const masterW = isVerticalStack
      ? Math.max(...subSvgs.map((s) => s.w)) + OUTER_PAD * 2
      : subSvgs.reduce((acc, s) => acc + s.w, 0) + Math.max(0, subSvgs.length - 1) * GAP + OUTER_PAD * 2;

    const masterH = isVerticalStack
      ? MASTER_HEADER_H + subSvgs.reduce((acc, s) => acc + s.h, 0) + Math.max(0, subSvgs.length - 1) * GAP + OUTER_PAD * 2
      : MASTER_HEADER_H + Math.max(...subSvgs.map((s) => s.h)) + OUTER_PAD * 2;

    const treeNamesSummary = roots.map((r) => extractGivenName(r.fullName)).join(' · ');
    const layoutDesc =
      mode === 'classic'
        ? 'التصميم الهرمي الأفقي (كل جيل في صف) — اصطفاف كل شجرة فوق الأخرى'
        : 'التصميم الهرمي العمودي (كل جيل بلون) — اصطفاف كل هرم بجانب الآخر';

    let combinedSvg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    combinedSvg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${masterW} ${masterH}" width="${masterW}" height="${masterH}" dir="rtl">\n`;
    combinedSvg += `<defs><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&amp;display=swap'); text { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; dominant-baseline: central; }</style></defs>\n`;
    combinedSvg += `<rect width="100%" height="100%" fill="#F8F5EC" />\n`;
    combinedSvg += `<rect x="18" y="18" width="${masterW - 36}" height="${masterH - 36}" fill="none" stroke="#0F4C3A" stroke-width="10" />\n`;
    combinedSvg += `<rect x="32" y="32" width="${masterW - 64}" height="${masterH - 64}" fill="none" stroke="#D4AF37" stroke-width="4" />\n`;

    const bannerX = OUTER_PAD;
    const bannerY = 40;
    const bannerW = masterW - OUTER_PAD * 2;
    const bannerH = MASTER_HEADER_H - 32;
    combinedSvg += `<rect x="${bannerX}" y="${bannerY}" width="${bannerW}" height="${bannerH}" rx="24" fill="#0F4C3A" stroke="#D4AF37" stroke-width="4" />\n`;
    combinedSvg += `<text x="${masterW / 2}" y="${bannerY + bannerH * 0.40}" text-anchor="middle" font-size="${Math.min(54, Math.max(32, Math.round(masterW * 0.024)))}" font-weight="900" fill="#FFFFFF">${escapeXml(`اللوحة المجمّعة لأشجار العائلة (${roots.length} أشجار): ${treeNamesSummary}`)}</text>\n`;
    combinedSvg += `<text x="${masterW / 2}" y="${bannerY + bannerH * 0.76}" text-anchor="middle" font-size="${Math.min(28, Math.max(18, Math.round(masterW * 0.013)))}" font-weight="700" fill="#FDE68A">${escapeXml(layoutDesc)}</text>\n`;

    if (isVerticalStack) {
      let curY = MASTER_HEADER_H + OUTER_PAD;
      for (let i = 0; i < subSvgs.length; i++) {
        const s = subSvgs[i];
        const drawX = Math.round((masterW - s.w) / 2);
        combinedSvg += `<g transform="translate(${drawX}, ${curY})">${s.content}</g>\n`;
        curY += s.h + GAP;
      }
    } else {
      let curRightX = masterW - OUTER_PAD;
      const contentTopY = MASTER_HEADER_H + OUTER_PAD;
      for (let i = 0; i < subSvgs.length; i++) {
        const s = subSvgs[i];
        const drawX = curRightX - s.w;
        const drawY = contentTopY;
        combinedSvg += `<g transform="translate(${drawX}, ${drawY})">${s.content}</g>\n`;
        curRightX = drawX - GAP;
      }
    }

    combinedSvg += `</svg>`;
    const combinedTitle = `مجمعة_${roots.length}_أشجار_${roots
      .slice(0, 3)
      .map((r) => extractGivenName(r.fullName))
      .join('_')}`;
    const blob = new Blob([combinedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const filename = `شجرة_العائلة_${combinedTitle}.svg`.replace(/[\\/:*?"<>|]/g, '_');
    return { blob, filename, rootFirstName: combinedTitle };
  }

  if (mode === 'classic_vertical') {
    const rawLayout = computeVerticalPyramidLayout({
      rootPerson,
      getChildren,
      collapsedNodes,
      includeFemales,
      forScreen: false
    });
    const layout = applyTargetAspectRatioToVerticalPyramid(rawLayout, options.targetAspectRatio);
    const {
      nodes,
      links,
      logicalW,
      logicalH,
      maxDepth,
      totalNodes,
      nodeW,
      nodeH,
      headerHeight,
      legendHeight,
      generationsList
    } = layout;

    const rootFirstName = extractGivenName(rootPerson.fullName);
    const fullRootTitle = formatAppName(rootPerson.fullName) || rootFirstName;

    let svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svgStr += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logicalW} ${logicalH}" width="${logicalW}" height="${logicalH}" dir="rtl">\n`;
    svgStr += `<defs>\n`;
    svgStr += `  <style>\n`;
    svgStr += `    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&amp;display=swap');\n`;
    svgStr += `    text { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; dominant-baseline: central; }\n`;
    svgStr += `  </style>\n`;
    svgStr += `</defs>\n`;

    svgStr += `<rect width="100%" height="100%" fill="#FCFBF7" />\n`;
    svgStr += `<rect x="16" y="16" width="${logicalW - 32}" height="${logicalH - 32}" fill="none" stroke="#0F4C3A" stroke-width="8" />\n`;
    svgStr += `<rect x="26" y="26" width="${logicalW - 52}" height="${logicalH - 52}" fill="none" stroke="#D4AF37" stroke-width="3.2" />\n`;

    const bannerLeft = 38;
    const bannerTop = 34;
    const bannerW = logicalW - 76;
    const bannerH = headerHeight - 38;
    const titleFontSz = Math.min(48, Math.max(28, Math.round(logicalW * 0.032)));
    const subFontSz = Math.min(24, Math.max(15, Math.round(logicalW * 0.016)));

    svgStr += `<rect x="${bannerLeft}" y="${bannerTop}" width="${bannerW}" height="${bannerH}" rx="22" fill="#0F4C3A" stroke="#D4AF37" stroke-width="3.5" />\n`;
    svgStr += `<text x="${logicalW / 2}" y="${bannerTop + bannerH * 0.40}" text-anchor="middle" font-size="${titleFontSz}" font-weight="900" fill="#FFFFFF">${escapeXml(`شجرة ${fullRootTitle}`)}</text>\n`;
    svgStr += `<text x="${logicalW / 2}" y="${bannerTop + bannerH * 0.76}" text-anchor="middle" font-size="${subFontSz}" font-weight="700" fill="#FDE68A">${escapeXml(`التخطيط الهرمي العمودي المدمج · كل جيل مميز بلون خاص (${totalNodes} فرداً · ${maxDepth} أجيال)`)}</text>\n`;

    // Generation Legend Bar
    const legendTop = bannerTop + bannerH + 10;
    const legendBoxH = Math.max(48, legendHeight - 14);
    svgStr += `<rect x="${bannerLeft}" y="${legendTop}" width="${bannerW}" height="${legendBoxH}" rx="14" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" />\n`;

    const chipGap = 12;
    const chipH = 34;
    const chipW = Math.min(138, Math.max(88, Math.floor((bannerW - 180 - generationsList.length * chipGap) / Math.max(1, generationsList.length))));
    const totalLegendContentW = generationsList.length * chipW + Math.max(0, generationsList.length - 1) * chipGap;
    let curChipRight = (logicalW + totalLegendContentW) / 2;
    const chipCenterY = legendTop + legendBoxH / 2;

    for (const genTheme of generationsList) {
      const chipLeft = curChipRight - chipW;
      svgStr += `<rect x="${chipLeft}" y="${chipCenterY - chipH / 2}" width="${chipW}" height="${chipH}" rx="10" fill="${genTheme.badgeBg}" stroke="${genTheme.border}" stroke-width="1.5" />\n`;
      svgStr += `<text x="${chipLeft + chipW / 2}" y="${chipCenterY}" text-anchor="middle" font-size="${Math.min(16, Math.max(11, Math.round(chipW * 0.13)))}" font-weight="900" fill="${genTheme.badgeText}">${escapeXml(genTheme.depth === 1 ? 'الجيل 1 (الأصل)' : `الجيل ${genTheme.depth}`)}</text>\n`;
      curChipRight = chipLeft - chipGap;
    }

    // Links
    for (const l of links) {
      svgStr += `<path d="${l.svgPath}" fill="none" stroke="${l.color}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }

    // Nodes
    for (const node of nodes) {
      const { person, depth, x, y, theme } = node;
      const isRoot = depth === 1;
      const left = x - nodeW / 2;
      const top = y - nodeH / 2;
      const badgeY = top + Math.round(nodeH * 0.165);
      const dividerY = top + Math.round(nodeH * 0.285);
      const textCenterY = dividerY + (nodeH - (dividerY - top)) / 2;
      const displayName = extractGivenName(person.fullName);
      const nameFontSize =
        displayName.length > 14
          ? Math.round(nodeH * 0.36)
          : displayName.length > 10
          ? Math.round(nodeH * 0.44)
          : Math.min(82, Math.round(nodeH * 0.54));

      const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
      const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
      const genPillW = isRoot ? 124 : 96;
      const genPillH = Math.round(nodeH * 0.21);
      const genPillX = left + nodeW - 12 - genPillW;
      const genPillY = badgeY - genPillH / 2;

      const genderPillW = 58;
      const genderPillH = genPillH;
      const genderPillX = left + 12;
      const genderPillY = badgeY - genderPillH / 2;
      const genderTextColor = isRoot
        ? '#FDE68A'
        : person.gender === 'female'
        ? '#BE123C'
        : theme.subText;
      const genderBgColor = isRoot
        ? 'rgba(253, 230, 138, 0.16)'
        : person.gender === 'female'
        ? 'rgba(190, 18, 60, 0.10)'
        : 'rgba(15, 23, 42, 0.06)';

      svgStr += `<g>\n`;
      svgStr += `  <rect x="${left}" y="${top}" width="${nodeW}" height="${nodeH}" rx="18" fill="${theme.bgEnd}" stroke="${theme.border}" stroke-width="${isRoot ? 6 : 4.2}" />\n`;
      svgStr += `  <rect x="${genPillX}" y="${genPillY}" width="${genPillW}" height="${genPillH}" rx="7" fill="${theme.badgeBg}" />\n`;
      svgStr += `  <text x="${genPillX + genPillW / 2}" y="${badgeY}" text-anchor="middle" font-size="16" font-weight="900" fill="${theme.badgeText}">${escapeXml(genLabel)}</text>\n`;
      svgStr += `  <rect x="${genderPillX}" y="${genderPillY}" width="${genderPillW}" height="${genderPillH}" rx="7" fill="${genderBgColor}" />\n`;
      svgStr += `  <text x="${genderPillX + genderPillW / 2}" y="${badgeY}" text-anchor="middle" font-size="16" font-weight="900" fill="${genderTextColor}">${escapeXml(genderLabel)}</text>\n`;
      svgStr += `  <line x1="${left + 12}" y1="${dividerY}" x2="${left + nodeW - 12}" y2="${dividerY}" stroke="${theme.divider}" stroke-width="1.8" />\n`;
      svgStr += `  <text x="${left + nodeW / 2}" y="${textCenterY}" text-anchor="middle" font-size="${nameFontSize}" font-weight="900" fill="${theme.nameText}">${escapeXml(displayName)}</text>\n`;
      svgStr += `</g>\n`;
    }

    svgStr += `<text x="${logicalW / 2}" y="${logicalH - 28}" text-anchor="middle" font-size="18" font-weight="900" fill="#0F172A">${escapeXml(`شجرة ${fullRootTitle} — التخطيط الهرمي العمودي (كل جيل مميز بلون خاص)`)}</text>\n`;
    svgStr += `</svg>`;

    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const filename = `شجرة_هرمية_عمودية_${rootFirstName}.svg`.replace(/[\\/:*?"<>|]/g, '_');
    return { blob, filename, rootFirstName };
  }

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

  const isSplitFillSvg = Boolean(options.targetAspectRatio && options.targetAspectRatio > 0.05);
  let NODE_W = 310;
  let NODE_H = 152;
  const H_GAP = 20;
  const HEADER_H = isSplitFillSvg ? 156 : 196;
  const FOOTER_H = isSplitFillSvg ? 46 : 58;
  const SIDE_PAD = isSplitFillSvg ? 28 : 48;
  const TOP_TREE_PAD = isSplitFillSvg ? 24 : 38;
  const BOTTOM_TREE_PAD = isSplitFillSvg ? 26 : 42;
  const LEVEL_H = 248;

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
      const fromY = node.y + NODE_H / 2;

      for (const ch of node.childrenLayouts) {
        const chLeft = currentRight - ch.subtreeWidth;
        assignCoords(ch, chLeft);
        currentRight = chLeft - H_GAP;

        const toY = ch.y - NODE_H / 2;
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

  let logicalW = Math.max(isSplitFillSvg ? 820 : 1120, rootLayout.subtreeWidth + SIDE_PAD * 2);
  assignCoords(rootLayout, (logicalW - rootLayout.subtreeWidth) / 2);

  let maxNodeBottom = 0;
  for (const n of flatNodes) {
    if (n.y + NODE_H / 2 > maxNodeBottom) maxNodeBottom = n.y + NODE_H / 2;
  }
  let logicalH = Math.ceil(maxNodeBottom + BOTTOM_TREE_PAD + FOOTER_H);

  if (options.targetAspectRatio && options.targetAspectRatio > 0.05) {
    const targetAspect = options.targetAspectRatio;
    const currentAspect = logicalW / Math.max(1, logicalH);

    if (currentAspect > targetAspect * 1.005) {
      logicalH = Math.round(logicalW / targetAspect);
      const treeAreaTop = HEADER_H + TOP_TREE_PAD;
      const treeAreaBottom = logicalH - FOOTER_H - BOTTOM_TREE_PAD;
      const availTreeH = Math.max(NODE_H, treeAreaBottom - treeAreaTop);

      NODE_H = Math.max(
        NODE_H,
        Math.min(
          Math.round(NODE_W * 0.78),
          Math.floor((availTreeH / Math.max(1, maxDepth)) * 0.70)
        )
      );

      const minCenterY = treeAreaTop + NODE_H / 2;
      const maxCenterY = Math.max(minCenterY, treeAreaBottom - NODE_H / 2);

      for (const n of flatNodes) {
        n.y =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + ((n.depth - 1) / (maxDepth - 1)) * (maxCenterY - minCenterY);
      }
      for (const l of links) {
        const parentY =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + ((l.depth - 1) / (maxDepth - 1)) * (maxCenterY - minCenterY);
        const childY =
          maxDepth <= 1
            ? (minCenterY + maxCenterY) / 2
            : minCenterY + (l.depth / (maxDepth - 1)) * (maxCenterY - minCenterY);
        l.fromY = parentY + NODE_H / 2;
        l.toY = childY - NODE_H / 2;
      }
    } else if (currentAspect < targetAspect * 0.995) {
      logicalW = Math.round(logicalH * targetAspect);
      let oldMinX = Infinity;
      let oldMaxX = -Infinity;
      for (const n of flatNodes) {
        if (n.x < oldMinX) oldMinX = n.x;
        if (n.x > oldMaxX) oldMaxX = n.x;
      }
      if (oldMaxX > oldMinX) {
        const oldSpanX = oldMaxX - oldMinX;
        const availW = Math.max(NODE_W, logicalW - SIDE_PAD * 2);
        const hFactor = Math.max(1, (availW - NODE_W) / oldSpanX);
        NODE_W = Math.min(Math.round(NODE_W * 1.48), Math.round(NODE_W * Math.sqrt(hFactor)));
        const newMinX = SIDE_PAD + NODE_W / 2;
        const newMaxX = Math.max(newMinX, logicalW - SIDE_PAD - NODE_W / 2);
        const mapX = (x: number) =>
          newMinX + ((x - oldMinX) / oldSpanX) * (newMaxX - newMinX);
        for (const n of flatNodes) n.x = mapX(n.x);
        for (const l of links) {
          l.fromX = mapX(l.fromX);
          l.toX = mapX(l.toX);
        }
      } else {
        for (const n of flatNodes) n.x = logicalW / 2;
      }
    }
  }

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
  svgStr += `<rect x="16" y="16" width="${logicalW - 32}" height="${logicalH - 32}" fill="none" stroke="#064E3B" stroke-width="10" />\n`;
  svgStr += `<rect x="26" y="26" width="${logicalW - 52}" height="${logicalH - 52}" fill="none" stroke="#D97706" stroke-width="4" />\n`;

  // Header Banner
  const bannerLeft = 38;
  const bannerTop = 34;
  const bannerW = logicalW - 76;
  const bannerH = HEADER_H - 36;
  const hdrTitleFont = Math.min(52, Math.max(32, Math.round(bannerH * 0.36)));
  const hdrSubFont = Math.min(26, Math.max(17, Math.round(bannerH * 0.18)));
  svgStr += `<rect x="${bannerLeft}" y="${bannerTop}" width="${bannerW}" height="${bannerH}" rx="22" fill="#064E3B" stroke="#D97706" stroke-width="4" />\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + bannerH * 0.40}" text-anchor="middle" font-size="${hdrTitleFont}" font-weight="900" fill="#FFFFFF">${escapeXml(`شجرة ${fullRootTitle}`)}</text>\n`;
  svgStr += `<text x="${logicalW / 2}" y="${bannerTop + bannerH * 0.76}" text-anchor="middle" font-size="${hdrSubFont}" font-weight="900" fill="#FDE68A">${escapeXml(`إجمالي الأفراد: ${totalNodes} فرداً   ·   عدد الأجيال: ${maxDepth} أجيال   ·   تاريخ الإصدار: ${new Date().toLocaleDateString('ar-SA')}`)}</text>\n`;

  // Links
  links.forEach((l) => {
    const midY = (l.fromY + l.toY) / 2;
    svgStr += `<path d="M ${l.fromX} ${l.fromY} L ${l.fromX} ${midY} L ${l.toX} ${midY} L ${l.toX} ${l.toY}" fill="none" stroke="#064E3B" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />\n`;
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

    const badgeY = top + Math.round(NODE_H * 0.165);
    const dividerY = top + Math.round(NODE_H * 0.285);
    const cardContentHeight = NODE_H - (dividerY - top);
    const textCenterY = dividerY + cardContentHeight / 2;

    const genLabel = isRoot ? 'الأصل الراسخ' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    const genColor = isRoot ? '#FDE68A' : '#064E3B';
    const genderColor = isRoot ? '#FDE68A' : person.gender === 'male' ? '#047857' : '#BE123C';

    const genPillW = isRoot ? 132 : 102;
    const genPillH = Math.round(NODE_H * 0.21);
    const genPillX = left + NODE_W - 14 - genPillW;
    const genPillY = badgeY - genPillH / 2;
    const genPillBg = isRoot ? 'rgba(253, 230, 138, 0.16)' : '#ECFDF5';

    const genderPillW = 62;
    const genderPillH = genPillH;
    const genderPillX = left + 14;
    const genderPillY = badgeY - genderPillH / 2;
    const genderPillBg = isRoot
      ? 'rgba(253, 230, 138, 0.16)'
      : person.gender === 'female'
      ? '#FFE4E6'
      : '#F0FDF4';

    svgStr += `<g>\n`;
    svgStr += `  <rect x="${left}" y="${top}" width="${NODE_W}" height="${NODE_H}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" />\n`;
    svgStr += `  <rect x="${genPillX}" y="${genPillY}" width="${genPillW}" height="${genPillH}" rx="7" fill="${genPillBg}" />\n`;
    svgStr += `  <text x="${genPillX + genPillW / 2}" y="${badgeY}" text-anchor="middle" font-size="18" font-weight="900" fill="${genColor}">${escapeXml(genLabel)}</text>\n`;
    svgStr += `  <rect x="${genderPillX}" y="${genderPillY}" width="${genderPillW}" height="${genderPillH}" rx="7" fill="${genderPillBg}" />\n`;
    svgStr += `  <text x="${genderPillX + genderPillW / 2}" y="${badgeY}" text-anchor="middle" font-size="18" font-weight="900" fill="${genderColor}">${escapeXml(genderLabel)}</text>\n`;
    svgStr += `  <line x1="${left + 12}" y1="${dividerY}" x2="${left + NODE_W - 12}" y2="${dividerY}" stroke="${isRoot ? 'rgba(253,230,138,0.5)' : 'rgba(15,23,42,0.2)'}" stroke-width="2" />\n`;

    const displayName = extractGivenName(person.fullName);
    const textColor = isRoot ? '#FFFFFF' : '#000000';
    const nameFontSize =
      displayName.length > 14
        ? Math.round(NODE_H * 0.36)
        : displayName.length > 10
        ? Math.round(NODE_H * 0.44)
        : Math.min(86, Math.round(NODE_H * 0.55));
    svgStr += `  <text x="${left + NODE_W / 2}" y="${textCenterY}" text-anchor="middle" font-size="${nameFontSize}" font-weight="900" fill="${textColor}">${escapeXml(displayName)}</text>\n`;
    svgStr += `</g>\n`;
  });

  // Footer
  svgStr += `<text x="${logicalW / 2}" y="${logicalH - 24}" text-anchor="middle" font-size="20" font-weight="900" fill="#0F172A">${escapeXml(`شجرة ${fullRootTitle}`)}</text>\n`;
  svgStr += `</svg>`;

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `شجرة_العائلة_للمطابع_${rootFirstName}.svg`.replace(/[\\/:*?"<>|]/g, '_');
  return { blob, filename, rootFirstName };
}

export async function exportTreeToSvg(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
}> {
  const { blob, filename } = await generateTreeSvgBlob(options);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { blob, filename };
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
  // 1. Render master canvas with huge unconstrained card sizes & high-DPI limit
  const { canvas: masterCanvas, rootFirstName } = await renderTreeToCanvas({
    ...options,
    unconstrained: true,
    maxTargetDim: 7680,
    maxTargetPixels: 24_000_000
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
  // Match exact PDF page aspect ratio to the tile so each section fills 100% of the page from top to bottom!
  const baseShortPt = 841.89;
  const pageWidthPt = isLandscape
    ? Number(((tileWidthPx / Math.max(1, tileHeightPx)) * baseShortPt).toFixed(2))
    : baseShortPt;
  const pageHeightPt = isLandscape
    ? baseShortPt
    : Number(((tileHeightPx / Math.max(1, tileWidthPx)) * baseShortPt).toFixed(2));

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

      const pageLabel = `ورقة ${pageIndex} من ${totalPages}`;

      ctx.save();
      ctx.direction = 'rtl';
      const fontSize = Math.max(12, Math.min(15, Math.round(Math.min(tileWidthPx, tileHeightPx) * 0.0065)));
      ctx.font = `bold ${fontSize}px Cairo, sans-serif`;
      const badgeW = Math.ceil(ctx.measureText(pageLabel).width + 18);
      const badgeH = fontSize + 8;
      const edgePad = 3;

      const candidates: { x: number; y: number }[] = [
        { x: edgePad, y: tileHeightPx - badgeH - edgePad },
        { x: tileWidthPx - badgeW - edgePad, y: tileHeightPx - badgeH - edgePad },
        { x: edgePad, y: edgePad },
        { x: tileWidthPx - badgeW - edgePad, y: edgePad },
        { x: Math.round((tileWidthPx - badgeW) / 2), y: tileHeightPx - badgeH - edgePad },
        { x: Math.round((tileWidthPx - badgeW) / 2), y: edgePad }
      ];

      let bestPos = candidates[0];
      let lowestPenalty = Number.POSITIVE_INFINITY;

      for (const cand of candidates) {
        const checkPad = 10;
        const sx = Math.max(0, cand.x - checkPad);
        const sy = Math.max(0, cand.y - checkPad);
        const sw = Math.min(tileWidthPx - sx, badgeW + checkPad * 2);
        const sh = Math.min(tileHeightPx - sy, badgeH + checkPad * 2);
        try {
          const imgData = ctx.getImageData(sx, sy, sw, sh).data;
          let penalty = 0;
          for (let i = 0; i < imgData.length; i += 16) {
            const red = imgData[i];
            const green = imgData[i + 1];
            const blue = imgData[i + 2];
            if (red < 120 && green < 120 && blue < 120) {
              penalty += 50;
            } else if (red < 232 || green < 226 || blue < 215) {
              penalty += 4;
            }
          }
          if (penalty < lowestPenalty) {
            lowestPenalty = penalty;
            bestPos = cand;
            if (penalty === 0) break;
          }
        } catch {
          // Ignore
        }
      }

      ctx.fillStyle = 'rgba(252, 251, 247, 0.86)';
      drawRoundedRect(ctx, bestPos.x, bestPos.y, badgeW, badgeH, 5);
      ctx.fill();

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, bestPos.x, bestPos.y, badgeW, badgeH, 5);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 76, 58, 0.80)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pageLabel, bestPos.x + badgeW / 2, bestPos.y + badgeH / 2 + 1);
      ctx.restore();

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

  const rootFirstName =
    options.rootPersons && options.rootPersons.length > 1
      ? `مجمعة_${options.rootPersons.length}_أشجار_${options.rootPersons
          .slice(0, 3)
          .map((r) => extractGivenName(r.fullName))
          .join('_')}`
      : extractGivenName(rootPerson.fullName);

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

  const rootsToTraverse =
    options.rootPersons && options.rootPersons.length > 1
      ? options.rootPersons
      : [rootPerson];
  for (const r of rootsToTraverse) {
    collectFathersRecursive(r, 1, []);
  }

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

  // When multiple trees are selected, include the full combined visual poster as Page 1!
  if (options.rootPersons && options.rootPersons.length > 1) {
    const { canvas: visualCanvas, isLandscape } = await renderTreeToCanvas({
      ...options,
      collapsedNodes: new Set<string>(),
      orientation: 'portrait',
      includeFemales
    });
    const pw = isLandscape ? 841.89 : 595.28;
    const ph = isLandscape ? 595.28 : 841.89;
    pdfPages.push(encodeCanvasToSafeJpegPage(visualCanvas, 0.95, pw, ph));
  }

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

export async function exportTreeToPdf(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
}> {
  const { blob, filename } = await generateTreePdfBlob(options);
  triggerBlobDownload(blob, filename);
  return { blob, filename };
}

/**
 * Generates a 1-page High-Resolution Visual Tree Poster PDF (single tree or combined multi-tree,
 * preserving the exact aspect ratio of the rendered tree canvas).
 */
export async function generateVisualTreePosterPdfBlob(options: ExportTreePdfOptions): Promise<{
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

  const w = Math.max(100, canvas.width);
  const h = Math.max(100, canvas.height);
  const baseShortSidePt = 841.89; // A3 / A4 crisp PDF points
  const pageWidthPt = w >= h ? Math.round((w / h) * baseShortSidePt) : baseShortSidePt;
  const pageHeightPt = h > w ? Math.round((h / w) * baseShortSidePt) : baseShortSidePt;

  const pagePacket = encodeCanvasToSafeJpegPage(canvas, 0.95, pageWidthPt, pageHeightPt);
  const pdfBlob = createPdfBlobFromJpegPages([pagePacket]);
  const filename = `لوحة_شجرة_العائلة_${rootFirstName}.pdf`.replace(/[\\/:*?"<>|]/g, '_');

  return { blob: pdfBlob, filename, rootFirstName };
}

export async function exportVisualTreePosterToPdf(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
}> {
  const { blob, filename } = await generateVisualTreePosterPdfBlob(options);
  triggerBlobDownload(blob, filename);
  return { blob, filename };
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

export async function exportTreeToPng(options: ExportTreePdfOptions): Promise<{
  blob: Blob;
  filename: string;
}> {
  const { blob, filename } = await generateTreePngBlob(options);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return { blob, filename };
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
      title: `${idx + 1}. ${formatQuadrupleName(ch, allPersons)}`,
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
