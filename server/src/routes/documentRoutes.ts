import { Router, Response } from 'express';
import multer from 'multer';
import { authenticate, extractRequestId, requireRole } from '../middleware/auth';
import { DocumentService } from '../services/documentService';
import { AuditService } from '../services/auditService';
import { AuthenticatedRequest } from '../types';

const router = Router();

// Configure Multer with memory storage to allow magic byte signature validation before saving to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB hard boundary
  }
});

// POST /api/documents - Upload a new confidential document (Owner or Admin only)
router.post(
  '/',
  extractRequestId,
  authenticate,
  requireRole('OWNER', 'ADMIN'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please provide a document file.' });
        return;
      }

      const { category, description, display_name } = req.body;
      const claimedName = display_name || (req.headers['x-filename'] as string) || req.file.originalname;

      const document = await DocumentService.uploadDocument({
        actor: req.user!,
        originalName: claimedName,
        buffer: req.file.buffer,
        clientMimeType: req.file.mimetype,
        category: category || 'General',
        description: description || '',
        requestId: req.requestId,
        ipAddress: req.ip
      });

      res.status(201).json({
        message: 'Document uploaded and securely stored.',
        document
      });
    } catch (err: any) {
      const status = err.message.includes('File validation failed') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// GET /api/documents - List/search documents caller is entitled to discover
router.get('/', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, category, ownerId, dateFrom, dateTo } = req.query;

    const documents = DocumentService.listDiscoverableDocuments(req.user!, {
      search: search as string,
      category: category as string,
      ownerId: ownerId as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    });

    res.json({ documents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id - Read document metadata (Checks READ access)
router.get('/:id', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { document, effectivePermission } = DocumentService.getDocumentById(
      req.user!,
      req.params.id,
      req.requestId,
      req.ip
    );

    res.json({ document, effectivePermission });
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/documents/:id/download - Download document content (Checks READ/EDIT access)
router.get('/:id/download', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { document, buffer } = await DocumentService.getDocumentForDownload(
      req.user!,
      req.params.id,
      req.requestId,
      req.ip
    );

    res.setHeader('Content-Type', document.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.display_name)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Document-Checksum', document.checksum);

    res.send(buffer);
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /api/documents/:id - Edit document metadata or replace content (Owner or EDIT grant)
router.patch(
  '/:id',
  extractRequestId,
  authenticate,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { display_name, category, description } = req.body;

      const updated = await DocumentService.updateDocument({
        actor: req.user!,
        documentId: req.params.id,
        displayName: display_name,
        category,
        description,
        newFileBuffer: req.file ? req.file.buffer : undefined,
        newFileName: req.file ? req.file.originalname : undefined,
        newMimeType: req.file ? req.file.mimetype : undefined,
        requestId: req.requestId,
        ipAddress: req.ip
      });

      res.json({
        message: 'Document updated successfully.',
        document: updated
      });
    } catch (err: any) {
      const status = err.message.includes('Access denied') ? 403 : err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// DELETE /api/documents/:id - Delete document (Owner only)
router.delete('/:id', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    DocumentService.deleteDocument(
      req.user!,
      req.params.id,
      req.requestId,
      req.ip
    );

    res.json({ message: 'Document deleted successfully. Audit trail preserved.' });
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/documents/:id/audit - Document activity trail (Owner or Admin only)
router.get('/:id/audit', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const docData = DocumentService.getDocumentById(req.user!, req.params.id, req.requestId, req.ip);

    // Only active Owner and Admin can inspect history
    const isOwner = docData.document.owner_id === req.user!.userId && req.user!.role === 'OWNER';
    const isAdmin = req.user!.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      AuditService.logEvent({
        actor_id: req.user!.userId,
        action: 'ACCESS_DENIED',
        document_id: req.params.id,
        outcome: 'DENIED',
        request_id: req.requestId,
        ip_address: req.ip,
        details: { attempted_action: 'VIEW_DOCUMENT_AUDIT', reason: 'Only active document owner or administrator can view document history.' }
      });
      res.status(403).json({ error: 'Access denied: Only active document owner or administrator can view document history.' });
      return;
    }

    const auditTrail = AuditService.getDocumentAudit(req.params.id);
    res.json({ auditTrail });
  } catch (err: any) {
    const status = err.message.includes('Access denied') ? 403 : 404;
    res.status(status).json({ error: err.message });
  }
});

export default router;
