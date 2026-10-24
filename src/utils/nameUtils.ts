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
 * Splits a single name segment (without بن/بنت) into logical Arabic name units,
 * keeping compound prefixes (عبد، أبو، ابو، أم، ام، آل) attached to the following word.
 */
function splitIntoArabicNameUnits(segment: string): string[] {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  const units: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^(عبد|أبو|ابو|أم|ام|آل)$/i.test(w) && i + 1 < words.length) {
      units.push(`${w} ${words[i + 1]}`);
      i += 2;
    } else {
      units.push(w);
      i += 1;
    }
  }
  return units;
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
  if (/\s+(?:بن|بنت|ابن)\s+/i.test(trimmed)) {
    const parts = trimmed.split(/\s+(?:بن|بنت|ابن)\s+/i);
    return (parts[0] || trimmed).trim();
  }
  const units = splitIntoArabicNameUnits(trimmed);
  return units[0] || trimmed;
}

/**
 * Formats a full lineage name to display up to `maxNames` names.
 * - maxNames = 1 -> First name only (الاسم الأول فقط، مثل: "محمد" أو "عبد الله")
 * - maxNames = 4 -> Up to 4 names for general app display (مثل: "محمد بن زاهر بن سعيد بن راشد")
 * - maxNames = 5 -> Up to 5 names for dropdowns/selectors (مثل: "محمد بن زاهر بن سعيد بن راشد بن عبدالله")
 */
export function formatNameWithLimit(fullName: string, maxNames: number = 4): string {
  const trimmed = (fullName || '').trim().replace(/^(ابن|بن|بنت)\s+/i, '');
  if (!trimmed) return '';
  if (maxNames <= 1) {
    return extractGivenName(trimmed);
  }

  // If the name uses patronymic connectors (بن / بنت / ابن)
  const tokens = trimmed.split(/\s+(بن|بنت|ابن)\s+/i);
  if (tokens.length > 1) {
    // tokens structure: [name1, conn1, name2, conn2, name3, ...]
    const maxTokens = maxNames * 2 - 1;
    return tokens.slice(0, maxTokens).join(' ').trim();
  }

  // Fallback if no بن/بنت connectors exist: take up to maxNames logical name units
  const units = splitIntoArabicNameUnits(trimmed);
  return units.slice(0, maxNames).join(' ');
}

/**
 * Formats a person's name for general display across the application (4 names max).
 */
export function formatAppName(fullName?: string | null): string {
  if (!fullName) return '';
  return formatNameWithLimit(fullName, 4);
}

/**
 * Formats a person's quadruple name (الاسم الرباعي: الاسم + الأب + الجد + جد الأب).
 * Uses `person.fullName` and, if fewer than 4 names are present in `fullName`,
 * walks up `fatherId` to construct the complete 4-part name.
 */
export function formatQuadrupleName(
  person?: { id?: string; fullName?: string | null; gender?: Gender; fatherId?: string | null } | null,
  lookup?: ((id: string) => { id?: string; fullName?: string | null; gender?: Gender; fatherId?: string | null } | undefined) | Array<{ id: string; fullName: string; gender: Gender; fatherId?: string | null }>
): string {
  if (!person || !person.fullName) return '';
  const chainParts = splitLineageChain(person.fullName);
  if (chainParts.length >= 4 || !person.fatherId || !lookup) {
    return formatNameWithLimit(person.fullName, 4);
  }

  const getById = typeof lookup === 'function'
    ? lookup
    : (id: string) => lookup.find(p => p.id === id);

  const names: string[] = [extractGivenName(person.fullName)];
  let currentFatherId: string | null | undefined = person.fatherId;
  const visited = new Set<string>();
  if (person.id) visited.add(person.id);

  while (currentFatherId && names.length < 4) {
    if (visited.has(currentFatherId)) break;
    visited.add(currentFatherId);
    const father = getById(currentFatherId);
    if (!father || !father.fullName) break;

    const fatherParts = splitLineageChain(father.fullName);
    if (fatherParts.length > 1) {
      for (const part of fatherParts) {
        if (names.length < 4) {
          names.push(part);
        }
      }
      break;
    } else {
      names.push(extractGivenName(father.fullName));
      currentFatherId = father.fatherId;
    }
  }

  if (names.length <= 1) {
    return formatNameWithLimit(person.fullName, 4);
  }

  const firstConnector = person.gender === 'female' ? 'بنت' : 'بن';
  let result = `${names[0]} ${firstConnector} ${names[1]}`;
  for (let i = 2; i < names.length; i++) {
    result += ` بن ${names[i]}`;
  }
  return result;
}

