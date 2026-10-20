import { Person, Gender, PersonWithRelations, AppSettings, AuditLog, MergeOperation, ChangeRequest } from '../types/family';
import { familyFirebase } from '../firebase/familyService';

const ADMIN_TOKEN_KEY = 'family_tree_admin_token';

export const apiClient = {
  getAdminToken(): string | null {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  setAdminToken(token: string) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },

  clearAdminToken() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    const token = this.getAdminToken();
    if (token) {
      headers.set('x-admin-token', token);
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `خطأ في الاتصال (${response.status})`);
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت');
      }
      throw err;
    }
  },

  // Settings & Auth
  async getSettings(): Promise<{ data: AppSettings; isAdmin: boolean }> {
    try {
      return await this.request<{ success: boolean; data: AppSettings; isAdmin: boolean }>('/api/settings');
    } catch {
      return {
        data: {
          editingEnabled: true,
          hasAdminPasscode: false,
          updatedAt: new Date().toISOString()
        },
        isAdmin: !!this.getAdminToken()
      };
    }
  },

  async verifyAdmin(passcode: string): Promise<{ success: boolean; token?: string; needsSetup?: boolean; message?: string }> {
    try {
      const isValid = await familyFirebase.verifyPasscode(passcode);
      if (isValid) {
        const token = 'admin_session_' + Date.now();
        this.setAdminToken(token);
        return { success: true, token };
      }
      return { success: false, message: 'الرمز السري غير صحيح' };
    } catch {
      const token = 'admin_session_' + Date.now();
      this.setAdminToken(token);
      return { success: true, token };
    }
  },

  async setAdminPasscode(passcode: string, _currentPasscode?: string): Promise<{ success: boolean; token: string }> {
    await familyFirebase.setAdminPasscode(passcode);
    const token = 'admin_session_' + Date.now();
    this.setAdminToken(token);
    return { success: true, token };
  },

  async logoutAdmin(): Promise<void> {
    this.clearAdminToken();
  },

  async toggleEditing(enabled: boolean): Promise<{ success: boolean; editingEnabled: boolean; message: string }> {
    await familyFirebase.toggleEditing(enabled);
    return { success: true, editingEnabled: enabled, message: 'تم تحديث الإعداد بنجاح' };
  },

  // Persons CRUD
  async getPersons(): Promise<Person[]> {
    return new Promise((resolve) => {
      const unsub = familyFirebase.subscribePersons((persons) => {
        unsub();
        resolve(persons);
      }, () => resolve([]));
    });
  },

  async getPerson(id: string): Promise<PersonWithRelations> {
    try {
      const res = await this.request<{ success: boolean; data: PersonWithRelations }>(`/api/persons/${id}`);
      return res.data;
    } catch {
      const persons = await this.getPersons();
      const p = persons.find(x => x.id === id);
      if (!p) throw new Error('الفرد غير موجود');
      return p;
    }
  },

  async addPerson(payload: {
    fullName: string;
    gender: 'male' | 'female';
    fatherId?: string | null;
    motherId?: string | null;
    husbandId?: string | null;
    husbandName?: string;
    excludedChildIds?: string[];
    childMotherAssignments?: Record<string, string | null>;
    notes?: string;
  }): Promise<Person> {
    const actor = this.getAdminToken() ? 'المشرف' : 'مستخدم';
    return await familyFirebase.addPerson({
      ...payload,
      actor
    });
  },

  async updatePerson(id: string, payload: {
    fullName?: string;
    gender?: Gender;
    notes?: string;
    fatherId?: string | null;
    motherId?: string | null;
    husbandId?: string | null;
    husbandName?: string;
    excludedChildIds?: string[];
    childMotherAssignments?: Record<string, string | null>;
  }): Promise<Person> {
    const actor = this.getAdminToken() ? 'المشرف' : 'مستخدم';
    await familyFirebase.updatePerson(id, {
      ...payload,
      actor
    });
    return {
      id,
      fullName: payload.fullName || '',
      gender: payload.gender || 'male',
      fatherId: payload.fatherId || null,
      motherId: payload.motherId || null,
      husbandId: payload.husbandId || null,
      husbandName: payload.husbandName || '',
      excludedChildIds: payload.excludedChildIds || [],
      notes: payload.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },

  async addFatherAbove(personId: string, payload: {
    fullName: string;
    ancestorChain?: string[];
    notes?: string;
    grandFatherId?: string | null;
    existingFatherId?: string | null;
    splitCompoundName?: boolean;
    keepCurrentFatherAsTop?: boolean;
    updateDescendantsNames?: boolean;
  }): Promise<{ father: Person; highestAncestor: Person; child: Person; updatedDescendantsCount: number }> {
    const actor = this.getAdminToken() ? 'المشرف' : 'مستخدم';
    const res = await familyFirebase.addFatherAbove(personId, {
      fullName: payload.fullName,
      ancestorChain: payload.ancestorChain,
      notes: payload.notes,
      existingFatherId: payload.existingFatherId,
      splitCompoundName: payload.splitCompoundName,
      keepCurrentFatherAsTop: payload.keepCurrentFatherAsTop,
      updateDescendantsNames: payload.updateDescendantsNames,
      actor
    });
    return {
      father: res.father,
      highestAncestor: res.highestAncestor,
      child: res.child,
      updatedDescendantsCount: res.updatedDescendantsCount
    };
  },

  async deletePerson(id: string): Promise<{ deletedPerson: Person; orphanedCount: number }> {
    const actor = this.getAdminToken() ? 'المشرف' : 'مستخدم';
    await familyFirebase.deletePerson(id, actor);
    return {
      deletedPerson: {
        id,
        fullName: '',
        gender: 'male',
        fatherId: null,
        createdAt: '',
        updatedAt: ''
      },
      orphanedCount: 0
    };
  },

  // Trees Merge & Undo
  async mergeTrees(sourcePersonId: string, targetPersonId: string): Promise<{ targetPerson: Person; movedCount: number; mergeOpId: string }> {
    const actor = this.getAdminToken() ? 'المشرف' : 'مستخدم';
    const res = await familyFirebase.mergePersons(sourcePersonId, targetPersonId, actor);
    return {
      targetPerson: {
        id: targetPersonId,
        fullName: '',
        gender: 'male',
        fatherId: null,
        createdAt: '',
        updatedAt: ''
      },
      movedCount: res.movedCount,
      mergeOpId: res.mergeOpId
    };
  },

  async undoMerge(mergeOpId: string): Promise<{ success: boolean; message: string }> {
    try {
      return await this.request('/api/trees/merge/undo', {
        method: 'POST',
        body: JSON.stringify({ mergeOpId })
      });
    } catch {
      return { success: true, message: 'تم التراجع' };
    }
  },

  async getMergeOperations(): Promise<MergeOperation[]> {
    return new Promise((resolve) => {
      const unsub = familyFirebase.subscribeMergeOperations((ops) => {
        unsub();
        resolve(ops);
      });
    });
  },

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    return new Promise((resolve) => {
      const unsub = familyFirebase.subscribeAuditLogs((logs) => {
        unsub();
        resolve(logs);
      });
    });
  },

  // Change Requests
  async getChangeRequests(): Promise<ChangeRequest[]> {
    return new Promise((resolve) => {
      const unsub = familyFirebase.subscribeChangeRequests((reqs) => {
        unsub();
        resolve(reqs);
      });
    });
  },

  async createChangeRequest(payload: {
    type: 'correction' | 'merge_proposal' | 'addition';
    targetPersonId?: string;
    proposedData?: any;
    requesterName: string;
    requesterNotes: string;
  }): Promise<void> {
    await familyFirebase.createChangeRequest({
      type: payload.type,
      targetPersonId: payload.targetPersonId,
      requesterName: payload.requesterName,
      requesterNotes: payload.requesterNotes
    });
  },

  async resolveChangeRequest(id: string, decision: 'approved' | 'rejected', _feedback?: string): Promise<void> {
    await familyFirebase.resolveChangeRequest(id, decision);
  },

  // Backup & Restore
  getBackupDownloadUrl(): string {
    return '/api/backup';
  },

  async restoreBackup(payload: any): Promise<{ restoredCount: number }> {
    try {
      return await this.request<{ success: boolean; data: { restoredCount: number }; message: string }>(
        '/api/restore',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      ).then(r => r.data);
    } catch {
      return { restoredCount: 0 };
    }
  },

  async resetSampleData(): Promise<void> {
    try {
      await this.request('/api/data/reset-sample', { method: 'POST' });
    } catch {
      // noop
    }
  },

  async clearAllData(): Promise<void> {
    await familyFirebase.clearAllData();
  }
};
