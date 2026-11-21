import { Person, Gender, AuditLog, MergeOperation } from '../types/family';
import {
  extractGivenName,
  normalizeArabic,
  splitLineageChain,
  rebuildChildFullName
} from './nameUtils';

export const AUTO_SAFETY_BACKUP_STORAGE_KEY = 'family_tree_auto_safety_backup_v1';
export const AUTO_SAFETY_BACKUP_HISTORY_KEY = 'family_tree_auto_safety_history_v1';

export interface LocalSafetySnapshot {
  id: string;
  savedAt: string;
  reason?: string;
  persons: Person[];
  rootsCount: number;
  rootDetails: Array<{ id: string; fullName: string; branchCount: number }>;
  maleCount: number;
  femaleCount: number;
  wifeLinksCount: number;
  motherLinksCount: number;
  notesCount: number;
  hasRichDetails: boolean;
}

export interface ParsedBackupResult {
  persons: Person[];
  sourceType: 'json' | 'html_interactive' | 'xlsx' | 'cloud_logs' | 'local_safety';
  sourceLabel: string;
  warnings: string[];
  isEmptyAppShellHtml?: boolean;
  diagnostics?: string;
}

export interface CloudRecoverySummary {
  persons: Person[];
  rootsCount: number;
  maleCount: number;
  femaleCount: number;
  synthesizedAncestorsCount: number;
  lastClearTimestamp: string | null;
  totalLogsAnalyzed: number;
  source: 'local_safety' | 'cloud_logs' | 'none';
}

