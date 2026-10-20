import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db';

export const apiRouter = Router();

// In-memory admin tokens for active sessions
const activeAdminTokens = new Set<string>();

function generateToken(): string {
  return 'adm_' + crypto.randomBytes(24).toString('hex');
}

// Middleware to extract admin state
export function getIsAdmin(req: Request): boolean {
  const token = req.headers['x-admin-token'] as string;
  if (token && activeAdminTokens.has(token)) {
    return true;
  }
  return false;
}

// Security middleware enforcing editing lock on mutations
function enforceCanEdit(req: Request, res: Response, next: NextFunction) {
  const isAdmin = getIsAdmin(req);
  if (!db.canEdit(isAdmin)) {
    return res.status(403).json({
      success: false,
      error: 'عذراً، وضع التعديل مقفل حالياً من قِبل المشرف. يمكنك استعراض وبحث الشجرة فقط.'
    });
  }
  next();
}

// Security middleware requiring admin authentication
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!getIsAdmin(req)) {
    return res.status(401).json({
      success: false,
      error: 'غير مصرح: هذه العملية تتطلب تسجيل دخول المشرف بالرمز السري'
    });
  }
  next();
}

// --- Settings & Auth Routes ---

apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getSettings(),
    isAdmin: getIsAdmin(req)
  });
});

