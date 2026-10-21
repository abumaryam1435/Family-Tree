import { Person } from '../types/family';
import {
  comparePersonsMalesFirstAlphabetical,
  sortPersonsMalesFirstAlphabetical,
  formatAppName,
  extractGivenName
} from './nameUtils';

export interface KinshipInfo {
  // Direct relationships
  father: Person | null;
  mother: Person | null;
  spouse: { person: Person | null; name: string } | null;
  wives: Person[]; // if male, all females whose husbandId is this person
  siblings: Person[]; // brothers & sisters (same father)
  brothers: Person[];
  sisters: Person[];
  children: Person[];
  sons: Person[];
  daughters: Person[];

  // Uncles & Aunts of this person
  paternalUncles: Person[]; // أعمام (brothers of father)
  paternalAunts: Person[]; // عمات (sisters of father)
  maternalUncles: Person[]; // أخوال (brothers of mother)
  maternalAunts: Person[]; // خالات (sisters of mother)

  // What this person is to others
  isMaternalUncleTo: Person[]; // خال لـ (أبناء وبنات الأخوات اللاتي هن أمهات لهؤلاء الأبناء وغير مستثنين)
  isPaternalUncleTo: Person[]; // عم لـ (children of brothers)
  isMaternalAuntTo: Person[]; // خالة لـ (أبناء وبنات الأخوات اللاتي هن أمهات لهؤلاء الأبناء وغير مستثنين)
  isPaternalAuntTo: Person[]; // عمة لـ (if female, children of brothers)

  // Excluded husband children (for females married to a family member who excluded some children from being her children)
  excludedHusbandChildren: { child: Person; otherMother: Person | null }[];

  // Nieces & Nephews
  nephewsAndNieces: Person[]; // أبناء وبنات الإخوة والأخوات

  // Paternal Cousins
  paternalCousins: Person[]; // أبناء وبنات العم
}

/**
 * Helper: checks whether a husband's child has this wife as their mother
 * (by default true for all children of her husband unless excluded in wife.excludedChildIds or assigned to another mother).
 */
export function isChildIncludedForWife(wife: Person, child: Person): boolean {
  if (Array.isArray(wife.excludedChildIds) && wife.excludedChildIds.includes(child.id)) {
    return false;
  }
  if (child.motherId && child.motherId !== wife.id) {
    return false;
  }
  return true;
}

/**
 * Resolves the mother (from the family) for a given child, taking exclusions and explicit motherId into account.
 */
export function resolveMotherOfChild(
  child: Person,
  map: Map<string, Person>,
  wivesOfHusband: Map<string, Person[]>
): Person | null {
  if (child.motherId) {
    const explicitMother = map.get(child.motherId) || null;
    if (explicitMother && isChildIncludedForWife(explicitMother, child)) {
      return explicitMother;
    }
  }
  if (child.fatherId) {
    const fatherWives = wivesOfHusband.get(child.fatherId) || [];
    const matchingWife = fatherWives.find(w => isChildIncludedForWife(w, child));
    if (matchingWife) {
      return matchingWife;
    }
  }
  return null;
}

/**
 * Calculates extended genealogical kinship relationships for any person in the family tree.
 * All lists are sorted: Males first, then Females, in Arabic alphabetical order.
 */
