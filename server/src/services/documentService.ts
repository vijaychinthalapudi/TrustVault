import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db } from '../db';
import { DocumentRecord, AuthTokenPayload, SafeUser } from '../types';
import { StorageService } from './storageService';
import { AuditService } from './auditService';
import { PermissionService } from './permissionService';
import { PolicyEvaluator } from '../security/policyEvaluator';
import { validateUploadedFile, sanitizeFileName } from '../security/fileValidator';
import { calculateBufferSha256 } from '../utils/crypto';

export class DocumentService {
  /**
   * Uploads and securely stores a new document
   */
  public static async uploadDocument(params: {
    actor: AuthTokenPayload;
    originalName: string;
    buffer: Buffer;
    clientMimeType: string;
    category: string;
    description?: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<DocumentRecord> {
    // 1. Validate file content, extension, magic bytes, and path safety
    const validation = validateUploadedFile(params.originalName, params.buffer, params.clientMimeType);
    if (!validation.valid || !validation.sanitizedName || !validation.detectedMimeType) {
      AuditService.logEvent({
        actor_id: params.actor.userId,
        action: 'ACCESS_DENIED',
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: {
          attempted_action: 'DOCUMENT_UPLOAD',
          original_name: params.originalName,
          error: validation.error || 'Validation failed'
        }
      });
      throw new Error(`File validation failed: ${validation.error}`);
    }

    const documentId = uuidv4();
    const ext = path.extname(validation.sanitizedName);
    const storageKey = `${documentId}${ext}.bin`; // Opaque random storage key
    const checksum = calculateBufferSha256(params.buffer);
    const now = new Date().toISOString();

    // 2. Persist to private storage
    await StorageService.saveFile(storageKey, params.buffer);

    // 3. Save document metadata to database
    const insertStmt = db.prepare(`
      INSERT INTO documents (
        id, owner_id, display_name, category, storage_key, 
        content_type, file_size, checksum, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `);

    try {
      insertStmt.run(
        documentId,
        params.actor.userId,
        validation.sanitizedName,
        params.category.trim() || 'General',
        storageKey,
        validation.detectedMimeType,
        params.buffer.length,
        checksum,
        params.description?.trim() || '',
        now,
        now
      );
    } catch (err: any) {
      // Clean up storage file if DB transaction failed
      await StorageService.deleteFile(storageKey);
      throw err;
    }

    // 4. Record audit event
    AuditService.logEvent({
      actor_id: params.actor.userId,
      action: 'DOCUMENT_UPLOAD',
      document_id: documentId,
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        display_name: validation.sanitizedName,
        file_size: params.buffer.length,
        content_type: validation.detectedMimeType,
        checksum
      }
    });

    return {
      id: documentId,
      owner_id: params.actor.userId,
      display_name: validation.sanitizedName,
      category: params.category.trim() || 'General',
      storage_key: storageKey,
      content_type: validation.detectedMimeType,
      file_size: params.buffer.length,
      checksum,
      description: params.description?.trim() || '',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Retrieves document metadata with strict authorization check
   */
  public static getDocumentById(
    actor: AuthTokenPayload,
    documentId: string,
    requestId?: string,
    ipAddress?: string
  ): { document: DocumentRecord; effectivePermission: string } {
    const doc = db.prepare(`
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      WHERE d.id = ?
    `).get(documentId) as (DocumentRecord & { owner_name: string; owner_email: string }) | undefined;

    if (!doc) {
      throw new Error('Document not found.');
    }

    const grant = PermissionService.getUserGrant(documentId, actor.userId);
    const evalResult = PolicyEvaluator.evaluateDocumentAccess(actor, doc, 'READ_METADATA', grant);

    if (!evalResult.allowed) {
      AuditService.logEvent({
        actor_id: actor.userId,
        action: 'ACCESS_DENIED',
        document_id: documentId,
        outcome: 'DENIED',
        request_id: requestId,
        ip_address: ipAddress,
        details: { attempted_action: 'READ_METADATA', reason: evalResult.reason }
      });
      throw new Error(`Access denied: ${evalResult.reason}`);
    }

    AuditService.logEvent({
      actor_id: actor.userId,
      action: 'DOCUMENT_READ',
      document_id: documentId,
      outcome: 'SUCCESS',
      request_id: requestId,
      ip_address: ipAddress,
      details: { effective_permission: evalResult.effectivePermission }
    });

    return {
      document: doc,
      effectivePermission: evalResult.effectivePermission || 'READ'
    };
  }

  /**
   * Downloads document content after real-time authorization evaluation
   */
  public static getDocumentForDownload(
    actor: AuthTokenPayload,
    documentId: string,
    requestId?: string,
    ipAddress?: string
  ): { document: DocumentRecord; buffer: Buffer } {
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as DocumentRecord | undefined;

    if (!doc) {
      throw new Error('Document not found.');
    }

    const grant = PermissionService.getUserGrant(documentId, actor.userId);
    const evalResult = PolicyEvaluator.evaluateDocumentAccess(actor, doc, 'DOWNLOAD_CONTENT', grant);

    if (!evalResult.allowed) {
      AuditService.logEvent({
        actor_id: actor.userId,
        action: 'ACCESS_DENIED',
        document_id: documentId,
        outcome: 'DENIED',
        request_id: requestId,
        ip_address: ipAddress,
        details: { attempted_action: 'DOWNLOAD_CONTENT', reason: evalResult.reason }
      });
      throw new Error(`Access denied: ${evalResult.reason}`);
    }

    const buffer = StorageService.getFileBuffer(doc.storage_key);

    AuditService.logEvent({
      actor_id: actor.userId,
      action: 'DOCUMENT_DOWNLOAD',
      document_id: documentId,
      outcome: 'SUCCESS',
      request_id: requestId,
      ip_address: ipAddress,
      details: {
        file_size: doc.file_size,
        checksum: doc.checksum
      }
    });

    return { document: doc, buffer };
  }

  /**
   * Updates document metadata or replaces file content (Owner or EDIT grant)
   */
  public static async updateDocument(params: {
    actor: AuthTokenPayload;
    documentId: string;
    displayName?: string;
    category?: string;
    description?: string;
    newFileBuffer?: Buffer;
    newFileName?: string;
    newMimeType?: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<DocumentRecord> {
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(params.documentId) as DocumentRecord | undefined;

    if (!doc) {
      throw new Error('Document not found.');
    }

    const grant = PermissionService.getUserGrant(params.documentId, params.actor.userId);
    const evalResult = PolicyEvaluator.evaluateDocumentAccess(params.actor, doc, 'EDIT', grant);

    if (!evalResult.allowed) {
      AuditService.logEvent({
        actor_id: params.actor.userId,
        action: 'ACCESS_DENIED',
        document_id: params.documentId,
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { attempted_action: 'DOCUMENT_EDIT', reason: evalResult.reason }
      });
      throw new Error('Access denied: You do not have permission to edit this document.');
    }

    let displayName = doc.display_name;
    let category = params.category ? params.category.trim() : doc.category;
    let description = params.description !== undefined ? params.description.trim() : doc.description;
    let storageKey = doc.storage_key;
    let contentType = doc.content_type;
    let fileSize = doc.file_size;
    let checksum = doc.checksum;

    if (params.displayName) {
      displayName = sanitizeFileName(params.displayName);
    }

    if (params.newFileBuffer && params.newFileName && params.newMimeType) {
      const validation = validateUploadedFile(params.newFileName, params.newFileBuffer, params.newMimeType);
      if (!validation.valid || !validation.sanitizedName || !validation.detectedMimeType) {
        throw new Error(`Replacement file validation failed: ${validation.error}`);
      }

      // Save new file bytes
      const ext = path.extname(validation.sanitizedName);
      const newStorageKey = `${params.documentId}_${Date.now()}${ext}.bin`;
      await StorageService.saveFile(newStorageKey, params.newFileBuffer);

      // Delete old file
      await StorageService.deleteFile(doc.storage_key);

      storageKey = newStorageKey;
      contentType = validation.detectedMimeType;
      fileSize = params.newFileBuffer.length;
      checksum = calculateBufferSha256(params.newFileBuffer);
      displayName = validation.sanitizedName;
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE documents SET
        display_name = ?,
        category = ?,
        description = ?,
        storage_key = ?,
        content_type = ?,
        file_size = ?,
        checksum = ?,
        updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(displayName, category, description, storageKey, contentType, fileSize, checksum, now, params.documentId);

    AuditService.logEvent({
      actor_id: params.actor.userId,
      action: 'DOCUMENT_EDIT',
      document_id: params.documentId,
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        updated_fields: {
          display_name: displayName,
          category,
          has_content_replaced: !!params.newFileBuffer
        }
      }
    });

    return {
      ...doc,
      display_name: displayName,
      category,
      description,
      storage_key: storageKey,
      content_type: contentType,
      file_size: fileSize,
      checksum,
      updated_at: now
    };
  }

  /**
   * Deletes a document (Owner only)
   */
  public static deleteDocument(
    actor: AuthTokenPayload,
    documentId: string,
    requestId?: string,
    ipAddress?: string
  ): void {
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as DocumentRecord | undefined;

    if (!doc) {
      throw new Error('Document not found.');
    }

    const grant = PermissionService.getUserGrant(documentId, actor.userId);
    const evalResult = PolicyEvaluator.evaluateDocumentAccess(actor, doc, 'DELETE', grant);

    if (!evalResult.allowed) {
      AuditService.logEvent({
        actor_id: actor.userId,
        action: 'ACCESS_DENIED',
        document_id: documentId,
        outcome: 'DENIED',
        request_id: requestId,
        ip_address: ipAddress,
        details: { attempted_action: 'DOCUMENT_DELETE', reason: evalResult.reason }
      });
      throw new Error('Access denied: Only document owner can delete this document.');
    }

    // Soft delete to preserve audit history and integrity
    db.prepare(`UPDATE documents SET status = 'SOFT_DELETED', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), documentId);

    AuditService.logEvent({
      actor_id: actor.userId,
      action: 'DOCUMENT_DELETE',
      document_id: documentId,
      outcome: 'SUCCESS',
      request_id: requestId,
      ip_address: ipAddress,
      details: {
        deleted_display_name: doc.display_name
      }
    });
  }

  /**
   * Lists only documents discoverable by the actor.
   * Completely eliminates cross-user metadata and title search leakage.
   */
  public static listDiscoverableDocuments(
    actor: AuthTokenPayload,
    filters: {
      search?: string;
      category?: string;
      ownerId?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): any[] {
    let where = "d.status = 'ACTIVE'";
    const params: any[] = [];

    // Access control filtering in query:
    if (actor.role === 'ADMIN') {
      // Admin sees active documents for administrative governance
    } else {
      where += ` AND (d.owner_id = ? OR d.id IN (SELECT document_id FROM document_permissions WHERE user_id = ?))`;
      params.push(actor.userId, actor.userId);
    }

    // Search filter (display_name or description)
    if (filters.search) {
      where += ` AND (d.display_name LIKE ? OR d.description LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    if (filters.category) {
      where += ` AND d.category = ?`;
      params.push(filters.category);
    }

    if (filters.ownerId) {
      where += ` AND d.owner_id = ?`;
      params.push(filters.ownerId);
    }

    if (filters.dateFrom) {
      where += ` AND d.created_at >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      where += ` AND d.created_at <= ?`;
      params.push(filters.dateTo);
    }

    const query = `
      SELECT 
        d.id, d.owner_id, d.display_name, d.category, d.content_type, 
        d.file_size, d.checksum, d.description, d.status, d.created_at, d.updated_at,
        u.name as owner_name, u.email as owner_email,
        dp.permission as my_permission,
        CASE 
          WHEN d.owner_id = ? THEN 'OWNER'
          ELSE dp.permission 
        END as effective_role
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      LEFT JOIN document_permissions dp ON (d.id = dp.document_id AND dp.user_id = ?)
      WHERE ${where}
      ORDER BY d.created_at DESC
    `;

    return db.prepare(query).all(actor.userId, actor.userId, ...params);
  }
}