apiRouter.post('/admin/set-passcode', (req: Request, res: Response) => {
  try {
    const { passcode, currentPasscode } = req.body;
    const settings = db.getSettings();

    if (settings.hasAdminPasscode) {
      if (!currentPasscode || !db.verifyAdminPasscode(currentPasscode)) {
        return res.status(400).json({ success: false, error: 'الرمز السري الحالي غير صحيح' });
      }
    }

    db.setAdminPasscode(passcode);
    const token = generateToken();
    activeAdminTokens.add(token);

    res.json({
      success: true,
      message: 'تم تعيين الرمز السري بنجاح',
      token,
      settings: db.getSettings()
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/admin/verify', (req: Request, res: Response) => {
  try {
    const { passcode } = req.body;
    const settings = db.getSettings();

    // If no passcode has been configured yet, allow the user to open settings to configure one
    if (!settings.hasAdminPasscode) {
      return res.json({
        success: true,
        needsSetup: true,
        message: 'لم يتم تعيين رمز سري بعد، يرجى تعيين الرمز السري للمشرف'
      });
    }

    if (!db.verifyAdminPasscode(passcode)) {
      return res.status(401).json({
        success: false,
        error: 'الرمز السري غير صحيح'
      });
    }

    const token = generateToken();
    activeAdminTokens.add(token);

    res.json({
      success: true,
      token,
      message: 'تم تسجيل دخول المشرف بنجاح'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/admin/logout', (req: Request, res: Response) => {
  const token = req.headers['x-admin-token'] as string;
  if (token) {
    activeAdminTokens.delete(token);
  }
  res.json({ success: true });
});

apiRouter.post('/settings/toggle-edit', requireAdmin, (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const newState = db.toggleEditing(!!enabled, 'المشرف');
    res.json({
      success: true,
      editingEnabled: newState,
      message: newState ? 'تم تفعيل وضع التعديل للجميع' : 'تم قفل التعديل للجميع'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Persons Routes ---

apiRouter.get('/persons', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getPersons()
  });
});

apiRouter.get('/persons/:id', (req: Request, res: Response) => {
  const person = db.getPersonById(req.params.id);
  if (!person) {
    return res.status(404).json({ success: false, error: 'الفرد غير موجود' });
  }
  const children = db.getChildren(person.id);
  const ancestors = db.getAncestors(person.id);
  res.json({
    success: true,
    data: {
      ...person,
      children,
      ancestors
    }
  });
});

apiRouter.post('/persons', enforceCanEdit, (req: Request, res: Response) => {
  try {
    const isAdmin = getIsAdmin(req);
    const person = db.addPerson({
      ...req.body,
      actor: isAdmin ? 'المشرف' : 'مستخدم'
    });
    res.status(201).json({
      success: true,
      data: person,
      message: 'تمت إضافة الفرد بنجاح'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.put('/persons/:id', enforceCanEdit, (req: Request, res: Response) => {
  try {
    const isAdmin = getIsAdmin(req);
    const updated = db.updatePerson(req.params.id, {
      ...req.body,
      actor: isAdmin ? 'المشرف' : 'مستخدم'
    });
    res.json({
      success: true,
      data: updated,
      message: 'تم تحديث البيانات بنجاح'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/persons/:id/add-father', enforceCanEdit, (req: Request, res: Response) => {
  try {
    const isAdmin = getIsAdmin(req);
    const result = db.addFatherAbove(req.params.id, {
      ...req.body,
      actor: isAdmin ? 'المشرف' : 'مستخدم'
    });
    res.json({
      success: true,
      data: result,
      message: 'تمت إضافة الأب وتحديث الروابط بنجاح'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/persons/:id', enforceCanEdit, (req: Request, res: Response) => {
  try {
    const isAdmin = getIsAdmin(req);
    const result = db.deletePerson(req.params.id, isAdmin ? 'المشرف' : 'مستخدم');
    res.json({
      success: true,
      data: result,
      message: 'تم حذف الفرد بنجاح'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Trees Merge & Undo ---

apiRouter.post('/trees/merge', enforceCanEdit, (req: Request, res: Response) => {
  try {
    const { sourcePersonId, targetPersonId } = req.body;
    const isAdmin = getIsAdmin(req);
    const result = db.mergePersons(sourcePersonId, targetPersonId, isAdmin ? 'المشرف' : 'مستخدم');
    res.json({
      success: true,
      data: result,
      message: `تم دمج السجلين بنجاح ونقل ${result.movedCount} من الفروع والأحفاد`
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/trees/merge/undo', requireAdmin, (req: Request, res: Response) => {
  try {
    const { mergeOpId } = req.body;
    db.undoMerge(mergeOpId, 'المشرف');
    res.json({
      success: true,
      message: 'تم التراجع عن عملية الدمج واستعادة الشجرة السابقة بنجاح'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.get('/trees/merge-operations', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getMergeOperations()
  });
});

// --- Change Requests (طلبات التصحيح والدمج المقترحة) ---

apiRouter.get('/requests', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getChangeRequests()
  });
});

apiRouter.post('/requests', (req: Request, res: Response) => {
  try {
    const reqItem = db.createChangeRequest(req.body);
    res.status(201).json({
      success: true,
      data: reqItem,
      message: 'تم إرسال اقتراحك للمشرف بنجاح وسيتم مراجعته'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/requests/:id/resolve', requireAdmin, (req: Request, res: Response) => {
  try {
    const { decision, feedback } = req.body;
    const resolved = db.resolveChangeRequest(req.params.id, decision, feedback);
    res.json({
      success: true,
      data: resolved,
      message: decision === 'approved' ? 'تم قبول الطلب وتطبيق التعديلات بنجاح' : 'تم رفض الطلب'
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Audit Logs ---

apiRouter.get('/audit-logs', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.getAuditLogs()
  });
});

// --- Backup & Restore ---

apiRouter.get('/backup', (_req: Request, res: Response) => {
  const backup = db.createBackup();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="family_tree_backup_${Date.now()}.json"`);
  res.json(backup);
});

apiRouter.post('/restore', requireAdmin, (req: Request, res: Response) => {
  try {
    const result = db.restoreBackup(req.body);
    res.json({
      success: true,
      message: `تمت استعادة النسخة الاحتياطية بنجاح (${result.restoredCount} فرد)`,
      data: result
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

apiRouter.post('/data/reset-sample', requireAdmin, (_req: Request, res: Response) => {
  try {
    db.populateSampleData(true);
    res.json({
      success: true,
      message: 'تم تحميل البيانات النموذجية لشجرة العائلة بنجاح'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post('/data/clear', requireAdmin, (_req: Request, res: Response) => {
  try {
    db.clearAllData('المشرف');
    res.json({
      success: true,
      message: 'تم تفريغ بيانات شجرة العائلة بنجاح. يمكنك الآن البدء بإضافة الجد الأول.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