export function calculateKinship(personId: string, persons: Person[]): KinshipInfo {
  const map = new Map<string, Person>();
  for (const p of persons) {
    map.set(p.id, p);
  }

  const target = map.get(personId);

  // Group children by fatherId (sorted Males first then Females alphabetically)
  const childrenOfFather = new Map<string, Person[]>();
  for (const p of persons) {
    if (p.fatherId) {
      const list = childrenOfFather.get(p.fatherId) || [];
      list.push(p);
      childrenOfFather.set(p.fatherId, list);
    }
  }
  for (const [fid, list] of childrenOfFather.entries()) {
    childrenOfFather.set(fid, sortPersonsMalesFirstAlphabetical(list));
  }

  // Group females by husbandId (sorted alphabetically)
  const wivesOfHusband = new Map<string, Person[]>();
  for (const p of persons) {
    if (p.gender === 'female' && p.husbandId) {
      const list = wivesOfHusband.get(p.husbandId) || [];
      list.push(p);
      wivesOfHusband.set(p.husbandId, list);
    }
  }
  for (const [hid, list] of wivesOfHusband.entries()) {
    wivesOfHusband.set(hid, sortPersonsMalesFirstAlphabetical(list));
  }

  if (!target) {
    return {
      father: null,
      mother: null,
      spouse: null,
      wives: [],
      siblings: [],
      brothers: [],
      sisters: [],
      children: [],
      sons: [],
      daughters: [],
      paternalUncles: [],
      paternalAunts: [],
      maternalUncles: [],
      maternalAunts: [],
      isMaternalUncleTo: [],
      isPaternalUncleTo: [],
      isMaternalAuntTo: [],
      isPaternalAuntTo: [],
      excludedHusbandChildren: [],
      nephewsAndNieces: [],
      paternalCousins: []
    };
  }

  // 1. Father
  const father = target.fatherId ? map.get(target.fatherId) || null : null;

  // 2. Mother: resolved only if target is not excluded from her
  const mother = resolveMotherOfChild(target, map, wivesOfHusband);

  // 3. Spouse / Wives
  let spouse: { person: Person | null; name: string } | null = null;
  const wives: Person[] = [];

  if (target.gender === 'female') {
    if (target.husbandId) {
      const hPerson = map.get(target.husbandId) || null;
      spouse = {
        person: hPerson,
        name: hPerson ? formatAppName(hPerson.fullName) : formatAppName(target.husbandName || 'غير محدد')
      };
    } else if (target.husbandName) {
      spouse = {
        person: null,
        name: formatAppName(target.husbandName)
      };
    }
  } else {
    // male: all women whose husband is this person (already sorted alphabetically)
    const wList = wivesOfHusband.get(target.id) || [];
    wives.push(...wList);
    if (wives.length > 0) {
      spouse = {
        person: wives[0],
        name: wives.map(w => formatAppName(w.fullName)).join('، ')
      };
    }
  }

  // 4. Siblings (brothers & sisters sharing same father, sorted Males first then Females alphabetically)
  const allSiblings = sortPersonsMalesFirstAlphabetical(
    father
      ? (childrenOfFather.get(father.id) || []).filter(p => p.id !== target.id)
      : []
  );
  const brothers = allSiblings.filter(p => p.gender === 'male');
  const sisters = allSiblings.filter(p => p.gender === 'female');

  // 5. Children of target
  // If male: all children whose fatherId === target.id
  // If female: all children of her husband for whom she is their mother (not excluded)
  const myChildren = sortPersonsMalesFirstAlphabetical(
    target.gender === 'male'
      ? (childrenOfFather.get(target.id) || [])
      : (target.husbandId
          ? (childrenOfFather.get(target.husbandId) || []).filter(c => {
              const m = resolveMotherOfChild(c, map, wivesOfHusband);
              return m?.id === target.id;
            })
          : [])
  );
  const sons = myChildren.filter(c => c.gender === 'male');
  const daughters = myChildren.filter(c => c.gender === 'female');

  // Excluded husband children (for females married to a family member who excluded some of the husband's children from being her children)
  const excludedHusbandChildren: { child: Person; otherMother: Person | null }[] = [];
  if (target.gender === 'female' && target.husbandId) {
    const allHusbandKids = childrenOfFather.get(target.husbandId) || [];
    for (const c of allHusbandKids) {
      const resolvedMother = resolveMotherOfChild(c, map, wivesOfHusband);
      if (!resolvedMother || resolvedMother.id !== target.id) {
        excludedHusbandChildren.push({
          child: c,
          otherMother: resolvedMother && resolvedMother.id !== target.id ? resolvedMother : null
        });
      }
    }
    excludedHusbandChildren.sort((a, b) => comparePersonsMalesFirstAlphabetical(a.child, b.child));
  }

  // 6. Paternal Uncles & Aunts (Father's brothers and sisters)
  let paternalUncles: Person[] = [];
  let paternalAunts: Person[] = [];
  if (father && father.fatherId) {
    const fatherSiblings = sortPersonsMalesFirstAlphabetical(
      (childrenOfFather.get(father.fatherId) || []).filter(p => p.id !== father.id)
    );
    paternalUncles = fatherSiblings.filter(p => p.gender === 'male');
    paternalAunts = fatherSiblings.filter(p => p.gender === 'female');
  }

  // 7. Maternal Uncles & Aunts (Mother's brothers and sisters — ONLY if mother is resolved and child was not excluded!)
  let maternalUncles: Person[] = [];
  let maternalAunts: Person[] = [];
  if (mother && mother.fatherId) {
    const motherSiblings = sortPersonsMalesFirstAlphabetical(
      (childrenOfFather.get(mother.fatherId) || []).filter(p => p.id !== mother.id)
    );
    maternalUncles = motherSiblings.filter(p => p.gender === 'male');
    maternalAunts = motherSiblings.filter(p => p.gender === 'female');
  }

  // 8. "خال لـ / خالة لـ" (Children of target's sisters for whom that sister is actually their mother, excluding excluded children!)
  const rawMaternalUncleTo: Person[] = [];
  const rawMaternalAuntTo: Person[] = [];

  for (const sis of sisters) {
    if (sis.husbandId) {
      const sisChildren = (childrenOfFather.get(sis.husbandId) || []).filter(c => {
        const m = resolveMotherOfChild(c, map, wivesOfHusband);
        return m?.id === sis.id;
      });
      for (const child of sisChildren) {
        if (target.gender === 'male') {
          if (!rawMaternalUncleTo.some(c => c.id === child.id)) rawMaternalUncleTo.push(child);
        } else {
          if (!rawMaternalAuntTo.some(c => c.id === child.id)) rawMaternalAuntTo.push(child);
        }
      }
    }
  }
  const isMaternalUncleTo = sortPersonsMalesFirstAlphabetical(rawMaternalUncleTo);
  const isMaternalAuntTo = sortPersonsMalesFirstAlphabetical(rawMaternalAuntTo);

  // 9. "عم لـ / عمة لـ"
  // For each brother of target: all his children!
  const rawPaternalUncleTo: Person[] = [];
  const rawPaternalAuntTo: Person[] = [];

  for (const bro of brothers) {
    const broChildren = childrenOfFather.get(bro.id) || [];
    for (const child of broChildren) {
      if (target.gender === 'male') {
        if (!rawPaternalUncleTo.some(c => c.id === child.id)) rawPaternalUncleTo.push(child);
      } else {
        if (!rawPaternalAuntTo.some(c => c.id === child.id)) rawPaternalAuntTo.push(child);
      }
    }
  }
  const isPaternalUncleTo = sortPersonsMalesFirstAlphabetical(rawPaternalUncleTo);
  const isPaternalAuntTo = sortPersonsMalesFirstAlphabetical(rawPaternalAuntTo);

  // 10. Nephews & Nieces (أبناء وبنات الأخ والأخت)
  const nephewsAndNieces: Person[] = sortPersonsMalesFirstAlphabetical([
    ...isPaternalUncleTo,
    ...isPaternalAuntTo,
    ...isMaternalUncleTo,
    ...isMaternalAuntTo
  ]);

  // 11. Paternal Cousins (أبناء العم)
  const rawPaternalCousins: Person[] = [];
  for (const uncle of paternalUncles) {
    const cousins = childrenOfFather.get(uncle.id) || [];
    rawPaternalCousins.push(...cousins);
  }
  const paternalCousins = sortPersonsMalesFirstAlphabetical(rawPaternalCousins);

  return {
    father,
    mother,
    spouse,
    wives,
    siblings: allSiblings,
    brothers,
    sisters,
    children: myChildren,
    sons,
    daughters,
    paternalUncles,
    paternalAunts,
    maternalUncles,
    maternalAunts,
    isMaternalUncleTo,
    isPaternalUncleTo,
    isMaternalAuntTo,
    isPaternalAuntTo,
    excludedHusbandChildren,
    nephewsAndNieces,
    paternalCousins
  };
}

export interface CoupleRelationship {
  relationToHusband: string; // صلة الزوج بالنسبة لها (مثلاً: ابن عمها)
  relationToWife: string; // صلة الزوجة بالنسبة له (مثلاً: ابنة عمه)
  commonAncestor: Person | null; // الجد المشترك
  description: string; // وصف كامل يوضح التقاء النسب
}

/**
 * Calculates the precise genealogical relationship between a female and her husband
 * chosen from the family members.
 */
