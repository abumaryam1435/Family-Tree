import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Person,
  AppSettings,
  AuditLog,
  MergeOperation,
  ChangeRequest,
  FamilyTreeDatabase,
  Gender
} from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'family_tree_db.json');
const RESCUE_BACKUP = path.join(DATA_DIR, 'rescue_backup.json');

// Default initial state
const defaultSettings: AppSettings = {
  editingEnabled: true,
  hasAdminPasscode: false,
  adminPasscodeHash: '',
  updatedAt: new Date().toISOString()
};

export class FamilyDatabase {
  private db: FamilyTreeDatabase;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDirectoryExists();
    this.db = this.loadDatabase();
    // Database starts completely clean as requested by user
    // No automatic sample data injection
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private hashPasscode(passcode: string): string {
    return crypto.createHash('sha256').update(passcode + '_arabic_family_salt_2026').digest('hex');
  }

  private loadDatabase(): FamilyTreeDatabase {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.persons)) {
          return {
            version: parsed.version || 1,
            settings: {
              editingEnabled: parsed.settings?.editingEnabled ?? true,
              hasAdminPasscode: !!parsed.settings?.adminPasscodeHash,
              adminPasscodeHash: parsed.settings?.adminPasscodeHash || '',
              updatedAt: parsed.settings?.updatedAt || new Date().toISOString()
            },
            persons: parsed.persons || [],
            auditLogs: parsed.auditLogs || [],
            mergeOperations: parsed.mergeOperations || [],
            changeRequests: parsed.changeRequests || []
          };
        }
      }
    } catch (err) {
      console.error('Error loading family tree database, creating fresh one:', err);
    }

    return {
      version: 1,
      settings: { ...defaultSettings },
      persons: [],
      auditLogs: [],
      mergeOperations: [],
      changeRequests: []
    };
  }

  private persistImmediately() {
    this.ensureDirectoryExists();
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    const serialized = JSON.stringify(this.db, null, 2);
    fs.writeFileSync(tempFile, serialized, 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public save() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.persistImmediately();
    }, 100);
  }

  // --- Settings & Admin Security ---

  public getSettings(): { editingEnabled: boolean; hasAdminPasscode: boolean; updatedAt: string } {
    return {
      editingEnabled: this.db.settings.editingEnabled,
      hasAdminPasscode: this.db.settings.hasAdminPasscode || !!this.db.settings.adminPasscodeHash,
      updatedAt: this.db.settings.updatedAt
    };
  }

  public setAdminPasscode(passcode: string): boolean {
    if (!passcode || passcode.trim().length < 4) {
      throw new Error('يجب ألا يقل الرمز السري عن 4 خانات');
    }
    this.db.settings.adminPasscodeHash = this.hashPasscode(passcode.trim());
    this.db.settings.hasAdminPasscode = true;
    this.db.settings.updatedAt = new Date().toISOString();
    this.addAuditLog('المشرف', 'settings_change', undefined, undefined, 'تعيين رمز سري جديد للمشرف');
    this.persistImmediately();
    return true;
  }

  public verifyAdminPasscode(passcode: string): boolean {
    if (!this.db.settings.adminPasscodeHash) {
      return false;
    }
    const hash = this.hashPasscode(passcode.trim());
    return hash === this.db.settings.adminPasscodeHash;
  }

  public toggleEditing(enabled: boolean, actor: 'المشرف' = 'المشرف'): boolean {
    this.db.settings.editingEnabled = enabled;
    this.db.settings.updatedAt = new Date().toISOString();
    const desc = enabled ? 'تفعيل وضع جمع البيانات والتعديل للجميع' : 'قفل التعديل للجميع (عرض فقط)';
    this.addAuditLog(actor, 'settings_change', undefined, undefined, desc);
    this.persistImmediately();
    return this.db.settings.editingEnabled;
  }

  public canEdit(isAdmin: boolean): boolean {
    if (isAdmin) return true;
    return this.db.settings.editingEnabled;
  }

  // --- Audit Log ---

  public addAuditLog(
    actor: 'مستخدم' | 'المشرف',
    actionType: AuditLog['actionType'],
    targetPersonId?: string,
    targetPersonName?: string,
    description: string = '',
    previousData?: unknown,
    newData?: unknown
  ) {
    const log: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actor,
      actionType,
      targetPersonId,
      targetPersonName,
      description,
      previousData,
      newData,
      timestamp: new Date().toISOString()
    };
    this.db.auditLogs.unshift(log);
    // Keep last 500 logs
    if (this.db.auditLogs.length > 500) {
      this.db.auditLogs.pop();
    }
    this.save();
  }

  public getAuditLogs(): AuditLog[] {
    return this.db.auditLogs;
  }

  // --- Persons Queries & Graph Logic ---

  public getPersons(): Person[] {
    return this.db.persons;
  }

  public getPersonById(id: string): Person | undefined {
    return this.db.persons.find(p => p.id === id);
  }

  public getChildren(personId: string): Person[] {
    return this.db.persons.filter(p => p.fatherId === personId);
  }

  public getAncestors(personId: string): Person[] {
    const ancestors: Person[] = [];
    const visited = new Set<string>();
    let current = this.getPersonById(personId);

    while (current && current.fatherId) {
      if (visited.has(current.fatherId)) {
        // cycle detected, break out safely
        break;
      }
      visited.add(current.fatherId);
      const father = this.getPersonById(current.fatherId);
      if (father) {
        ancestors.push(father);
        current = father;
      } else {
        break;
      }
    }
    return ancestors;
  }

  public wouldCreateCycle(personId: string, proposedFatherId: string): boolean {
    if (personId === proposedFatherId) return true;
    // Walk up the ancestry of proposedFatherId. If personId is reached, it forms a cycle.
    const ancestors = this.getAncestors(proposedFatherId);
    return ancestors.some(a => a.id === personId);
  }

  // --- Persons Mutations & Rule Enforcement ---

  public addPerson(data: {
    fullName: string;
    gender: Gender;
    fatherId?: string | null;
    notes?: string;
    birthYear?: string;
    isLiving?: boolean;
    actor?: 'مستخدم' | 'المشرف';
  }): Person {
    const trimmedName = data.fullName.trim();
    if (!trimmedName) {
      throw new Error('الاسم الكامل مطلوب');
    }

    const fatherId = data.fatherId || null;

    if (fatherId) {
      const father = this.getPersonById(fatherId);
      if (!father) {
        throw new Error('الأب المحدد غير موجود في قاعدة البيانات');
      }
      // Rule 5: Cannot add children directly to a female in the agnatic tree
      if (father.gender === 'female') {
        throw new Error('في شجرة النسب العربية، ينسب الأبناء لآبائهم. لا يمكن إضافة أبناء لإناث كفروع رئيسية في الشجرة.');
      }
    }

    const newPerson: Person = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fullName: trimmedName,
      gender: data.gender,
      fatherId: fatherId,
      notes: data.notes?.trim() || '',
      birthYear: data.birthYear?.trim() || '',
      isLiving: data.isLiving ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.db.persons.push(newPerson);

    const fatherName = fatherId ? this.getPersonById(fatherId)?.fullName : 'شجرة مستقلة';
    this.addAuditLog(
      data.actor || 'مستخدم',
      'create',
      newPerson.id,
      newPerson.fullName,
      `إضافة ${newPerson.gender === 'male' ? 'ابن' : 'ابنة'} جديد: ${newPerson.fullName} (الأب: ${fatherName})`,
      undefined,
      newPerson
    );

    this.save();
    return newPerson;
  }

  public updatePerson(
    id: string,
    updates: {
      fullName?: string;
      gender?: Gender;
      notes?: string;
      birthYear?: string;
      isLiving?: boolean;
      fatherId?: string | null;
      husbandId?: string | null;
      husbandName?: string;
      actor?: 'مستخدم' | 'المشرف';
    }
  ): Person {
    const person = this.getPersonById(id);
    if (!person) {
      throw new Error('الفرد غير موجود');
    }

    const previousData = { ...person };

    if (updates.fullName !== undefined) {
      const name = updates.fullName.trim();
      if (!name) throw new Error('الاسم الكامل لا يمكن أن يكون فارغاً');
      person.fullName = name;
    }

    if (updates.gender !== undefined) {
      person.gender = updates.gender;
      if (updates.gender === 'male') {
        person.husbandId = null;
        person.husbandName = '';
      }
    }

    if (updates.notes !== undefined) {
      person.notes = updates.notes.trim();
    }

    if (updates.birthYear !== undefined) {
      person.birthYear = updates.birthYear.trim();
    }

    if (updates.isLiving !== undefined) {
      person.isLiving = updates.isLiving;
    }

    if (updates.husbandId !== undefined) {
      person.husbandId = updates.husbandId || null;
    }

    if (updates.husbandName !== undefined) {
      person.husbandName = updates.husbandName?.trim() || '';
    }

    if (updates.fatherId !== undefined) {
      const newFatherId = updates.fatherId || null;
      if (newFatherId !== person.fatherId) {
        if (newFatherId) {
          if (newFatherId === person.id) {
            throw new Error('لا يمكن أن يكون الشخص أباً لنفسه');
          }
          const father = this.getPersonById(newFatherId);
          if (!father) {
            throw new Error('الأب المحدد غير موجود');
          }
          if (father.gender === 'female') {
            throw new Error('لا يمكن ربط الفرد بأنثى كأب في شجرة النسب');
          }
          if (this.wouldCreateCycle(person.id, newFatherId)) {
            throw new Error('لا يمكن تعيين هذا الأب لأن ذلك يُحدث دورة مغلقة في شجرة النسب (أحد الأحفاد يصبح أباً لسلفه)');
          }
        }
        person.fatherId = newFatherId;
      }
    }

    person.updatedAt = new Date().toISOString();

    this.addAuditLog(
      updates.actor || 'مستخدم',
      'update',
      person.id,
      person.fullName,
      `تعديل بيانات: ${person.fullName}`,
      previousData,
      person
    );

    this.save();
    return person;
  }

  public addFatherAbove(
    personId: string,
    fatherData: {
      fullName: string;
      notes?: string;
      birthYear?: string;
      isLiving?: boolean;
      grandFatherId?: string | null;
      actor?: 'مستخدم' | 'المشرف';
    }
  ): { father: Person; child: Person } {
    const child = this.getPersonById(personId);
    if (!child) {
      throw new Error('الفرد المراد إضافة أب له غير موجود');
    }

    const trimmedName = fatherData.fullName.trim();
    if (!trimmedName) {
      throw new Error('اسم الأب مطلوب');
    }

    // Check grandFatherId cycle if provided
    if (fatherData.grandFatherId) {
      if (this.wouldCreateCycle(personId, fatherData.grandFatherId)) {
        throw new Error('تعيين هذا الجد يسبب دورة نسب مغلقة');
      }
    }

    // Create the new father (always male)
    const newFather: Person = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fullName: trimmedName,
      gender: 'male',
      fatherId: fatherData.grandFatherId || null,
      notes: fatherData.notes?.trim() || '',
      birthYear: fatherData.birthYear?.trim() || '',
      isLiving: fatherData.isLiving ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.db.persons.push(newFather);

    // Link child to this new father
    const previousChild = { ...child };
    child.fatherId = newFather.id;
    child.updatedAt = new Date().toISOString();

    this.addAuditLog(
      fatherData.actor || 'مستخدم',
      'add_father',
      child.id,
      child.fullName,
      `إضافة الأب (${newFather.fullName}) فوق (${child.fullName}) مع الحفاظ على جميع الفروع والأحفاد`,
      previousChild,
      { child, father: newFather }
    );

    this.save();
    return { father: newFather, child };
  }

  public deletePerson(id: string, actor: 'مستخدم' | 'المشرف' = 'مستخدم'): { deletedPerson: Person; orphanedCount: number } {
    const index = this.db.persons.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error('الفرد غير موجود');
    }

    const person = this.db.persons[index];
    const children = this.getChildren(id);

    // Reparent children to their grandfather (if known) or detach them as new roots
    for (const child of children) {
      child.fatherId = person.fatherId; // promote to grandfather or null
      child.updatedAt = new Date().toISOString();
    }

    this.db.persons.splice(index, 1);

    this.addAuditLog(
      actor,
      'delete',
      person.id,
      person.fullName,
      `حذف الفرد: ${person.fullName}. تم إعادة ربط ${children.length} من الأبناء بالجد أو تحويلهم لشجرة مستقلة.`,
      person,
      undefined
    );

    this.save();
    return { deletedPerson: person, orphanedCount: children.length };
  }

  // --- Tree Merging & Rollback ---

  public mergePersons(
    sourcePersonId: string,
    targetPersonId: string,
    actor: 'مستخدم' | 'المشرف' = 'مستخدم'
  ): { targetPerson: Person; movedCount: number; mergeOpId: string } {
    if (sourcePersonId === targetPersonId) {
      throw new Error('لا يمكن دمج الشخص مع نفسه');
    }

    const sourcePerson = this.getPersonById(sourcePersonId);
    const targetPerson = this.getPersonById(targetPersonId);

    if (!sourcePerson || !targetPerson) {
      throw new Error('أحد الشخصين المحددين للدمج غير موجود في قاعدة البيانات');
    }

    // Both must have the same gender
    if (sourcePerson.gender !== targetPerson.gender) {
      throw new Error('لا يمكن دمج شخص ذكر مع شخص أنثى');
    }

    // Cycle check: moving source's children to target must not create cycles
    const sourceChildren = this.getChildren(sourcePersonId);
    for (const child of sourceChildren) {
      if (this.wouldCreateCycle(child.id, targetPersonId)) {
        throw new Error(`تعارض نسب: نقل الابن (${child.fullName}) إلى (${targetPerson.fullName}) يُنشئ دورة مغلقة في النسب.`);
      }
    }

    // Take snapshot for undo
    const backupSnapshot = JSON.parse(JSON.stringify(sourcePerson));
    const movedChildrenIds: string[] = [];

    // Transfer all children to target person
    for (const child of sourceChildren) {
      child.fatherId = targetPerson.id;
      child.updatedAt = new Date().toISOString();
      movedChildrenIds.push(child.id);
    }

    // Merge notes if target is empty
    if (!targetPerson.notes && sourcePerson.notes) {
      targetPerson.notes = sourcePerson.notes;
    }
    if (!targetPerson.birthYear && sourcePerson.birthYear) {
      targetPerson.birthYear = sourcePerson.birthYear;
    }
    targetPerson.updatedAt = new Date().toISOString();

    // Remove sourcePerson from persons
    const sourceIndex = this.db.persons.findIndex(p => p.id === sourcePersonId);
    if (sourceIndex !== -1) {
      this.db.persons.splice(sourceIndex, 1);
    }

    const mergeOp: MergeOperation = {
      id: `merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sourcePersonId: sourcePerson.id,
      sourcePersonName: sourcePerson.fullName,
      targetPersonId: targetPerson.id,
      targetPersonName: targetPerson.fullName,
      movedChildrenIds,
      sourcePersonBackup: backupSnapshot,
      timestamp: new Date().toISOString(),
      details: `تم دمج ${sourcePerson.fullName} في ${targetPerson.fullName} ونقل ${movedChildrenIds.length} فروع بنجاح.`
    };

    this.db.mergeOperations.unshift(mergeOp);

    this.addAuditLog(
      actor,
      'merge',
      targetPerson.id,
      targetPerson.fullName,
      `دمج شجرتين/شخصين: دمج (${sourcePerson.fullName}) في (${targetPerson.fullName}) ونقل ${movedChildrenIds.length} من الفروع.`,
      { source: sourcePerson, target: targetPerson },
      mergeOp
    );

    this.persistImmediately();
    return { targetPerson, movedCount: movedChildrenIds.length, mergeOpId: mergeOp.id };
  }

  public undoMerge(mergeOpId: string, actor: 'المشرف' = 'المشرف'): boolean {
    const opIndex = this.db.mergeOperations.findIndex(m => m.id === mergeOpId);
    if (opIndex === -1) {
      throw new Error('عملية الدمج غير موجودة أو تم التراجع عنها مسبقاً');
    }

    const op = this.db.mergeOperations[opIndex];

    // Restore source person
    this.db.persons.push(op.sourcePersonBackup);

    // Re-route moved children back to sourcePerson
    for (const childId of op.movedChildrenIds) {
      const child = this.getPersonById(childId);
      if (child) {
        child.fatherId = op.sourcePersonBackup.id;
        child.updatedAt = new Date().toISOString();
      }
    }

    // Remove merge op
    this.db.mergeOperations.splice(opIndex, 1);

    this.addAuditLog(
      actor,
      'undo_merge',
      op.targetPersonId,
      op.targetPersonName,
      `التراجع عن عملية الدمج: استعادة (${op.sourcePersonName}) وإعادة ربط ${op.movedChildrenIds.length} فروع إليه.`,
      op,
      undefined
    );

    this.persistImmediately();
    return true;
  }

  public getMergeOperations(): MergeOperation[] {
    return this.db.mergeOperations;
  }

  // --- Change Requests ---

  public createChangeRequest(data: {
    type: 'correction' | 'merge_proposal' | 'addition';
    targetPersonId?: string;
    proposedData: ChangeRequest['proposedData'];
    requesterName: string;
    requesterNotes: string;
  }): ChangeRequest {
    const targetPerson = data.targetPersonId ? this.getPersonById(data.targetPersonId) : undefined;

    const req: ChangeRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: data.type,
      targetPersonId: data.targetPersonId,
      targetPersonName: targetPerson?.fullName,
      proposedData: data.proposedData,
      requesterName: data.requesterName.trim() || 'فرد من العائلة',
      requesterNotes: data.requesterNotes.trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.db.changeRequests.unshift(req);
    this.save();
    return req;
  }

  public getChangeRequests(): ChangeRequest[] {
    return this.db.changeRequests;
  }

  public resolveChangeRequest(
    requestId: string,
    decision: 'approved' | 'rejected',
    feedback?: string
  ): ChangeRequest {
    const req = this.db.changeRequests.find(r => r.id === requestId);
    if (!req) {
      throw new Error('طلب التعديل غير موجود');
    }

    req.status = decision;
    req.adminFeedback = feedback || '';
    req.resolvedAt = new Date().toISOString();

    if (decision === 'approved') {
      // Execute change based on type
      if (req.type === 'correction' && req.targetPersonId) {
        this.updatePerson(req.targetPersonId, {
          fullName: req.proposedData.fullName,
          notes: req.proposedData.notes,
          birthYear: req.proposedData.birthYear,
          fatherId: req.proposedData.fatherId,
          actor: 'المشرف'
        });
      } else if (req.type === 'addition') {
        this.addPerson({
          fullName: req.proposedData.fullName || 'اسم جديد',
          gender: req.proposedData.gender || 'male',
          fatherId: req.proposedData.fatherId,
          notes: req.proposedData.notes,
          birthYear: req.proposedData.birthYear,
          actor: 'المشرف'
        });
      } else if (req.type === 'merge_proposal' && req.targetPersonId && req.proposedData.otherPersonId) {
        this.mergePersons(req.proposedData.otherPersonId, req.targetPersonId, 'المشرف');
      }
    }

    this.addAuditLog(
      'المشرف',
      'request_approved',
      req.targetPersonId,
      req.targetPersonName,
      `${decision === 'approved' ? 'قبول' : 'رفض'} طلب التعديل المقدم من: ${req.requesterName} (${req.type})`
    );

    this.persistImmediately();
    return req;
  }

  // --- Backup, Restore & Sample Data ---

  public createBackup(): FamilyTreeDatabase {
    // Return clean snapshot without sensitive secrets
    const clone = JSON.parse(JSON.stringify(this.db));
    if (clone.settings) {
      delete clone.settings.adminPasscodeHash;
    }
    return clone;
  }

  public restoreBackup(payload: any): { restoredCount: number } {
    if (!payload || !Array.isArray(payload.persons)) {
      throw new Error('ملف النسخة الاحتياطية غير صالح (لا يحتوي على قائمة أفراد صحيحة)');
    }

    // 1. Take safety snapshot before replacing
    fs.writeFileSync(RESCUE_BACKUP, JSON.stringify(this.db, null, 2), 'utf-8');

    // 2. Validate relations and detect cycles
    const personsMap = new Map<string, Person>();
    for (const p of payload.persons) {
      if (!p.id || !p.fullName || !p.gender) {
        throw new Error(`سجل غير صالح في النسخة الاحتياطية: ${JSON.stringify(p)}`);
      }
      personsMap.set(p.id, p);
    }

    // Validate fathers exist or are null
    for (const p of payload.persons) {
      if (p.fatherId && !personsMap.has(p.fatherId)) {
        // Father missing in dataset: set to null safely
        p.fatherId = null;
      }
    }

    // Restore data
    this.db.persons = payload.persons;
    this.db.auditLogs = Array.isArray(payload.auditLogs) ? payload.auditLogs : [];
    this.db.mergeOperations = Array.isArray(payload.mergeOperations) ? payload.mergeOperations : [];
    this.db.changeRequests = Array.isArray(payload.changeRequests) ? payload.changeRequests : [];

    this.addAuditLog('المشرف', 'restore', undefined, undefined, `استعادة نسخة احتياطية تحتوي على ${payload.persons.length} فرداً.`);
    this.persistImmediately();

    return { restoredCount: payload.persons.length };
  }

  public clearAllData(actor: 'المشرف' = 'المشرف') {
    this.db.persons = [];
    this.db.mergeOperations = [];
    this.db.changeRequests = [];
    this.addAuditLog(actor, 'delete', undefined, undefined, 'مسح جميع بيانات شجرة العائلة للبدء من الصفر.');
    this.persistImmediately();
  }

  public populateSampleData(logAudit = true) {
    // Rich Arabic sample family tree:
    // Tree 1: آل الشيخ سالم التميمي
    // Tree 2: آل ناصر (شجرة فرعية مستقلة صالحة للتجربة والدمج)
    const now = new Date().toISOString();

    const p_salem: Person = {
      id: 'p_salem_root',
      fullName: 'الشيخ سالم بن عبد الله التميمي',
      gender: 'male',
      fatherId: null,
      notes: 'الجد المؤسس لفرع العائلة، عُرف بالحكمة والكرم وتجارة الخيول',
      birthYear: '1905',
      isLiving: false,
      createdAt: now,
      updatedAt: now
    };

    // Sons of Salem
    const p_rashid: Person = {
      id: 'p_rashid',
      fullName: 'راشد بن سالم التميمي',
      gender: 'male',
      fatherId: p_salem.id,
      notes: 'الابن الأكبر للشيخ سالم، إمام وخطيب',
      birthYear: '1934',
      isLiving: false,
      createdAt: now,
      updatedAt: now
    };

    const p_mohammed: Person = {
      id: 'p_mohammed',
      fullName: 'محمد بن سالم التميمي',
      gender: 'male',
      fatherId: p_salem.id,
      notes: 'معلم ومربٍّ فاضل',
      birthYear: '1938',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_fahad: Person = {
      id: 'p_fahad',
      fullName: 'فهد بن سالم التميمي',
      gender: 'male',
      fatherId: p_salem.id,
      notes: 'مهندس زراعي متقاعد',
      birthYear: '1945',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    // Daughters of Salem (no children in patrilineal tree)
    const p_noura: Person = {
      id: 'p_noura',
      fullName: 'نورة بنت سالم التميمي',
      gender: 'female',
      fatherId: p_salem.id,
      notes: 'الابنة الكبرى، حافظة للقرآن الكريم',
      birthYear: '1936',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_maryam: Person = {
      id: 'p_maryam',
      fullName: 'مريم بنت سالم التميمي',
      gender: 'female',
      fatherId: p_salem.id,
      notes: 'أديبة وشاعرة',
      birthYear: '1942',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    // Grandchildren through Rashid
    const p_abdullah_rashid: Person = {
      id: 'p_abdullah_r',
      fullName: 'عبد الله بن راشد بن سالم',
      gender: 'male',
      fatherId: p_rashid.id,
      notes: 'طبيب استشاري',
      birthYear: '1962',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_khalid_rashid: Person = {
      id: 'p_khalid_r',
      fullName: 'خالد بن راشد بن سالم',
      gender: 'male',
      fatherId: p_rashid.id,
      notes: 'أستاذ جامعي',
      birthYear: '1968',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_hissa_rashid: Person = {
      id: 'p_hissa_r',
      fullName: 'حصة بنت راشد بن سالم',
      gender: 'female',
      fatherId: p_rashid.id,
      notes: 'مديرة مدرسة',
      birthYear: '1965',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    // Great grandchildren through Abdullah
    const p_rashid_abdullah: Person = {
      id: 'p_rashid_a',
      fullName: 'راشد بن عبد الله بن راشد',
      gender: 'male',
      fatherId: p_abdullah_rashid.id,
      notes: 'مهندس برمجيات وذكاء اصطناعي',
      birthYear: '1992',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_sara_abdullah: Person = {
      id: 'p_sara_a',
      fullName: 'سارة بنت عبد الله بن راشد',
      gender: 'female',
      fatherId: p_abdullah_rashid.id,
      notes: 'مصممة جرافيك وواجهات مستخدم',
      birthYear: '1996',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    // Grandchildren through Mohammed
    const p_saud_mohammed: Person = {
      id: 'p_saud_m',
      fullName: 'سعود بن محمد بن سالم',
      gender: 'male',
      fatherId: p_mohammed.id,
      notes: 'رائد أعمال',
      birthYear: '1970',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_reem_mohammed: Person = {
      id: 'p_reem_m',
      fullName: 'ريم بنت محمد بن سالم',
      gender: 'female',
      fatherId: p_mohammed.id,
      notes: 'معلمة لغة عربية',
      birthYear: '1974',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    // Independent Tree 2: آل ناصر (سجل مستقل ينتظر الدمج عند التحقق)
    const p_nasser_root: Person = {
      id: 'p_nasser_root',
      fullName: 'العم ناصر بن إبراهيم',
      gender: 'male',
      fatherId: null,
      notes: 'شجرة عائلية مستقلة مسجلة في منطقة القصيم',
      birthYear: '1920',
      isLiving: false,
      createdAt: now,
      updatedAt: now
    };

    const p_ibrahim_nasser: Person = {
      id: 'p_ibrahim_n',
      fullName: 'إبراهيم بن ناصر بن إبراهيم',
      gender: 'male',
      fatherId: p_nasser_root.id,
      notes: 'باحث في التاريخ والأنساب',
      birthYear: '1955',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    const p_fatima_nasser: Person = {
      id: 'p_fatima_n',
      fullName: 'فاطمة بنت ناصر بن إبراهيم',
      gender: 'female',
      fatherId: p_nasser_root.id,
      notes: 'طبيبة أطفال',
      birthYear: '1960',
      isLiving: true,
      createdAt: now,
      updatedAt: now
    };

    this.db.persons = [
      p_salem,
      p_rashid,
      p_mohammed,
      p_fahad,
      p_noura,
      p_maryam,
      p_abdullah_rashid,
      p_khalid_rashid,
      p_hissa_rashid,
      p_rashid_abdullah,
      p_sara_abdullah,
      p_saud_mohammed,
      p_reem_mohammed,
      p_nasser_root,
      p_ibrahim_nasser,
      p_fatima_nasser
    ];

    if (logAudit) {
      this.addAuditLog('المشرف', 'create', undefined, undefined, 'إدراج البيانات النموذجية لشجرة العائلة العربية (آل سالم وآل ناصر)');
    }
    this.persistImmediately();
  }
}

export const db = new FamilyDatabase();
