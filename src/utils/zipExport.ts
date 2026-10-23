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

  return {
    zipBlob,
    zipFilename,
    filesCount: entries.length,
    individualFiles
  };
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
 * Invokes the native Web Share sheet (WhatsApp / Telegram / etc.) synchronously
 * within a user click gesture.
 * - Never auto-downloads to memory on failure.
 * - Tries sharing the .zip archive first (supported on iOS/macOS Safari, Firefox, etc.).
 * - If the browser (e.g. Android Chrome) blocks .zip in navigator.canShare, immediately
 *   shares the generated files (.html, .pdf, .svg, .png) in the same synchronous gesture so
 *   the WhatsApp share sheet opens reliably.
 */
export async function shareBulkResultToWhatsApp(
  result: BulkZipResult
): Promise<'shared_zip' | 'shared_files' | 'need_user_gesture' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return 'unsupported';
  }

  const safeName = result.zipFilename.replace(/[\\/:*?"<>|]/g, '_');
  const finalZipName = safeName.endsWith('.zip') ? safeName : `${safeName}.zip`;
  const shareTitle = finalZipName.replace(/\.zip$/i, '');

  // 1. Try sharing the .zip file directly (works on iOS Safari, iPadOS, macOS, etc.)
  const zipMimeCandidates = [
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ];

  for (const mime of zipMimeCandidates) {
    try {
      const zipFile = new File([result.zipBlob], finalZipName, { type: mime });
      const canShareZip =
        typeof navigator.canShare === 'function'
          ? navigator.canShare({ files: [zipFile] })
          : true;

      if (canShareZip) {
        await navigator.share({
          title: shareTitle,
          text: 'ملف مضغوط (ZIP) يحتوي على ملفات شجرة العائلة بكامل دقتها الأصلية دون ضغط.',
          files: [zipFile]
        });
        return 'shared_zip';
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'shared_zip';
      }
      if (err?.name === 'NotAllowedError') {
        return 'need_user_gesture';
      }
    }
  }

  // 2. Fallback for Android Chrome (which restricts .zip in navigator.canShare):
  // Share the generated files (.pdf, .html, .svg, .png) directly via navigator.share
  // so the native WhatsApp share screen still opens immediately!
  if (result.individualFiles && result.individualFiles.length > 0) {
    // Chromium allows up to 10 files per navigator.share call
    const filesBatch = result.individualFiles.slice(0, 10);
    try {
      const canShareBatch =
        typeof navigator.canShare === 'function'
          ? navigator.canShare({ files: filesBatch })
          : true;

      if (canShareBatch) {
        await navigator.share({
          title: shareTitle,
          text: 'ملفات شجرة العائلة بكامل دقتها الأصلية.',
          files: filesBatch
        });
        return 'shared_files';
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'shared_files';
      }
      if (err?.name === 'NotAllowedError') {
        return 'need_user_gesture';
      }
    }
  }

  return 'unsupported';
}
