import { Person } from '../types/family';
import { extractGivenName } from './nameUtils';
import {
  ExportTreePdfOptions,
  renderTreeToCanvas,
  generateTreeSvgBlob
} from './pdfExport';
import { buildZipArchiveBlob, ZipEntryInput } from './zipExport';

export type SplitPaperSize = 'A4' | 'A3';
export type SplitOrientation = 'portrait' | 'landscape' | 'auto';
export type SplitExportFormat = 'pdf' | 'png_zip' | 'svg_zip' | 'all_zip';
export type SplitLayoutType =
  | 'auto_smart' // تقسيم ذكي تلقائي حسب حجم الشجرة ودقة الأسماء
  | 'horizontal_strip' // شريط أفقي (تُلصق جنباً إلى جنب: 1 × N)
  | 'vertical_strip' // شريط عمودي (تُلصق فوق بعضها: N × 1)
  | 'custom_grid'; // شبكة مخصصة (أعمدة × صفوف)

export interface SplitExportConfig {
  roots: Person[]; // شجرة واحدة أو عدة أشجار مدمجة
  getChildren: (personId: string) => Person[];
  mode: 'classic' | 'classic_vertical';
  includeFemales: boolean;
  collapsedNodes?: Set<string>;
  paperSize: SplitPaperSize;
  orientation: SplitOrientation;
  layoutType: SplitLayoutType;
  targetPagesCount: number; // عند اختيار شريط أفقي أو عمودي (مثلاً 2، 3، 4، 5، 6...)
  customCols: number; // عند اختيار شبكة مخصصة
  customRows: number; // عند اختيار شبكة مخصصة
  format: SplitExportFormat;
  seamlesslyBorderless: boolean; // بدون هوامش داخلية (تتصل مباشرة عند القص/اللصق)
  showSubtleCornerBadge: boolean; // رقم تسلسل صغير في الزاوية لترتيب اللصق
}

export interface ComputedGridPreview {
  cols: number;
  rows: number;
  totalPages: number;
  resolvedOrientation: 'portrait' | 'landscape';
  pageWidthMm: number;
  pageHeightMm: number;
  totalPosterWidthCm: number;
  totalPosterHeightCm: number;
}

/**
 * Computes the optimal grid (cols x rows) and physical dimensions for the split poster
 */
export function computeSplitPosterGrid(
  config: Pick<
    SplitExportConfig,
    | 'mode'
    | 'paperSize'
    | 'orientation'
    | 'layoutType'
    | 'targetPagesCount'
    | 'customCols'
    | 'customRows'
  >,
  estimatedAspectRatio: number = 1.4, // width / height
  estimatedNodesCount: number = 25
): ComputedGridPreview {
  const {
    mode,
    paperSize,
    orientation,
    layoutType,
    targetPagesCount,
    customCols,
    customRows
  } = config;

  // Determine orientation
  let resolvedOrientation: 'portrait' | 'landscape' = 'portrait';
  if (orientation === 'auto') {
    resolvedOrientation =
      mode === 'classic' || estimatedAspectRatio >= 1.15 ? 'landscape' : 'portrait';
  } else {
    resolvedOrientation = orientation;
  }

  // Standard ISO paper sizes in mm
  const baseShortMm = paperSize === 'A3' ? 297 : 210;
  const baseLongMm = paperSize === 'A3' ? 420 : 297;

  const pageWidthMm = resolvedOrientation === 'landscape' ? baseLongMm : baseShortMm;
  const pageHeightMm = resolvedOrientation === 'landscape' ? baseShortMm : baseLongMm;

  let cols = 2;
  let rows = 2;

  if (layoutType === 'horizontal_strip') {
    cols = Math.max(1, Math.min(20, Math.round(targetPagesCount || 3)));
    rows = 1;
  } else if (layoutType === 'vertical_strip') {
    cols = 1;
    rows = Math.max(1, Math.min(20, Math.round(targetPagesCount || 3)));
  } else if (layoutType === 'custom_grid') {
    cols = Math.max(1, Math.min(12, Math.round(customCols || 2)));
    rows = Math.max(1, Math.min(12, Math.round(customRows || 2)));
  } else {
    // 'auto_smart': Automatically determine optimal cols x rows so every name is crystal clear
    if (mode === 'classic') {
      // Horizontal rows tree is usually wide
      if (estimatedNodesCount <= 15) {
        cols = 2;
        rows = 1;
      } else if (estimatedNodesCount <= 35) {
        cols = 3;
        rows = 1;
      } else if (estimatedNodesCount <= 65) {
        cols = 2;
        rows = 2;
      } else if (estimatedNodesCount <= 110) {
        cols = 3;
        rows = 2;
      } else {
        cols = 4;
        rows = 2;
      }
    } else {
      // Vertical column pyramid or organic botanical tree
      if (estimatedNodesCount <= 18) {
        cols = 1;
        rows = 2;
      } else if (estimatedNodesCount <= 40) {
        cols = 1;
        rows = 3;
      } else if (estimatedNodesCount <= 75) {
        cols = 2;
        rows = 2;
      } else if (estimatedNodesCount <= 120) {
        cols = 2;
        rows = 3;
      } else {
        cols = 3;
        rows = 3;
      }
    }
  }

  const totalPages = cols * rows;
  const totalPosterWidthCm = Number(((cols * pageWidthMm) / 10).toFixed(1));
  const totalPosterHeightCm = Number(((rows * pageHeightMm) / 10).toFixed(1));

  return {
    cols,
    rows,
    totalPages,
    resolvedOrientation,
    pageWidthMm,
    pageHeightMm,
    totalPosterWidthCm,
    totalPosterHeightCm
  };
}