export interface TimeTravelRestorePoint {
  id: string;
  label: string;
  subLabel: string;
  cutoffTimestamp: string;
  cutoffMs: number;
  persons: Person[];
  rootsCount: number;
  rootNames: string[];
  rootDetails: Array<{ id: string; fullName: string; branchCount: number }>;
  maleCount: number;
  femaleCount: number;
  wifeLinksCount: number;
  motherLinksCount: number;
  notesCount: number;
  logsIncludedCount: number;
  isBeforeToday: boolean;
  isHighlighted?: boolean;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function makeSafePersonId(rawId: unknown, index: number): string {
  if (typeof rawId === 'string') {
    const trimmed = rawId.trim();
    if (trimmed.length > 0 && trimmed.length <= 128 && VALID_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
    const cleaned = trimmed.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100);
    if (cleaned.length > 0 && VALID_ID_REGEX.test(cleaned)) {
      return `r_${cleaned}`;
    }
  }
  return `p_rec_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Sanitizes, validates, deduplicates, and breaks any cycles in a list of Person records
 * so every document strictly complies with Firestore security rules.
 */
export function sanitizePersonsForRestore(rawList: any[]): {
  persons: Person[];
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!Array.isArray(rawList)) {
    return { persons: [], warnings: ['البيانات ليست قائمة صالحة من الأفراد.'] };
  }

  const now = new Date().toISOString();
  const idRemap = new Map<string, string>();
  const usedIds = new Set<string>();
  const intermediate: Array<{
    id: string;
    rawFatherId: string | null;
    rawMotherId: string | null;
    rawHusbandId: string | null;
    rawExcludedChildIds: string[];
    fullName: string;
    gender: Gender;
    husbandName: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
  }> = [];

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;

    const rawName = String(item.fullName ?? item.name ?? item.firstName ?? '').trim();
    if (!rawName) continue;

    const originalId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    let safeId = makeSafePersonId(originalId, i);
    while (usedIds.has(safeId)) {
      safeId = `${safeId.slice(0, 110)}_${i}`;
    }
    usedIds.add(safeId);
    if (originalId) {
      idRemap.set(originalId, safeId);
    }

    const rawGender = String(item.gender ?? '').trim().toLowerCase();
    let gender: Gender = 'male';
    if (
      rawGender === 'female' ||
      rawGender === 'f' ||
      rawGender === 'أنثى' ||
      rawGender === 'انثى' ||
      rawGender === 'بنت' ||
      rawGender === 'ابنة'
    ) {
      gender = 'female';
    } else if (
      rawGender !== 'male' &&
      rawGender !== 'm' &&
      rawGender !== 'ذكر' &&
      /^\S+(?:\s+\S+)?\s+بنت\s+/.test(rawName)
    ) {
      gender = 'female';
    }

    const fullName = rawName.slice(0, 200);
    const notes = typeof item.notes === 'string' ? item.notes.trim().slice(0, 2000) : '';
    const husbandName =
      gender === 'female' && typeof item.husbandName === 'string'
        ? item.husbandName.trim().slice(0, 200)
        : '';

    intermediate.push({
      id: safeId,
      rawFatherId: typeof item.fatherId === 'string' && item.fatherId.trim() ? item.fatherId.trim() : null,
      rawMotherId: typeof item.motherId === 'string' && item.motherId.trim() ? item.motherId.trim() : null,
      rawHusbandId:
        gender === 'female' && typeof item.husbandId === 'string' && item.husbandId.trim()
          ? item.husbandId.trim()
          : null,
      rawExcludedChildIds:
        gender === 'female' && Array.isArray(item.excludedChildIds)
          ? item.excludedChildIds.filter((x: any) => typeof x === 'string' && x.trim())
          : [],
      fullName,
      gender,
      husbandName,
      notes,
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now
    });
  }

  const validIdSet = new Set(intermediate.map((x) => x.id));

  const persons: Person[] = intermediate.map((item) => {
    const mappedFather = item.rawFatherId ? idRemap.get(item.rawFatherId) || item.rawFatherId : null;
    const mappedMother = item.rawMotherId ? idRemap.get(item.rawMotherId) || item.rawMotherId : null;
    const mappedHusband = item.rawHusbandId ? idRemap.get(item.rawHusbandId) || item.rawHusbandId : null;

    const fatherId =
      mappedFather && mappedFather !== item.id && validIdSet.has(mappedFather) ? mappedFather : null;
    const motherId =
      mappedMother && mappedMother !== item.id && validIdSet.has(mappedMother) ? mappedMother : null;
    const husbandId =
      item.gender === 'female' && mappedHusband && mappedHusband !== item.id && validIdSet.has(mappedHusband)
        ? mappedHusband
        : null;
    const excludedChildIds =
      item.gender === 'female'
        ? item.rawExcludedChildIds
            .map((cid) => idRemap.get(cid) || cid)
            .filter((cid) => validIdSet.has(cid))
        : [];

    return {
      id: item.id,
      fullName: item.fullName,
      gender: item.gender,
      fatherId,
      motherId,
      husbandId,
      husbandName: item.husbandName,
      excludedChildIds,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  });

  // Cycle detection & breaking on fatherId chain
  const byId = new Map<string, Person>(persons.map((p) => [p.id, p]));
  let brokenCycles = 0;
  for (const p of persons) {
    if (!p.fatherId) continue;
    const seen = new Set<string>([p.id]);
    let currId: string | null = p.fatherId;
    while (currId) {
      if (seen.has(currId)) {
        p.fatherId = null;
        brokenCycles++;
        break;
      }
      seen.add(currId);
      const parent = byId.get(currId);
      if (!parent || parent.gender === 'female') {
        if (parent && parent.gender === 'female') {
          p.fatherId = null;
        }
        break;
      }
      currId = parent.fatherId;
    }
  }

  if (brokenCycles > 0) {
    warnings.push(`تم تصحيح ${brokenCycles} علاقة دائرية تلقائياً لضمان سلامة الشجرة.`);
  }

  return { persons, warnings };
}

/**
 * Extracts a balanced JSON array literal starting at the first '[' after `markerIndex`.
 */
function extractBalancedJsonArray(source: string, startSearchIndex: number): string | null {
  const startIdx = source.indexOf('[', startSearchIndex);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

/**
 * Parses a JSON backup payload (supports { persons }, { data: { persons } }, or raw array).
 */
export function parseJsonBackupText(text: string): ParsedBackupResult {
  const trimmed = text.trim();

  // Check if this is actually an HTML file (e.g., downloaded from old /api/backup or interactive HTML export)
  if (
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML')
  ) {
    return parseHtmlBackupText(trimmed);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('تعذر قراءة ملف JSON — يرجى التأكد من سلامة بنية الملف.');
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.persons)
    ? parsed.persons
    : Array.isArray(parsed?.data?.persons)
    ? parsed.data.persons
    : Array.isArray(parsed?.familyData)
    ? parsed.familyData
    : null;

  if (!rawList) {
    throw new Error('لم يتم العثور على قائمة الأفراد (persons) داخل ملف JSON.');
  }

  const { persons, warnings } = sanitizePersonsForRestore(rawList);
  if (persons.length === 0) {
    throw new Error('ملف النسخة الاحتياطية لا يحتوي على أي أفراد للاستعادة.');
  }

  return {
    persons,
    sourceType: 'json',
    sourceLabel: 'ملف نسخة احتياطية (JSON)',
    warnings
  };
}

/**
 * Parses an exported interactive HTML file (شجرة_العائلة_التفاعلية_*.html)
 * OR detects if the HTML file is just the empty app shell (index.html) downloaded by mistake.
 */
export function parseHtmlBackupText(htmlText: string): ParsedBackupResult {
  // 1. Check for `const familyData = [...]` embedded by htmlExport.ts
  const markerMatch = htmlText.match(/(?:const|let|var)\s+familyData\s*=/);
  if (markerMatch && markerMatch.index !== undefined) {
    const jsonArrStr = extractBalancedJsonArray(htmlText, markerMatch.index + markerMatch[0].length);
    if (jsonArrStr) {
      try {
        const rawList = JSON.parse(jsonArrStr);
        const { persons, warnings } = sanitizePersonsForRestore(rawList);
        if (persons.length > 0) {
          return {
            persons,
            sourceType: 'html_interactive',
            sourceLabel: 'ملف الشجرة التفاعلية (HTML)',
            warnings
          };
        }
      } catch {
        // Fall through to secondary checks
      }
    }
  }

  // 2. Check for embedded JSON script or `"persons": [...]` inside HTML
  const personsPropMatch = htmlText.match(/"persons"\s*:/);
  if (personsPropMatch && personsPropMatch.index !== undefined) {
    const jsonArrStr = extractBalancedJsonArray(htmlText, personsPropMatch.index + personsPropMatch[0].length);
    if (jsonArrStr) {
      try {
        const rawList = JSON.parse(jsonArrStr);
        const { persons, warnings } = sanitizePersonsForRestore(rawList);
        if (persons.length > 0) {
          return {
            persons,
            sourceType: 'html_interactive',
            sourceLabel: 'ملف HTML يحتوي على بيانات الشجرة',
            warnings
          };
        }
      } catch {
        // Fall through
      }
    }
  }

  // 3. Detect empty SPA shell (index.html returned by static hosting for /api/backup)
  const looksLikeAppShell =
    htmlText.includes('<div id="root">') ||
    htmlText.includes('/src/main.tsx') ||
    htmlText.includes('/assets/index-') ||
    htmlText.length < 15000;

  return {
    persons: [],
    sourceType: 'html_interactive',
    sourceLabel: 'ملف HTML',
    warnings: [],
    isEmptyAppShellHtml: true,
    diagnostics: looksLikeAppShell
      ? 'هذا الملف هو صفحة التطبيق الفارغة (index.html) التي نزلت بسبب خلل سابق في رابط النسخ الاحتياطي ولا يحتوي على أسماء العائلة. لا تقلق: يمكنك استرجاع بياناتك مباشرة من أداة «الاستعادة الطارئة من سجل التعديلات السحابي» بالأسفل، أو برفع ملف شجرة تفاعلية (HTML) أو ملف إكسل (XLSX) سبق تصديره.'
      : 'لم يتم العثور على بيانات شجرة عائلة مدمجة داخل ملف HTML هذا. يرجى تجربة الاستعادة من سجل التعديلات السحابي بالأسفل، أو رفع ملف شجرة تفاعلية HTML أو ملف إكسل XLSX.'
  };
}

// ============================================================================
// Pure Browser XLSX (ZIP + OpenXML) Reader — Zero External Dependencies
// ============================================================================

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('المتصفح لا يدعم فك ضغط ملفات Excel المضغوطة.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  writer.write(copy);
  writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLen += value.byteLength;
    }
  }
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function extractZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map<string, Uint8Array>();

  // Locate End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('ملف الإكسل غير صالح أو تالف.');
  }

  const cdEntriesCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdEntriesCount; i++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > bytes.length) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(fileName, rawSlice);
    } else if (compressionMethod === 8) {
      try {
        const inflated = await inflateRawBytes(rawSlice);
        entries.set(fileName, inflated);
      } catch {
        // Skip unreadable entry
      }
    }
  }

  return entries;
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseWorksheetXmlRows(xmlText: string, sharedStrings: string[]): string[][] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const rowEls = Array.from(doc.getElementsByTagName('row'));
  const rows: string[][] = [];

  for (const rowEl of rowEls) {
    const cells: string[] = [];
    const cellEls = Array.from(rowEl.getElementsByTagName('c'));
    for (const cEl of cellEls) {
      const ref = cEl.getAttribute('r') || '';
      const colLettersMatch = ref.match(/^([A-Z]+)/i);
      const colIdx = colLettersMatch ? colLettersToIndex(colLettersMatch[1].toUpperCase()) : cells.length;
      const type = cEl.getAttribute('t') || '';

      let val = '';
      if (type === 'inlineStr') {
        const tNodes = Array.from(cEl.getElementsByTagName('t'));
        val = tNodes.map((n) => n.textContent || '').join('');
      } else if (type === 's') {
        const vNode = cEl.getElementsByTagName('v')[0];
        const sIdx = vNode ? parseInt(vNode.textContent || '-1', 10) : -1;
        val = sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
      } else {
        const vNode = cEl.getElementsByTagName('v')[0];
        val = vNode ? vNode.textContent || '' : '';
      }

      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = val.trim();
    }
    rows.push(cells);
  }

  return rows;
}

/**
 * Reconstructs parent-child fatherId relationships from Arabic patronymic full names
 * (e.g. "سالم بن محمد بن علي" -> father "محمد بن علي"), optionally synthesizing missing
 * intermediate male ancestors if `synthesizeMissingAncestors` is true.
 */
function linkFathersByArabicLineage(
  persons: Person[],
  options: {
    preferredFatherNameMap?: Map<string, string>;
    preferredFatherIdMap?: Map<string, string>;
    historicalNamesById?: Map<string, Set<string>>;
    deletedNamesSet?: Set<string>;
    bridgeToExistingAncestors?: boolean;
    groupOrphanSiblings?: boolean;
    synthesizeMissingAncestors?: boolean;
  } = {}
): { persons: Person[]; synthesizedCount: number } {
  const {
    preferredFatherNameMap,
    preferredFatherIdMap,
    historicalNamesById,
    deletedNamesSet,
    bridgeToExistingAncestors = false,
    groupOrphanSiblings = false,
    synthesizeMissingAncestors = false
  } = options;

  const list: Person[] = persons.map((p) => ({ ...p }));
  const byId = new Map<string, Person>(list.map((p) => [p.id, p]));
  const maleByNormFullName = new Map<string, Person[]>();
  const malesByNormChainKey = new Map<string, Person[]>();
  const malesByGivenName = new Map<string, Person[]>();

  const registerMaleNameVariant = (p: Person, nameVariant: string) => {
    const normFull = normalizeArabic(nameVariant);
    if (normFull) {
      const listExact = maleByNormFullName.get(normFull) || [];
      if (!listExact.some((x) => x.id === p.id)) {
        listExact.push(p);
        maleByNormFullName.set(normFull, listExact);
      }
    }
    const chain = splitLineageChain(nameVariant).map((s) => normalizeArabic(s)).filter(Boolean);
    if (chain.length > 0) {
      const key = chain.join('|');
      const arr = malesByNormChainKey.get(key) || [];
      if (!arr.some((x) => x.id === p.id)) {
        arr.push(p);
        malesByNormChainKey.set(key, arr);
      }

      const given = chain[0];
      const gArr = malesByGivenName.get(given) || [];
      if (!gArr.some((x) => x.id === p.id)) {
        gArr.push(p);
        malesByGivenName.set(given, gArr);
      }
    }
  };

  const registerMale = (p: Person) => {
    if (p.gender !== 'male') return;
    registerMaleNameVariant(p, p.fullName);
    const hist = historicalNamesById?.get(p.id);
    if (hist) {
      for (const variant of hist) {
        registerMaleNameVariant(p, variant);
      }
    }
  };

  for (const p of list) {
    registerMale(p);
  }

  const getFatherSuffixFromFullName = (fullName: string): string | null => {
    const trimmed = fullName.trim().replace(/^(ابن|بن|بنت)\s+/i, '');
    const m = trimmed.match(/^.+?\s+(?:بن|بنت|ابن)\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();

    // Fallback: if space-separated without بن/بنت (e.g. "أحمد محمد سالم") and remainder matches an existing male exactly
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const skipCount = /^(عبد|أبو|ابو|أم|ام|آل)$/i.test(words[0]) && words.length >= 3 ? 2 : 1;
      const remainder = words.slice(skipCount).join(' ');
      if (remainder && maleByNormFullName.has(normalizeArabic(remainder))) {
        return remainder;
      }
    }
    return null;
  };

  // Walks `fatherId` up from `cand` to get its LIVE full ancestor given-name chain
  const getLiveAncestorChain = (cand: Person): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let curr: Person | undefined = cand;
    while (curr && !seen.has(curr.id) && chain.length < 14) {
      seen.add(curr.id);
      const currParts = splitLineageChain(curr.fullName).map((s) => normalizeArabic(s)).filter(Boolean);
      if (curr.fatherId && byId.has(curr.fatherId)) {
        if (currParts[0]) chain.push(currParts[0]);
        curr = byId.get(curr.fatherId);
      } else {
        for (const seg of currParts) chain.push(seg);
        break;
      }
    }
    return chain;
  };

  // Checks if `potentialAncestorId` is already a descendant of `childId` (prevents cycles)
  const wouldCreateCycle = (childId: string, candidateFatherId: string): boolean => {
    if (childId === candidateFatherId) return true;
    const seen = new Set<string>([childId]);
    let currId: string | null = candidateFatherId;
    while (currId) {
      if (seen.has(currId)) return true;
      seen.add(currId);
      const node = byId.get(currId);
      currId = node?.fatherId || null;
    }
    return false;
  };

  // Pick the best existing male matching `suffix` (using exact, historical, live ancestor chain, and prefix scoring)
  const findExistingMaleForSuffix = (suffix: string, childId: string): Person | null => {
    const normSuffix = normalizeArabic(suffix);
    if (!normSuffix) return null;

    const suffixChain = splitLineageChain(suffix).map((s) => normalizeArabic(s)).filter(Boolean);
    if (suffixChain.length === 0) return null;

    // 1. Exact fullName or historical fullName match
    const exactMatches = (maleByNormFullName.get(normSuffix) || []).filter(
      (m) => !wouldCreateCycle(childId, m.id)
    );
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      // Prefer the one whose current fullName matches or who already has a fatherId
      const currentExact = exactMatches.find((m) => normalizeArabic(m.fullName) === normSuffix);
      return currentExact || exactMatches[0];
    }

    // 2. Exact chain key match
    const exactChainMatches = (malesByNormChainKey.get(suffixChain.join('|')) || []).filter(
      (m) => !wouldCreateCycle(childId, m.id)
    );
    if (exactChainMatches.length > 0) {
      return exactChainMatches[0];
    }

    // 3. Score ALL male candidates whose given name matches `suffixChain[0]`
    // Compare against current chain, historical chains, AND live walked ancestor chain!
    const candidates = (malesByGivenName.get(suffixChain[0]) || []).filter(
      (m) => !wouldCreateCycle(childId, m.id)
    );
    if (candidates.length === 0) return null;

    if (candidates.length === 1 && suffixChain.length === 1) {
      return candidates[0];
    }

    let bestCand: Person | null = null;
    let bestScore = 0;

    for (const cand of candidates) {
      const chainsToCheck: string[][] = [
        getLiveAncestorChain(cand),
        splitLineageChain(cand.fullName).map((s) => normalizeArabic(s)).filter(Boolean)
      ];
      const hist = historicalNamesById?.get(cand.id);
      if (hist) {
        for (const h of hist) {
          chainsToCheck.push(splitLineageChain(h).map((s) => normalizeArabic(s)).filter(Boolean));
        }
      }

      for (const candChain of chainsToCheck) {
        if (candChain.length === 0 || candChain[0] !== suffixChain[0]) continue;

        let consecutive = 0;
        const minLen = Math.min(candChain.length, suffixChain.length);
        for (let k = 0; k < minLen; k++) {
          if (candChain[k] === suffixChain[k]) consecutive++;
          else break;
        }

        // Exact full match on live ancestor chain gets highest score
        if (consecutive === suffixChain.length && candChain.length === suffixChain.length) {
          const score = 10000 + consecutive * 100;
          if (score > bestScore) {
            bestScore = score;
            bestCand = cand;
          }
          continue;
        }

        // Full prefix match (e.g. cand has 1-name root "محمد" or shorter chain before rename, OR suffix truncated at 4 names)
        if (consecutive === minLen && consecutive >= 2) {
          const score = 5000 + consecutive * 100 - Math.abs(candChain.length - suffixChain.length) * 5;
          if (score > bestScore) {
            bestScore = score;
            bestCand = cand;
          }
          continue;
        }

        // Father's branch was later renamed/moved above grandfather (e.g., [علي, أحمد, قديم] vs [علي, أحمد, جديد])
        if (consecutive >= 2) {
          const score = 3000 + consecutive * 100;
          if (score > bestScore) {
            bestScore = score;
            bestCand = cand;
          }
          continue;
        }

        // Single-name candidate (root originally created with 1 name before getting a father) when it is the ONLY candidate with that given name
        if (consecutive === 1 && candChain.length === 1 && candidates.length === 1) {
          const score = 1500;
          if (score > bestScore) {
            bestScore = score;
            bestCand = cand;
          }
        }
      }
    }

    if (bestCand && bestScore >= 1500) {
      return bestCand;
    }

    // If only 1 male in the entire family has this exact given name and his live chain doesn't contradict suffixChain[1]
    if (candidates.length === 1 && suffixChain.length >= 2) {
      const sole = candidates[0];
      const liveChain = getLiveAncestorChain(sole);
      if (liveChain.length === 1) {
        return sole;
      }
    }

    return null;
  };

  let synthesizedCount = 0;

  const createSynthesizedMale = (fullName: string, fatherId: string | null): Person => {
    const now = new Date().toISOString();
    const synthId = `p_syn_${Math.abs(hashStr(fullName))}_${synthesizedCount}`;
    const synthPerson: Person = {
      id: synthId,
      fullName: fullName.slice(0, 200),
      gender: 'male',
      fatherId,
      motherId: null,
      husbandId: null,
      husbandName: '',
      excludedChildIds: [],
      notes: '',
      createdAt: now,
      updatedAt: now
    };
    synthesizedCount++;
    list.push(synthPerson);
    byId.set(synthId, synthPerson);
    registerMale(synthPerson);
    return synthPerson;
  };

  // First pass: apply explicit preferredFatherIdMap (e.g. from merge_operations)
  if (preferredFatherIdMap) {
    for (const p of list) {
      if (!p.fatherId) {
        const prefId = preferredFatherIdMap.get(p.id);
        if (prefId && !wouldCreateCycle(p.id, prefId) && byId.has(prefId)) {
          const dad = byId.get(prefId)!;
          if (dad.gender === 'male') {
            p.fatherId = prefId;
          }
        }
      }
    }
  }

  // Second pass: link existing fathers in ASCENDING lineage depth order (depth 1 -> depth 2 -> depth 3...)
  // so that higher ancestors already have their `fatherId` populated when deeper descendants check live ancestor chains!
  const depthOrdered = [...list].sort((a, b) => {
    const da = splitLineageChain(a.fullName).length;
    const db = splitLineageChain(b.fullName).length;
    if (da !== db) return da - db;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Run 2 passes so newly linked live chains help link any remaining nodes
  for (let pass = 0; pass < 2; pass++) {
    let linkedThisPass = 0;
    for (const p of depthOrdered) {
      if (p.fatherId && byId.has(p.fatherId)) continue;

      const suffix = getFatherSuffixFromFullName(p.fullName);
      if (suffix) {
        const dad = findExistingMaleForSuffix(suffix, p.id);
        if (dad && !wouldCreateCycle(p.id, dad.id)) {
          p.fatherId = dad.id;
          linkedThisPass++;
          continue;
        }

        // If the direct father was intentionally deleted (deletePerson reparents children to grandfather without changing fullName),
        // skip the deleted father and link directly to the next existing ancestor!
        if (deletedNamesSet && deletedNamesSet.has(normalizeArabic(suffix))) {
          const grandSuffix = getFatherSuffixFromFullName(suffix);
          if (grandSuffix) {
            const grandDad = findExistingMaleForSuffix(grandSuffix, p.id);
            if (grandDad && !wouldCreateCycle(p.id, grandDad.id)) {
              p.fatherId = grandDad.id;
              linkedThisPass++;
              continue;
            }
          }
        }
      }

      // Fallback: explicit direct father name column (e.g. from Excel)
      const prefDadName = preferredFatherNameMap?.get(p.id);
      if (prefDadName && prefDadName !== 'أصل شجرة' && !prefDadName.includes('الأصل المؤسس')) {
        const dad = findExistingMaleForSuffix(prefDadName, p.id);
        if (dad && !wouldCreateCycle(p.id, dad.id)) {
          p.fatherId = dad.id;
          linkedThisPass++;
        }
      }
    }
    if (linkedThisPass === 0) break;
  }

  // Third pass (Tier 4A): Bridge unlinked nodes into EXISTING trees when a deeper suffix matches an existing male ancestor!
  // Example: "أحمد بن خالد بن محمد بن راشد" is unlinked, and "محمد بن راشد" exists -> link via missing intermediate "خالد بن محمد بن راشد"
  // (or directly to "محمد بن راشد" if "خالد" was deleted).
  if (bridgeToExistingAncestors || synthesizeMissingAncestors) {
    const unlinkedSnapshot = depthOrdered.filter((p) => !p.fatherId);
    for (const p of unlinkedSnapshot) {
      if (p.fatherId) continue;
      const suffix = getFatherSuffixFromFullName(p.fullName);
      if (!suffix) continue;

      // Re-check first in case a previous bridge already created this exact father
      const alreadyCreatedDad = findExistingMaleForSuffix(suffix, p.id);
      if (alreadyCreatedDad && !wouldCreateCycle(p.id, alreadyCreatedDad.id)) {
        p.fatherId = alreadyCreatedDad.id;
        continue;
      }

      const suffixSegments = splitLineageChain(suffix);
      if (suffixSegments.length >= 2) {
        // Look for the closest existing ancestor at offset k >= 1 in suffixSegments
        let matchedAncestor: Person | null = null;
        let matchedOffset = -1;
        for (let k = 1; k < suffixSegments.length; k++) {
          const ancSuffix = suffixSegments.slice(k).join(' بن ');
          const foundAnc = findExistingMaleForSuffix(ancSuffix, p.id);
          if (foundAnc && !wouldCreateCycle(p.id, foundAnc.id)) {
            matchedAncestor = foundAnc;
            matchedOffset = k;
            break;
          }
        }

        if (matchedAncestor && matchedOffset > 0) {
          // Check if the skipped intermediate segment(s) were explicitly deleted
          const directNorm = normalizeArabic(suffix);
          if (matchedOffset === 1 && deletedNamesSet && deletedNamesSet.has(directNorm)) {
            p.fatherId = matchedAncestor.id;
            continue;
          }

          // Synthesize ONLY the missing intermediate ancestor(s) between p and matchedAncestor
          let upperFather: Person = matchedAncestor;
          for (let j = matchedOffset - 1; j >= 0; j--) {
            const interFullName = rebuildChildFullName(suffixSegments[j], 'male', upperFather.fullName);
            const existingInter = findExistingMaleForSuffix(interFullName, p.id);
            if (existingInter && !wouldCreateCycle(p.id, existingInter.id)) {
              upperFather = existingInter;
            } else {
              upperFather = createSynthesizedMale(interFullName, upperFather.id);
            }
          }
          if (!wouldCreateCycle(p.id, upperFather.id)) {
            p.fatherId = upperFather.id;
          }
        }
      }
    }
  }

  // Fourth pass (Tier 4B): Group 2+ remaining unlinked siblings who share the EXACT same father suffix
  // so siblings under an unlogged root/father never scatter into separate trees!
  if (groupOrphanSiblings) {
    const orphanGroups = new Map<string, { rawSuffix: string; members: Person[] }>();
    for (const p of list) {
      if (p.fatherId) continue;
      const suffix = getFatherSuffixFromFullName(p.fullName);
      if (!suffix) continue;
      const norm = normalizeArabic(suffix);
      if (!norm || (deletedNamesSet && deletedNamesSet.has(norm))) continue;
      const grp = orphanGroups.get(norm) || { rawSuffix: suffix, members: [] };
      grp.members.push(p);
      orphanGroups.set(norm, grp);
    }

    for (const grp of orphanGroups.values()) {
      if (grp.members.length < 2) continue;
      const sharedDad =
        findExistingMaleForSuffix(grp.rawSuffix, grp.members[0].id) ||
        createSynthesizedMale(grp.rawSuffix, null);

      // Also check if this new sharedDad attaches to an existing higher ancestor
      if (!sharedDad.fatherId) {
        const dadSuffix = getFatherSuffixFromFullName(sharedDad.fullName);
        if (dadSuffix) {
          const grand = findExistingMaleForSuffix(dadSuffix, sharedDad.id);
          if (grand && !wouldCreateCycle(sharedDad.id, grand.id)) {
            sharedDad.fatherId = grand.id;
          }
        }
      }

      for (const m of grp.members) {
        if (!m.fatherId && !wouldCreateCycle(m.id, sharedDad.id)) {
          m.fatherId = sharedDad.id;
        }
      }
    }
  }

  return { persons: list, synthesizedCount };
}

/**
 * Parses an exported Excel (.xlsx) workbook generated by the app (or compatible Arabic family register).
 */
export async function parseXlsxBackupFile(file: File): Promise<ParsedBackupResult> {
  const buffer = await file.arrayBuffer();
  const entries = await extractZipEntries(buffer);
  const decoder = new TextDecoder('utf-8');

  // Parse sharedStrings.xml if present
  const sharedStrings: string[] = [];
  const ssBytes = entries.get('xl/sharedStrings.xml');
  if (ssBytes) {
    const ssXml = decoder.decode(ssBytes);
    const parser = new DOMParser();
    const doc = parser.parseFromString(ssXml, 'application/xml');
    const siNodes = Array.from(doc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagName('t'));
      sharedStrings.push(tNodes.map((n) => n.textContent || '').join(''));
    }
  }

  // Scan worksheets to find the full registry sheet (Sheet 3 in tree export or Sheet 1 in MembersList export)
  const sheetPaths = Array.from(entries.keys())
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort();

  let bestHeaderRowIdx = -1;
  let bestRows: string[][] = [];
  let colMap = {
    givenName: -1,
    fullName: -1,
    gender: -1,
    fatherName: -1,
    familyDetails: -1,
    notes: -1
  };

  for (const sp of sheetPaths) {
    const sheetBytes = entries.get(sp);
    if (!sheetBytes) continue;
    const rows = parseWorksheetXmlRows(decoder.decode(sheetBytes), sharedStrings);
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      const fullNameCol = row.findIndex(
        (c) => c.includes('الاسم الكامل') || c.includes('سلسلة النسب') || c.includes('النسب الصاعد')
      );
      const genderCol = row.findIndex((c) => c.includes('الجنس'));
      if (fullNameCol !== -1 && genderCol !== -1) {
        bestHeaderRowIdx = r;
        bestRows = rows;
        colMap = {
          givenName: row.findIndex((c) => c.includes('الاسم الأول')),
          fullName: fullNameCol,
          gender: genderCol,
          fatherName: row.findIndex((c) => c.includes('الأب المباشر')),
          familyDetails: row.findIndex((c) => c.includes('الأم') || c.includes('الزوج')),
          notes: row.findIndex((c) => c.includes('الملاحظات') || c.includes('السيرة'))
        };
        break;
      }
    }
    if (bestHeaderRowIdx !== -1) break;
  }

  if (bestHeaderRowIdx === -1) {
    throw new Error(
      'لم يتم العثور على جدول سجل الأفراد داخل ملف الإكسل (يجب أن يحتوي على عمود «الاسم الكامل» وعمود «الجنس»).'
    );
  }

  const now = new Date().toISOString();
  const rawPersons: Person[] = [];
  const preferredFatherNameMap = new Map<string, string>();
  const pendingMotherLinks: Array<{ personId: string; motherName: string }> = [];
  const pendingHusbandLinks: Array<{ personId: string; husbandName: string }> = [];

  for (let r = bestHeaderRowIdx + 1; r < bestRows.length; r++) {
    const row = bestRows[r];
    if (!row || row.every((c) => !c)) continue;

    // Skip totals footer row
    if (row[0] === 'الإجمالي' || row[0] === 'المجموع الكلي') continue;

    const fullName = (row[colMap.fullName] || '').trim();
    const givenName = colMap.givenName !== -1 ? (row[colMap.givenName] || '').trim() : '';
    const finalName = fullName || givenName;
    if (!finalName || finalName === '—') continue;

    const genderText = (row[colMap.gender] || '').trim();
    const gender: Gender =
      genderText.includes('أنثى') || genderText.includes('انثى') || genderText.includes('بنت')
        ? 'female'
        : 'male';

    const notesRaw = colMap.notes !== -1 ? (row[colMap.notes] || '').trim() : '';
    const notes = notesRaw === '—' ? '' : notesRaw;

    const id = `p_xlsx_${Date.now()}_${r}_${Math.random().toString(36).substring(2, 6)}`;
    rawPersons.push({
      id,
      fullName: finalName.slice(0, 200),
      gender,
      fatherId: null,
      motherId: null,
      husbandId: null,
      husbandName: '',
      excludedChildIds: [],
      notes: notes.slice(0, 2000),
      createdAt: now,
      updatedAt: now
    });

    const fatherText = colMap.fatherName !== -1 ? (row[colMap.fatherName] || '').trim() : '';
    if (fatherText && fatherText !== '—') {
      preferredFatherNameMap.set(id, fatherText);
    }

    const famDetails = colMap.familyDetails !== -1 ? (row[colMap.familyDetails] || '').trim() : '';
    if (famDetails && famDetails !== '—') {
      const motherMatch = famDetails.match(/الأم:\s*([^|]+)/);
      if (motherMatch && motherMatch[1]) {
        pendingMotherLinks.push({ personId: id, motherName: motherMatch[1].trim() });
      }
      const husbandMatch = famDetails.match(/الزوج:\s*([^|]+)/);
      if (husbandMatch && husbandMatch[1]) {
        pendingHusbandLinks.push({ personId: id, husbandName: husbandMatch[1].trim() });
      }
    }
  }

  const linked = linkFathersByArabicLineage(rawPersons, {
    preferredFatherNameMap,
    synthesizeMissingAncestors: false
  });

  // Resolve motherId and husbandId/husbandName where possible
  const byNormFull = new Map<string, Person>();
  for (const p of linked.persons) {
    byNormFull.set(normalizeArabic(p.fullName), p);
  }
  const byId = new Map<string, Person>(linked.persons.map((p) => [p.id, p]));

  for (const ml of pendingMotherLinks) {
    const child = byId.get(ml.personId);
    const mother = byNormFull.get(normalizeArabic(ml.motherName));
    if (child && mother && mother.gender === 'female') {
      child.motherId = mother.id;
    }
  }
  for (const hl of pendingHusbandLinks) {
    const wife = byId.get(hl.personId);
    if (wife && wife.gender === 'female') {
      wife.husbandName = hl.husbandName.slice(0, 200);
      const husband = byNormFull.get(normalizeArabic(hl.husbandName));
      if (husband && husband.gender === 'male') {
        wife.husbandId = husband.id;
      }
    }
  }

  const { persons, warnings } = sanitizePersonsForRestore(linked.persons);
  if (persons.length === 0) {
    throw new Error('لم يتم العثور على أي أفراد في ملف الإكسل.');
  }

  return {
    persons,
    sourceType: 'xlsx',
    sourceLabel: 'ملف إكسل (XLSX)',
    warnings
  };
}

/**
 * Universal smart file parser supporting .json, .html/.htm, and .xlsx
 */
export async function parseBackupFile(file: File): Promise<ParsedBackupResult> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xlsx')) {
    return parseXlsxBackupFile(file);
  }

  const text = await file.text();
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    return parseHtmlBackupText(text);
  }

  return parseJsonBackupText(text);
}

// ============================================================================
// Emergency Recovery from Firestore Audit Logs + Merge Operations + Local Safety Snapshot
// ============================================================================

export function computeRootDetails(persons: Person[]): {
  rootsCount: number;
  rootNames: string[];
  rootDetails: Array<{ id: string; fullName: string; branchCount: number }>;
} {
  const byId = new Set(persons.map((p) => p.id));
  const childrenByFather = new Map<string, Person[]>();
  const roots: Person[] = [];

  for (const p of persons) {
    if (p.fatherId && byId.has(p.fatherId)) {
      const arr = childrenByFather.get(p.fatherId) || [];
      arr.push(p);
      childrenByFather.set(p.fatherId, arr);
    } else {
      roots.push(p);
    }
  }

  const sizeMemo = new Map<string, number>();
  const subtreeSize = (id: string, stack = new Set<string>()): number => {
    if (sizeMemo.has(id)) return sizeMemo.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const kids = childrenByFather.get(id) || [];
    let count = 1;
    for (const k of kids) {
      count += subtreeSize(k.id, stack);
    }
    stack.delete(id);
    sizeMemo.set(id, count);
    return count;
  };

  const rootDetails = roots
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      branchCount: subtreeSize(r.id)
    }))
    .sort((a, b) => b.branchCount - a.branchCount);

  return {
    rootsCount: rootDetails.length,
    rootNames: rootDetails.map((r) => r.fullName),
    rootDetails
  };
}

function buildLocalSafetySnapshot(
  raw: { id?: string; savedAt?: string; reason?: string; persons: any[] },
  fallbackIndex: number
): LocalSafetySnapshot | null {
  if (!raw || !Array.isArray(raw.persons) || raw.persons.length === 0) return null;
  const { persons } = sanitizePersonsForRestore(raw.persons);
  if (persons.length === 0) return null;
  const savedAt = raw.savedAt || new Date().toISOString();
  const { rootsCount, rootDetails } = computeRootDetails(persons);
  const maleCount = persons.filter((p) => p.gender === 'male').length;
  const wifeLinksCount = persons.filter(
    (p) => p.gender === 'female' && (Boolean(p.husbandId) || Boolean(p.husbandName && p.husbandName.trim()))
  ).length;
  const motherLinksCount = persons.filter((p) => Boolean(p.motherId)).length;
  const notesCount = persons.filter((p) => Boolean(p.notes && p.notes.trim())).length;
  const hasRichDetails = wifeLinksCount > 0 || motherLinksCount > 0 || notesCount > 0;
  return {
    id: raw.id || `local_${savedAt}_${persons.length}_${fallbackIndex}`,
    savedAt,
    reason: raw.reason,
    persons,
    rootsCount,
    rootDetails,
    maleCount,
    femaleCount: persons.length - maleCount,
    wifeLinksCount,
    motherLinksCount,
    notesCount,
    hasRichDetails
  };
}

export function saveLocalSafetyBackup(persons: Person[], reason?: string): void {
  if (!persons || persons.length === 0) return;
  const nowIso = new Date().toISOString();
  const newEntry = {
    id: `local_${Date.now()}`,
    savedAt: nowIso,
    reason: reason || 'نسخة أمان تلقائية قبل التعديل',
    persons
  };

  try {
    // Preserve any existing single-slot backup into rolling history before updating
    const history: Array<{ id?: string; savedAt: string; reason?: string; persons: Person[] }> = [];
    try {
      const rawHistory = localStorage.getItem(AUTO_SAFETY_BACKUP_HISTORY_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && Array.isArray(item.persons) && item.persons.length > 0) {
              history.push(item);
            }
          }
        }
      }
    } catch {
      // Ignore malformed history
    }

    try {
      const rawSingle = localStorage.getItem(AUTO_SAFETY_BACKUP_STORAGE_KEY);
      if (rawSingle) {
        const prevSingle = JSON.parse(rawSingle);
        if (prevSingle && Array.isArray(prevSingle.persons) && prevSingle.persons.length > 0) {
          const alreadyInHistory = history.some(
            (h) => h.savedAt === prevSingle.savedAt && h.persons.length === prevSingle.persons.length
          );
          if (!alreadyInHistory) {
            history.unshift({
              id: prevSingle.id || `local_prev_${prevSingle.savedAt || Date.now()}`,
              savedAt: prevSingle.savedAt || nowIso,
              reason: prevSingle.reason || 'نسخة أمان تلقائية سابقة',
              persons: prevSingle.persons
            });
          }
        }
      }
    } catch {
      // Ignore malformed single slot
    }

    // Avoid adding an exact duplicate right on top of identical snapshot
    const newSig = `${persons.length}|${persons.filter((p) => !p.fatherId).length}|${persons
      .slice(0, 5)
      .map((p) => `${p.id}:${p.fatherId || ''}`)
      .join(',')}`;
    const topItem = history[0];
    const topSig = topItem
      ? `${topItem.persons.length}|${topItem.persons.filter((p) => !p.fatherId).length}|${topItem.persons
          .slice(0, 5)
          .map((p) => `${p.id}:${p.fatherId || ''}`)
          .join(',')}`
      : '';

    if (newSig !== topSig) {
      history.unshift(newEntry);
    }

    // Keep up to 6 snapshots, trimming oldest if quota is exceeded
    let trimmed = history.slice(0, 6);
    while (trimmed.length > 0) {
      try {
        localStorage.setItem(AUTO_SAFETY_BACKUP_HISTORY_KEY, JSON.stringify(trimmed));
        break;
      } catch {
        trimmed = trimmed.slice(0, trimmed.length - 1);
      }
    }

    // Also update legacy single-slot key
    localStorage.setItem(
      AUTO_SAFETY_BACKUP_STORAGE_KEY,
      JSON.stringify({ savedAt: nowIso, reason: newEntry.reason, persons })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalSafetyBackups(): LocalSafetySnapshot[] {
  const snapshots: LocalSafetySnapshot[] = [];
  const seenKeys = new Set<string>();

  const pushRaw = (raw: any, idx: number) => {
    const snap = buildLocalSafetySnapshot(raw, idx);
    if (!snap) return;
    const dedupeKey = `${snap.persons.length}|${snap.rootsCount}|${snap.rootDetails
      .slice(0, 4)
      .map((r) => `${r.id}:${r.branchCount}`)
      .join(',')}|${snap.hasRichDetails}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    snapshots.push(snap);
  };

