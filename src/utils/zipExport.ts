import { Person } from '../types/family';
import { extractGivenName } from './nameUtils';
import {
  generateTreePngBlob,
  generateTreePdfBlob,
  generateVisualTreePosterPdfBlob,
  generateTreeSvgBlob
} from './pdfExport';
import { generateTreeInteractiveHtmlBlob } from './htmlExport';

// Precomputed CRC32 Table for standard ZIP archive creation
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

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  path: string;
  data: Uint8Array;
}

/**
 * Pure TypeScript ZIP Archive Builder (STORE method with UTF-8 flag 0x0800 for full Arabic filenames & folders)
 */
export function buildZipArchiveBlob(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // Bit 11: UTF-8 filename & path
    lv.setUint16(8, 0, true); // Compression: 0 (STORE)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central Dir Signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 bit
    cv.setUint16(10, 0, true); // Compression: 0 (STORE)
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localChunks.push(localHeader, data);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralChunks) {
    centralDirSize += c.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, eocd] as any[], {
    type: 'application/zip'
  });
}

export type BulkExportFormat = 'png' | 'pdf_poster' | 'pdf' | 'html' | 'svg';
export type BulkTreeModeChoice = 'classic' | 'classic_vertical' | 'both';
export type BulkFemalesChoice = 'males_only' | 'with_females' | 'both';
export type BulkGroupingChoice = 'separate' | 'combined' | 'both';

export interface BulkZipExportOptions {
  roots: Person[];
  getChildren: (personId: string) => Person[];
  groupingChoice: BulkGroupingChoice;
  modeChoice: BulkTreeModeChoice;
  femalesChoice: BulkFemalesChoice;
  formats: BulkExportFormat[];
  onProgress?: (info: {
    currentStep: number;
    totalSteps: number;
    treeName: string;
    detailLabel: string;
  }) => void;
}

export function calculateBulkExportTasksCount(options: {
  rootsCount: number;
  groupingChoice: BulkGroupingChoice;
  modeChoice: BulkTreeModeChoice;
  femalesChoice: BulkFemalesChoice;
  formatsCount: number;
}): number {
  if (options.rootsCount <= 0 || options.formatsCount <= 0) return 0;
  const modesCount = options.modeChoice === 'both' ? 2 : 1;
  const femalesCount = options.femalesChoice === 'both' ? 2 : 1;
  const separateTreesCount =
    options.groupingChoice === 'separate' || options.groupingChoice === 'both'
      ? options.rootsCount
      : 0;
  const combinedTreesCount =
    options.groupingChoice === 'combined' || options.groupingChoice === 'both'
      ? 1
      : 0;

  return (
    (separateTreesCount + combinedTreesCount) *
    modesCount *
    femalesCount *
    options.formatsCount
  );
}

