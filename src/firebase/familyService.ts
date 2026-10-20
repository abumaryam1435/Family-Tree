import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';
import { Person, AppSettings, AuditLog, MergeOperation, ChangeRequest, Gender } from '../types/family';
import {
  extractGivenName,
  splitLineageChain,
  rebuildChildFullName
} from '../utils/nameUtils';

// SubtleCrypto SHA-256 for browser-compatible passcode verification
async function hashPasscode(passcode: string): Promise<string> {
  const enc = new TextEncoder().encode(passcode.trim() + '_arabic_family_salt_2026');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Error handling helper mandated by skill
function handleFirestoreError(error: unknown, op: string, path: string | null) {
  console.error(`Firestore error during ${op} on ${path}:`, error);
  throw error;
}

/**
 * Automatically cascades updated full lineage names down an entire branch (كل ابن وفروعه)
 * and updates husbandName on any married female linked via husbandId.
 */
function cascadeSubtreeLineageUpdates(
  batch: ReturnType<typeof writeBatch>,
  allPersons: Person[],
  startRoots: { id: string; fullName: string }[],
  now: string
): number {
  const childrenMap = new Map<string, Person[]>();
  for (const p of allPersons) {
    if (p.fatherId) {
      const list = childrenMap.get(p.fatherId) || [];
      list.push(p);
      childrenMap.set(p.fatherId, list);
    }
  }

  const updatedNamesMap = new Map<string, string>();
  for (const r of startRoots) {
    updatedNamesMap.set(r.id, r.fullName);
  }

  const queue: { id: string; fullName: string }[] = [...startRoots];
  const visited = new Set<string>(startRoots.map(r => r.id));
  let updatedDescendantsCount = 0;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const directChildren = childrenMap.get(curr.id) || [];
    for (const desc of directChildren) {
      if (visited.has(desc.id)) continue;
      visited.add(desc.id);

      const descNewName = rebuildChildFullName(desc.fullName, desc.gender, curr.fullName);
      if (descNewName !== desc.fullName) {
        batch.update(doc(db, 'persons', desc.id), {
          fullName: descNewName,
          updatedAt: now
        });
        updatedNamesMap.set(desc.id, descNewName);
        updatedDescendantsCount++;
      }

      queue.push({
        id: desc.id,
        fullName: descNewName
      });
    }
  }

  // Update husbandName for any female in the family married to any person whose fullName changed
  if (updatedNamesMap.size > 0) {
    for (const p of allPersons) {
      if (p.gender === 'female' && p.husbandId && updatedNamesMap.has(p.husbandId)) {
        const newHusbandName = updatedNamesMap.get(p.husbandId)!;
        if (p.husbandName !== newHusbandName) {
          batch.update(doc(db, 'persons', p.id), {
            husbandName: newHusbandName,
            updatedAt: now
          });
        }
      }
    }
  }

  return updatedDescendantsCount;
}