  try {
    const rawHistory = localStorage.getItem(AUTO_SAFETY_BACKUP_HISTORY_KEY);
    if (rawHistory) {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, idx) => pushRaw(item, idx));
      }
    }
  } catch {
    // Ignore parse error
  }

  try {
    const rawSingle = localStorage.getItem(AUTO_SAFETY_BACKUP_STORAGE_KEY);
    if (rawSingle) {
      const parsed = JSON.parse(rawSingle);
      pushRaw(parsed, snapshots.length);
    }
  } catch {
    // Ignore parse error
  }

  snapshots.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return snapshots;
}

export function loadLocalSafetyBackup(): { savedAt: string; persons: Person[] } | null {
  const all = loadLocalSafetyBackups();
  if (all.length === 0) return null;
  // Prefer the snapshot with rich details and cleanest root structure, else newest
  const sorted = [...all].sort((a, b) => {
    if (a.hasRichDetails !== b.hasRichDetails) return a.hasRichDetails ? -1 : 1;
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });
  return { savedAt: sorted[0].savedAt, persons: sorted[0].persons };
}

/**
 * Reconstructs the exact family tree state at a specific point in time (`cutoffMs`)
 * by replaying Firestore `audit_logs` and `merge_operations` strictly up to `cutoffMs`.
 * Optionally enriches recovered records using verified snapshot data (`enrichmentPersons`)
 * for fields not stored in audit_logs (notes, motherId, husbandId, husbandName, and untouched fatherId).
 */
