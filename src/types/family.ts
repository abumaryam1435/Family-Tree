export type Gender = 'male' | 'female';

export interface Person {
  id: string;
  fullName: string;
  gender: Gender;
  fatherId: string | null;
  motherId?: string | null;
  husbandId?: string | null;
  husbandName?: string;
  excludedChildIds?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonWithRelations extends Person {
  children?: Person[];
  ancestors?: Person[];
}

export interface AppSettings {
  editingEnabled: boolean;
  hasAdminPasscode: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actor: 'مستخدم' | 'المشرف';
  actionType: string;
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
    otherPersonId?: string;
  };
  requesterName: string;
  requesterNotes: string;
  status: 'pending' | 'approved' | 'rejected';
  adminFeedback?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface FamilyTreeRoot {
  rootPerson: Person;
  totalMembers: number;
  maxGeneration: number;
  sonsCount: number;
  daughtersCount: number;
}