export const familyFirebase = {
  // Real-time listener for persons collection across all connected devices
  subscribePersons(callback: (persons: Person[]) => void, onError?: (err: any) => void) {
    const colRef = collection(db, 'persons');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: Person[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Person);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, 'subscribe', 'persons');
        if (onError) onError(error);
      }
    );
  },

  // Real-time listener for app settings
  subscribeSettings(callback: (settings: AppSettings) => void) {
    const docRef = doc(db, 'settings', 'app_config');
    return onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback({
          editingEnabled: false,
          hasAdminPasscode: !!data.adminPasscodeHash,
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      } else {
        // Initialize default settings doc if not exists
        const initial = {
          editingEnabled: false,
          adminPasscodeHash: '',
          updatedAt: new Date().toISOString()
        };
        await setDoc(docRef, initial).catch(() => {});
        callback({
          editingEnabled: false,
          hasAdminPasscode: false,
          updatedAt: initial.updatedAt
        });
      }
    });
  },

  // Audit Logs listener
  subscribeAuditLogs(callback: (logs: AuditLog[]) => void) {
    const colRef = collection(db, 'audit_logs');
    return onSnapshot(colRef, (snap) => {
      const logs: AuditLog[] = [];
      snap.forEach(d => logs.push(d.data() as AuditLog));
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(logs);
    });
  },

  // Merge Operations listener
  subscribeMergeOperations(callback: (ops: MergeOperation[]) => void) {
    const colRef = collection(db, 'merge_operations');
    return onSnapshot(colRef, (snap) => {
      const ops: MergeOperation[] = [];
      snap.forEach(d => ops.push(d.data() as MergeOperation));
      ops.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(ops);
    });
  },

  // Change Requests listener
  subscribeChangeRequests(callback: (reqs: ChangeRequest[]) => void) {
    const colRef = collection(db, 'change_requests');
    return onSnapshot(colRef, (snap) => {
      const reqs: ChangeRequest[] = [];
      snap.forEach(d => reqs.push(d.data() as ChangeRequest));
      reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(reqs);
    });
  },

  // Add audit log
  async addAuditLog(actor: 'مستخدم' | 'المشرف', actionType: string, desc: string, targetId?: string, targetName?: string) {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logData: AuditLog = {
      id: logId,
      actor,
      actionType,
      targetPersonId: targetId,
      targetPersonName: targetName,
      description: desc,
      timestamp: new Date().toISOString()
    };
    await setDoc(doc(db, 'audit_logs', logId), logData).catch(() => {});
  },

  // Add Person
  async addPerson(payload: {
    fullName: string;
    gender: Gender;
    fatherId?: string | null;
    motherId?: string | null;
    husbandId?: string | null;
    husbandName?: string;
    excludedChildIds?: string[];
    childMotherAssignments?: Record<string, string | null>;
    notes?: string;
    actor?: 'مستخدم' | 'المشرف';
  }): Promise<Person> {
    const trimmed = payload.fullName.trim();
    if (!trimmed) throw new Error('الاسم الكامل مطلوب');

    const fatherId = payload.fatherId || null;
    let finalNewPersonName = trimmed;

    if (fatherId) {
      const fatherSnap = await getDoc(doc(db, 'persons', fatherId));
      if (!fatherSnap.exists()) {
        throw new Error('الأب المحدد غير موجود');
      }
      const fatherData = fatherSnap.data() as Person;
      if (fatherData.gender === 'female') {
        throw new Error('في شجرة النسب العربية، ينسب الأبناء لآبائهم. لا يمكن إضافة أبناء لإناث كفروع رئيسية في الشجرة.');
      }
      finalNewPersonName = rebuildChildFullName(trimmed, payload.gender, fatherData.fullName);
    } else {
      // When adding a root ancestor (أصل بدون أب), keep the first name before بن/بنت
      finalNewPersonName = extractGivenName(trimmed) || trimmed;
    }

    const id = `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newPerson: Person = {
      id,
      fullName: finalNewPersonName,
      gender: payload.gender,
      fatherId,
      motherId: payload.motherId || null,
      husbandId: payload.gender === 'female' ? (payload.husbandId || null) : null,
      husbandName: payload.gender === 'female' ? (payload.husbandName?.trim() || '') : '',
      excludedChildIds: payload.gender === 'female' && Array.isArray(payload.excludedChildIds) ? payload.excludedChildIds : [],
      notes: payload.notes?.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'persons', id), newPerson);

    // If childMotherAssignments provided for excluded children of husband
    if (payload.gender === 'female' && payload.childMotherAssignments) {
      for (const [childId, otherMotherId] of Object.entries(payload.childMotherAssignments)) {
        const childRef = doc(db, 'persons', childId);
        await updateDoc(childRef, {
          motherId: otherMotherId || null,
          updatedAt: new Date().toISOString()
        }).catch(() => {});

        // If otherMotherId is a female in the tree, ensure she is linked to this husband if she has none, and child is not in her excludedChildIds
        if (otherMotherId && payload.husbandId) {
          const otherMotherRef = doc(db, 'persons', otherMotherId);
          const omSnap = await getDoc(otherMotherRef);
          if (omSnap.exists()) {
            const omData = omSnap.data() as Person;
            const omUpdates: Partial<Person> = {
              updatedAt: new Date().toISOString()
            };
            if (!omData.husbandId) {
              omUpdates.husbandId = payload.husbandId;
              omUpdates.husbandName = payload.husbandName || '';
            }
            if (Array.isArray(omData.excludedChildIds) && omData.excludedChildIds.includes(childId)) {
              omUpdates.excludedChildIds = omData.excludedChildIds.filter(cid => cid !== childId);
            }
            await updateDoc(otherMotherRef, omUpdates).catch(() => {});
          }
        }
      }
    }

    await this.addAuditLog(payload.actor || 'مستخدم', 'create', `إضافة ${newPerson.gender === 'male' ? 'ابن' : 'ابنة'}: ${newPerson.fullName}`, newPerson.id, newPerson.fullName);
    return newPerson;
  },

  // Update Person (with automatic cascading of lineage names to all children and descendants if fatherId or fullName changes)
  async updatePerson(id: string, updates: {
    fullName?: string;
    gender?: Gender;
    notes?: string;
    fatherId?: string | null;
    motherId?: string | null;
    husbandId?: string | null;
    husbandName?: string;
    excludedChildIds?: string[];
    childMotherAssignments?: Record<string, string | null>;
    actor?: 'مستخدم' | 'المشرف';
  }): Promise<void> {
    const docRef = doc(db, 'persons', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('الفرد غير موجود');

    const current = snap.data() as Person;
    const now = new Date().toISOString();
    const cleanUpdates: Partial<Person> = {
      updatedAt: now
    };

    const targetGender = updates.gender !== undefined ? updates.gender : current.gender;
    if (updates.gender !== undefined) {
      cleanUpdates.gender = updates.gender;
      if (updates.gender === 'male') {
        cleanUpdates.husbandId = null;
        cleanUpdates.husbandName = '';
        cleanUpdates.excludedChildIds = [];
      }
    }
    if (updates.notes !== undefined) cleanUpdates.notes = updates.notes.trim();
    if (updates.fatherId !== undefined) cleanUpdates.fatherId = updates.fatherId || null;
    if (updates.motherId !== undefined) cleanUpdates.motherId = updates.motherId || null;
    if (updates.husbandId !== undefined) cleanUpdates.husbandId = updates.husbandId || null;
    if (updates.husbandName !== undefined) cleanUpdates.husbandName = updates.husbandName?.trim() || '';
    if (updates.excludedChildIds !== undefined) cleanUpdates.excludedChildIds = updates.excludedChildIds;

    const allSnap = await getDocs(collection(db, 'persons'));
    const allPersons = allSnap.docs.map(d => d.data() as Person);

    const fatherChanged = updates.fatherId !== undefined && (updates.fatherId || null) !== (current.fatherId || null);
    let finalFullName = updates.fullName !== undefined ? updates.fullName.trim() : current.fullName;

    if (fatherChanged) {
      const newFatherId = updates.fatherId || null;
      if (newFatherId) {
        if (newFatherId === id) {
          throw new Error('لا يمكن ربط الفرد كأب لنفسه');
        }
        // Check that newFatherId is not a descendant of `id`
        const descSet = new Set<string>([id]);
        let added = true;
        while (added) {
          added = false;
          for (const p of allPersons) {
            if (p.fatherId && descSet.has(p.fatherId) && !descSet.has(p.id)) {
              descSet.add(p.id);
              added = true;
            }
          }
        }
        if (descSet.has(newFatherId)) {
          throw new Error('لا يمكن نقل الأب أو الجد ليكون ابناً لأحد أبنائه أو أحفاده');
        }

        const newFather = allPersons.find(p => p.id === newFatherId);
        if (!newFather) throw new Error('الأب / الجد المحدد غير موجود');
        if (newFather.gender === 'female') throw new Error('لا يمكن النسبة إلى أنثى كأب في الشجرة');

        // Rebuild fullName keeping only the first name before بن/بنت and attaching the new father's full name
        finalFullName = rebuildChildFullName(finalFullName, targetGender, newFather.fullName);
      } else {
        // Person became a root ancestor (أصل مستقل بدون أب): keep only the first name before بن/بنت
        finalFullName = extractGivenName(finalFullName) || finalFullName;
      }
    } else if (! (updates.fatherId !== undefined ? updates.fatherId : current.fatherId)) {
      // Root ancestor edited: keep only the first name before بن/بنت
      finalFullName = extractGivenName(finalFullName) || finalFullName;
    } else if (updates.gender !== undefined && updates.gender !== current.gender && current.fatherId) {
      const curFather = allPersons.find(p => p.id === current.fatherId);
      if (curFather) {
        finalFullName = rebuildChildFullName(finalFullName, targetGender, curFather.fullName);
      }
    }

    cleanUpdates.fullName = finalFullName;

    const batch = writeBatch(db);
    batch.update(docRef, cleanUpdates);

    // Cascade lineage updates to all descendants (كل ابن وفروعه) if name or father changed
    if (finalFullName !== current.fullName || fatherChanged) {
      const updatedAllPersons = allPersons.map(p =>
        p.id === id
          ? { ...p, ...cleanUpdates, fullName: finalFullName }
          : p
      );
      cascadeSubtreeLineageUpdates(
        batch,
        updatedAllPersons,
        [{ id, fullName: finalFullName }],
        now
      );
    }

    await batch.commit();

    // Update children's motherId if childMotherAssignments provided
    if (updates.childMotherAssignments) {
      const targetHusbandId = updates.husbandId !== undefined ? updates.husbandId : current.husbandId;
      const targetHusbandName = updates.husbandName !== undefined ? updates.husbandName : current.husbandName;
      for (const [childId, otherMotherId] of Object.entries(updates.childMotherAssignments)) {
        const childRef = doc(db, 'persons', childId);
        await updateDoc(childRef, {
          motherId: otherMotherId || null,
          updatedAt: new Date().toISOString()
        }).catch(() => {});

        if (otherMotherId && targetHusbandId) {
          const otherMotherRef = doc(db, 'persons', otherMotherId);
          const omSnap = await getDoc(otherMotherRef);
          if (omSnap.exists()) {
            const omData = omSnap.data() as Person;
            const omUpdates: Partial<Person> = {
              updatedAt: new Date().toISOString()
            };
            if (!omData.husbandId) {
              omUpdates.husbandId = targetHusbandId;
              omUpdates.husbandName = targetHusbandName || '';
            }
            if (Array.isArray(omData.excludedChildIds) && omData.excludedChildIds.includes(childId)) {
              omUpdates.excludedChildIds = omData.excludedChildIds.filter(cid => cid !== childId);
            }
            await updateDoc(otherMotherRef, omUpdates).catch(() => {});
          }
        }
      }
    }

    await this.addAuditLog(
      updates.actor || 'مستخدم',
      'update',
      `تعديل بيانات: ${finalFullName}`,
      id,
      finalFullName
    );
  },

  // Move Son & His Branches to a Higher Grandfather / Add 1 or More Ancestors Above
  async addFatherAbove(personId: string, fatherData: {
    fullName: string;
    ancestorChain?: string[]; // Ordered from direct father up to highest grandfather: [directFather, grandFather, greatGrandFather...]
    notes?: string;
    existingFatherId?: string | null;
    splitCompoundName?: boolean;
    keepCurrentFatherAsTop?: boolean;
    updateDescendantsNames?: boolean;
    actor?: 'مستخدم' | 'المشرف';
  }): Promise<{ father: Person; highestAncestor: Person; child: Person; updatedDescendantsCount: number }> {
    const allSnap = await getDocs(collection(db, 'persons'));
    const allPersons = allSnap.docs.map(d => d.data() as Person);

    const child = allPersons.find(p => p.id === personId);
    if (!child) throw new Error('الفرد غير موجود');

    // Collect all descendants of `personId` to prevent circular ancestry
    const descendantIds = new Set<string>([personId]);
    let added = true;
    while (added) {
      added = false;
      for (const p of allPersons) {
        if (p.fatherId && descendantIds.has(p.fatherId) && !descendantIds.has(p.id)) {
          descendantIds.add(p.id);
          added = true;
        }
      }
    }

    let existingTopAncestor: Person | null = null;
    if (fatherData.existingFatherId) {
      existingTopAncestor = allPersons.find(p => p.id === fatherData.existingFatherId) || null;
      if (!existingTopAncestor) throw new Error('الجد / الأصل المحدد غير موجود');
      if (existingTopAncestor.id === personId) {
        throw new Error('لا يمكن ربط الفرد بنفسه');
      }
      if (descendantIds.has(existingTopAncestor.id)) {
        throw new Error('لا يمكن نقل الأب أو الجد ليكون تحت أحد أبنائه أو أحفاده');
      }
      if (existingTopAncestor.gender === 'female') {
        throw new Error('في شجرة النسب العربية، يكون الأصل الأعلى ذكراً');
      }
    }

    // Build ordered list of new intermediate/higher ancestors from direct father up to highest new ancestor
    // Always keep only the first name before بن/بنت for each added ancestor unless explicitly split
    const shouldSplit = fatherData.splitCompoundName === true;
    const rawChainInput: string[] =
      Array.isArray(fatherData.ancestorChain) && fatherData.ancestorChain.length > 0
        ? fatherData.ancestorChain
        : !fatherData.existingFatherId && fatherData.fullName?.trim()
        ? [fatherData.fullName.trim()]
        : [];

    const chainNames: string[] = [];
    for (const item of rawChainInput) {
      const trimmedItem = (item || '').trim();
      if (!trimmedItem) continue;
      if (shouldSplit && /\s+(?:بن|بنت|ابن)\s+/i.test(trimmedItem)) {
        const parts = splitLineageChain(trimmedItem);
        chainNames.push(...parts);
      } else {
        // Keep only the first name before بن/بنت
        chainNames.push(extractGivenName(trimmedItem) || trimmedItem);
      }
    }

    if (!existingTopAncestor && chainNames.length === 0) {
      throw new Error('يرجى تحديد الجد الأعلى أو إدخال اسم الأب / الجد');
    }

    const now = new Date().toISOString();
    const batch = writeBatch(db);

    // Determine the upper anchor above our chain
    let currentUpperFather: Person | null = null;
    if (existingTopAncestor) {
      currentUpperFather = existingTopAncestor;
    } else if (child.fatherId && fatherData.keepCurrentFatherAsTop !== false) {
      currentUpperFather = allPersons.find(p => p.id === child.fatherId) || null;
    }

    let highestCreatedAncestor: Person | null = null;
    const createdAncestors: Person[] = [];

    // Create the new ancestors from TOP (highest grandfather) down to BOTTOM (direct father of `child`)
    for (let i = chainNames.length - 1; i >= 0; i--) {
      const ancGivenName = extractGivenName(chainNames[i]) || chainNames[i];
      const ancFullName = currentUpperFather
        ? rebuildChildFullName(ancGivenName, 'male', currentUpperFather.fullName)
        : ancGivenName;

      const ancId = `p_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
      const newAncestor: Person = {
        id: ancId,
        fullName: ancFullName,
        gender: 'male',
        fatherId: currentUpperFather ? currentUpperFather.id : null,
        notes: i === chainNames.length - 1 ? (fatherData.notes?.trim() || '') : '',
        createdAt: now,
        updatedAt: now
      };

      batch.set(doc(db, 'persons', ancId), newAncestor);
      createdAncestors.push(newAncestor);
      if (!highestCreatedAncestor) {
        highestCreatedAncestor = newAncestor;
      }
      currentUpperFather = newAncestor;
    }

    const targetDirectFather = currentUpperFather!;
    const highestAncestor = existingTopAncestor || highestCreatedAncestor || targetDirectFather;

    // Keep the child's first name before بن/بنت and build the updated lineage name
    const shouldUpdateNames = fatherData.updateDescendantsNames !== false;
    const newChildName = shouldUpdateNames
      ? rebuildChildFullName(child.fullName, child.gender, targetDirectFather.fullName)
      : extractGivenName(child.fullName) || child.fullName.trim();

    const updatedChild: Person = {
      ...child,
      fullName: newChildName,
      fatherId: targetDirectFather.id,
      updatedAt: now
    };

    batch.update(doc(db, 'persons', personId), {
      fullName: newChildName,
      fatherId: targetDirectFather.id,
      updatedAt: now
    });

    // Cascade full lineage names to all children, grandchildren, and branches (كل ابن وفروعه)
    let updatedDescendantsCount = 0;
    if (shouldUpdateNames) {
      const updatedAllPersons = [
        ...allPersons.map(p => (p.id === personId ? updatedChild : p)),
        ...createdAncestors
      ];
      updatedDescendantsCount = cascadeSubtreeLineageUpdates(
        batch,
        updatedAllPersons,
        [{ id: personId, fullName: newChildName }],
        now
      );
    }

    await batch.commit();
    await this.addAuditLog(
      fatherData.actor || 'المشرف',
      'add_father',
      `نقل/ربط (${updatedChild.fullName}) وفروعه (${updatedDescendantsCount} فرع) إلى الجد/الأصل (${highestAncestor.fullName})`,
      highestAncestor.id,
      highestAncestor.fullName
    );

    return {
      father: targetDirectFather,
      highestAncestor,
      child: updatedChild,
      updatedDescendantsCount
    };
  },

  // Delete Person
  async deletePerson(id: string, actor: 'مستخدم' | 'المشرف' = 'مستخدم'): Promise<void> {
    const snap = await getDoc(doc(db, 'persons', id));
    if (!snap.exists()) throw new Error('الفرد غير موجود');
    const person = snap.data() as Person;

    const allPersonsSnap = await getDocs(collection(db, 'persons'));
    const batch = writeBatch(db);

    allPersonsSnap.forEach((d) => {
      const p = d.data() as Person;
      if (p.fatherId === id) {
        batch.update(doc(db, 'persons', p.id), {
          fatherId: person.fatherId || null,
          updatedAt: new Date().toISOString()
        });
      }
    });

    batch.delete(doc(db, 'persons', id));
    await batch.commit();

    await this.addAuditLog(actor, 'delete', `حذف الفرد: ${person.fullName}`, person.id, person.fullName);
  },

  // Merge Persons (with automatic cascading of lineage names to all merged branches)
  async mergePersons(sourceId: string, targetId: string, actor: 'مستخدم' | 'المشرف' = 'مستخدم'): Promise<{ movedCount: number; mergeOpId: string }> {
    const [sourceSnap, targetSnap] = await Promise.all([
      getDoc(doc(db, 'persons', sourceId)),
      getDoc(doc(db, 'persons', targetId))
    ]);

    if (!sourceSnap.exists() || !targetSnap.exists()) {
      throw new Error('أحد السجلين المحددين للدمج غير موجود');
    }

    const sourcePerson = sourceSnap.data() as Person;
    const targetPerson = targetSnap.data() as Person;

    if (sourcePerson.gender !== targetPerson.gender) {
      throw new Error('لا يمكن دمج سجلين لجنسين مختلفين');
    }

    const allPersonsSnap = await getDocs(collection(db, 'persons'));
    const allPersons = allPersonsSnap.docs.map(d => d.data() as Person);
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const movedIds: string[] = [];

    for (const p of allPersons) {
      if (p.fatherId === sourceId) {
        batch.update(doc(db, 'persons', p.id), {
          fatherId: targetId,
          updatedAt: now
        });
        movedIds.push(p.id);
      }
      if (p.husbandId === sourceId) {
        batch.update(doc(db, 'persons', p.id), {
          husbandId: targetId,
          husbandName: targetPerson.fullName,
          updatedAt: now
        });
      }
    }

    // If targetPerson has no fatherId but sourcePerson had a fatherId (not targetId), preserve upward lineage
    let effectiveTargetFullName = targetPerson.fullName;
    if (!targetPerson.fatherId && sourcePerson.fatherId && sourcePerson.fatherId !== targetId) {
      const sourceFather = allPersons.find(p => p.id === sourcePerson.fatherId);
      if (sourceFather) {
        effectiveTargetFullName = rebuildChildFullName(targetPerson.fullName, targetPerson.gender, sourceFather.fullName);
      }
      batch.update(doc(db, 'persons', targetId), {
        fatherId: sourcePerson.fatherId,
        fullName: effectiveTargetFullName,
        updatedAt: now
      });
    }

    // Cascade full lineage names to all children and descendants under targetId
    const simulatedPersons = allPersons
      .filter(p => p.id !== sourceId)
      .map(p => {
        if (p.id === targetId) {
          return { ...p, fullName: effectiveTargetFullName };
        }
        if (p.fatherId === sourceId) {
          return { ...p, fatherId: targetId };
        }
        return p;
      });

    cascadeSubtreeLineageUpdates(
      batch,
      simulatedPersons,
      [{ id: targetId, fullName: effectiveTargetFullName }],
      now
    );

    batch.delete(doc(db, 'persons', sourceId));

    const mergeOpId = `merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mergeOp: MergeOperation = {
      id: mergeOpId,
      sourcePersonId: sourcePerson.id,
      sourcePersonName: sourcePerson.fullName,
      targetPersonId: targetPerson.id,
      targetPersonName: effectiveTargetFullName,
      movedChildrenIds: movedIds,
      timestamp: now,
      details: `تم دمج ${sourcePerson.fullName} في ${effectiveTargetFullName} ونقل ${movedIds.length} فروع.`
    };

    batch.set(doc(db, 'merge_operations', mergeOpId), mergeOp);
    await batch.commit();

    await this.addAuditLog(actor, 'merge', `دمج (${sourcePerson.fullName}) في (${effectiveTargetFullName}) ونقل ${movedIds.length} فروع`, targetId, effectiveTargetFullName);

    return { movedCount: movedIds.length, mergeOpId };
  },

  // Settings & Passcode
  async toggleEditing(enabled: boolean): Promise<void> {
    const docRef = doc(db, 'settings', 'app_config');
    await updateDoc(docRef, {
      editingEnabled: enabled,
      updatedAt: new Date().toISOString()
    });
    await this.addAuditLog('المشرف', 'settings_change', enabled ? 'تفعيل وضع التعديل للجميع' : 'قفل التعديل للجميع');
  },

  async setAdminPasscode(newPasscode: string): Promise<void> {
    if (newPasscode.length < 4) throw new Error('الرمز يجب ألا يقل عن 4 خانات');
    const hash = await hashPasscode(newPasscode);
    const docRef = doc(db, 'settings', 'app_config');
    await updateDoc(docRef, {
      adminPasscodeHash: hash,
      updatedAt: new Date().toISOString()
    });
    await this.addAuditLog('المشرف', 'settings_change', 'تعيين رمز سري جديد للمشرف');
  },

  async verifyPasscode(passcode: string): Promise<boolean> {
    const snap = await getDoc(doc(db, 'settings', 'app_config'));
    if (!snap.exists()) return false;
    const data = snap.data();
    if (!data.adminPasscodeHash) return true;
    const inputHash = await hashPasscode(passcode);
    return inputHash === data.adminPasscodeHash;
  },

  // Change Requests
  async createChangeRequest(data: {
    type: 'correction' | 'merge_proposal' | 'addition';
    targetPersonId?: string;
    targetPersonName?: string;
    requesterName: string;
    requesterNotes: string;
  }): Promise<void> {
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const req: ChangeRequest = {
      id,
      type: data.type,
      targetPersonId: data.targetPersonId,
      targetPersonName: data.targetPersonName,
      proposedData: {},
      requesterName: data.requesterName.trim() || 'فرد من العائلة',
      requesterNotes: data.requesterNotes.trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'change_requests', id), req);
  },

  async resolveChangeRequest(id: string, decision: 'approved' | 'rejected'): Promise<void> {
    await updateDoc(doc(db, 'change_requests', id), {
      status: decision,
      resolvedAt: new Date().toISOString()
    });
    await this.addAuditLog('المشرف', 'request_approved', `${decision === 'approved' ? 'قبول' : 'رفض'} طلب التعديل`);
  },

  // Clear all data (Removes sample data and starts pristine clean)
  async clearAllData(): Promise<void> {
    const allPersons = await getDocs(collection(db, 'persons'));
    const batch = writeBatch(db);
    allPersons.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await this.addAuditLog('المشرف', 'delete', 'تفريغ كافة بيانات شجرة العائلة والبدء من الصفر');
  }
};
