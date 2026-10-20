export type Gender = 'male' | 'female';

export interface Person {
  id: string;
  fullName: string;
  gender: Gender;
  fatherId: string | null;
  husbandId?: string | null;
  husbandName?: string;
  notes?: string;
  birthYear?: string;
  isLiving?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  editingEnabled: boolean;
  hasAdminPasscode: boolean;
  adminPasscodeHash: string; // SHA-256 hash
  updatedAt: string;
}

export type ActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'add_father' 
  | 'merge' 
  | 'undo_merge' 
  | 'restore' 
  | 'settings_change'
  | 'request_approved';

export interface AuditLog {
  id: string;
  actor: 'مستخدم' | 'المشرف';
  actionType: ActionType;
  targetPersonId?: string;
  targetPersonName?: string;
  description: string;
  previousData?: unknown;
  newData?: unknown;
  timestamp: string;
}

export interface MergeOperation {
  id: string;
  sourcePersonId: string;
  sourcePersonName: string;
  targetPersonId: string;
  targetPersonName: string;
  movedChildrenIds: string[];
  sourcePersonBackup: Person;
  timestamp: string;
  details: string;
}

export interface ChangeRequest {
  id: string;
  type: 'correction' | 'merge_proposal' | 'addition';
  targetPersonId?: string;
  targetPersonName?: string;
  proposedData: {
    fullName?: string;
    gender?: Gender;
    fatherId?: string | null;
    notes?: string;
    birthYear?: string;
    otherPersonId?: string; // For merge proposal
  };
  requesterName: string;
  requesterNotes: string;
  status: 'pending' | 'approved' | 'rejected';
  adminFeedback?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface FamilyTreeDatabase {
  version: number;
  settings: AppSettings;
  persons: Person[];
  auditLogs: AuditLog[];
  mergeOperations: MergeOperation[];
  changeRequests: ChangeRequest[];
}