/**
 * Formats a branch/child name (son or daughter) to show ONLY the first name (الاسم الأول فقط).
 */
export function formatBranchName(fullName?: string | null): string {
  if (!fullName) return '';
  return extractGivenName(fullName);
}

/**
 * Formats a person's name for dropdowns and selection lists (such as choosing a husband for a woman) — up to 5 names.
 */
export function formatDropdownName(fullName?: string | null): string {
  if (!fullName) return '';
  return formatNameWithLimit(fullName, 5);
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
    .replace(/ابو\s+/g, 'ابو')
    .replace(/ام\s+/g, 'ام')
    .trim();
}

const GENEALOGICAL_CONNECTORS = new Set(['بن', 'بنت', 'ابن', 'ابنه']);

/**
 * Splits normalized Arabic text into meaningful name words, ignoring standalone connectors (بن / بنت / ابن).
 */
export function tokenizeArabicNameWords(text: string): string[] {
  const norm = normalizeArabic(text);
  if (!norm) return [];
  const rawTokens = norm.split(/\s+/).filter(Boolean);
  const filtered = rawTokens.filter((w) => !GENEALOGICAL_CONNECTORS.has(w));
  return filtered.length > 0 ? filtered : rawTokens;
}

/**
 * Scores a single field's words against query tokens.
 * Returns -1 if not all query tokens can be matched to distinct words in the field.
 *
 * Ranking hierarchy (highest to lowest):
 * 1. Exact full name match (100,000+)
 * 2. Consecutive word-prefix match starting from the 1st name [0, 1, 2, ...] (90,000+)
 *    e.g. "محمد راش مح" -> "محمد بن راشد بن محمد"
 * 3. Ordered word-prefix match starting from the 1st name with skipped ancestors (75,000 - gap penalties)
 *    e.g. "محمد راش مح" -> "محمد بن راشد بن سالم بن محمد" (beats "محمد بن سالم بن راشد بن محمد")
 * 4. Consecutive word-prefix match starting from father/grandfather [startIdx > 0] (55,000 - startIdx penalty)
 *    e.g. "محمد راش مح" -> "أحمد بن محمد بن راشد بن محمد"
 * 5. Ordered word-prefix match starting from father/grandfather with skipped ancestors (40,000 - penalties)
 * 6. Ordered substring match across distinct words (25,000 - penalties)
 * 7. Unordered match across distinct words (10,000 - penalties)
 */