function createPdfBlobFromJpegPagesLocal(
  pages: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[]
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const pageCount = pages.length;
  const kidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');

  offsets[1] = offset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets[2] = offset;
  pushStr(`2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [ ${kidsRefs} ] >>\nendobj\n`);

  for (let i = 0; i < pageCount; i++) {
    const p = pages[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;

    const wPt = p.pageWidthPt.toFixed(2);
    const hPt = p.pageHeightPt.toFixed(2);

    offsets[pageObjId] = offset;
    pushStr(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${wPt} ${hPt} ] /Rotate 0 ` +
        `/Resources << /XObject << /Im${i} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\n` +
        `endobj\n`
    );

    // Full-bleed edge-to-edge drawing (0 margins so adjacent pages connect seamlessly)
    const contentStream = `q\n${wPt} 0 0 ${hPt} 0 0 cm\n/Im${i} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    offsets[contentObjId] = offset;
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');

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

  const totalObjects = 2 + pageCount * 3 + 1;
  const xrefOffset = offset;
  pushStr(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`);
  for (let objId = 1; objId < totalObjects; objId++) {
    const offStr = String(offsets[objId] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks as any[], { type: 'application/pdf' });
}

function canvasToJpegUint8(canvas: HTMLCanvasElement, quality = 0.96): Uint8Array {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function canvasToPngUint8(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(new Uint8Array(0));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Generates and downloads a Multi-Page / Multi-Sheet Split Poster in PDF, PNG (ZIP), SVG (ZIP), or All Formats
 * Each tile fills the target page at maximum uniform scale so that when printed and placed side-by-side
 * without margins, the pieces form one continuous, high-resolution giant tree.
 */
export async function executeSplitPosterExport(
  config: SplitExportConfig,
  estimatedNodesCount: number = 30
): Promise<{ filename: string; totalPages: number; cols: number; rows: number }> {
  const {
    roots,
    getChildren,
    mode,
    includeFemales,
    collapsedNodes = new Set<string>(),
    paperSize,
    showSubtleCornerBadge,
    format
  } = config;

  if (roots.length === 0) {
    throw new Error('الرجاء اختيار شجرة واحدة على الأقل للتصدير.');
  }

  const primaryRoot = roots[0];
  const multiRoots = roots.length > 1 ? roots : undefined;

  const filteredGetChildren = (personId: string) => {
    const kids = getChildren(personId);
    return includeFemales ? kids : kids.filter((c) => c.gender === 'male');
  };

  // 1. Compute optimal or user-requested grid
  const initialEstAspect = mode === 'classic' ? 2.4 : 0.82;
  const grid = computeSplitPosterGrid(config, initialEstAspect, estimatedNodesCount);
  const { cols, rows, totalPages, resolvedOrientation } = grid;

  // 2. Determine exact PDF Points & High-DPI Pixel dimensions for each sheet
  //    A4 = 595.28 x 841.89 pt  |  A3 = 841.89 x 1190.55 pt
  const shortPt = paperSize === 'A3' ? 841.89 : 595.28;
  const longPt = paperSize === 'A3' ? 1190.55 : 841.89;

  const pageWidthPt = resolvedOrientation === 'landscape' ? longPt : shortPt;
  const pageHeightPt = resolvedOrientation === 'landscape' ? shortPt : longPt;

  // True 300+ DPI per page so every single card and name is razor-sharp when printed on A4/A3
  const baseLongPx = paperSize === 'A3' ? 3508 : 3000;
  const baseShortPx = Math.round(baseLongPx * (shortPt / longPt));

  const tileWidthPx = resolvedOrientation === 'landscape' ? baseLongPx : baseShortPx;
  const tileHeightPx = resolvedOrientation === 'landscape' ? baseShortPx : baseLongPx;

  // Exact aspect ratio of the assembled (cols x rows) multi-page poster
  const targetPosterAspect = (cols * pageWidthPt) / Math.max(1, rows * pageHeightPt);

  const renderOptions: ExportTreePdfOptions = {
    rootPerson: primaryRoot,
    rootPersons: multiRoots,
    getChildren: filteredGetChildren,
    mode,
    collapsedNodes,
    unconstrained: true,
    orientation: 'portrait',
    includeFemales,
    targetAspectRatio: targetPosterAspect,
    maxTargetDim: 9600,
    maxTargetPixels: 32_000_000
  };

  const rootFirstName =
    roots.length === 1
      ? extractGivenName(primaryRoot.fullName)
      : `مجمعة_${roots.length}_أشجار_${roots
          .slice(0, 3)
          .map((r) => extractGivenName(r.fullName))
          .join('_')}`;

  const pdfPages: {
    jpegBytes: Uint8Array;
    widthPx: number;
    heightPx: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }[] = [];

  const pngZipEntries: ZipEntryInput[] = [];

  const needRasterTiles = format === 'pdf' || format === 'png_zip' || format === 'all_zip';

  if (needRasterTiles) {
    // For combined multi-trees, render the high-DPI master canvas once with targetPosterAspect
    let combinedMasterCanvas: HTMLCanvasElement | null = null;
    if (multiRoots) {
      const combinedRes = await renderTreeToCanvas(renderOptions);
      combinedMasterCanvas = combinedRes.canvas;
    }

    let pageCounter = 1;

    for (let r = 0; r < rows; r++) {
      // Iterate from Right to Left (RTL) so Page 1 is the Top-Right sheet, matching Arabic reading & pasting order
      for (let rtlCol = 0; rtlCol < cols; rtlCol++) {
        const c = cols - 1 - rtlCol; // physical column index from left (0 .. cols-1)

        let tileCanvas: HTMLCanvasElement;
        let tCtx: CanvasRenderingContext2D;

        if (!multiRoots) {
          // Single tree: Render this exact page tile DIRECTLY from vector paths & vector fonts at 300+ DPI!
          // Every section fills 100% of its page from top (y=0) to bottom (y=tileHeightPx) and right to left!
          const tileRes = await renderTreeToCanvas({
            ...renderOptions,
            tileViewport: {
              col: c,
              row: r,
              cols,
              rows,
              tileWidthPx,
              tileHeightPx
            }
          });
          tileCanvas = tileRes.canvas;
          tCtx = tileCanvas.getContext('2d')!;
        } else {
          // Combined multi-trees: Slice the exact (1/cols x 1/rows) section and draw edge-to-edge filling 100% of the page!
          tileCanvas = document.createElement('canvas');
          tileCanvas.width = tileWidthPx;
          tileCanvas.height = tileHeightPx;
          tCtx = tileCanvas.getContext('2d')!;
          tCtx.direction = 'rtl';
          tCtx.imageSmoothingEnabled = true;
          tCtx.imageSmoothingQuality = 'high';

          const srcW = combinedMasterCanvas!.width;
          const srcH = combinedMasterCanvas!.height;
          const srcTileW = srcW / cols;
          const srcTileH = srcH / rows;
          const srcX = c * srcTileW;
          const srcY = r * srcTileH;

          tCtx.drawImage(
            combinedMasterCanvas!,
            srcX,
            srcY,
            srcTileW,
            srcTileH,
            0,
            0,
            tileWidthPx,
            tileHeightPx
          );
        }

        // Optional ultra-subtle hair-line cut/join marks at connecting inner edges
        tCtx.save();
        tCtx.setTransform(1, 0, 0, 1, 0, 0);
        tCtx.direction = 'rtl';
        tCtx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
        tCtx.lineWidth = 1.5;
        tCtx.setLineDash([10, 10]);

        if (c > 0) {
          tCtx.beginPath();
          tCtx.moveTo(1, 0);
          tCtx.lineTo(1, tileHeightPx);
          tCtx.stroke();
        }
        if (c < cols - 1) {
          tCtx.beginPath();
          tCtx.moveTo(tileWidthPx - 1, 0);
          tCtx.lineTo(tileWidthPx - 1, tileHeightPx);
          tCtx.stroke();
        }
        if (r > 0) {
          tCtx.beginPath();
          tCtx.moveTo(0, 1);
          tCtx.lineTo(tileWidthPx, 1);
          tCtx.stroke();
        }
        if (r < rows - 1) {
          tCtx.beginPath();
          tCtx.moveTo(0, tileHeightPx - 1);
          tCtx.lineTo(tileWidthPx, tileHeightPx - 1);
          tCtx.stroke();
        }
        tCtx.restore();

        // Optional small corner assembly badge so the user knows exact row/col order when gluing
        // Optional tiny non-overlapping sheet number so the user knows order without EVER covering any name
        if (showSubtleCornerBadge) {
          const badgeLabel = `ورقة ${pageCounter} من ${totalPages}`;

          tCtx.save();
          tCtx.setTransform(1, 0, 0, 1, 0, 0);
          tCtx.direction = 'rtl';
          const fontSize = Math.max(12, Math.min(15, Math.round(Math.min(tileWidthPx, tileHeightPx) * 0.0065)));
          tCtx.font = `bold ${fontSize}px Cairo, sans-serif`;
          const badgeW = Math.ceil(tCtx.measureText(badgeLabel).width + 18);
          const badgeH = fontSize + 8;
          const edgePad = 3;

          // Candidate positions along the extreme 3px outer perimeter of the sheet
          const candidates: { x: number; y: number }[] = [
            { x: edgePad, y: tileHeightPx - badgeH - edgePad }, // Bottom-Left
            { x: tileWidthPx - badgeW - edgePad, y: tileHeightPx - badgeH - edgePad }, // Bottom-Right
            { x: edgePad, y: edgePad }, // Top-Left
            { x: tileWidthPx - badgeW - edgePad, y: edgePad }, // Top-Right
            { x: Math.round((tileWidthPx - badgeW) / 2), y: tileHeightPx - badgeH - edgePad }, // Bottom-Center
            { x: Math.round((tileWidthPx - badgeW) / 2), y: edgePad }, // Top-Center
            { x: Math.round(tileWidthPx * 0.25), y: tileHeightPx - badgeH - edgePad },
            { x: Math.round(tileWidthPx * 0.75 - badgeW), y: tileHeightPx - badgeH - edgePad },
            { x: Math.round(tileWidthPx * 0.25), y: edgePad },
            { x: Math.round(tileWidthPx * 0.75 - badgeW), y: edgePad }
          ];

          // Scan candidate spots with a 10px safety buffer around the badge to find 100% empty paper background
          let bestPos = candidates[0];
          let lowestPenalty = Number.POSITIVE_INFINITY;

          for (const cand of candidates) {
            const checkPad = 10;
            const sx = Math.max(0, cand.x - checkPad);
            const sy = Math.max(0, cand.y - checkPad);
            const sw = Math.min(tileWidthPx - sx, badgeW + checkPad * 2);
            const sh = Math.min(tileHeightPx - sy, badgeH + checkPad * 2);

            try {
              const imgData = tCtx.getImageData(sx, sy, sw, sh).data;
              let penalty = 0;
              // Sample every 4th pixel for speed
              for (let i = 0; i < imgData.length; i += 16) {
                const red = imgData[i];
                const green = imgData[i + 1];
                const blue = imgData[i + 2];
                // Cream/white background has R > 235, G > 230, B > 220
                if (red < 120 && green < 120 && blue < 120) {
                  // Dark text or card border -> heavy penalty so we never touch a name!
                  penalty += 50;
                } else if (red < 232 || green < 226 || blue < 215) {
                  // Card fill or decorative line
                  penalty += 4;
                }
              }
              if (penalty < lowestPenalty) {
                lowestPenalty = penalty;
                bestPos = cand;
                if (penalty === 0) break; // Found 100% pure empty paper spot!
              }
            } catch {
              // Ignore and keep default
            }
          }

          const bx = bestPos.x;
          const by = bestPos.y;

          // Subtle translucent light paper pill so it blends gently and never obscures anything
          tCtx.fillStyle = 'rgba(252, 251, 247, 0.86)';
          tCtx.beginPath();
          tCtx.roundRect(bx, by, badgeW, badgeH, 5);
          tCtx.fill();

          tCtx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
          tCtx.lineWidth = 1;
          tCtx.stroke();

          tCtx.fillStyle = 'rgba(15, 76, 58, 0.80)';
          tCtx.textAlign = 'center';
          tCtx.textBaseline = 'middle';
          tCtx.fillText(badgeLabel, bx + badgeW / 2, by + badgeH / 2 + 1);
          tCtx.restore();
        }

        if (format === 'pdf' || format === 'all_zip') {
          const jpegBytes = canvasToJpegUint8(tileCanvas, 0.97);
          pdfPages.push({
            jpegBytes,
            widthPx: tileWidthPx,
            heightPx: tileHeightPx,
            pageWidthPt,
            pageHeightPt
          });
        }

        if (format === 'png_zip' || format === 'all_zip') {
          const pngBytes = await canvasToPngUint8(tileCanvas);
          const padNum = String(pageCounter).padStart(2, '0');
          const fileName = `قطعة_${padNum}_من_${totalPages}_صف${r + 1}_عمود${rtlCol + 1}_${rootFirstName}.png`;
          pngZipEntries.push({
            path: format === 'all_zip' ? `صور_PNG_مقسمة/${fileName}` : fileName,
            data: pngBytes
          });
        }

        tileCanvas.width = 1;
        tileCanvas.height = 1;

        pageCounter++;
      }
    }

    if (combinedMasterCanvas) {
      combinedMasterCanvas.width = 1;
      combinedMasterCanvas.height = 1;
    }
  }

  // 4. Generate Vector SVG split tiles if requested (`svg_zip` or `all_zip`)
  const svgZipEntries: ZipEntryInput[] = [];
  if (format === 'svg_zip' || format === 'all_zip') {
    const masterSvgRes = await generateTreeSvgBlob(renderOptions);
    const masterSvgText = await masterSvgRes.blob.text();

    const wMatch = masterSvgText.match(/width="(\d+)"/);
    const hMatch = masterSvgText.match(/height="(\d+)"/);
    const svgTotalW = wMatch ? parseInt(wMatch[1], 10) : cols * 1600;
    const svgTotalH = hMatch ? parseInt(hMatch[1], 10) : rows * 1600;

    const innerSvgContent = masterSvgText
      .replace(/<\?xml[^>]*\?>\s*/i, '')
      .replace(/^<svg[^>]*>/i, '')
      .replace(/<\/svg>\s*$/i, '');

    const sliceSvgW = svgTotalW / cols;
    const sliceSvgH = svgTotalH / rows;
    const outSvgW = Math.round(pageWidthPt * 2);
    const outSvgH = Math.round(pageHeightPt * 2);

    const encoder = new TextEncoder();
    let pageCounter = 1;

    for (let r = 0; r < rows; r++) {
      for (let rtlCol = 0; rtlCol < cols; rtlCol++) {
        const c = cols - 1 - rtlCol;
        const vx = c * sliceSvgW;
        const vy = r * sliceSvgH;

        let tileSvg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        tileSvg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${sliceSvgW.toFixed(2)} ${sliceSvgH.toFixed(2)}" width="${outSvgW}" height="${outSvgH}" preserveAspectRatio="none" dir="rtl">\n`;
        tileSvg += `<rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${sliceSvgW.toFixed(2)}" height="${sliceSvgH.toFixed(2)}" fill="#FCFBF7" />\n`;
        tileSvg += innerSvgContent;
        if (showSubtleCornerBadge) {
          const badgeText = `ورقة ${pageCounter} من ${totalPages}`;
          const bx = vx + 4;
          const by = vy + sliceSvgH - 20;
          tileSvg += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="84" height="16" rx="4" fill="#FCFBF7" fill-opacity="0.86" stroke="#D4AF37" stroke-width="0.7" stroke-opacity="0.55" />\n`;
          tileSvg += `<text x="${(bx + 42).toFixed(1)}" y="${(by + 8).toFixed(1)}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="9.5" font-weight="bold" fill="#0F4C3A" fill-opacity="0.8">${badgeText}</text>\n`;
        }
        tileSvg += `</svg>`;

        const padNum = String(pageCounter).padStart(2, '0');
        const fileName = `قطعة_فيكتور_${padNum}_من_${totalPages}_صف${r + 1}_عمود${rtlCol + 1}_${rootFirstName}.svg`;
        svgZipEntries.push({
          path: format === 'all_zip' ? `ملفات_SVG_مقسمة/${fileName}` : fileName,
          data: encoder.encode(tileSvg)
        });
        pageCounter++;
      }
    }
  }

  const modeTitle = mode === 'classic' ? 'الهرمي_صفوف' : 'الهرمي_عمود';
  const gridDesc = `${cols}x${rows}_${totalPages}صفحات_${paperSize}`;

  // 5. Deliver final file (Direct Multi-Page PDF or ZIP Archive of Split Sheets)
  if (format === 'pdf') {
    const pdfBlob = createPdfBlobFromJpegPagesLocal(pdfPages);
    const filename = `شجرة_مقسمة_${gridDesc}_${modeTitle}_${rootFirstName}.pdf`;
    triggerDownload(pdfBlob, filename);
    return { filename, totalPages, cols, rows };
  }

  if (format === 'png_zip') {
    const zipBlob = buildZipArchiveBlob(pngZipEntries);
    const filename = `صور_PNG_مقسمة_${gridDesc}_${modeTitle}_${rootFirstName}.zip`;
    triggerDownload(zipBlob, filename);
    return { filename, totalPages, cols, rows };
  }

  if (format === 'svg_zip') {
    const zipBlob = buildZipArchiveBlob(svgZipEntries);
    const filename = `ملفات_SVG_مقسمة_${gridDesc}_${modeTitle}_${rootFirstName}.zip`;
    triggerDownload(zipBlob, filename);
    return { filename, totalPages, cols, rows };
  }

  // format === 'all_zip': Combine the Multi-Page PDF + PNG Split Tiles + SVG Split Tiles in one ZIP
  const pdfBlob = createPdfBlobFromJpegPagesLocal(pdfPages);
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const allEntries: ZipEntryInput[] = [
    {
      path: `ملف_PDF_المقسم_للطباعة_${totalPages}_صفحات_${rootFirstName}.pdf`,
      data: pdfBytes
    },
    ...pngZipEntries,
    ...svgZipEntries
  ];

  const masterZipBlob = buildZipArchiveBlob(allEntries);
  const filename = `حقيبة_التقسيم_الاحترافي_${gridDesc}_${modeTitle}_${rootFirstName}.zip`;
  triggerDownload(masterZipBlob, filename);
  return { filename, totalPages, cols, rows };
}
