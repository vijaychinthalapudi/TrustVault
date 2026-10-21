import { Router, Response } from 'express';
import { authenticate, extractRequestId } from '../middleware/auth';
import { PermissionService } from '../services/permissionService';
import { AuditService } from '../services/auditService';
import { db } from '../db';
import { AuthenticatedRequest, DocumentRecord } from '../types';

const router = Router();

// Helper to load document
function getDocument(id: string): DocumentRecord | null {
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRecord | undefined;
  return doc || null;
}

// GET /api/documents/:id/permissions - List active grants
router.get('/:id/permissions', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const documentId = req.params.id;
    const doc = getDocument(documentId);

    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    // Only owner and admin can view permission grants
    if (doc.owner_id !== req.user!.userId && req.user!.role !== 'ADMIN') {
      AuditService.logEvent({
        actor_id: req.user!.userId,
        action: 'ACCESS_DENIED',
        document_id: documentId,
        outcome: 'DENIED',
        request_id: req.requestId,
        ip_address: req.ip,
        details: { attempted_action: 'VIEW_DOCUMENT_PERMISSIONS', reason: 'Only document owner or administrator can view permissions.' }
      });
      res.status(403).json({ error: 'Access denied: Only document owner or administrator can view permissions.' });
      return;
    }

    const grants = PermissionService.listGrants(documentId);
    res.json({ grants });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/documents/:id/permissions/:userId - Grant or update access
router.put('/:id/permissions/:userId', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const documentId = req.params.id;
    const targetUserId = req.params.userId;
    const { permission } = req.body;

    if (!permission || (permission !== 'READ' && permission !== 'EDIT')) {
      res.status(400).json({ error: "Invalid permission level. Must be 'READ' or 'EDIT'." });
      return;
    }

    const doc = getDocument(documentId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    const updatedGrant = PermissionService.grantAccess({
      actor: req.user!,
      document: doc,
      targetUserId,
      permission,
      requestId: req.requestId,
      ipAddress: req.ip
    });

    res.json({
      message: `Successfully granted '${permission}' access.`,
      grant: updatedGrant
    });
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/documents/:id/permissions/:userId - Revoke access immediately
router.delete('/:id/permissions/:userId', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const documentId = req.params.id;
    const targetUserId = req.params.userId;

    const doc = getDocument(documentId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    PermissionService.revokeAccess({
      actor: req.user!,
      document: doc,
      targetUserId,
      requestId: req.requestId,
      ipAddress: req.ip
    });

    res.json({
      message: 'Access revoked successfully. Subsequent requests from this user are now denied.'
    });
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