function scoreFieldAgainstQueryTokens(fieldText: string, queryTokens: string[], normFullQuery: string): number {
  const normField = normalizeArabic(fieldText);
  if (!normField) return -1;

  const targetWords = tokenizeArabicNameWords(fieldText);
  const M = queryTokens.length;
  const N = targetWords.length;

  if (M === 0) return 0;

  // If the field has fewer words than query tokens, check direct substring only as a last resort
  if (N < M) {
    if (normField.includes(normFullQuery)) {
      return 30000;
    }
    return -1;
  }

  // Exact full-word sequence match
  if (N === M && targetWords.every((w, i) => w === queryTokens[i])) {
    return 100000;
  }

  // Helper to compute closeness of a single query token to a target word
  const getPrefixCloseness = (qTok: string, tWord: string): number => {
    if (tWord === qTok) return 100;
    if (tWord.startsWith(qTok)) {
      return Math.round((qTok.length / tWord.length) * 80);
    }
    return -1;
  };

  const getSubstringCloseness = (qTok: string, tWord: string): number => {
    const p = getPrefixCloseness(qTok, tWord);
    if (p >= 0) return p;
    if (tWord.includes(qTok)) {
      return Math.round((qTok.length / tWord.length) * 35);
    }
    return -1;
  };

  // 1. Search for the best ORDERED WORD-PREFIX alignment: 0 <= i_0 < i_1 < ... < i_{M-1} < N
  let bestPrefixScore = -1;

  function findBestOrderedAlignment(
    useSubstring: boolean
  ): number {
    let bestScore = -1;

    // Try each possible starting word index i_0 for queryTokens[0]
    for (let startIdx = 0; startIdx <= N - M; startIdx++) {
      const firstQuality = useSubstring
        ? getSubstringCloseness(queryTokens[0], targetWords[startIdx])
        : getPrefixCloseness(queryTokens[0], targetWords[startIdx]);
      if (firstQuality < 0) continue;

      if (M === 1) {
        let score: number;
        const isPrefix = targetWords[startIdx].startsWith(queryTokens[0]);
        if (!useSubstring || isPrefix) {
          score =
            startIdx === 0
              ? 90000 + firstQuality + (N === 1 ? 20 : 0)
              : Math.max(30000, 55000 - startIdx * 3000 + firstQuality);
        } else {
          score =
            startIdx === 0
              ? 25000 + firstQuality
              : Math.max(12000, 18000 - startIdx * 1200 + firstQuality);
        }
        if (score > bestScore) bestScore = score;
        continue;
      }

      // Dynamic programming / memoized search for remaining tokens k = 1 .. M-1
      // We want to minimize gap penalties and maximize word closeness
      const memo = new Map<number, { penalty: number; quality: number; prefixHits: number } | null>();

      const solve = (
        k: number,
        prevIdx: number
      ): { penalty: number; quality: number; prefixHits: number } | null => {
        const key = k * 64 + prevIdx;
        if (memo.has(key)) return memo.get(key)!;

        let bestSub: { penalty: number; quality: number; prefixHits: number } | null = null;
        const maxIdx = N - (M - k);

        for (let idx = prevIdx + 1; idx <= maxIdx; idx++) {
          const q = useSubstring
            ? getSubstringCloseness(queryTokens[k], targetWords[idx])
            : getPrefixCloseness(queryTokens[k], targetWords[idx]);
          if (q < 0) continue;

          const stepGap = idx - prevIdx - 1;
          // Each skipped word costs 2500, plus 400 * (M - k) so earlier gaps are penalized more heavily
          const stepPenalty = stepGap * 2500 + stepGap * (M - k) * 400;
          const isPref = targetWords[idx].startsWith(queryTokens[k]) ? 1 : 0;

          if (k === M - 1) {
            const candidate = {
              penalty: stepPenalty,
              quality: q,
              prefixHits: isPref
            };
            if (
              !bestSub ||
              candidate.quality - candidate.penalty > bestSub.quality - bestSub.penalty
            ) {
              bestSub = candidate;
            }
          } else {
            const rest = solve(k + 1, idx);
            if (rest) {
              const candidate = {
                penalty: stepPenalty + rest.penalty,
                quality: q + rest.quality,
                prefixHits: isPref + rest.prefixHits
              };
              if (
                !bestSub ||
                candidate.quality - candidate.penalty > bestSub.quality - bestSub.penalty
              ) {
                bestSub = candidate;
              }
            }
          }
        }

        memo.set(key, bestSub);
        return bestSub;
      };

      const tail = solve(1, startIdx);
      if (!tail) continue;

      const totalQuality = firstQuality + tail.quality;
      const totalPenalty = tail.penalty;
      const isZeroGaps = totalPenalty === 0;
      const exactLengthBonus = N === M && startIdx === 0 ? 20 : 0;

      let alignmentScore: number;
      if (!useSubstring) {
        if (startIdx === 0 && isZeroGaps) {
          // Tier 2: Consecutive prefix match from 1st name (e.g. "محمد راش مح" -> "محمد بن راشد بن محمد")
          alignmentScore = 90000 + totalQuality + exactLengthBonus;
        } else if (startIdx === 0) {
          // Tier 3: Starts at 1st name, but skips 1+ ancestors in between
          alignmentScore = Math.max(56000, 75000 - totalPenalty + totalQuality);
        } else if (isZeroGaps) {
          // Tier 4: Consecutive prefix match starting at father/grandfather
          alignmentScore = Math.max(41000, 55000 - startIdx * 3000 + totalQuality);
        } else {
          // Tier 5: Starts at father/grandfather with skipped ancestors
          alignmentScore = Math.max(26000, 40000 - startIdx * 2500 - totalPenalty + totalQuality);
        }
      } else {
        const firstIsPref = targetWords[startIdx].startsWith(queryTokens[0]) ? 1 : 0;
        const totalPrefs = firstIsPref + tail.prefixHits;
        alignmentScore = Math.max(
          15000,
          (startIdx === 0 ? 24000 : 19000 - startIdx * 1000) -
            Math.round(totalPenalty * 0.4) +
            totalPrefs * 400 +
            totalQuality
        );
      }

      if (alignmentScore > bestScore) {
        bestScore = alignmentScore;
      }
    }

    return bestScore;
  }

  bestPrefixScore = findBestOrderedAlignment(false);
  if (bestPrefixScore >= 0) {
    return bestPrefixScore;
  }

  // 2. Try ordered substring alignment across distinct words
  const bestOrderedSubstringScore = findBestOrderedAlignment(true);
  if (bestOrderedSubstringScore >= 0) {
    return bestOrderedSubstringScore;
  }

  // 3. Try unordered match across distinct words (each query token must match a separate word)
  const usedWordIndices = new Set<number>();
  let totalUnorderedQuality = 0;
  let matchedWordZero = false;
  let prefixMatchesCount = 0;
  let indicesPenalty = 0;

  for (const qTok of queryTokens) {
    let chosenIdx = -1;
    let chosenQuality = -1;

    // Prefer prefix match on an unused word first
    for (let wIdx = 0; wIdx < N; wIdx++) {
      if (usedWordIndices.has(wIdx)) continue;
      const pq = getPrefixCloseness(qTok, targetWords[wIdx]);
      if (pq >= 0) {
        chosenIdx = wIdx;
        chosenQuality = pq;
        prefixMatchesCount++;
        break;
      }
    }

    // Fallback to substring match on an unused word
    if (chosenIdx === -1) {
      for (let wIdx = 0; wIdx < N; wIdx++) {
        if (usedWordIndices.has(wIdx)) continue;
        const sq = getSubstringCloseness(qTok, targetWords[wIdx]);
        if (sq >= 0) {
          chosenIdx = wIdx;
          chosenQuality = sq;
          break;
        }
      }
    }

    if (chosenIdx === -1) {
      return -1; // Could not match all query tokens to distinct words
    }

    usedWordIndices.add(chosenIdx);
    if (chosenIdx === 0) matchedWordZero = true;
    totalUnorderedQuality += chosenQuality;
    indicesPenalty += chosenIdx * 120;
  }

  return Math.max(
    5000,
    10000 +
      (matchedWordZero ? 1500 : 0) +
      prefixMatchesCount * 300 +
      totalUnorderedQuality -
      indicesPenalty
  );
}

