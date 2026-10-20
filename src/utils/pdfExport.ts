import { Person } from '../types/family';
import { KinshipInfo } from './kinship';

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

  // Object 1: Catalog
  // Object 2: Pages
  // For each page i (0..N-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
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
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${wPt} ${hPt} ] ` +
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

  return new Blob(chunks, { type: 'application/pdf' });
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

export async function exportTreeToPdf(options: {
  rootPerson: Person;
  getChildren: (personId: string) => Person[];
  mode: 'classic' | 'organic';
  organicDirection?: 'up' | 'down';
  collapsedNodes?: Set<string>;
}) {
  const {
    rootPerson,
    getChildren,
    mode,
    organicDirection = 'up',
    collapsedNodes = new Set<string>()
  } = options;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const NODE_W = 220;
  const NODE_H = 86;
  const H_GAP = 32;
  const LEVEL_H = 165;
  const visited = new Set<string>();
  let maxDepth = 1;
  let totalNodes = 0;

  function buildLayout(person: Person, depth: number): TreeLayoutNode {
    visited.add(person.id);
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;

    const children = collapsedNodes.has(person.id)
      ? []
      : getChildren(person.id).filter(c => !visited.has(c.id));
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

    const childrenLayouts = children.map(ch => buildLayout(ch, depth + 1));
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

  const rootLayout = buildLayout(rootPerson, 1);

  const HEADER_H = 140;
  const FOOTER_H = 75;
  const SIDE_PAD = 90;
  const TOP_TREE_PAD = mode === 'organic' && organicDirection === 'up' ? 80 : 90;
  const BOTTOM_TREE_PAD = mode === 'organic' && organicDirection === 'up' ? 185 : 95;

  const logicalW = Math.max(1200, rootLayout.subtreeWidth + SIDE_PAD * 2);
  const logicalH =
    HEADER_H +
    TOP_TREE_PAD +
    Math.max(1, maxDepth - 1) * LEVEL_H +
    NODE_H +
    BOTTOM_TREE_PAD +
    FOOTER_H;

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

  const isUpward = mode === 'organic' && organicDirection === 'up';

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

      // Arabic RTL order: First child on the RIGHT, proceeding LEFTWARD
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

  // Determine high-DPI scale without exceeding browser max canvas limits (max ~12000px)
  const maxDim = Math.max(logicalW, logicalH);
  const scale = maxDim > 5500 ? Math.max(1, 5500 / maxDim) : 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalW * scale);
  canvas.height = Math.round(logicalH * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
  if (mode === 'organic') {
    bgGrad.addColorStop(0, '#F5FAF6');
    bgGrad.addColorStop(0.6, '#FBF9F5');
    bgGrad.addColorStop(1, '#F3ECE1');
  } else {
    bgGrad.addColorStop(0, '#FFFDF9');
    bgGrad.addColorStop(1, '#F7F4EE');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Outer Ornate Frame
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, logicalW - 36, logicalH - 36);
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(25, 25, logicalW - 50, logicalH - 50);

  // Header Banner
  ctx.fillStyle = '#0F4C3A';
  drawRoundedRect(ctx, 40, 36, logicalW - 80, 92, 18);
  ctx.fill();

  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 40, 36, logicalW - 80, 92, 18);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText('بسم الله الرحمن الرحيم — سجل شجرة العائلة الموثق', logicalW / 2, 62);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Cairo, sans-serif';
  const modeTitle =
    mode === 'organic' ? 'شجرة العائلة (الجذر والأغصان والتفريعات)' : 'شجرة العائلة (المخطط الهرمي)';
  ctx.fillText(`${modeTitle} — أصل الشجرة: ${rootPerson.fullName}`, logicalW / 2, 94);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 13px Cairo, sans-serif';
  ctx.fillText(
    `عدد الأفراد الظاهرين: ${totalNodes} فرداً · عدد الأجيال: ${maxDepth} أجيال · تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}`,
    logicalW / 2,
    116
  );

  // If Organic Mode, draw Root Trunk & Soil Roots
  if (mode === 'organic') {
    const rx = rootLayout.x;
    const ry = rootLayout.y;

    if (isUpward) {
      // Soil mound
      ctx.fillStyle = 'rgba(92, 58, 33, 0.14)';
      ctx.beginPath();
      ctx.ellipse(rx, ry + 110, 175, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trunk from soil up to root card
      ctx.fillStyle = '#5C3A21';
      ctx.beginPath();
      ctx.moveTo(rx - 26, ry + 110);
      ctx.quadraticCurveTo(rx - 14, ry + 70, rx - 10, ry + NODE_H / 2);
      ctx.lineTo(rx + 10, ry + NODE_H / 2);
      ctx.quadraticCurveTo(rx + 14, ry + 70, rx + 26, ry + 110);
      ctx.closePath();
      ctx.fill();

      // Roots spreading in soil
      ctx.strokeStyle = '#4A2C11';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 108);
      ctx.quadraticCurveTo(rx - 4, ry + 135, rx, ry + 158);
      ctx.stroke();

      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(rx + 14, ry + 106);
      ctx.quadraticCurveTo(rx + 60, ry + 125, rx + 115, ry + 142);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx - 14, ry + 106);
      ctx.quadraticCurveTo(rx - 60, ry + 125, rx - 115, ry + 142);
      ctx.stroke();

      ctx.fillStyle = '#5C3A21';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('جذر الشجرة وأصلها الراسخ', rx, ry + 132);
    }
  }

  // Draw Connecting Branches / Lines
  for (const link of links) {
    if (mode === 'organic') {
      const ctrlY1 = link.fromY + (link.toY - link.fromY) * 0.45;
      const ctrlY2 = link.fromY + (link.toY - link.fromY) * 0.55;
      const strokeW = Math.max(2.2, 9.5 - link.depth * 1.8);

      ctx.strokeStyle =
        link.depth === 1
          ? '#6E4726'
          : link.childGender === 'female' && !link.childHasChildren
          ? '#B84360'
          : '#1B5E43';
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(link.fromX, link.fromY);
      ctx.bezierCurveTo(link.fromX, ctrlY1, link.toX, ctrlY2, link.toX, link.toY);
      ctx.stroke();
    } else {
      // Classic orthogonal hierarchical connector
      const midY = (link.fromY + link.toY) / 2;
      ctx.strokeStyle = 'rgba(15, 76, 58, 0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(link.fromX, link.fromY);
      ctx.lineTo(link.fromX, midY);
      ctx.lineTo(link.toX, midY);
      ctx.lineTo(link.toX, link.toY);
      ctx.stroke();
    }
  }

  // Draw Nodes
  for (const node of flatNodes) {
    const { person, depth, x, y, maleChildrenCount, femaleChildrenCount } = node;
    const isRoot = depth === 1;
    const left = x - NODE_W / 2;
    const top = y - NODE_H / 2;

    // Card Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // Card Fill
    if (isRoot && mode === 'organic') {
      const rootGrad = ctx.createLinearGradient(left, top, left, top + NODE_H);
      rootGrad.addColorStop(0, '#4A2C11');
      rootGrad.addColorStop(1, '#0F4C3A');
      ctx.fillStyle = rootGrad;
    } else if (person.gender === 'male') {
      ctx.fillStyle = '#F3FAF6';
    } else {
      ctx.fillStyle = '#FFF3F6';
    }

    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 14);
    ctx.fill();
    ctx.restore();

    // Card Border
    ctx.lineWidth = isRoot ? 2.5 : 1.6;
    ctx.strokeStyle = isRoot
      ? '#D4AF37'
      : person.gender === 'male'
      ? '#0F4C3A'
      : '#E11D48';
    drawRoundedRect(ctx, left, top, NODE_W, NODE_H, 14);
    ctx.stroke();

    // Generation Badge
    const genLabel = isRoot ? 'الأصل (الجذر)' : `الجيل ${depth}`;
    const genderLabel = person.gender === 'male' ? 'ذكر' : 'أنثى';
    ctx.font = 'bold 10px Cairo, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = isRoot && mode === 'organic' ? '#F5E6B8' : '#0F4C3A';
    ctx.fillText(genLabel, left + NODE_W - 12, top + 20);

    ctx.textAlign = 'left';
    ctx.fillStyle =
      isRoot && mode === 'organic'
        ? '#F5E6B8'
        : person.gender === 'male'
        ? '#065F46'
        : '#9F1239';
    ctx.fillText(genderLabel, left + 12, top + 20);

    // Person Full Name
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillStyle = isRoot && mode === 'organic' ? '#FFFFFF' : '#0F172A';
    const displayName = truncateRtlText(ctx, person.fullName, NODE_W - 24);
    ctx.fillText(displayName, left + NODE_W - 12, top + 46);

    // Divider line
    ctx.strokeStyle =
      isRoot && mode === 'organic' ? 'rgba(255,255,255,0.18)' : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + 12, top + 58);
    ctx.lineTo(left + NODE_W - 12, top + 58);
    ctx.stroke();

    // Footer info
    ctx.font = 'bold 10px Cairo, sans-serif';
    ctx.fillStyle =
      isRoot && mode === 'organic'
        ? '#E2E8F0'
        : person.gender === 'male'
        ? '#0F4C3A'
        : '#9F1239';
    let footerText = '';
    if (person.gender === 'male') {
      if (maleChildrenCount + femaleChildrenCount > 0) {
        footerText = `${maleChildrenCount} أبناء · ${femaleChildrenCount} بنات`;
      } else {
        footerText = 'فرع طرفي';
      }
    } else if (person.husbandName) {
      footerText = truncateRtlText(ctx, `زوجة: ${person.husbandName}`, NODE_W - 24);
    } else {
      footerText = 'ابنة / فرع';
    }
    ctx.fillText(footerText, left + NODE_W - 12, top + 74);
  }

  // Footer Bar
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px Cairo, sans-serif';
  ctx.fillText(
    'تم استخراج هذه الوثيقة آلياً من نظام شجرة العائلة الرقمي — جميع الأسماء مرتبة هجائياً (الذكور ثم الإناث)',
    logicalW / 2,
    logicalH - 36
  );

  // Convert to PDF (sizing PDF points proportional to logical dimensions)
  const jpegBytes = canvasToJpegBytes(canvas, 0.94);
  const pageWidthPt = Math.max(842, Math.round(logicalW * 0.72));
  const pageHeightPt = Math.max(595, Math.round(logicalH * 0.72));

  const pdfBlob = createPdfBlobFromJpegPages([
    {
      jpegBytes,
      widthPx: canvas.width,
      heightPx: canvas.height,
      pageWidthPt,
      pageHeightPt
    }
  ]);

  triggerBlobDownload(pdfBlob, `شجرة_العائلة_${rootPerson.fullName}.pdf`);
}

// ============================================================================
// 2. EXPORT PERSON LINEAGE & KINSHIP CERTIFICATE TO PDF
// ============================================================================
export async function exportPersonCertificateToPdf(options: {
  person: Person;
  lineage: string;
  ancestors: Person[];
  children: Person[];
  kinship?: KinshipInfo;
}) {
  const { person, lineage, ancestors, children, kinship } = options;

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

  // Lineage Banner Box
  ctx.fillStyle = '#F2F8F5';
  drawRoundedRect(ctx, 70, 185, W - 140, 120, 18);
  ctx.fill();
  ctx.strokeStyle = '#0F4C3A';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 70, 185, W - 140, 120, 18);
  ctx.stroke();

  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 14px Cairo, sans-serif';
  ctx.fillText('سلسلة النسب الكاملة:', W / 2, 215);

  ctx.font = 'bold 20px Cairo, sans-serif';
  const wrappedLineage = truncateRtlText(ctx, `« ${lineage} »`, W - 180);
  ctx.fillText(wrappedLineage, W / 2, 252);

  if (person.gender === 'female' && person.husbandName) {
    ctx.fillStyle = '#9F1239';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(`الزوج المسجل: ${person.husbandName}`, W / 2, 285);
  } else if (kinship?.mother) {
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(`الأم (الوالدة): ${kinship.mother.fullName}`, W / 2, 285);
  }

  let curY = 345;

  // Ancestors Table
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0F4C3A';
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText('سلسلة الآباء والأجداد صعوداً:', W - 70, curY);
  curY += 20;

  const chainRows = [{ label: 'الفرد (صاحب الوثيقة)', name: person.fullName }].concat(
    ancestors.map((anc, idx) => ({
      label: idx === 0 ? 'الأب المباشر' : idx === 1 ? 'الجد الأول' : `الجد (الجيل ${idx + 2})`,
      name: anc.fullName
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
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(row.name, 90, curY + 25);
    curY += 42;
  }

  // Kinship Summary if provided
  if (kinship) {
    curY += 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText('ملخص صلات القرابة المباشرة:', W - 70, curY);
    curY += 20;

    const kRows: { title: string; val: string }[] = [];
    if (kinship.mother) kRows.push({ title: 'الأم (الوالدة):', val: kinship.mother.fullName });
    if (kinship.brothers.length > 0)
      kRows.push({ title: `الإخوة الذكور (${kinship.brothers.length}):`, val: kinship.brothers.map(b => b.fullName.split(' ')[0]).join('، ') });
    if (kinship.sisters.length > 0)
      kRows.push({ title: `الأخوات (${kinship.sisters.length}):`, val: kinship.sisters.map(s => s.fullName.split(' ')[0]).join('، ') });
    if (kinship.paternalUncles.length > 0)
      kRows.push({ title: `الأعمام (${kinship.paternalUncles.length}):`, val: kinship.paternalUncles.map(u => u.fullName.split(' ')[0]).join('، ') });
    if (kinship.paternalAunts.length > 0)
      kRows.push({ title: `العمات (${kinship.paternalAunts.length}):`, val: kinship.paternalAunts.map(a => a.fullName.split(' ')[0]).join('، ') });
    if (kinship.maternalUncles.length > 0)
      kRows.push({ title: `الأخوال (${kinship.maternalUncles.length}):`, val: kinship.maternalUncles.map(u => u.fullName.split(' ')[0]).join('، ') });
    if (kinship.maternalAunts.length > 0)
      kRows.push({ title: `الخالات (${kinship.maternalAunts.length}):`, val: kinship.maternalAunts.map(a => a.fullName.split(' ')[0]).join('، ') });

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

  // Children List
  if (children.length > 0) {
    curY += 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText(`الأبناء والبنات المسجلون (${children.length}):`, W - 70, curY);
    curY += 20;

    for (let i = 0; i < children.length; i += 2) {
      const c1 = children[i];
      const c2 = children[i + 1];

      ctx.fillStyle = '#F2F8F5';
      drawRoundedRect(ctx, W / 2 + 10, curY, W / 2 - 80, 36, 8);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText(
        `${i + 1}. ${c1.fullName} (${c1.gender === 'male' ? 'ابن' : 'ابنة'})`,
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
          `${i + 2}. ${c2.fullName} (${c2.gender === 'male' ? 'ابن' : 'ابنة'})`,
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

  triggerBlobDownload(pdfBlob, `وثيقة_نسب_${person.fullName}.pdf`);
}

// ============================================================================
// 3. EXPORT RELATIONSHIP BETWEEN TWO PERSONS TO PDF
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

  // Two Persons Cards
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
  ctx.font = 'bold 16px Cairo, sans-serif';
  ctx.fillText(truncateRtlText(ctx, personA.fullName, W / 2 - 130), W - 90, 215);

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
  ctx.font = 'bold 16px Cairo, sans-serif';
  ctx.fillText(truncateRtlText(ctx, personB.fullName, W / 2 - 130), W / 2 - 40, 215);

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
    `• صلة (${personB.fullName.split(' ')[0]}) بالنسبة لـ (${personA.fullName.split(' ')[0]}):  ${relationBtoA}`,
    W - 95,
    curY + 35
  );
  ctx.fillText(
    `• صلة (${personA.fullName.split(' ')[0]}) بالنسبة لـ (${personB.fullName.split(' ')[0]}):  ${relationAtoB}`,
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
    ctx.fillText(`الجد المشترك الجامع للنسب: « ${commonAncestor.fullName} »`, W / 2, curY + 35);
    curY += 80;
  }

  // Additional Ties
  if (additionalTies.length > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 16px Cairo, sans-serif';
    ctx.fillText('صلات القرابة والمصاهرة التفصيلية:', W - 70, curY);
    curY += 15;
    for (const tie of additionalTies) {
      ctx.fillStyle = '#F8FAFC';
      drawRoundedRect(ctx, 70, curY, W - 140, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText(`• ${tie}`, W - 90, curY + 23);
      curY += 42;
    }
    curY += 15;
  }

  // Step-by-step Lineage Columns (Path A on Right, Path B on Left)
  if (pathA.length > 0 || pathB.length > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F4C3A';
    ctx.font = 'bold 17px Cairo, sans-serif';
    ctx.fillText('التسلسل النسبي للطرفين حتى نقطة الالتقاء:', W - 70, curY);
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
        ctx.font = 'bold 13px Cairo, sans-serif';
        ctx.fillText(
          `${i === 0 ? 'الطرف الأول' : `الجيل +${i}`}: ${truncateRtlText(ctx, pA.fullName, W / 2 - 190)}`,
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
        ctx.font = 'bold 13px Cairo, sans-serif';
        ctx.fillText(
          `${i === 0 ? 'الطرف الثاني' : `الجيل +${i}`}: ${truncateRtlText(ctx, pB.fullName, W / 2 - 190)}`,
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
    `صلة_القرابة_${personA.fullName.split(' ')[0]}_و_${personB.fullName.split(' ')[0]}.pdf`
  );
}

// ============================================================================
// 4. EXPORT FULL FAMILY REGISTRY LIST TO MULTI-PAGE PDF
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
    ctx.fillText('الاسم الكامل والنسب', W - 110, curY + 24);
    ctx.fillText('الجنس', 420, curY + 24);
    ctx.fillText('الأب المباشر', 330, curY + 24);
    ctx.fillText('الأبناء / الزوج', 155, curY + 24);
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
      ctx.font = 'bold 13px Cairo, sans-serif';
      ctx.fillText(truncateRtlText(ctx, p.fullName, 450), W - 110, curY + 28);

      ctx.fillStyle = p.gender === 'male' ? '#065F46' : '#9F1239';
      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.fillText(p.gender === 'male' ? 'ذكر' : 'أنثى', 420, curY + 28);

      ctx.fillStyle = '#334155';
      ctx.font = '600 12px Cairo, sans-serif';
      ctx.fillText(
        father ? truncateRtlText(ctx, father.fullName.split(' ')[0], 150) : 'أصل شجرة',
        330,
        curY + 28
      );

      ctx.fillStyle = '#0F4C3A';
      ctx.font = 'bold 12px Cairo, sans-serif';
      const extraInfo =
        p.gender === 'male'
          ? `${kids.length} أبناء`
          : p.husbandName
          ? truncateRtlText(ctx, `زوجة: ${p.husbandName.split(' ')[0]}`, 100)
          : '—';
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