export function getCoupleRelationship(
  femaleId: string | null | undefined,
  femaleFatherId: string | null | undefined,
  husbandId: string | null | undefined,
  persons: Person[]
): CoupleRelationship {
  if (!husbandId) {
    return {
      relationToHusband: 'غير محدد',
      relationToWife: 'غير محدد',
      commonAncestor: null,
      description: 'لم يتم تحديد زوج من أفراد العائلة'
    };
  }

  const map = new Map<string, Person>();
  for (const p of persons) {
    map.set(p.id, p);
  }

  const husband = map.get(husbandId);
  if (!husband) {
    return {
      relationToHusband: 'زوج مسجل',
      relationToWife: 'زوجة',
      commonAncestor: null,
      description: 'الزوج غير موجود في السجلات'
    };
  }

  // Determine female's father
  let femaleFather: Person | null = null;
  if (femaleFatherId) {
    femaleFather = map.get(femaleFatherId) || null;
  } else if (femaleId) {
    const f = map.get(femaleId);
    if (f?.fatherId) {
      femaleFather = map.get(f.fatherId) || null;
    }
  }

  // If female has no recorded father in tree
  if (!femaleFather) {
    return {
      relationToHusband: 'أحد رجال العائلة',
      relationToWife: 'زوجته من العائلة',
      commonAncestor: null,
      description: `زوجها هو ${formatAppName(husband.fullName)} (أحد رجال العائلة)`
    };
  }

  // Husband's father
  const husbandFather = husband.fatherId ? map.get(husband.fatherId) || null : null;

  // Build ancestors path for female (starting at father)
  const femaleAncestors: { person: Person; distance: number }[] = [];
  let curr: Person | null = femaleFather;
  let d = 1;
  const visitedF = new Set<string>();
  while (curr && !visitedF.has(curr.id)) {
    visitedF.add(curr.id);
    femaleAncestors.push({ person: curr, distance: d });
    d++;
    curr = curr.fatherId ? map.get(curr.fatherId) || null : null;
  }

  // Build ancestors path for husband (husband is distance 0, husband's father is distance 1)
  const husbandAncestors: { person: Person; distance: number }[] = [
    { person: husband, distance: 0 }
  ];
  let currH: Person | null = husbandFather;
  let dH = 1;
  const visitedH = new Set<string>();
  while (currH && !visitedH.has(currH.id)) {
    visitedH.add(currH.id);
    husbandAncestors.push({ person: currH, distance: dH });
    dH++;
    currH = currH.fatherId ? map.get(currH.fatherId) || null : null;
  }

  // Find Lowest Common Ancestor
  let commonAncestor: Person | null = null;
  let distFemale = 0;
  let distHusband = 0;

  for (const fa of femaleAncestors) {
    const match = husbandAncestors.find(ha => ha.person.id === fa.person.id);
    if (match) {
      commonAncestor = match.person;
      distFemale = fa.distance;
      distHusband = match.distance;
      break;
    }
  }

  if (!commonAncestor) {
    return {
      relationToHusband: 'من رجال العائلة',
      relationToWife: 'من نساء العائلة',
      commonAncestor: null,
      description: `زوجها هو ${formatAppName(husband.fullName)} (ينتسب لفرع آخر أو شجرة مستقلة في العائلة)`
    };
  }

  const lcaShort = formatAppName(commonAncestor.fullName);

  // 1. Same father (distFemale = 1, distHusband = 1) -> Siblings
  if (distFemale === 1 && distHusband === 1) {
    return {
      relationToHusband: 'أخوها (نفس الأب)',
      relationToWife: 'أخته',
      commonAncestor,
      description: `يشتركان في الأب (${lcaShort})`
    };
  }

  // 2. Husband is father's brother (distFemale = 2, distHusband = 0)
  if (distFemale === 2 && distHusband === 0) {
    return {
      relationToHusband: 'عمها الشقيق (أخو أبيها)',
      relationToWife: 'ابنة أخيه',
      commonAncestor,
      description: `عمها المباشر (أخو أبيها ${formatAppName(femaleFather.fullName)})`
    };
  }

  // 3. Husband is father's paternal uncle (distFemale > 2, distHusband === 0)
  if (distFemale > 2 && distHusband === 0) {
    return {
      relationToHusband: 'عم أبيها',
      relationToWife: 'ابنة ابن أخيه',
      commonAncestor,
      description: `عم أبيها (يلتقيان في الجد ${lcaShort})`
    };
  }

  // 4. Husband is brother's son (distFemale = 1, distHusband = 2)
  if (distFemale === 1 && distHusband === 2) {
    return {
      relationToHusband: 'ابن أخيها',
      relationToWife: 'عمته',
      commonAncestor,
      description: `ابن أخيها (والده أخوها، وجده والدها ${lcaShort})`
    };
  }

  // 5. Classic First Cousins (ابن عمها المباشر)
  if (distFemale === 2 && distHusband === 2) {
    return {
      relationToHusband: 'ابن عمها المباشر',
      relationToWife: 'ابنة عمه المباشرة',
      commonAncestor,
      description: `ابن عمها لجدّهما (${lcaShort}) - والداهما أخوان`
    };
  }

  // 6. Husband's father is her father's paternal uncle (distFemale = 3, distHusband = 2)
  if (distFemale === 3 && distHusband === 2) {
    return {
      relationToHusband: 'ابن عم أبيها',
      relationToWife: 'ابنة ابن عمه',
      commonAncestor,
      description: `ابن عم أبيها (يلتقيان في الجد ${lcaShort})`
    };
  }

  // 7. Her father is husband's father's paternal uncle (distFemale = 2, distHusband = 3)
  if (distFemale === 2 && distHusband === 3) {
    return {
      relationToHusband: 'ابن ابن عمها',
      relationToWife: 'ابنة عم أبيه',
      commonAncestor,
      description: `ابن ابن عمها (يلتقيان في الجد ${lcaShort})`
    };
  }

  // 8. Second Cousins or same generation
  if (distFemale === distHusband) {
    const degree = distFemale === 3 ? 'من الدرجة الثانية' : `(الجيل ${distFemale})`;
    return {
      relationToHusband: `ابن عمها ${degree}`,
      relationToWife: `ابنة عمه ${degree}`,
      commonAncestor,
      description: `أبناء عم يلتقيان في الجد المشترك (${lcaShort})`
    };
  }

  // 9. General genealogical branch relation
  return {
    relationToHusband: `قريب (من فروع الجد ${extractGivenName(commonAncestor.fullName)})`,
    relationToWife: `قريبة (من فروع الجد ${extractGivenName(commonAncestor.fullName)})`,
    commonAncestor,
    description: `يلتقيان في الجد المشترك (${lcaShort})`
  };
}

