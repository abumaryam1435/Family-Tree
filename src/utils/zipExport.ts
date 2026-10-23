import { Person } from '../types/family';
import { extractGivenName, formatAppName } from './nameUtils';
import {
  generateTreePngBlob,
  generateTreeSvgBlob,
  generateTreePdfBlob
} from './pdfExport';
import { generateTreeInteractiveHtmlBlob } from './htmlExport';

export interface ZipEntryInput {
  path: string; // e.g. "شجرة_عبدالله/شجرة_عبدالله_هرمي_ذكور_فقط.png"
  blob: Blob;
  mimeType: string;
  compress?: boolean;
}

export interface BulkZipResult {
  zipBlob: Blob;
  zipFilename: string;
  filesCount: number;
  individualFiles: File[];
  shareBundleFile: File;
}

// Precomputed IEEE 802.3 CRC-32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function tryDeflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(new Uint8Array(data));
    writer.close();
    const compressedBuffer = await new Response(cs.readable).arrayBuffer();
    const compressed = new Uint8Array(compressedBuffer);
    return compressed.length < data.length ? compressed : null;
  } catch {
    return null;
  }
}

function getDosDateTime(date: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Builds a standard PKZIP (.zip) archive with UTF-8 filenames (Bit 11 = 0x0800)
 * so Arabic file and folder names display accurately across Windows, macOS, Android, iOS, and WhatsApp.
 */
export async function buildZipBlob(entries: ZipEntryInput[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  const { dosTime, dosDate } = getDosDateTime(new Date());

  for (const entry of entries) {
    const rawBuffer = await entry.blob.arrayBuffer();
    const rawBytes = new Uint8Array(rawBuffer);
    const uncompressedSize = rawBytes.length;
    const fileCrc = crc32(rawBytes);

    let compressedBytes: Uint8Array = rawBytes;
    let compressionMethod = 0; // 0 = STORED, 8 = DEFLATE

    if (entry.compress) {
      const deflated = await tryDeflateRaw(rawBytes);
      if (deflated) {
        compressedBytes = deflated;
        compressionMethod = 8;
      }
    }

    const compressedSize = compressedBytes.length;
    const nameBytes = encoder.encode(entry.path.replace(/^\/+/, ''));
    const utf8Flag = 0x0800; // Bit 11: Language encoding flag (EFS) -> UTF-8

    // 1. Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, utf8Flag, true); // General purpose bit flag (UTF-8)
    lv.setUint16(8, compressionMethod, true); // Compression method
    lv.setUint16(10, dosTime, true); // Last mod file time
    lv.setUint16(12, dosDate, true); // Last mod file date
    lv.setUint32(14, fileCrc, true); // CRC-32
    lv.setUint32(18, compressedSize, true); // Compressed size
    lv.setUint32(22, uncompressedSize, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, compressedBytes);

    // 2. Central Directory File Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, utf8Flag, true); // General purpose bit flag (UTF-8)
    cv.setUint16(10, compressionMethod, true); // Compression method
    cv.setUint16(12, dosTime, true); // Last mod file time
    cv.setUint16(14, dosDate, true); // Last mod file date
    cv.setUint32(16, fileCrc, true); // CRC-32
    cv.setUint32(20, compressedSize, true); // Compressed size
    cv.setUint32(24, uncompressedSize, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, localOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    localOffset += localHeader.length + compressedBytes.length;
  }

  const centralDirSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const centralDirOffset = localOffset;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central dir signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, entries.length, true); // Number of central directory records on this disk
  ev.setUint16(10, entries.length, true); // Total number of central directory records
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  return new Blob([...localParts, ...centralParts, eocd] as any[], {
    type: 'application/zip'
  });
}

export type BulkExportFormat = 'html' | 'png' | 'pdf' | 'svg';
export type BulkTreeModeChoice = 'classic' | 'organic' | 'both';
export type BulkFemalesChoice = 'males_only' | 'with_females' | 'both';

export interface BulkZipExportOptions {
  roots: Person[];
  modeChoice: BulkTreeModeChoice;
  femalesChoice: BulkFemalesChoice;
  formats: BulkExportFormat[];
  organicDirection?: 'up' | 'down';
  getChildren: (personId: string) => Person[];
  getAllPersons: () => Person[];
  onProgress?: (completed: number, total: number, currentLabel: string) => void;
}

export function calculateBulkExportTasksCount(
  rootsCount: number,
  modeChoice: BulkTreeModeChoice,
  femalesChoice: BulkFemalesChoice,
  formats: BulkExportFormat[]
): number {
  if (rootsCount === 0 || formats.length === 0) return 0;
  const modesCount = modeChoice === 'both' ? 2 : 1;
  const femalesCount = femalesChoice === 'both' ? 2 : 1;

  let perRoot = 0;
  for (const fmt of formats) {
    if (fmt === 'pdf') {
      // Sequential A4 PDF review depends on root + includeFemales (not visual mode classic/organic)
      perRoot += femalesCount;
    } else {
      perRoot += modesCount * femalesCount;
    }
  }
  return rootsCount * perRoot;
}

function sanitizeFileSegment(text: string): string {
  return text.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

export async function generateBulkTreesZip(
  options: BulkZipExportOptions
): Promise<BulkZipResult> {
  const {
    roots,
    modeChoice,
    femalesChoice,
    formats,
    organicDirection = 'up',
    getChildren,
    getAllPersons,
    onProgress
  } = options;

  const modes: ('classic' | 'organic')[] =
    modeChoice === 'both' ? ['classic', 'organic'] : [modeChoice];
  const femaleFlags: boolean[] =
    femalesChoice === 'both'
      ? [false, true]
      : femalesChoice === 'with_females'
      ? [true]
      : [false];

  const totalTasks = calculateBulkExportTasksCount(
    roots.length,
    modeChoice,
    femalesChoice,
    formats
  );

  const entries: ZipEntryInput[] = [];
  const individualFiles: File[] = [];
  let completed = 0;
  const useSubfolders = roots.length > 1;

  for (const root of roots) {
    const rootShortName = sanitizeFileSegment(
      formatAppName(root.fullName) || extractGivenName(root.fullName)
    );
    const folderPrefix = useSubfolders ? `شجرة_${rootShortName}/` : '';

    for (const includeFemales of femaleFlags) {
      const genderTag = includeFemales ? 'مع_البنات' : 'ذكور_فقط';
      const filteredGetChildren = (personId: string) => {
        const all = getChildren(personId);
        return includeFemales ? all : all.filter((c) => c.gender === 'male');
      };

      // 1. Visual mode-dependent formats (HTML, PNG, SVG)
      for (const mode of modes) {
        const modeTag = mode === 'organic' ? 'غصون' : 'هرمي';

        if (formats.includes('html')) {
          const label = `شجرة ${extractGivenName(root.fullName)} — تفاعلي (HTML) — ${mode === 'organic' ? 'غصون' : 'هرمي'} (${includeFemales ? 'مع البنات' : 'ذكور فقط'})`;
          onProgress?.(completed, totalTasks, label);

          const { blob } = generateTreeInteractiveHtmlBlob({
            rootPerson: root,
            getChildren,
            getAllPersons,
            mode,
            includeFemales
          });

          const flatFileName = `شجرة_${rootShortName}_تفاعلية_${modeTag}_${genderTag}.html`;
          entries.push({
            path: `${folderPrefix}${flatFileName}`,
            blob,
            mimeType: 'text/html',
            compress: true
          });
          individualFiles.push(new File([blob], flatFileName, { type: 'text/html' }));
          completed++;
          onProgress?.(completed, totalTasks, label);
        }

        if (formats.includes('png')) {
          const label = `شجرة ${extractGivenName(root.fullName)} — صورة فائقة (PNG) — ${mode === 'organic' ? 'غصون' : 'هرمي'} (${includeFemales ? 'مع البنات' : 'ذكور فقط'})`;
          onProgress?.(completed, totalTasks, label);

          const { blob } = await generateTreePngBlob({
            rootPerson: root,
            getChildren: filteredGetChildren,
            mode,
            organicDirection,
            collapsedNodes: new Set<string>(),
            orientation: 'portrait',
            unconstrained: true
          });

          const flatFileName = `شجرة_${rootShortName}_صورة_${modeTag}_${genderTag}.png`;
          entries.push({
            path: `${folderPrefix}${flatFileName}`,
            blob,
            mimeType: 'image/png',
            compress: false
          });
          individualFiles.push(new File([blob], flatFileName, { type: 'image/png' }));
          completed++;
          onProgress?.(completed, totalTasks, label);
        }

        if (formats.includes('svg')) {
          const label = `شجرة ${extractGivenName(root.fullName)} — فيكتور للمطابع (SVG) — ${mode === 'organic' ? 'غصون' : 'هرمي'} (${includeFemales ? 'مع البنات' : 'ذكور فقط'})`;
          onProgress?.(completed, totalTasks, label);

          const { blob } = await generateTreeSvgBlob({
            rootPerson: root,
            getChildren: filteredGetChildren,
            mode,
            organicDirection,
            collapsedNodes: new Set<string>()
          });

          const flatFileName = `شجرة_${rootShortName}_للمطابع_${modeTag}_${genderTag}.svg`;
          entries.push({
            path: `${folderPrefix}${flatFileName}`,
            blob,
            mimeType: 'image/svg+xml',
            compress: true
          });
          individualFiles.push(
            new File([blob], flatFileName, { type: 'image/svg+xml' })
          );
          completed++;
          onProgress?.(completed, totalTasks, label);
        }
      }

      // 2. Sequential A4 PDF format (once per root + gender choice)
      if (formats.includes('pdf')) {
        const label = `شجرة ${extractGivenName(root.fullName)} — سجل المراجعة (PDF A4) (${includeFemales ? 'مع البنات' : 'ذكور فقط'})`;
        onProgress?.(completed, totalTasks, label);

        const { blob } = await generateTreePdfBlob({
          rootPerson: root,
          getChildren,
          mode: 'classic',
          includeFemales
        });

        const flatFileName = `سجل_مراجعة_شجرة_${rootShortName}_A4_${genderTag}.pdf`;
        entries.push({
          path: `${folderPrefix}${flatFileName}`,
          blob,
          mimeType: 'application/pdf',
          compress: false
        });
        individualFiles.push(
          new File([blob], flatFileName, { type: 'application/pdf' })
        );
        completed++;
        onProgress?.(completed, totalTasks, label);
      }
    }
  }

  onProgress?.(totalTasks, totalTasks, 'جارٍ ضغط وتغليف جميع الملفات في ملف ZIP واحد...');

  const zipBlob = await buildZipBlob(entries);
  const zipFilename =
    roots.length === 1
      ? `ملفات_شجرة_${sanitizeFileSegment(extractGivenName(roots[0].fullName))}_الشاملة.zip`
      : `ملفات_أشجار_العائلة_الشاملة_${roots.length}_أشجار.zip`;

  const shareBundleFile = await buildSelfExtractingArchiveFile(
    zipBlob,
    zipFilename,
    entries.length
  );

  return {
    zipBlob,
    zipFilename,
    filesCount: entries.length,
    individualFiles,
    shareBundleFile
  };
}

function blobToBase64Fast(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف المضغوط'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Wraps the compressed `.zip` binary archive inside a single self-extracting `.html` package file
 * (`type: 'text/html'`).
 * Why this is needed for Android phones:
 * - iOS/iPadOS Safari and Firefox allow sharing `.zip` (`application/zip`) directly via `navigator.share({ files })`.
 * - Chromium on Android (Chrome, Samsung Internet, Edge) blocks `.zip` in `ShareServiceImpl.java` (`FILE_TYPES.md`),
 *   throwing `NotAllowedError` if `.zip` is passed, while explicitly allowing `.html` (`text/html`).
 * - This single self-extracting package file passes Chromium's allowlist 100% of the time, opens the native
 *   phone Share Sheet (`نافذة اختيار الواتساب أو غيره`) with 1 file and zero text, is sent by WhatsApp/Telegram
 *   as an uncompressed Document (preserving 100% image quality), and allows 1-tap extraction of the `.zip`
 *   and all files inside it on any phone or computer.
 */
async function buildSelfExtractingArchiveFile(
  zipBlob: Blob,
  zipFilename: string,
  filesCount: number
): Promise<File> {
  const safeZipName = zipFilename.replace(/[\\/:*?"<>|]/g, '_');
  const finalZipName = safeZipName.endsWith('.zip') ? safeZipName : `${safeZipName}.zip`;
  const bundleFileName = finalZipName.replace(/\.zip$/i, '_المضغوط.html');
  const base64Zip = await blobToBase64Fast(zipBlob);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${finalZipName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #F4F7F5;
      color: #0F172A;
      padding: 16px;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #093829, #0F4C3A, #15664F);
      color: #FFFFFF;
      border-radius: 22px;
      padding: 22px 20px;
      border: 2px solid #D4AF37;
      box-shadow: 0 12px 28px rgba(9, 56, 41, 0.18);
      text-align: center;
      margin-bottom: 18px;
    }
    .header h1 { font-size: 19px; font-weight: 900; color: #FDE68A; margin-bottom: 6px; }
    .header p { font-size: 13px; color: #E2E8F0; font-weight: 700; }
    .zip-actions {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
    }
    .btn-primary {
      background: #D4AF37;
      color: #0F291E;
      border: none;
      border-radius: 14px;
      padding: 12px 22px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .btn-primary:active { transform: scale(0.98); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 14px;
    }
    .card {
      background: #FFFFFF;
      border-radius: 18px;
      border: 1.5px solid #CBD5E1;
      padding: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
    }
    .card-title {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
      word-break: break-word;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 9px;
      border-radius: 8px;
      background: #ECFDF5;
      color: #0F4C3A;
      border: 1px solid #A7F3D0;
      margin-bottom: 6px;
    }
    .preview-box {
      width: 100%;
      max-height: 200px;
      overflow: hidden;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-box img {
      max-width: 100%;
      max-height: 196px;
      object-fit: contain;
    }
    .card-btns {
      display: flex;
      gap: 8px;
    }
    .btn-card {
      flex: 1;
      text-align: center;
      padding: 8px 10px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      text-decoration: none;
      border: 1px solid #0F4C3A;
      background: #0F4C3A;
      color: #FFFFFF;
    }
    .btn-card.secondary {
      background: #F8FAFC;
      color: #0F4C3A;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 الملف المضغوط الشامل لشجرة العائلة (${filesCount} ملف)</h1>
      <p>جميع الصور والملفات محفوظة بكامل دقتها الأصلية 100% دون أي ضغط</p>
      <div class="zip-actions">
        <button type="button" class="btn-primary" id="download-zip-btn">
          ⬇️ تنزيل الملف المضغوط الأصلي (${finalZipName})
        </button>
      </div>
    </div>
    <div id="files-grid" class="grid"></div>
  </div>
  <script id="zip-base64" type="text/plain">${base64Zip}</script>
  <script>
    (async function() {
      const b64 = document.getElementById('zip-base64').textContent.trim();
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);

      const zipBlob = new Blob([bytes], { type: 'application/zip' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const zipBtn = document.getElementById('download-zip-btn');
      zipBtn.onclick = function() {
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = ${JSON.stringify(finalZipName)};
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      const grid = document.getElementById('files-grid');
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const decoder = new TextDecoder('utf-8');
      let offset = 0;

      function getMime(name) {
        const lower = name.toLowerCase();
        if (lower.endsWith('.png')) return { mime: 'image/png', label: 'صورة فائقة الوضوح (PNG)' };
        if (lower.endsWith('.pdf')) return { mime: 'application/pdf', label: 'سجل مراجعة وطباعة (PDF)' };
        if (lower.endsWith('.svg')) return { mime: 'image/svg+xml', label: 'ملف فيكتور للمطابع (SVG)' };
        if (lower.endsWith('.html')) return { mime: 'text/html;charset=utf-8', label: 'شجرة تفاعلية (HTML)' };
        return { mime: 'application/octet-stream', label: 'ملف' };
      }

      while (offset + 30 <= bytes.length) {
        const sig = dv.getUint32(offset, true);
        if (sig !== 0x04034b50) break;
        const method = dv.getUint16(offset + 8, true);
        const compSize = dv.getUint32(offset + 18, true);
        const uncompSize = dv.getUint32(offset + 22, true);
        const nameLen = dv.getUint16(offset + 26, true);
        const extraLen = dv.getUint16(offset + 28, true);
        const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
        const fullPath = decoder.decode(nameBytes);
        const dataStart = offset + 30 + nameLen + extraLen;
        const compData = bytes.subarray(dataStart, dataStart + compSize);
        offset = dataStart + compSize;

        let fileBytes = compData;
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          try {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(new Uint8Array(compData));
            writer.close();
            const buf = await new Response(ds.readable).arrayBuffer();
            fileBytes = new Uint8Array(buf);
          } catch (e) {}
        }

        const info = getMime(fullPath);
        const blob = new Blob([fileBytes], { type: info.mime });
        const url = URL.createObjectURL(blob);
        const shortName = fullPath.split('/').pop() || fullPath;
        const sizeKb = Math.max(1, Math.round(uncompSize / 1024));

        const card = document.createElement('div');
        card.className = 'card';

        let previewHtml = '';
        if (info.mime === 'image/png' || info.mime === 'image/svg+xml') {
          previewHtml = '<div class="preview-box"><img src="' + url + '" alt="' + shortName + '" /></div>';
        }

        card.innerHTML =
          '<div>' +
            '<span class="badge">' + info.label + ' • ' + sizeKb + ' KB</span>' +
            '<div class="card-title">' + fullPath.replace(/\\//g, ' ◂ ') + '</div>' +
          '</div>' +
          previewHtml +
          '<div class="card-btns">' +
            '<a class="btn-card" href="' + url + '" download="' + shortName + '">⬇️ تحميل بجودة 100%</a>' +
            '<a class="btn-card secondary" href="' + url + '" target="_blank" rel="noopener">🔍 فتح ومعاينة</a>' +
          '</div>';

        grid.appendChild(card);
      }
    })();
  </script>
</body>
</html>`;

  const htmlBlob = new Blob([html], { type: 'text/html' });
  return new File([htmlBlob], bundleFileName, { type: 'text/html' });
}

export function downloadZipBlob(blob: Blob, filename: string) {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

/**
 * Opens the native OS Share Sheet (`نافذة اختيار الواتساب أو غيره`) synchronously
 * within a user click gesture, sending ONLY the compressed file with NO text (`بدون نص`).
 *
 * Platform behavior:
 * - On iOS / iPadOS / macOS Safari & Firefox: shares the `.zip` archive (`application/zip`) directly.
 * - On Android Chromium (Chrome, Samsung Internet, Edge): Chromium's `ShareServiceImpl.java` rejects `.zip`
 *   in `navigator.share()` with `NotAllowedError` even when `navigator.canShare()` returns `true`.
 *   Therefore on Chromium, we share the single self-extracting compressed package (`result.shareBundleFile`),
 *   which is 100% permitted by Chromium's allowlist, opens the native Android Share Sheet on the first tap,
 *   and sends 1 single file with zero text.
 */
export async function shareBulkResultToWhatsApp(
  result: BulkZipResult,
  isDirectClickGesture: boolean = false
): Promise<
  | 'shared_zip'
  | 'shared_files'
  | 'downloaded_fallback'
  | 'need_user_gesture'
  | 'unsupported'
> {
  const safeName = result.zipFilename.replace(/[\\/:*?"<>|]/g, '_');
  const finalZipName = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`;

  const canUseWebShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasCanShare =
    canUseWebShare && typeof navigator.canShare === 'function';

  if (canUseWebShare) {
    let chosenFiles: File[] | null = null;
    let shareOutcomeType: 'shared_zip' | 'shared_files' = 'shared_zip';

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    // Chromium browsers (Android Chrome, Samsung Internet, Edge, Opera) block `.zip` in ShareServiceImpl.java
    const isChromiumWithZipBlock =
      (/Android/i.test(ua) && !/Firefox/i.test(ua)) ||
      (/Chrome|Chromium|Edg|OPR|SamsungBrowser/i.test(ua) && !/iPhone|iPad|iPod|CriOS/i.test(ua));

    // Candidate A: On Apple WebKit (iOS/iPadOS/macOS) and Firefox, share the native .zip archive directly
    if (!isChromiumWithZipBlock) {
      try {
        const candidateZip = new File([result.zipBlob], finalZipName, {
          type: 'application/zip'
        });
        if (!hasCanShare || navigator.canShare({ files: [candidateZip] })) {
          chosenFiles = [candidateZip];
          shareOutcomeType = 'shared_zip';
        }
      } catch {
        // Ignore synchronous canShare errors
      }
    }

    // Candidate B: Single self-extracting compressed archive file (works 100% on Android Chrome & all Chromium browsers)
    if (!chosenFiles && result.shareBundleFile) {
      try {
        if (!hasCanShare || navigator.canShare({ files: [result.shareBundleFile] })) {
          chosenFiles = [result.shareBundleFile];
          shareOutcomeType = 'shared_zip';
        }
      } catch {
        // Ignore synchronous canShare errors
      }
    }

    // Candidate C: Individual shareable files if neither A nor B matched
    if (!chosenFiles && result.individualFiles && result.individualFiles.length > 0 && hasCanShare) {
      const supportedIndividual = result.individualFiles.filter((file) => {
        try {
          return navigator.canShare({ files: [file] });
        } catch {
          return false;
        }
      });

      if (supportedIndividual.length > 0) {
        const batch = supportedIndividual.slice(0, 10);
        try {
          if (navigator.canShare({ files: batch })) {
            chosenFiles = batch;
            shareOutcomeType = 'shared_files';
          } else if (navigator.canShare({ files: [batch[0]] })) {
            chosenFiles = [batch[0]];
            shareOutcomeType = 'shared_files';
          }
        } catch {
          // Ignore synchronous canShare errors
        }
      }
    }

    // Invoke navigator.share with ONLY `{ files }` (NO title, NO text)
    if (chosenFiles && chosenFiles.length > 0) {
      try {
        await navigator.share({
          files: chosenFiles
        });
        return shareOutcomeType;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User saw the native share chooser window and closed it
          return shareOutcomeType;
        }
        if (err?.name === 'NotAllowedError' && !isDirectClickGesture) {
          // Transient user activation expired while rendering canvases; prompt 1-tap share button
          return 'need_user_gesture';
        }
      }
    }
  }

  // Fallback ONLY for desktop browsers / environments without Web Share file support:
  // Download the ZIP archive locally (never redirect to a WhatsApp text link).
  if (isDirectClickGesture) {
    downloadZipBlob(result.zipBlob, result.zipFilename);
    return 'downloaded_fallback';
  }

  return 'need_user_gesture';
}


