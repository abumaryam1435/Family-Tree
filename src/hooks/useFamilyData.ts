import { useState, useEffect, useCallback, useMemo } from 'react';
import { Person, AppSettings } from '../types/family';
import { familyFirebase } from '../firebase/familyService';
import { apiClient } from '../api/client';
import {
  advancedArabicMatch,
  scoreArabicMatch,
  sortPersonsMalesFirstAlphabetical,
  comparePersonsMalesFirstAlphabetical,
  filterAndSortBySearch,
  extractGivenName
} from '../utils/nameUtils';

export function useFamilyData() {
  const [rawPersons, setRawPersons] = useState<Person[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    editingEnabled: false,
    hasAdminPasscode: false,
    updatedAt: new Date().toISOString()
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<'home' | 'tree' | 'lineage' | 'kinship' | 'list' | 'trees' | 'requests'>('home');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedTreeRootId, setSelectedTreeRootId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Globally sorted persons: Males first, then Females, alphabetically (Arabic)
  const persons = useMemo(() => {
    return sortPersonsMalesFirstAlphabetical(rawPersons);
  }, [rawPersons]);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  // Real-time synchronization via Firebase Firestore
  useEffect(() => {
    setLoading(true);

    // 1. Subscribe to Persons collection
    const unsubPersons = familyFirebase.subscribePersons(
      (firebasePersons) => {
        setRawPersons(firebasePersons);
        setLoading(false);
        setError(null);
      },
      async (err) => {
        console.warn('Firebase sync fallback to server api:', err);
        try {
          const fallbackPersons = await apiClient.getPersons();
          setRawPersons(fallbackPersons);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }
    );

    // 2. Subscribe to Settings doc
    const unsubSettings = familyFirebase.subscribeSettings((firebaseSettings) => {
      setSettings(firebaseSettings);
    });

    // Check admin session token
    const token = apiClient.getAdminToken();
    if (token) {
      setIsAdmin(true);
    }

    return () => {
      unsubPersons();
      unsubSettings();
    };
  }, []);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const serverPersons = await apiClient.getPersons().catch(() => null);
      if (serverPersons && rawPersons.length === 0) {
        setRawPersons(serverPersons);
      }
      const token = apiClient.getAdminToken();
      setIsAdmin(!!token);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [rawPersons.length]);

  // Index map of persons for O(1) lookups
  const personsMap = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of persons) {
      map.set(p.id, p);
    }
    return map;
  }, [persons]);

  // Children index map (each father's children sorted Males first then Females alphabetically)
  // Strictly patrilineal: children branch under their father in the tree, never under a female node
  const childrenMap = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of persons) {
      if (p.fatherId) {
        const father = personsMap.get(p.fatherId);
        if (father && father.gender === 'female') continue;
        const arr = map.get(p.fatherId) || [];
        arr.push(p);
        map.set(p.fatherId, arr);
      }
    }
    for (const [fid, arr] of map.entries()) {
      map.set(fid, sortPersonsMalesFirstAlphabetical(arr));
    }
    return map;
  }, [persons, personsMap]);

  // Independent tree roots (ancestors with no fatherId, sorted alphabetically)
  const treeRoots = useMemo(() => {
    return sortPersonsMalesFirstAlphabetical(
      persons.filter(p => !p.fatherId && p.gender === 'male')
    );
  }, [persons]);

  // If active tree root is not set, default to first root
  useEffect(() => {
    if (!selectedTreeRootId && treeRoots.length > 0) {
      setSelectedTreeRootId(treeRoots[0].id);
    }
  }, [treeRoots, selectedTreeRootId]);

  // Helper getters
  const getPerson = useCallback((id: string): Person | undefined => {
    return personsMap.get(id);
  }, [personsMap]);

  const getChildren = useCallback((personId: string): Person[] => {
    const p = personsMap.get(personId);
    if (p && p.gender === 'female') return [];
    return childrenMap.get(personId) || [];
  }, [childrenMap, personsMap]);

  const getSons = useCallback((personId: string): Person[] => {
    const p = personsMap.get(personId);
    if (p && p.gender === 'female') return [];
    return (childrenMap.get(personId) || []).filter(c => c.gender === 'male');
  }, [childrenMap, personsMap]);

  const getDaughters = useCallback((personId: string): Person[] => {
    const p = personsMap.get(personId);
    if (p && p.gender === 'female') return [];
    return (childrenMap.get(personId) || []).filter(c => c.gender === 'female');
  }, [childrenMap, personsMap]);

  const getAncestors = useCallback((personId: string): Person[] => {
    const ancestors: Person[] = [];
    const visited = new Set<string>();
    let current = personsMap.get(personId);

    while (current && current.fatherId) {
      if (visited.has(current.fatherId)) break;
      visited.add(current.fatherId);
      const father = personsMap.get(current.fatherId);
      if (father) {
        ancestors.push(father);
        current = father;
      } else {
        break;
      }
    }
    return ancestors;
  }, [personsMap]);

  // Full lineage string
  const getLineageString = useCallback((personId: string): string => {
    const person = personsMap.get(personId);
    if (!person) return '';
    const ancestors = getAncestors(personId);
    if (ancestors.length === 0) return person.fullName;

    const chain = [extractGivenName(person.fullName)];
    for (let i = 0; i < ancestors.length; i++) {
      const anc = ancestors[i];
      const firstName = extractGivenName(anc.fullName)
        .replace(/^(الشيخ|العم|الدكتور|المهندس)\s*/, '')
        .trim();
      const isFemale = i === 0 && person.gender === 'female';
      chain.push(isFemale ? `بنت ${firstName}` : `بن ${firstName}`);
    }
    return chain.join(' ');
  }, [personsMap, getAncestors]);

  // Compute total descendants count
  const getDescendantsCount = useCallback((personId: string): { total: number; males: number; females: number; maxDepth: number } => {
    let males = 0;
    let females = 0;
    let maxDepth = 0;

    function walk(id: string, depth: number) {
      if (depth > maxDepth) maxDepth = depth;
      const ch = childrenMap.get(id) || [];
      for (const c of ch) {
        if (c.gender === 'male') males++;
        else females++;
        walk(c.id, depth + 1);
      }
    }

    walk(personId, 0);
    return { total: males + females, males, females, maxDepth };
  }, [childrenMap]);

  // Filtered persons based on proximity to search query (closest first, then next closest, then Arabic alphabetical)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return filterAndSortBySearch(persons, q, (p) => [
      getLineageString(p.id),
      p.husbandName || '',
      p.notes || ''
    ]);
  }, [persons, searchQuery, getLineageString]);

  // Global family tree metrics
  const stats = useMemo(() => {
    const totalMembers = persons.length;
    const totalMales = persons.filter(p => p.gender === 'male').length;
    const totalFemales = persons.filter(p => p.gender === 'female').length;
    const independentTreesCount = treeRoots.length;

    let maxGenerations = treeRoots.length > 0 ? 1 : 0;
    for (const root of treeRoots) {
      const { maxDepth } = getDescendantsCount(root.id);
      if (maxDepth + 1 > maxGenerations) {
        maxGenerations = maxDepth + 1;
      }
    }

    return {
      totalMembers,
      totalMales,
      totalFemales,
      independentTreesCount,
      maxGenerations
    };
  }, [persons, treeRoots, getDescendantsCount]);

  return {
    persons,
    personsMap,
    treeRoots,
    settings,
    isAdmin,
    loading,
    error,
    toastMessage,
    activeTab,
    selectedPersonId,
    selectedTreeRootId,
    searchQuery,
    searchResults,
    stats,
    setActiveTab,
    setSelectedPersonId,
    setSelectedTreeRootId,
    setSearchQuery,
    showToast,
    fetchData,
    getPerson,
    getChildren,
    getSons,
    getDaughters,
    getAncestors,
    getLineageString,
    getDescendantsCount
  };
}