/**
 * Scores a match for sorting search results (higher score = closer match).
 * Returns -1 if the candidate does not match the query.
 */
export function scoreArabicMatch(
  targetText: string,
  rawQuery: string,
  additionalTexts: string[] = []
): number {
  const normQuery = normalizeArabic(rawQuery);
  if (!normQuery) return 0;

  const queryTokens = tokenizeArabicNameWords(rawQuery);
  if (queryTokens.length === 0) return 0;

  // 1. Score primary targetText independently
  let bestScore = scoreFieldAgainstQueryTokens(targetText, queryTokens, normQuery);

  const primaryFirstWord = tokenizeArabicNameWords(targetText)[0] || '';

  // 2. Score each additional text independently (NEVER concatenating duplicate lineage strings together)
  const nonLineageExtras: string[] = [];
  for (const extra of additionalTexts) {
    if (!extra || !extra.trim()) continue;
    const extraWords = tokenizeArabicNameWords(extra);
    if (extraWords.length === 0) continue;

    // Check if this extra text is the full ascending lineage string of the same person
    const isSamePersonLineage =
      primaryFirstWord &&
      extraWords[0] === primaryFirstWord &&
      (extra.includes('بن') || extra.includes('بنت') || extraWords.length >= tokenizeArabicNameWords(targetText).length);

    const extraScore = scoreFieldAgainstQueryTokens(extra, queryTokens, normQuery);
    if (extraScore >= 0) {
      // Lineage string gets full primary weight; secondary metadata (notes, spouse) is capped below primary name matches
      const weightedScore = isSamePersonLineage
        ? extraScore
        : Math.min(35000, Math.round(extraScore * 0.45));
      if (weightedScore > bestScore) {
        bestScore = weightedScore;
      }
    }

    if (!isSamePersonLineage) {
      nonLineageExtras.push(extra);
    }
  }

  if (bestScore >= 0) {
    return bestScore;
  }

  // 3. Fallback: check if query tokens match across (primaryName + non-lineage metadata like notes/husbandName)
  if (nonLineageExtras.length > 0) {
    const combinedMetadata = `${targetText} ${nonLineageExtras.join(' ')}`;
    const crossScore = scoreFieldAgainstQueryTokens(combinedMetadata, queryTokens, normQuery);
    if (crossScore >= 0) {
      return Math.min(4500, Math.round(crossScore * 0.25));
    }
  }

  return -1;
}

