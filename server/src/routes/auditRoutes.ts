import { Router, Response } from 'express';
import { authenticate, extractRequestId, requireRole } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { db } from '../db';
import { AuthenticatedRequest } from '../types';

const router = Router();

// GET /api/audit - View system audit trail (Admin only)
router.get(
  '/',
  extractRequestId,
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { actor_id, document_id, action, outcome, limit, offset } = req.query;

      const result = AuditService.getLogs({
        actor_id: actor_id as string,
        document_id: document_id as string,
        action: action as string,
        outcome: outcome as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0
      });

      // Audit the administrative view action itself
      AuditService.logEvent({
        actor_id: req.user!.userId,
        action: 'ADMIN_AUDIT_VIEW',
        outcome: 'SUCCESS',
        request_id: req.requestId,
        ip_address: req.ip,
        details: { filters: { actor_id, document_id, action, outcome } }
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/audit/verify - Cryptographically verify audit hash chain integrity (Admin only)
router.get(
  '/verify',
  extractRequestId,
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const verification = AuditService.verifyChainIntegrity();

      AuditService.logEvent({
        actor_id: req.user!.userId,
        action: 'CHAIN_INTEGRITY_VERIFIED',
        outcome: verification.isValid ? 'SUCCESS' : 'FAILED',
        request_id: req.requestId,
        ip_address: req.ip,
        details: {
          total_records: verification.totalRecords,
          chain_valid: verification.isValid,
          broken_at: verification.brokenAtEventId || null
        }
      });

      res.json(verification);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/admin/stats - System health & compliance metrics
router.get(
  '/stats',
  extractRequestId,
  authenticate,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userCount = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any).count;
      const docCount = (db.prepare(`SELECT COUNT(*) as count FROM documents WHERE status = 'ACTIVE'`).get() as any).count;
      const auditCount = (db.prepare(`SELECT COUNT(*) as count FROM audit_logs`).get() as any).count;
      const deniedCount = (db.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE outcome = 'DENIED'`).get() as any).count;

      const chainStatus = AuditService.verifyChainIntegrity();

      res.json({
        totalUsers: userCount,
        activeDocuments: docCount,
        totalAuditEvents: auditCount,
        deniedEvents: deniedCount,
        chainIntegrity: chainStatus
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