export async function generateBulkTreesZip(options: BulkZipExportOptions): Promise<{
  zipBlob: Blob;
  zipFilename: string;
  totalFilesGenerated: number;
}> {
  const {
    roots,
    getChildren,
    groupingChoice,
    modeChoice,
    femalesChoice,
    formats,
    onProgress
  } = options;

  const modes: ('classic' | 'classic_vertical')[] =
    modeChoice === 'both' ? ['classic', 'classic_vertical'] : [modeChoice];

  const femaleVariants: boolean[] =
    femalesChoice === 'both'
      ? [false, true]
      : femalesChoice === 'with_females'
      ? [true]
      : [false];

  const includeSeparate =
    groupingChoice === 'separate' || groupingChoice === 'both';
  const includeCombined =
    groupingChoice === 'combined' || groupingChoice === 'both';

  const totalSteps =
    ((includeSeparate ? roots.length : 0) + (includeCombined ? 1 : 0)) *
    modes.length *
    femaleVariants.length *
    formats.length;

  let currentStep = 0;
  const zipEntries: ZipEntryInput[] = [];
  const usedPaths = new Set<string>();

  const ensureUniquePath = (proposedPath: string): string => {
    if (!usedPaths.has(proposedPath)) {
      usedPaths.add(proposedPath);
      return proposedPath;
    }
    const dotIdx = proposedPath.lastIndexOf('.');
    const base = dotIdx !== -1 ? proposedPath.slice(0, dotIdx) : proposedPath;
    const ext = dotIdx !== -1 ? proposedPath.slice(dotIdx) : '';
    let counter = 2;
    while (usedPaths.has(`${base}_${counter}${ext}`)) {
      counter++;
    }
    const finalPath = `${base}_${counter}${ext}`;
    usedPaths.add(finalPath);
    return finalPath;
  };

  const getModeLabel = (mode: 'classic' | 'classic_vertical') =>
    mode === 'classic' ? 'الهرمي_صفوف' : 'الهرمي_عمود';

  const getModeHumanLabel = (mode: 'classic' | 'classic_vertical') =>
    mode === 'classic' ? 'التصميم الهرمي صفوف' : 'التصميم الهرمي عمود';

  const getFormatHumanLabel = (fmt: BulkExportFormat) =>
    fmt === 'png'
      ? 'صورة PNG'
      : fmt === 'pdf_poster'
      ? 'ملف PDF لوحة مصورة'
      : fmt === 'pdf'
      ? 'ملف PDF سجل مراجعة'
      : fmt === 'html'
      ? 'ملف HTML تفاعلي'
      : 'ملف SVG للمطابع';

  // Helper to export one target (either a single tree or all selected trees combined)
  const runExportUnit = async (params: {
    targetRoot: Person;
    targetRoots?: Person[];
    folderName: string;
    baseFileLabel: string;
    progressTreeLabel: string;
  }) => {
    const {
      targetRoot,
      targetRoots,
      folderName,
      baseFileLabel,
      progressTreeLabel
    } = params;

    for (const includeFemales of femaleVariants) {
      const genderLabel = includeFemales ? 'مع_الإناث' : 'بدون_إناث';
      const genderHuman = includeFemales ? 'مع الإناث' : 'الذكور فقط (بدون إناث)';

      const filteredGetChildren = (personId: string) => {
        const kids = getChildren(personId);
        return includeFemales ? kids : kids.filter((c) => c.gender === 'male');
      };

      for (const mode of modes) {
        const modeLabel = getModeLabel(mode);
        const modeHuman = getModeHumanLabel(mode);

        for (const fmt of formats) {
          currentStep++;
          const fmtHuman = getFormatHumanLabel(fmt);

          onProgress?.({
            currentStep,
            totalSteps,
            treeName: progressTreeLabel,
            detailLabel: `${modeHuman} · ${genderHuman} · ${fmtHuman}`
          });

          // Yield briefly to UI thread so progress bar updates smoothly
          await new Promise((r) => setTimeout(r, 25));

          let blob: Blob;
          let ext: string;
          let fmtSuffix = '';

          if (fmt === 'png') {
            const res = await generateTreePngBlob({
              rootPerson: targetRoot,
              rootPersons: targetRoots,
              getChildren: filteredGetChildren,
              mode,
              collapsedNodes: new Set<string>(),
              unconstrained: true,
              orientation: 'portrait',
              includeFemales
            });
            blob = res.blob;
            ext = 'png';
            fmtSuffix = 'صورة';
          } else if (fmt === 'pdf_poster') {
            const res = await generateVisualTreePosterPdfBlob({
              rootPerson: targetRoot,
              rootPersons: targetRoots,
              getChildren: filteredGetChildren,
              mode,
              collapsedNodes: new Set<string>(),
              unconstrained: true,
              orientation: 'portrait',
              includeFemales
            });
            blob = res.blob;
            ext = 'pdf';
            fmtSuffix = 'لوحة_مصورة';
          } else if (fmt === 'pdf') {
            const res = await generateTreePdfBlob({
              rootPerson: targetRoot,
              rootPersons: targetRoots,
              getChildren: filteredGetChildren,
              mode,
              collapsedNodes: new Set<string>(),
              includeFemales
            });
            blob = res.blob;
            ext = 'pdf';
            fmtSuffix = 'سجل_مراجعة';
          } else if (fmt === 'html') {
            const res = generateTreeInteractiveHtmlBlob({
              rootPerson: targetRoot,
              rootPersons: targetRoots,
              getChildren: filteredGetChildren,
              getAllPersons: () => roots,
              mode,
              includeFemales
            });
            blob = res.blob;
            ext = 'html';
            fmtSuffix = 'تفاعلي';
          } else {
            const res = await generateTreeSvgBlob({
              rootPerson: targetRoot,
              rootPersons: targetRoots,
              getChildren: filteredGetChildren,
              mode,
              collapsedNodes: new Set<string>(),
              includeFemales
            });
            blob = res.blob;
            ext = 'svg';
            fmtSuffix = 'للمطابع';
          }

          const bytes = new Uint8Array(await blob.arrayBuffer());
          const subFolder =
            groupingChoice === 'both'
              ? targetRoots && targetRoots.length > 0
                ? `01_الأشجار_مجمعة_في_ملف_واحد`
                : `02_الأشجار_المفردة/${folderName}`
              : folderName;

          const fileName =
            `${baseFileLabel}_${modeLabel}_${genderLabel}_${fmtSuffix}.${ext}`.replace(
              /[\\/:*?"<>|]/g,
              '_'
            );
          const fullZipPath = ensureUniquePath(`${subFolder}/${fileName}`);
          zipEntries.push({
            path: fullZipPath,
            data: bytes
          });
        }
      }
    }
  };

  // 1. Export Combined File(s) if requested ('combined' or 'both')
  if (includeCombined && roots.length > 0) {
    const namesPreview = roots
      .slice(0, 3)
      .map((r) => extractGivenName(r.fullName).replace(/\s+/g, '_'))
      .join('_');
    const combinedBaseLabel =
      roots.length === 1
        ? `شجرة_${namesPreview}_مجمعة`
        : `شجرة_مجمعة_${roots.length}_أشجار_${namesPreview}`;
    const combinedProgressLabel =
      roots.length === 1
        ? `الملف المجمّع (${extractGivenName(roots[0].fullName)})`
        : `جميع الأشجار المحددة في ملف واحد (${roots.length} أشجار)`;

    await runExportUnit({
      targetRoot: roots[0],
      targetRoots: roots,
      folderName: 'الأشجار_مجمعة_في_ملف_واحد',
      baseFileLabel: combinedBaseLabel,
      progressTreeLabel: combinedProgressLabel
    });
  }

  // 2. Export Separate Individual Tree Files if requested ('separate' or 'both')
  if (includeSeparate) {
    for (const rootPerson of roots) {
      const rootShortName = extractGivenName(rootPerson.fullName).replace(
        /[\\/:*?"<>|]/g,
        '_'
      );
      const treeFolder = `شجرة_${rootPerson.fullName
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[\\/:*?"<>|]/g, '_')}`;

      await runExportUnit({
        targetRoot: rootPerson,
        targetRoots: undefined,
        folderName: treeFolder,
        baseFileLabel: `شجرة_${rootShortName}`,
        progressTreeLabel: `${rootPerson.fullName} (مفردة)`
      });
    }
  }

  const zipBlob = buildZipArchiveBlob(zipEntries);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const groupingTag =
    groupingChoice === 'combined'
      ? 'مجمعة_في_ملف_واحد'
      : groupingChoice === 'both'
      ? 'مفردة_ومجمعة'
      : 'مفردة';
  const zipFilename = `حقيبة_أشجار_العائلة_${groupingTag}_${roots.length}_أشجار_${dateStamp}.zip`;

  // Trigger automatic download
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  return {
    zipBlob,
    zipFilename,
    totalFilesGenerated: zipEntries.length
  };
}