/**
 * Advanced partial & non-consecutive Arabic search.
 * Example: query "محمد راش مح" matches "محمد بن راشد بن محمد".
 */
export function advancedArabicMatch(
  targetText: string,
  rawQuery: string,
  additionalTexts: string[] = []
): boolean {
  const normQuery = normalizeArabic(rawQuery);
  if (!normQuery) return true;
  return scoreArabicMatch(targetText, rawQuery, additionalTexts) >= 0;
}

/**
 * Comparator that sorts by closest search match first (descending score),
 * and then alphabetically in Arabic.
 */
export function compareBySearchRelevance<T extends { fullName: string }>(
  a: T,
  b: T,
  rawQuery: string,
  getAdditionalTexts?: (item: T) => string[]
): number {
  const q = rawQuery.trim();
  if (q) {
    const extraA = getAdditionalTexts ? getAdditionalTexts(a) : [];
    const extraB = getAdditionalTexts ? getAdditionalTexts(b) : [];
    const scoreA = scoreArabicMatch(a.fullName, q, extraA);
    const scoreB = scoreArabicMatch(b.fullName, q, extraB);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
  }
  return a.fullName.localeCompare(b.fullName, 'ar');
}

/**
 * Filters a list of items and sorts them by closest match to the search query first,
 * then next closest, and finally alphabetically in Arabic.
 */
export function filterAndSortBySearch<T extends { fullName: string }>(
  items: T[],
  rawQuery: string,
  getAdditionalTexts?: (item: T) => string[],
  emptyQueryComparator?: (a: T, b: T) => number
): T[] {
  const q = rawQuery.trim();
  if (!q) {
    return emptyQueryComparator ? [...items].sort(emptyQueryComparator) : [...items];
  }

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const extra = getAdditionalTexts ? getAdditionalTexts(item) : [];
    const score = scoreArabicMatch(item.fullName, q, extra);
    if (score >= 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((x, y) => {
    if (y.score !== x.score) {
      return y.score - x.score;
    }
    return x.item.fullName.localeCompare(y.item.fullName, 'ar');
  });

  return scored.map((s) => s.item);
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


