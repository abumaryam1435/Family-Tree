import { Gender } from '../types/family';

/**
 * Generates the patronymic suffix (e.g. "بن محمد بن سالم..." or "بنت محمد بن سالم...")
 */
export function getPatronymicSuffix(fatherFullName: string, gender: Gender): string {
  const cleanFather = fatherFullName.trim();
  if (!cleanFather) return '';
  const connector = gender === 'male' ? 'بن' : 'بنت';
  return `${connector} ${cleanFather}`;
}

/**
 * Generates the complete full name for a child from first name, gender, and father's full name.
 */
export function generateChildFullName(
  firstName: string,
  fatherFullName: string,
  gender: Gender
): string {
  const cleanFirst = firstName.trim();
  const cleanFather = fatherFullName.trim();
  if (!cleanFirst) return '';
  if (!cleanFather) return cleanFirst;

  // If the user already typed a patronymic particle in first name, don't duplicate
  if (/\s+(بن|بنت)\s+/i.test(cleanFirst)) {
    return cleanFirst;
  }

  const connector = gender === 'male' ? 'بن' : 'بنت';
  return `${cleanFirst} ${connector} ${cleanFather}`;
}

/**
 * Extracts the person's own given name (الاسم الشخصي الأول) before any patronymic connector (بن / بنت / ابن).
 * Example: "محمد بن زاهر بن سعيد" -> "محمد"
 * Example: "فاطمة بنت محمد بن زاهر" -> "فاطمة"
 * Example: "عبد الله بن راشد" -> "عبد الله"
 */
export function extractGivenName(fullName: string): string {
  const trimmed = (fullName || '').trim().replace(/^(ابن|بن|بنت)\s+/i, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+(?:بن|بنت|ابن)\s+/i);
  return (parts[0] || trimmed).trim();
}

/**
 * Splits a compound lineage string (e.g. "راشد بن عبدالله بن عامر") into sequential ancestor names
 * ordered from closest father to highest grandfather: ["راشد", "عبدالله", "عامر"].
 */
export function splitLineageChain(lineageText: string): string[] {
  const trimmed = (lineageText || '').trim().replace(/^(ابن|بن|بنت)\s+/i, '');
  if (!trimmed) return [];
  return trimmed
    .split(/\s+(?:بن|بنت|ابن)\s+/i)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * Rebuilds a child's full name using their given name, gender, and their father's updated full lineage name.
 * Example: ("محمد بن زاهر", "male", "زاهر بن سعيد بن راشد") -> "محمد بن زاهر بن سعيد بن راشد"
 */
export function rebuildChildFullName(
  currentChildFullName: string,
  childGender: Gender,
  newFatherFullName: string
): string {
  const givenName = extractGivenName(currentChildFullName);
  const cleanFather = (newFatherFullName || '').trim().replace(/^(ابن|بن|بنت)\s+/i, '');
  if (!givenName) return (currentChildFullName || '').trim();
  if (!cleanFather) return givenName;
  const connector = childGender === 'male' ? 'بن' : 'بنت';
  return `${givenName} ${connector} ${cleanFather}`;
}

/**
 * Normalizes Arabic text for flexible searching (unifies Alef, Teh Marbuta, Yeh, removes Tashkeel/Tatweel).
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove tashkeel & tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/عبد\s+ال/g, 'عبدال')
    .trim();
}

/**
 * Advanced partial & non-consecutive Arabic search.
 * Example: query "مح زا سع" matches "محمد بن زاهر بن سعيد".
 */
export function advancedArabicMatch(targetText: string, rawQuery: string, additionalTexts: string[] = []): boolean {
  const normQuery = normalizeArabic(rawQuery);
  if (!normQuery) return true;

  const combinedTarget = normalizeArabic([targetText, ...additionalTexts].filter(Boolean).join(' '));
  if (!combinedTarget) return false;

  // Direct substring match
  if (combinedTarget.includes(normQuery)) return true;

  // Split query into tokens (e.g. ["مح", "زا", "سع"])
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  // 1. Check if all query tokens appear in order (even non-consecutively across words)
  let searchPos = 0;
  let allInOrder = true;
  for (const token of queryTokens) {
    const foundIdx = combinedTarget.indexOf(token, searchPos);
    if (foundIdx === -1) {
      allInOrder = false;
      break;
    }
    searchPos = foundIdx + token.length;
  }
  if (allInOrder) return true;

  // 2. Also allow matching when every token is present anywhere in the target text
  return queryTokens.every(token => combinedTarget.includes(token));
}

/**
 * Scores a match for sorting search results (higher score = better match).
 */
export function scoreArabicMatch(targetText: string, rawQuery: string, additionalTexts: string[] = []): number {
  const normQuery = normalizeArabic(rawQuery);
  if (!normQuery) return 0;

  const normPrimary = normalizeArabic(targetText);
  const normCombined = normalizeArabic([targetText, ...additionalTexts].filter(Boolean).join(' '));

  if (!advancedArabicMatch(targetText, rawQuery, additionalTexts)) return -1;

  // Exact match or startsWith
  if (normPrimary === normQuery) return 1000;
  if (normPrimary.startsWith(normQuery)) return 900;
  if (normPrimary.includes(normQuery)) return 800;

  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  // Remove connector words from target words for word-by-word prefix check
  const targetWords = normCombined.split(/\s+/).filter(w => w && w !== 'بن' && w !== 'بنت');

  // Check if tokens match prefixes of targetWords in sequence (e.g., "مح زا سع" -> "محمد", "زاهر", "سعيد")
  let wordIdx = 0;
  let matchedWordPrefixesInOrder = 0;
  for (const token of queryTokens) {
    while (wordIdx < targetWords.length) {
      if (targetWords[wordIdx].startsWith(token)) {
        matchedWordPrefixesInOrder++;
        wordIdx++;
        break;
      }
      wordIdx++;
    }
  }
  if (matchedWordPrefixesInOrder === queryTokens.length) {
    return 700;
  }

  // Check if tokens appear in order in primary name
  let pos = 0;
  let inOrderPrimary = true;
  for (const token of queryTokens) {
    const idx = normPrimary.indexOf(token, pos);
    if (idx === -1) {
      inOrderPrimary = false;
      break;
    }
    pos = idx + token.length;
  }
  if (inOrderPrimary) return 600;

  return 400;
}

/**
 * Universal comparator: Males first, then Females, and alphabetically (Arabic locale) within each gender.
 */
export function comparePersonsMalesFirstAlphabetical<T extends { fullName: string; gender: Gender }>(
  a: T,
  b: T
): number {
  if (a.gender !== b.gender) {
    return a.gender === 'male' ? -1 : 1;
  }
  return a.fullName.localeCompare(b.fullName, 'ar');
}

/**
 * Returns a new array sorted with Males first, then Females, in Arabic alphabetical order.
 */
export function sortPersonsMalesFirstAlphabetical<T extends { fullName: string; gender: Gender }>(
  list: T[]
): T[] {
  return [...list].sort(comparePersonsMalesFirstAlphabetical);
}