export interface RelationshipBetweenPersonsResult {
  found: boolean;
  isSamePerson: boolean;
  headline: string; // العنوان الرئيسي للعلاقة
  relationBtoA: string; // صلة الشخص الثاني بالنسبة للأول
  relationAtoB: string; // صلة الشخص الأول بالنسبة للثاني
  summaryDescription: string; // شرح وافٍ لصلة القرابة
  commonAncestor: Person | null; // الجد المشترك الأقرب (إن وجد)
  distA: number | null; // عدد الأجيال من الأول للجد المشترك
  distB: number | null; // عدد الأجيال من الثاني للجد المشترك
  pathA: Person[]; // سلسلة آباء الأول حتى الجد المشترك
  pathB: Person[]; // سلسلة آباء الثاني حتى الجد المشترك
  additionalTies: string[]; // صلات إضافية (مثل مصاهرة، خؤولة، أمومة...)
  networkPath: { person: Person; stepLabel: string }[]; // مسار القرابة خطوة بخطوة
}

/**
 * Finds all genealogical (paternal, maternal, and marital) relationships between any two persons in the family.
 * Respects excluded children rules for wives and maternal uncles/aunts.
 */
export function findRelationshipBetweenPersons(
  personAId: string,
  personBId: string,
  persons: Person[]
): RelationshipBetweenPersonsResult {
  const map = new Map<string, Person>();
  for (const p of persons) {
    map.set(p.id, p);
  }

  const personA = map.get(personAId);
  const personB = map.get(personBId);

  if (!personA || !personB) {
    return {
      found: false,
      isSamePerson: false,
      headline: 'يرجى اختيار الشخصين',
      relationBtoA: '—',
      relationAtoB: '—',
      summaryDescription: 'اختر الشخص الأول والشخص الثاني لمعرفة صلة القرابة بينهما.',
      commonAncestor: null,
      distA: null,
      distB: null,
      pathA: [],
      pathB: [],
      additionalTies: [],
      networkPath: []
    };
  }

  if (personA.id === personB.id) {
    return {
      found: true,
      isSamePerson: true,
      headline: 'نفس الشخص',
      relationBtoA: 'نفس الشخص المختار',
      relationAtoB: 'نفس الشخص المختار',
      summaryDescription: `تم اختيار (${formatAppName(personA.fullName)}) في كلا الطرفين.`,
      commonAncestor: personA,
      distA: 0,
      distB: 0,
      pathA: [personA],
      pathB: [personB],
      additionalTies: [],
      networkPath: [{ person: personA, stepLabel: 'نقطة البداية' }]
    };
  }

  // Group females by husbandId for accurate mother resolution
  const wivesOfHusband = new Map<string, Person[]>();
  for (const p of persons) {
    if (p.gender === 'female' && p.husbandId) {
      const list = wivesOfHusband.get(p.husbandId) || [];
      list.push(p);
      wivesOfHusband.set(p.husbandId, list);
    }
  }
  for (const [hid, list] of wivesOfHusband.entries()) {
    wivesOfHusband.set(hid, sortPersonsMalesFirstAlphabetical(list));
  }

  const motherA = resolveMotherOfChild(personA, map, wivesOfHusband);
  const motherB = resolveMotherOfChild(personB, map, wivesOfHusband);

  const firstNameA = extractGivenName(personA.fullName);
  const firstNameB = extractGivenName(personB.fullName);

  const additionalTies: string[] = [];
  let directMaternalOrSpousalHeadline: string | null = null;
  let directMaternalBtoA: string | null = null;
  let directMaternalAtoB: string | null = null;
  let directMaternalDesc: string | null = null;

  // ---------------------------------------------------------------------------
  // 1. Check Direct Spousal / Motherhood / Maternal Uncle & Aunt Ties
  // ---------------------------------------------------------------------------
  // A & B are Husband and Wife
  if (
    (personA.gender === 'female' && personA.husbandId === personB.id) ||
    (personB.gender === 'female' && personB.husbandId === personA.id)
  ) {
    const relB = personB.gender === 'male' ? 'زوجها' : 'زوجته';
    const relA = personA.gender === 'male' ? 'زوجها' : 'زوجته';
    directMaternalOrSpousalHeadline = 'علاقة زوجية (زوج وزوجة)';
    directMaternalBtoA = relB;
    directMaternalAtoB = relA;
    directMaternalDesc = `تجمع بين (${firstNameA}) و(${firstNameB}) علاقة زواج ومصاهرة.`;
    additionalTies.push(`علاقة زواج: ${firstNameA} و ${firstNameB} زوجان مسجلان في الشجرة.`);
  }

  // A is Mother of B (or Father's wife if B is excluded)
  if (personA.gender === 'female' && personB.fatherId && personA.husbandId === personB.fatherId) {
    if (motherB?.id === personA.id) {
      const relB = personB.gender === 'male' ? 'ابنها' : 'ابنتها';
      directMaternalOrSpousalHeadline = `أم و${personB.gender === 'male' ? 'ابنها' : 'ابنتها'}`;
      directMaternalBtoA = relB;
      directMaternalAtoB = 'أمه / والدته';
      directMaternalDesc = `${formatAppName(personA.fullName)} هي الأم (الوالدة) لـ ${formatAppName(personB.fullName)}.`;
      additionalTies.push(`علاقة أمومة مباشرة: ${firstNameA} هي والدة ${firstNameB}.`);
    } else {
      additionalTies.push(
        `مصاهرة: ${firstNameA} هي زوجة والد ${firstNameB} (وليست والدته؛ تم استثناؤه كابن من أم أخرى).`
      );
    }
  }

  // B is Mother of A (or Father's wife if A is excluded)
  if (personB.gender === 'female' && personA.fatherId && personB.husbandId === personA.fatherId) {
    if (motherA?.id === personB.id) {
      const relA = personA.gender === 'male' ? 'ابنها' : 'ابنتها';
      directMaternalOrSpousalHeadline = `أم و${personA.gender === 'male' ? 'ابنها' : 'ابنتها'}`;
      directMaternalBtoA = personA.gender === 'male' ? 'أمه (والدته)' : 'أمها (والدتها)';
      directMaternalAtoB = relA;
      directMaternalDesc = `${formatAppName(personB.fullName)} هي الأم (الوالدة) لـ ${formatAppName(personA.fullName)}.`;
      additionalTies.push(`علاقة أمومة مباشرة: ${firstNameB} هي والدة ${firstNameA}.`);
    } else {
      additionalTies.push(
        `مصاهرة: ${firstNameB} هي زوجة والد ${firstNameA} (وليست والدته؛ تم استثناؤه كابن من أم أخرى).`
      );
    }
  }

  // Maternal Siblings (same mother)
  if (motherA && motherB && motherA.id === motherB.id && personA.fatherId !== personB.fatherId) {
    additionalTies.push(`أخوّة من جهة الأم: يشتركان في الأم (${formatAppName(motherA.fullName)}).`);
  }

  // B is Maternal Uncle/Aunt (خال / خالة) of A -> B is sibling of motherA
  if (motherA && motherA.fatherId && personB.fatherId === motherA.fatherId && personB.id !== motherA.id) {
    const bRole = personB.gender === 'male' ? 'خاله (أخو أمه)' : 'خالته (أخت أمه)';
    const aRole = personA.gender === 'male' ? 'ابن أخته/أختها' : 'ابنة أخته/أختها';
    additionalTies.push(
      `علاقة خؤولة: ${firstNameB} هو ${personB.gender === 'male' ? 'خال' : 'خالة'} ${firstNameA} (شقيق والدته ${formatAppName(motherA.fullName)}).`
    );
    if (!directMaternalOrSpousalHeadline) {
      directMaternalOrSpousalHeadline =
        personB.gender === 'male' ? 'خال وابن/ابنة أخته' : 'خالة وابن/ابنة أختها';
      directMaternalBtoA = bRole;
      directMaternalAtoB = aRole;
      directMaternalDesc = `${firstNameB} ${personB.gender === 'male' ? 'خال' : 'خالة'} لـ ${firstNameA} عن طريق والدته (${formatAppName(motherA.fullName)}).`;
    }
  }

  // A is Maternal Uncle/Aunt (خال / خالة) of B -> A is sibling of motherB
  if (motherB && motherB.fatherId && personA.fatherId === motherB.fatherId && personA.id !== motherB.id) {
    const aRole = personA.gender === 'male' ? 'خاله (أخو أمه)' : 'خالته (أخت أمه)';
    const bRole = personB.gender === 'male' ? 'ابن أخته/أختها' : 'ابنة أخته/أختها';
    additionalTies.push(
      `علاقة خؤولة: ${firstNameA} هو ${personA.gender === 'male' ? 'خال' : 'خالة'} ${firstNameB} (شقيق والدته ${formatAppName(motherB.fullName)}).`
    );
    if (!directMaternalOrSpousalHeadline) {
      directMaternalOrSpousalHeadline =
        personA.gender === 'male' ? 'خال وابن/ابنة أخته' : 'خالة وابن/ابنة أختها';
      directMaternalBtoA = bRole;
      directMaternalAtoB = aRole;
      directMaternalDesc = `${firstNameA} ${personA.gender === 'male' ? 'خال' : 'خالة'} لـ ${firstNameB} عن طريق والدته (${formatAppName(motherB.fullName)}).`;
    }
  }

  // Maternal Grandfather (جد لأم): B is father of motherA
  if (motherA && motherA.fatherId === personB.id) {
    additionalTies.push(`جدومة لأم: ${firstNameB} هو جد ${firstNameA} من جهة الأم (والد أمه ${formatAppName(motherA.fullName)}).`);
    if (!directMaternalOrSpousalHeadline) {
      directMaternalOrSpousalHeadline = 'جد لأم (والد الأم) وحفيده';
      directMaternalBtoA = 'جده لأمه (والد الأم)';
      directMaternalAtoB = personA.gender === 'male' ? 'حفيده (ابن ابنته)' : 'حفيدته (ابنة ابنته)';
      directMaternalDesc = `${formatAppName(personB.fullName)} هو والد أم ${firstNameA} (${formatAppName(motherA.fullName)}).`;
    }
  }
  if (motherB && motherB.fatherId === personA.id) {
    additionalTies.push(`جدومة لأم: ${firstNameA} هو جد ${firstNameB} من جهة الأم (والد أمه ${formatAppName(motherB.fullName)}).`);
    if (!directMaternalOrSpousalHeadline) {
      directMaternalOrSpousalHeadline = 'جد لأم (والد الأم) وحفيده';
      directMaternalBtoA = personB.gender === 'male' ? 'حفيده (ابن ابنته)' : 'حفيدته (ابنة ابنته)';
      directMaternalAtoB = 'جده لأمه (والد الأم)';
      directMaternalDesc = `${formatAppName(personA.fullName)} هو والد أم ${firstNameB} (${formatAppName(motherB.fullName)}).`;
    }
  }

  // Maternal Cousins: A's mother and B's father are siblings (ابن الخال / ابن العمة)
  if (
    motherA &&
    motherA.fatherId &&
    personB.fatherId &&
     { father: map.get(personB.fatherId) }.father?.fatherId === motherA.fatherId &&
    personB.fatherId !== motherA.id
  ) {
    const bFather = map.get(personB.fatherId)!;
    additionalTies.push(
      `قرابة خؤولة وعمومة: والد ${firstNameB} (${extractGivenName(bFather.fullName)}) هو خال ${firstNameA} (شقيق والدته ${extractGivenName(motherA.fullName)}).`
    );
  }
  if (
    motherB &&
    motherB.fatherId &&
    personA.fatherId &&
    { father: map.get(personA.fatherId) }.father?.fatherId === motherB.fatherId &&
    personA.fatherId !== motherB.id
  ) {
    const aFather = map.get(personA.fatherId)!;
    additionalTies.push(
      `قرابة خؤولة وعمومة: والد ${firstNameA} (${extractGivenName(aFather.fullName)}) هو خال ${firstNameB} (شقيق والدته ${extractGivenName(motherB.fullName)}).`
    );
  }
  // A's mother and B's mother are sisters (أبناء خالة)
  if (
    motherA &&
    motherB &&
    motherA.id !== motherB.id &&
    motherA.fatherId &&
    motherA.fatherId === motherB.fatherId
  ) {
    additionalTies.push(
      `قرابة من جهة الأمهات (أبناء خالة): والدة ${firstNameA} (${extractGivenName(motherA.fullName)}) ووالدة ${firstNameB} (${extractGivenName(motherB.fullName)}) شقيقتان.`
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Build Paternal Ancestor Chains & Find Lowest Common Ancestor (LCA)
  // ---------------------------------------------------------------------------
  const chainA: Person[] = [];
  let curA: Person | undefined = personA;
  const seenA = new Set<string>();
  while (curA && !seenA.has(curA.id)) {
    seenA.add(curA.id);
    chainA.push(curA);
    curA = curA.fatherId ? map.get(curA.fatherId) : undefined;
  }

  const chainB: Person[] = [];
  let curB: Person | undefined = personB;
  const seenB = new Set<string>();
  while (curB && !seenB.has(curB.id)) {
    seenB.add(curB.id);
    chainB.push(curB);
    curB = curB.fatherId ? map.get(curB.fatherId) : undefined;
  }

  let lca: Person | null = null;
  let distA: number | null = null;
  let distB: number | null = null;

  for (let i = 0; i < chainA.length; i++) {
    const idxB = chainB.findIndex(p => p.id === chainA[i].id);
    if (idxB !== -1) {
      lca = chainA[i];
      distA = i;
      distB = idxB;
      break;
    }
  }

  // Shortest Network Path (BFS across father, mother, children, spouse)
  const networkPath = findShortestFamilyGraphPath(personA, personB, persons, map, wivesOfHusband);

  if (lca && distA !== null && distB !== null) {
    const pathA = chainA.slice(0, distA + 1);
    const pathB = chainB.slice(0, distB + 1);

    const paternalTitles = computeExactPaternalTitles(personA, personB, lca, distA, distB, motherA, motherB);

    // If they also have a direct maternal or spousal headline, combine or highlight both!
    const headline = directMaternalOrSpousalHeadline
      ? `${directMaternalOrSpousalHeadline} — و${paternalTitles.headline}`
      : paternalTitles.headline;

    const relationBtoA = directMaternalBtoA
      ? `${directMaternalBtoA} (${paternalTitles.relationBtoA})`
      : paternalTitles.relationBtoA;

    const relationAtoB = directMaternalAtoB
      ? `${directMaternalAtoB} (${paternalTitles.relationAtoB})`
      : paternalTitles.relationAtoB;

    return {
      found: true,
      isSamePerson: false,
      headline,
      relationBtoA,
      relationAtoB,
      summaryDescription: paternalTitles.description,
      commonAncestor: lca,
      distA,
      distB,
      pathA,
      pathB,
      additionalTies,
      networkPath
    };
  }

  // No paternal LCA, check if connected by maternal/spousal or network path
  if (directMaternalOrSpousalHeadline) {
    return {
      found: true,
      isSamePerson: false,
      headline: directMaternalOrSpousalHeadline,
      relationBtoA: directMaternalBtoA || 'قريب بالمصاهرة / الخؤولة',
      relationAtoB: directMaternalAtoB || 'قريب بالمصاهرة / الخؤولة',
      summaryDescription: directMaternalDesc || 'تربطهما صلة قرابة من جهة الأم أو المصاهرة.',
      commonAncestor: null,
      distA: null,
      distB: null,
      pathA: chainA,
      pathB: chainB,
      additionalTies,
      networkPath
    };
  }

  if (networkPath.length > 1) {
    return {
      found: true,
      isSamePerson: false,
      headline: 'قرابة عبر المصاهرة وتداخل الفروع',
      relationBtoA: 'قريب عبر المصاهرة بين الفروع',
      relationAtoB: 'قريب عبر المصاهرة بين الفروع',
      summaryDescription: `لا يجتمعان في جد واحد مباشر في السجل الحالي، ولكن يرتبطان عبر المصاهرة أو الأمومة (${networkPath.length - 1} خطوات).`,
      commonAncestor: null,
      distA: null,
      distB: null,
      pathA: chainA,
      pathB: chainB,
      additionalTies,
      networkPath
    };
  }

  return {
    found: false,
    isSamePerson: false,
    headline: 'من شجرتين مستقلتين (لا يوجد جد مشترك مسجل حالياً)',
    relationBtoA: 'من فرع أو شجرة مستقلة',
    relationAtoB: 'من فرع أو شجرة مستقلة',
    summaryDescription: `ينتمي (${formatAppName(personA.fullName)}) إلى أصل الشجرة (${formatAppName(chainA[chainA.length - 1]?.fullName)})، بينما ينتمي (${formatAppName(personB.fullName)}) إلى أصل الشجرة (${formatAppName(chainB[chainB.length - 1]?.fullName)}). يمكن ربط الشجرتين إذا تم التوصل إلى جد مشترك.`,
    commonAncestor: null,
    distA: null,
    distB: null,
    pathA: chainA,
    pathB: chainB,
    additionalTies,
    networkPath: []
  };
}

function computeExactPaternalTitles(
  personA: Person,
  personB: Person,
  lca: Person,
  distA: number,
  distB: number,
  motherA: Person | null,
  motherB: Person | null
): { headline: string; relationBtoA: string; relationAtoB: string; description: string } {
  const isAMale = personA.gender === 'male';
  const isBMale = personB.gender === 'male';
  const nameA = extractGivenName(personA.fullName);
  const nameB = extractGivenName(personB.fullName);
  const lcaName = formatAppName(lca.fullName);

  // 1. Direct Ancestor: A is ancestor of B (distA === 0)
  if (distA === 0) {
    if (distB === 1) {
      return {
        headline: `أب و${isBMale ? 'ابنه' : 'ابنته'}`,
        relationBtoA: isBMale ? 'ابنه المباشر' : 'ابنته المباشرة',
        relationAtoB: 'والده (أبوه المباشر)',
        description: `${formatAppName(personA.fullName)} هو الأب المباشر لـ ${formatAppName(personB.fullName)}.`
      };
    }
    if (distB === 2) {
      return {
        headline: `جد و${isBMale ? 'حفيده' : 'حفيدته'}`,
        relationBtoA: isBMale ? 'حفيده (ابن الابن)' : 'حفيدته (ابنة الابن)',
        relationAtoB: 'جده المباشر (والد الأب)',
        description: `${formatAppName(personA.fullName)} هو الجد المباشر (والد الأب) لـ ${formatAppName(personB.fullName)}.`
      };
    }
    if (distB === 3) {
      return {
        headline: `الجد الأكبر و${isBMale ? 'ابن حفيده' : 'ابنة حفيده'}`,
        relationBtoA: isBMale ? 'ابن حفيده (الجيل 3)' : 'ابنة حفيده (الجيل 3)',
        relationAtoB: 'جده الأكبر (جد الأب)',
        description: `${formatAppName(personA.fullName)} هو جد والد ${formatAppName(personB.fullName)} (بفارق 3 أجيال).`
      };
    }
    return {
      headline: `جد أعلى وذريته (بفارق ${distB} أجيال)`,
      relationBtoA: isBMale ? `من أحفاده وذريته (الجيل ${distB})` : `من حفيداته وذريته (الجيل ${distB})`,
      relationAtoB: `جده الأعلى (الجد رقم ${distB - 1})`,
      description: `${formatAppName(personA.fullName)} هو الجد الأعلى لـ ${formatAppName(personB.fullName)} بمسافة ${distB} أجيال.`
    };
  }

  // 2. Direct Ancestor: B is ancestor of A (distB === 0)
  if (distB === 0) {
    if (distA === 1) {
      return {
        headline: `أب و${isAMale ? 'ابنه' : 'ابنته'}`,
        relationBtoA: 'والده (أبوه المباشر)',
        relationAtoB: isAMale ? 'ابنه المباشر' : 'ابنته المباشرة',
        description: `${formatAppName(personB.fullName)} هو الأب المباشر لـ ${formatAppName(personA.fullName)}.`
      };
    }
    if (distA === 2) {
      return {
        headline: `جد و${isAMale ? 'حفيده' : 'حفيدته'}`,
        relationBtoA: 'جده المباشر (والد الأب)',
        relationAtoB: isAMale ? 'حفيده (ابن الابن)' : 'حفيدته (ابنة الابن)',
        description: `${formatAppName(personB.fullName)} هو الجد المباشر (والد الأب) لـ ${formatAppName(personA.fullName)}.`
      };
    }
    if (distA === 3) {
      return {
        headline: `الجد الأكبر و${isAMale ? 'ابن حفيده' : 'ابنة حفيده'}`,
        relationBtoA: 'جده الأكبر (جد الأب)',
        relationAtoB: isAMale ? 'ابن حفيده (الجيل 3)' : 'ابنة حفيده (الجيل 3)',
        description: `${formatAppName(personB.fullName)} هو جد والد ${formatAppName(personA.fullName)} (بفارق 3 أجيال).`
      };
    }
    return {
      headline: `جد أعلى وذريته (بفارق ${distA} أجيال)`,
      relationBtoA: `جده الأعلى (الجد رقم ${distA - 1})`,
      relationAtoB: isAMale ? `من أحفاده وذريته (الجيل ${distA})` : `من حفيداته وذريته (الجيل ${distA})`,
      description: `${formatAppName(personB.fullName)} هو الجد الأعلى لـ ${formatAppName(personA.fullName)} بمسافة ${distA} أجيال.`
    };
  }

  // 3. Siblings (distA === 1 && distB === 1)
  if (distA === 1 && distB === 1) {
    const differentMothers = Boolean(motherA && motherB && motherA.id !== motherB.id);
    const sameMother = Boolean(motherA && motherB && motherA.id === motherB.id);
    const suffixM = differentMothers ? ' (من الأب)' : sameMother ? ' شقيق' : '';
    const suffixF = differentMothers ? ' (من الأب)' : sameMother ? ' شقيقة' : '';

    return {
      headline:
        isAMale && isBMale
          ? `أخوان${differentMothers ? ' من الأب' : ''}`
          : !isAMale && !isBMale
          ? `أختان${differentMothers ? ' من الأب' : ''}`
          : `أخ وأخته${differentMothers ? ' من الأب' : ''}`,
      relationBtoA: isBMale ? `أخوه${suffixM}` : `أخته${suffixF}`,
      relationAtoB: isAMale ? `أخوه${suffixM}` : `أخته${suffixF}`,
      description: `يشترك (${nameA}) و(${nameB}) في الأب المباشر (${lcaName})${
        sameMother
          ? ` وفي الأم (${formatAppName(motherA!.fullName)})`
          : differentMothers
          ? ` (من أمّين مختلفتين: ${extractGivenName(motherA!.fullName)} و ${extractGivenName(motherB!.fullName)})`
          : ''
      }.`
    };
  }

  // 4. Paternal Uncle/Aunt: B is sibling of A's father (distA === 2 && distB === 1)
  if (distA === 2 && distB === 1) {
    return {
      headline: isBMale
        ? `عم و${isAMale ? 'ابن أخيه' : 'ابنة أخيه'}`
        : `عمة و${isAMale ? 'ابن أخيها' : 'ابنة أخيها'}`,
      relationBtoA: isBMale ? 'عمه المباشر (أخو الأب)' : 'عمته المباشرة (أخت الأب)',
      relationAtoB: isAMale ? 'ابن أخيه/أخيها' : 'ابنة أخيه/أخيها',
      description: `${nameB} ${isBMale ? 'عم' : 'عمة'} لـ ${nameA}، ويلتقيان في الجد (${lcaName}).`
    };
  }

  // 5. Paternal Uncle/Aunt: A is sibling of B's father (distA === 1 && distB === 2)
  if (distA === 1 && distB === 2) {
    return {
      headline: isAMale
        ? `عم و${isBMale ? 'ابن أخيه' : 'ابنة أخيه'}`
        : `عمة و${isBMale ? 'ابن أخيها' : 'ابنة أخيها'}`,
      relationBtoA: isBMale ? 'ابن أخيه/أخيها' : 'ابنة أخيه/أخيها',
      relationAtoB: isAMale ? 'عمه المباشر (أخو الأب)' : 'عمته المباشرة (أخت الأب)',
      description: `${nameA} ${isAMale ? 'عم' : 'عمة'} لـ ${nameB}، ويلتقيان في الجد (${lcaName}).`
    };
  }

  // 6. Great Uncle/Aunt: B is sibling of A's grandfather (distA >= 3 && distB === 1)
  if (distA >= 3 && distB === 1) {
    const uncleTarget = distA === 3 ? 'الأب' : 'الجد';
    return {
      headline: isBMale ? `عم ${uncleTarget} وحفيد الأخ` : `عمة ${uncleTarget} وحفيد الأخ`,
      relationBtoA: isBMale ? `عم ${uncleTarget}` : `عمة ${uncleTarget}`,
      relationAtoB: isAMale ? 'ابن ابن أخيه/أخيها' : 'ابنة ابن أخيه/أخيها',
      description: `${nameB} هو ${isBMale ? 'عم' : 'عمة'} ${uncleTarget} بالنسبة لـ ${nameA}، ويجتمعان في الأصل (${lcaName}).`
    };
  }

  // 7. Great Uncle/Aunt: A is sibling of B's grandfather (distA === 1 && distB >= 3)
  if (distA === 1 && distB >= 3) {
    const uncleTarget = distB === 3 ? 'الأب' : 'الجد';
    return {
      headline: isAMale ? `عم ${uncleTarget} وحفيد الأخ` : `عمة ${uncleTarget} وحفيد الأخ`,
      relationBtoA: isBMale ? 'ابن ابن أخيه/أخيها' : 'ابنة ابن أخيه/أخيها',
      relationAtoB: isAMale ? `عم ${uncleTarget}` : `عمة ${uncleTarget}`,
      description: `${nameA} هو ${isAMale ? 'عم' : 'عمة'} ${uncleTarget} بالنسبة لـ ${nameB}، ويجتمعان في الأصل (${lcaName}).`
    };
  }

  // 8. First Paternal Cousins (أبناء عم مباشرين: distA === 2 && distB === 2)
  if (distA === 2 && distB === 2) {
    return {
      headline: 'أبناء عم مباشرين (الدرجة الأولى)',
      relationBtoA: isBMale ? 'ابن عمه المباشر' : 'ابنة عمه المباشرة',
      relationAtoB: isAMale ? 'ابن عمه المباشر' : 'ابنة عمه المباشرة',
      description: `أبناء عمومة من الدرجة الأولى؛ والداهما شقيقان ويجتمعان في الجد المباشر (${lcaName}).`
    };
  }

  // 9. First Cousin Once Removed (distA === 3 && distB === 2)
  if (distA === 3 && distB === 2) {
    return {
      headline: isBMale ? 'ابن عم الأب وابن ابن العم' : 'ابنة عم الأب وابن ابن العم',
      relationBtoA: isBMale ? 'ابن عم أبيه' : 'ابنة عم أبيه',
      relationAtoB: isAMale ? 'ابن ابن عمه' : 'ابنة ابن عمه',
      description: `${nameB} في منزلة ابن/ابنة عم والد ${nameA}، ويلتقيان في الجد المشترك (${lcaName}).`
    };
  }

  // 10. First Cousin Once Removed (distA === 2 && distB === 3)
  if (distA === 2 && distB === 3) {
    return {
      headline: isAMale ? 'ابن عم الأب وابن ابن العم' : 'ابنة عم الأب وابن ابن العم',
      relationBtoA: isBMale ? 'ابن ابن عمه' : 'ابنة ابن عمه',
      relationAtoB: isAMale ? 'ابن عم أبيه' : 'ابنة عم أبيه',
      description: `${nameA} في منزلة ابن/ابنة عم والد ${nameB}، ويلتقيان في الجد المشترك (${lcaName}).`
    };
  }

  // 11. Second Cousins (distA === 3 && distB === 3)
  if (distA === 3 && distB === 3) {
    return {
      headline: 'أبناء عم (الدرجة الثانية - أبناء عمومة الجد)',
      relationBtoA: isBMale ? 'ابن عمه (الدرجة الثانية)' : 'ابنة عمه (الدرجة الثانية)',
      relationAtoB: isAMale ? 'ابن عمه (الدرجة الثانية)' : 'ابنة عمه (الدرجة الثانية)',
      description: `جدّاهما أخوان شقيقان، ويلتقي نسبهما في الجد المشترك (${lcaName}) عند الجيل الثالث.`
    };
  }

  // 12. Equal generation depth cousins (distA === distB)
  if (distA === distB) {
    return {
      headline: `أبناء عمومة من نفس الجيل (يلتقيان في الجد ${distA - 1})`,
      relationBtoA: isBMale ? `ابن عمه (يلتقيان في الجيل ${distA})` : `ابنة عمه (يلتقيان في الجيل ${distA})`,
      relationAtoB: isAMale ? `ابن عمه (يلتقيان في الجيل ${distA})` : `ابنة عمه (يلتقيان في الجيل ${distA})`,
      description: `يتساويان في المرتبة الجيلية، ويلتقي نسبهما في الجد المشترك (${lcaName}) بعد ${distA} آباء.`
    };
  }

  // 13. General paternal kinship
  return {
    headline: `أبناء عمومة وقرابة نسب (يجتمعان في الجد ${extractGivenName(lca.fullName)})`,
    relationBtoA: isBMale
      ? `ابن عمومة (يبعد ${distB} أجيال عن الجد المشترك)`
      : `ابنة عمومة (تبعد ${distB} أجيال عن الجد المشترك)`,
    relationAtoB: isAMale
      ? `ابن عمومة (يبعد ${distA} أجيال عن الجد المشترك)`
      : `ابنة عمومة (تبعد ${distA} أجيال عن الجد المشترك)`,
    description: `يلتقي نسب (${nameA}) و(${nameB}) في الجد الجامع (${lcaName})؛ بمسافة ${distA} أجيال للأول و${distB} أجيال للثاني.`
  };
}

function findShortestFamilyGraphPath(
  start: Person,
  goal: Person,
  persons: Person[],
  map: Map<string, Person>,
  wivesOfHusband: Map<string, Person[]>
): { person: Person; stepLabel: string }[] {
  // Build adjacency list with semantic Arabic relationship labels
  const adj = new Map<string, { toId: string; label: string }[]>();
  const addEdge = (fromId: string, toId: string, label: string) => {
    const list = adj.get(fromId) || [];
    if (!list.some(e => e.toId === toId)) {
      list.push({ toId, label });
      adj.set(fromId, list);
    }
  };

  for (const p of persons) {
    if (p.fatherId && map.has(p.fatherId)) {
      addEdge(p.id, p.fatherId, 'والده (الأب)');
      addEdge(p.fatherId, p.id, p.gender === 'male' ? 'ابنه' : 'ابنته');
    }
    const mother = resolveMotherOfChild(p, map, wivesOfHusband);
    if (mother) {
      addEdge(p.id, mother.id, 'والدته (الأم)');
      addEdge(mother.id, p.id, p.gender === 'male' ? 'ابنها' : 'ابنتها');
    }
    if (p.gender === 'female' && p.husbandId && map.has(p.husbandId)) {
      addEdge(p.id, p.husbandId, 'زوجها');
      addEdge(p.husbandId, p.id, 'زوجته');
    }
  }

  const queue: string[] = [start.id];
  const visited = new Set<string>([start.id]);
  const parentMap = new Map<string, { prevId: string; label: string }>();

  while (queue.length > 0) {
    const currId = queue.shift()!;
    if (currId === goal.id) {
      const path: { person: Person; stepLabel: string }[] = [];
      let traceId: string | undefined = goal.id;
      while (traceId) {
        const person = map.get(traceId)!;
        const pInfo = parentMap.get(traceId);
        path.unshift({
          person,
          stepLabel: pInfo ? pInfo.label : 'نقطة البداية (الطرف الأول)'
        });
        traceId = pInfo?.prevId;
      }
      return path;
    }

    const neighbors = adj.get(currId) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.toId)) {
        visited.add(edge.toId);
        parentMap.set(edge.toId, { prevId: currId, label: edge.label });
        queue.push(edge.toId);
      }
    }
  }

  return [];
}