export function reconstructAtTimestamp(
  auditLogs: AuditLog[],
  mergeOperations: MergeOperation[],
  cutoffMs: number,
  options: { ignoreClears?: boolean; enrichmentPersons?: Person[] } = {}
): {
  persons: Person[];
  rootsCount: number;
  rootNames: string[];
  rootDetails: Array<{ id: string; fullName: string; branchCount: number }>;
  maleCount: number;
  femaleCount: number;
  wifeLinksCount: number;
  motherLinksCount: number;
  notesCount: number;
  logsIncludedCount: number;
  lastClearTimestamp: string | null;
} {
  const { ignoreClears = false, enrichmentPersons = [] } = options;

  const validLogs = [...(auditLogs || [])]
    .filter((l) => !Number.isNaN(new Date(l.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const sortedLogs = validLogs.filter((l) => new Date(l.timestamp).getTime() <= cutoffMs);
  const logsAfterCutoff = validLogs.filter((l) => new Date(l.timestamp).getTime() > cutoffMs);

  // Track persons whose structural links were modified AFTER cutoffMs so enrichment never leaks later moves
  const modifiedAfterCutoffIds = new Set<string>();
  for (const log of logsAfterCutoff) {
    if (
      (log.actionType === 'update' || log.actionType === 'add_father' || log.actionType === 'merge') &&
      log.targetPersonId
    ) {
      modifiedAfterCutoffIds.add(log.targetPersonId);
    }
  }
  for (const op of mergeOperations || []) {
    const t = new Date(op.timestamp).getTime();
    if (!Number.isNaN(t) && t > cutoffMs) {
      if (op.sourcePersonId) modifiedAfterCutoffIds.add(op.sourcePersonId);
      if (op.targetPersonId) modifiedAfterCutoffIds.add(op.targetPersonId);
      if (Array.isArray(op.movedChildrenIds)) {
        for (const cid of op.movedChildrenIds) modifiedAfterCutoffIds.add(cid);
      }
    }
  }

  type TempRecord = {
    id: string;
    fullName: string;
    gender: Gender;
    createdAt: string;
    updatedAt: string;
  };

  let activeMap = new Map<string, TempRecord>();
  let bestPreClearSnapshot: Map<string, TempRecord> | null = null;
  let lastClearTimestamp: string | null = null;
  const historicalNamesById = new Map<string, Set<string>>();
  const deletedNamesSet = new Set<string>();

  const recordHistoricalName = (id: string, name: string) => {
    if (!id || !name) return;
    let set = historicalNamesById.get(id);
    if (!set) {
      set = new Set<string>();
      historicalNamesById.set(id, set);
    }
    set.add(name.trim());
  };

  const propagateRenameInActiveMap = (
    renamedId: string,
    oldFullName: string,
    newFullName: string,
    ts: string
  ) => {
    const normOld = normalizeArabic(oldFullName);
    const normNew = normalizeArabic(newFullName);
    if (!normOld || !normNew || normOld === normNew) return;
    const oldChain = splitLineageChain(oldFullName)
      .map((s) => normalizeArabic(s))
      .filter(Boolean);
    if (oldChain.length === 0) return;

    // Avoid propagating an ambiguous single-word name if another male shares that exact single name
    if (oldChain.length === 1) {
      let sameSingleNameMales = 0;
      for (const r of activeMap.values()) {
        if (r.id === renamedId || r.gender !== 'male') continue;
        if (normalizeArabic(r.fullName) === normOld) {
          sameSingleNameMales++;
        }
      }
      if (sameSingleNameMales > 0) return;
    }

    for (const rec of activeMap.values()) {
      if (rec.id === renamedId) continue;
      const recChain = splitLineageChain(rec.fullName);
      if (recChain.length <= oldChain.length) continue;
      const tailStart = recChain.length - oldChain.length;
      let matchesTail = true;
      for (let i = 0; i < oldChain.length; i++) {
        if (normalizeArabic(recChain[tailStart + i]) !== oldChain[i]) {
          matchesTail = false;
          break;
        }
      }
      if (matchesTail) {
        recordHistoricalName(rec.id, rec.fullName);
        const prefixSegs = recChain.slice(0, tailStart);
        const firstConn = rec.gender === 'female' ? 'بنت' : 'بن';
        const rebuilt =
          prefixSegs.length === 1
            ? `${prefixSegs[0]} ${firstConn} ${newFullName.trim()}`
            : `${prefixSegs[0]} ${firstConn} ${prefixSegs.slice(1).join(' بن ')} بن ${newFullName.trim()}`;
        rec.fullName = rebuilt.slice(0, 200);
        rec.updatedAt = ts;
        recordHistoricalName(rec.id, rec.fullName);
      }
    }
  };

  const inferGenderFromText = (name: string, desc: string, fallback: Gender = 'male'): Gender => {
    if (/إضافة\s+ابنة/.test(desc)) return 'female';
    if (/إضافة\s+ابن/.test(desc)) return 'male';
    const trimmed = name.trim();
    const firstConn = trimmed.match(/^\S+(?:\s+(?:عبد|أبو|ابو|أم|ام)\s+\S+)?\s+(بن|بنت|ابن)\s+/i);
    if (firstConn) {
      return firstConn[1] === 'بنت' ? 'female' : 'male';
    }
    return fallback;
  };

  for (const log of sortedLogs) {
    const desc = (log.description || '').trim();
    const ts = log.timestamp || new Date().toISOString();

    if (log.actionType === 'delete' && desc.includes('تفريغ كافة بيانات')) {
      lastClearTimestamp = ts;
      if (!bestPreClearSnapshot || activeMap.size >= bestPreClearSnapshot.size) {
        bestPreClearSnapshot = new Map(activeMap);
      }
      if (!ignoreClears) {
        activeMap = new Map<string, TempRecord>();
      }
      continue;
    }

    if (log.actionType === 'create') {
      const nameFromDesc = desc.replace(/^إضافة\s+(?:ابن|ابنة|فرد)\s*:\s*/i, '').trim();
      const fullName = (log.targetPersonName || nameFromDesc).trim();
      if (!fullName) continue;

      const id =
        log.targetPersonId && VALID_ID_REGEX.test(log.targetPersonId)
          ? log.targetPersonId
          : `p_log_${activeMap.size + 1}_${Math.abs(hashStr(fullName + ts))}`;
      const gender = inferGenderFromText(fullName, desc, 'male');

      activeMap.set(id, {
        id,
        fullName,
        gender,
        createdAt: ts,
        updatedAt: ts
      });
      recordHistoricalName(id, fullName);
      deletedNamesSet.delete(normalizeArabic(fullName));
    } else if (log.actionType === 'update') {
      const nameFromDesc = desc.replace(/^تعديل\s+بيانات\s*:\s*/i, '').trim();
      const fullName = (log.targetPersonName || nameFromDesc).trim();
      if (!fullName || !log.targetPersonId) continue;

      const existing = activeMap.get(log.targetPersonId);
      const oldName = existing?.fullName || '';
      const gender = inferGenderFromText(fullName, desc, existing?.gender || 'male');

      activeMap.set(log.targetPersonId, {
        id: log.targetPersonId,
        fullName,
        gender,
        createdAt: existing?.createdAt || ts,
        updatedAt: ts
      });
      if (oldName) recordHistoricalName(log.targetPersonId, oldName);
      recordHistoricalName(log.targetPersonId, fullName);
      if (oldName && normalizeArabic(oldName) !== normalizeArabic(fullName)) {
        propagateRenameInActiveMap(log.targetPersonId, oldName, fullName, ts);
      }
    } else if (log.actionType === 'add_father') {
      const highestName = (log.targetPersonName || '').trim();
      if (log.targetPersonId && highestName) {
        const existing = activeMap.get(log.targetPersonId);
        const oldHighest = existing?.fullName || '';
        activeMap.set(log.targetPersonId, {
          id: log.targetPersonId,
          fullName: highestName,
          gender: 'male',
          createdAt: existing?.createdAt || ts,
          updatedAt: ts
        });
        if (oldHighest) recordHistoricalName(log.targetPersonId, oldHighest);
        recordHistoricalName(log.targetPersonId, highestName);
        if (oldHighest && normalizeArabic(oldHighest) !== normalizeArabic(highestName)) {
          propagateRenameInActiveMap(log.targetPersonId, oldHighest, highestName, ts);
        }
      }

      // Description pattern: نقل/ربط (CHILD_FULLNAME) وفروعه (N فرع) إلى الجد/الأصل (ANCESTOR_FULLNAME)
      const childMatch = desc.match(/نقل\/ربط\s*\(([^)]+)\)\s*وفروعه/);
      if (childMatch && childMatch[1]) {
        const updatedChildName = childMatch[1].trim();
        const childGiven = normalizeArabic(extractGivenName(updatedChildName));

        // Update the matching child record and propagate down to its existing descendants
        for (const rec of activeMap.values()) {
          if (normalizeArabic(extractGivenName(rec.fullName)) === childGiven) {
            if (
              normalizeArabic(updatedChildName).startsWith(normalizeArabic(rec.fullName)) ||
              normalizeArabic(rec.fullName) === childGiven
            ) {
              const prevChildName = rec.fullName;
              recordHistoricalName(rec.id, prevChildName);
              rec.fullName = updatedChildName;
              rec.updatedAt = ts;
              recordHistoricalName(rec.id, updatedChildName);
              if (normalizeArabic(prevChildName) !== normalizeArabic(updatedChildName)) {
                propagateRenameInActiveMap(rec.id, prevChildName, updatedChildName, ts);
              }
              break;
            }
          }
        }

        // If add_father created intermediate ancestors strictly between child and highestAncestor, add them
        if (highestName) {
          const childChain = splitLineageChain(updatedChildName);
          const highestChain = splitLineageChain(highestName);
          if (childChain.length > highestChain.length + 1) {
            const tailMatches = highestChain.every(
              (seg, idx) =>
                normalizeArabic(childChain[childChain.length - highestChain.length + idx]) ===
                normalizeArabic(seg)
            );
            if (tailMatches) {
              const interEnd = childChain.length - highestChain.length;
              for (let k = interEnd - 1; k >= 1; k--) {
                const interFullName = childChain.slice(k).join(' بن ');
                const normInter = normalizeArabic(interFullName);
                const alreadyExists = Array.from(activeMap.values()).some(
                  (r) => r.gender === 'male' && normalizeArabic(r.fullName) === normInter
                );
                if (!alreadyExists) {
                  const interId = `p_af_${Math.abs(hashStr(interFullName))}_${k}`;
                  activeMap.set(interId, {
                    id: interId,
                    fullName: interFullName,
                    gender: 'male',
                    createdAt: ts,
                    updatedAt: ts
                  });
                  recordHistoricalName(interId, interFullName);
                }
              }
            }
          }
        }
      }
    } else if (log.actionType === 'delete' && log.targetPersonId) {
      const deletedRec = activeMap.get(log.targetPersonId);
      if (deletedRec?.fullName) {
        deletedNamesSet.add(normalizeArabic(deletedRec.fullName));
      }
      const deletedNameFromLog = (
        log.targetPersonName ||
        desc.replace(/^حذف\s+(?:الفرد|الشخص|ابن|ابنة|فرد)\s*:\s*/i, '')
      ).trim();
      if (deletedNameFromLog) {
        deletedNamesSet.add(normalizeArabic(deletedNameFromLog));
      }
      activeMap.delete(log.targetPersonId);
    } else if (log.actionType === 'merge') {
      if (log.targetPersonId && log.targetPersonName) {
        const existing = activeMap.get(log.targetPersonId);
        const oldName = existing?.fullName || '';
        const newName = log.targetPersonName.trim();
        activeMap.set(log.targetPersonId, {
          id: log.targetPersonId,
          fullName: newName,
          gender: existing?.gender || 'male',
          createdAt: existing?.createdAt || ts,
          updatedAt: ts
        });
        if (oldName) recordHistoricalName(log.targetPersonId, oldName);
        recordHistoricalName(log.targetPersonId, newName);
        if (oldName && normalizeArabic(oldName) !== normalizeArabic(newName)) {
          propagateRenameInActiveMap(log.targetPersonId, oldName, newName, ts);
        }
      }
    }
  }

  const chosenMap =
    ignoreClears && bestPreClearSnapshot && bestPreClearSnapshot.size > activeMap.size
      ? new Map(bestPreClearSnapshot)
      : new Map(activeMap);

  // Apply ONLY merge_operations that occurred on or before cutoffMs
  const preferredFatherIdMap = new Map<string, string>();
  const sortedMerges = [...(mergeOperations || [])]
    .filter((op) => {
      const t = new Date(op.timestamp).getTime();
      return !Number.isNaN(t) && t <= cutoffMs;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const op of sortedMerges) {
    if (op.sourcePersonId && chosenMap.has(op.sourcePersonId)) {
      chosenMap.delete(op.sourcePersonId);
    }
    if (op.targetPersonId && op.targetPersonName) {
      const existing = chosenMap.get(op.targetPersonId);
      if (!existing) {
        chosenMap.set(op.targetPersonId, {
          id: op.targetPersonId,
          fullName: op.targetPersonName.trim(),
          gender: 'male',
          createdAt: op.timestamp,
          updatedAt: op.timestamp
        });
      }
      recordHistoricalName(op.targetPersonId, op.targetPersonName.trim());
      if (op.sourcePersonName) {
        recordHistoricalName(op.targetPersonId, op.sourcePersonName.trim());
      }
    }
    if (Array.isArray(op.movedChildrenIds) && op.targetPersonId) {
      for (const cid of op.movedChildrenIds) {
        preferredFatherIdMap.set(cid, op.targetPersonId);
      }
    }
  }

  // Optional metadata & untouched-link enrichment from verified local/safety snapshot
  const enrichById = new Map<string, Person>();
  const enrichByNormName = new Map<string, Person>();
  const enrichByPairKey = new Map<string, Person[]>();
  const makePairKey = (fullName: string) => {
    const chain = splitLineageChain(fullName).map((s) => normalizeArabic(s)).filter(Boolean);
    return chain.length >= 2 ? `${chain[0]}|${chain[1]}` : '';
  };

  for (const ep of enrichmentPersons) {
    if (!ep || !ep.id) continue;
    if (!enrichById.has(ep.id)) enrichById.set(ep.id, ep);
    const norm = normalizeArabic(ep.fullName);
    if (norm && !enrichByNormName.has(norm)) {
      enrichByNormName.set(norm, ep);
    }
    const pk = makePairKey(ep.fullName);
    if (pk) {
      const arr = enrichByPairKey.get(pk) || [];
      arr.push(ep);
      enrichByPairKey.set(pk, arr);
    }
  }

  // Lookup males inside chosenMap by normalized fullName or given+father pair for husbandId re-resolution
  const chosenMaleByNorm = new Map<string, string>();
  const chosenMaleByPair = new Map<string, string[]>();
  for (const r of chosenMap.values()) {
    if (r.gender !== 'male') continue;
    const norm = normalizeArabic(r.fullName);
    if (norm && !chosenMaleByNorm.has(norm)) chosenMaleByNorm.set(norm, r.id);
    const pk = makePairKey(r.fullName);
    if (pk) {
      const arr = chosenMaleByPair.get(pk) || [];
      arr.push(r.id);
      chosenMaleByPair.set(pk, arr);
    }
  }

  const rawPersons: Person[] = Array.from(chosenMap.values()).map((r) => {
    let ep = enrichById.get(r.id) || enrichByNormName.get(normalizeArabic(r.fullName));
    if (!ep) {
      const pk = makePairKey(r.fullName);
      if (pk) {
        const pairCandidates = (enrichByPairKey.get(pk) || []).filter(
          (c) => c.gender === r.gender
        );
        if (pairCandidates.length === 1) {
          ep = pairCandidates[0];
        }
      }
    }

    if (
      ep &&
      ep.fatherId &&
      ep.fatherId !== r.id &&
      chosenMap.has(ep.fatherId) &&
      !preferredFatherIdMap.has(r.id) &&
      !modifiedAfterCutoffIds.has(r.id)
    ) {
      preferredFatherIdMap.set(r.id, ep.fatherId);
    }

    const motherId = ep?.motherId && chosenMap.has(ep.motherId) ? ep.motherId : null;
    let husbandId: string | null =
      ep?.husbandId && chosenMap.has(ep.husbandId) ? ep.husbandId : null;
    if (!husbandId && ep?.husbandName && ep.husbandName.trim()) {
      const normH = normalizeArabic(ep.husbandName);
      if (normH && chosenMaleByNorm.has(normH)) {
        husbandId = chosenMaleByNorm.get(normH)!;
      } else {
        const hPair = makePairKey(ep.husbandName);
        if (hPair) {
          const hCands = chosenMaleByPair.get(hPair) || [];
          if (hCands.length === 1) husbandId = hCands[0];
        }
      }
    }
    const excludedChildIds = Array.isArray(ep?.excludedChildIds)
      ? ep.excludedChildIds.filter((cid) => chosenMap.has(cid))
      : [];

    return {
      id: r.id,
      fullName: r.fullName,
      gender: ep?.gender || r.gender,
      fatherId: null,
      motherId,
      husbandId,
      husbandName: ep?.husbandName || '',
      excludedChildIds,
      notes: ep?.notes || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  });

  const linked = linkFathersByArabicLineage(rawPersons, {
    preferredFatherIdMap,
    historicalNamesById,
    deletedNamesSet,
    bridgeToExistingAncestors: true,
    groupOrphanSiblings: true,
    synthesizeMissingAncestors: false
  });

  const { persons: sanitized } = sanitizePersonsForRestore(linked.persons);

  // Top-down pass to refresh cascaded descendant fullNames cleanly from each root
  const childrenByFather = new Map<string, Person[]>();
  const roots: Person[] = [];
  for (const p of sanitized) {
    if (p.fatherId) {
      const arr = childrenByFather.get(p.fatherId) || [];
      arr.push(p);
      childrenByFather.set(p.fatherId, arr);
    } else {
      roots.push(p);
    }
  }

  const visitedCascade = new Set<string>();
  const queue: Person[] = [...roots];
  for (const r of roots) visitedCascade.add(r.id);

  while (queue.length > 0) {
    const parent = queue.shift()!;
    const kids = childrenByFather.get(parent.id) || [];
    for (const child of kids) {
      if (visitedCascade.has(child.id)) continue;
      visitedCascade.add(child.id);
      child.fullName = rebuildChildFullName(child.fullName, child.gender, parent.fullName).slice(0, 200);
      queue.push(child);
    }
  }

  // Keep husbandName in sync with updated husband fullName after lineage cascade
  const sanitizedById = new Map<string, Person>(sanitized.map((p) => [p.id, p]));
  for (const p of sanitized) {
    if (p.gender === 'female' && p.husbandId) {
      const husband = sanitizedById.get(p.husbandId);
      if (husband) {
        p.husbandName = husband.fullName;
      }
    }
  }

  const { rootsCount, rootNames, rootDetails } = computeRootDetails(sanitized);
  const maleCount = sanitized.filter((p) => p.gender === 'male').length;
  const wifeLinksCount = sanitized.filter(
    (p) => p.gender === 'female' && (Boolean(p.husbandId) || Boolean(p.husbandName && p.husbandName.trim()))
  ).length;
  const motherLinksCount = sanitized.filter((p) => Boolean(p.motherId)).length;
  const notesCount = sanitized.filter((p) => Boolean(p.notes && p.notes.trim())).length;

  return {
    persons: sanitized,
    rootsCount,
    rootNames,
    rootDetails,
    maleCount,
    femaleCount: sanitized.length - maleCount,
    wifeLinksCount,
    motherLinksCount,
    notesCount,
    logsIncludedCount: sortedLogs.length,
    lastClearTimestamp
  };
}

/**
 * Generates automatic Point-in-Time Restore Points from Firestore `audit_logs` & `merge_operations`,
 * including "Before today's edits", before each clear/merge event, and end of each active day.
 */
export function buildTimeTravelRestorePoints(
  auditLogs: AuditLog[],
  mergeOperations: MergeOperation[],
  enrichmentPersons: Person[] = []
): TimeTravelRestorePoint[] {
  if (!auditLogs || auditLogs.length === 0) return [];

  const sortedLogs = [...auditLogs]
    .filter((l) => !Number.isNaN(new Date(l.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (sortedLogs.length === 0) return [];

  const now = new Date();
  const startOfTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).getTime();

  const formatArDate = (ms: number) =>
    new Date(ms).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  const formatArDateTime = (ms: number) =>
    new Date(ms).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  type Candidate = {
    id: string;
    label: string;
    subLabel: string;
    cutoffMs: number;
    isBeforeToday: boolean;
    isHighlighted?: boolean;
    priority: number;
  };

  const candidates: Candidate[] = [];

  // 1. "Before today's edits" — latest log strictly before today 00:00:00
  const logsBeforeToday = sortedLogs.filter(
    (l) => new Date(l.timestamp).getTime() < startOfTodayMs
  );
  if (logsBeforeToday.length > 0) {
    const lastPrevMs = new Date(
      logsBeforeToday[logsBeforeToday.length - 1].timestamp
    ).getTime();
    candidates.push({
      id: `before_today_${lastPrevMs}`,
      label: 'نسخة ما قبل تعديلات اليوم',
      subLabel: `آخر حالة مسجّلة قبل اليوم (${formatArDateTime(lastPrevMs)})`,
      cutoffMs: lastPrevMs,
      isBeforeToday: true,
      isHighlighted: true,
      priority: 100
    });
  }

  // 2. Before each mass clear event
  for (const log of sortedLogs) {
    const desc = (log.description || '').trim();
    const tsMs = new Date(log.timestamp).getTime();
    if (log.actionType === 'delete' && desc.includes('تفريغ كافة بيانات')) {
      candidates.push({
        id: `pre_clear_${tsMs}`,
        label: 'قبل عملية تفريغ الشجرة مباشرة',
        subLabel: `لحظة ما قبل المسح في ${formatArDateTime(tsMs)}`,
        cutoffMs: tsMs - 1,
        isBeforeToday: tsMs < startOfTodayMs,
        isHighlighted: logsBeforeToday.length === 0,
        priority: 90
      });
    } else if (log.actionType === 'merge') {
      candidates.push({
        id: `pre_merge_${tsMs}`,
        label: 'قبل عملية دمج الأشجار',
        subLabel: `قبل الدمج في ${formatArDateTime(tsMs)}`,
        cutoffMs: tsMs - 1,
        isBeforeToday: tsMs < startOfTodayMs,
        priority: 75
      });
    }
  }

  // 3. End of each distinct calendar day present in logs (newest -> oldest)
  const dayLastLogMap = new Map<string, { lastMs: number; count: number }>();
  for (const log of sortedLogs) {
    const d = new Date(log.timestamp);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const ms = d.getTime();
    const prev = dayLastLogMap.get(dayKey);
    if (!prev) {
      dayLastLogMap.set(dayKey, { lastMs: ms, count: 1 });
    } else {
      dayLastLogMap.set(dayKey, { lastMs: Math.max(prev.lastMs, ms), count: prev.count + 1 });
    }
  }

  const dayEntries = Array.from(dayLastLogMap.entries())
    .sort((a, b) => b[1].lastMs - a[1].lastMs)
    .slice(0, 14);

  for (const [dayKey, info] of dayEntries) {
    const isBeforeToday = info.lastMs < startOfTodayMs;
    candidates.push({
      id: `day_${dayKey}`,
      label: isBeforeToday
        ? `نهاية يوم ${formatArDate(info.lastMs)}`
        : `آخر حالة اليوم (${formatArDate(info.lastMs)})`,
      subLabel: `${info.count} عملية في هذا اليوم · آخر تحديث ${formatArDateTime(info.lastMs)}`,
      cutoffMs: info.lastMs,
      isBeforeToday,
      priority: isBeforeToday ? 60 : 40
    });
  }

  // Evaluate each candidate and deduplicate identical resulting snapshots (keeping highest priority)
  candidates.sort((a, b) => b.priority - a.priority || b.cutoffMs - a.cutoffMs);

  const results: TimeTravelRestorePoint[] = [];
  const seenSignatures = new Set<string>();

  for (const cand of candidates) {
    const snap = reconstructAtTimestamp(auditLogs, mergeOperations, cand.cutoffMs, {
      ignoreClears: false,
      enrichmentPersons
    });
    if (snap.persons.length === 0) continue;

    const sig = `${snap.persons.length}|${snap.rootsCount}|${snap.rootNames.slice(0, 5).join(',')}|${snap.logsIncludedCount}`;
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    results.push({
      id: cand.id,
      label: cand.label,
      subLabel: cand.subLabel,
      cutoffTimestamp: new Date(cand.cutoffMs).toISOString(),
      cutoffMs: cand.cutoffMs,
      persons: snap.persons,
      rootsCount: snap.rootsCount,
      rootNames: snap.rootNames,
      rootDetails: snap.rootDetails,
      maleCount: snap.maleCount,
      femaleCount: snap.femaleCount,
      wifeLinksCount: snap.wifeLinksCount,
      motherLinksCount: snap.motherLinksCount,
      notesCount: snap.notesCount,
      logsIncludedCount: snap.logsIncludedCount,
      isBeforeToday: cand.isBeforeToday,
      isHighlighted: cand.isHighlighted
    });
  }

  return results;
}

/**
 * Reconstructs deleted family tree records directly from Firestore `audit_logs` and `merge_operations`
 * (which remain preserved in Firestore even after `clearAllData()` deletes the `persons` collection).
 */
export function reconstructFromCloudLogs(
  auditLogs: AuditLog[],
  mergeOperations: MergeOperation[]
): CloudRecoverySummary {
  const localSnap = loadLocalSafetyBackup();

  if (!auditLogs || auditLogs.length === 0) {
    if (localSnap && localSnap.persons.length > 0) {
      const rootsCount = localSnap.persons.filter((p) => !p.fatherId).length;
      const maleCount = localSnap.persons.filter((p) => p.gender === 'male').length;
      return {
        persons: localSnap.persons,
        rootsCount,
        maleCount,
        femaleCount: localSnap.persons.length - maleCount,
        synthesizedAncestorsCount: 0,
        lastClearTimestamp: localSnap.savedAt,
        totalLogsAnalyzed: 0,
        source: 'local_safety'
      };
    }
    return {
      persons: [],
      rootsCount: 0,
      maleCount: 0,
      femaleCount: 0,
      synthesizedAncestorsCount: 0,
      lastClearTimestamp: null,
      totalLogsAnalyzed: 0,
      source: 'none'
    };
  }

  const snap = reconstructAtTimestamp(auditLogs, mergeOperations, Date.now() + 60000, {
    ignoreClears: true,
    enrichmentPersons: localSnap?.persons || []
  });

  if (localSnap && localSnap.persons.length >= snap.persons.length && localSnap.persons.length > 0) {
    const rootsCount = localSnap.persons.filter((p) => !p.fatherId).length;
    const maleCount = localSnap.persons.filter((p) => p.gender === 'male').length;
    return {
      persons: localSnap.persons,
      rootsCount,
      maleCount,
      femaleCount: localSnap.persons.length - maleCount,
      synthesizedAncestorsCount: 0,
      lastClearTimestamp: localSnap.savedAt,
      totalLogsAnalyzed: auditLogs.length,
      source: 'local_safety'
    };
  }

  return {
    persons: snap.persons,
    rootsCount: snap.rootsCount,
    maleCount: snap.maleCount,
    femaleCount: snap.femaleCount,
    synthesizedAncestorsCount: 0,
    lastClearTimestamp: snap.lastClearTimestamp,
    totalLogsAnalyzed: auditLogs.length,
    source: snap.persons.length > 0 ? 'cloud_logs' : 'none'
  };
}

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * Triggers a clean browser download of a JSON backup file directly from memory (never calls /api/backup).
 */
export function triggerJsonBackupDownload(backupData: Record<string, any>, filenamePrefix = 'family_tree_backup'): string {
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${datePart}.json`;
  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return filename;
}
