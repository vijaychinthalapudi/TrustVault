import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthTokenPayload, DocumentPermission, PermissionLevel, DocumentRecord } from '../types';
import { AuditService } from './auditService';

export class PermissionService {
  /**
   * Retrieves active grant for a given document and user
   */
  public static getUserGrant(documentId: string, userId: string): DocumentPermission | null {
    const grant = db.prepare(`
      SELECT dp.*, u.name as user_name, u.email as user_email
      FROM document_permissions dp
      JOIN users u ON dp.user_id = u.id
      WHERE dp.document_id = ? AND dp.user_id = ?
    `).get(documentId, userId) as DocumentPermission | undefined;

    return grant || null;
  }

  /**
   * Lists all active grants for a document
   */
  public static listGrants(documentId: string): DocumentPermission[] {
    return db.prepare(`
      SELECT dp.*, u.name as user_name, u.email as user_email
      FROM document_permissions dp
      JOIN users u ON dp.user_id = u.id
      WHERE dp.document_id = ?
      ORDER BY dp.granted_at DESC
    `).all(documentId) as DocumentPermission[];
  }

  /**
   * Grants or updates READ / EDIT access to a named user
   */
  public static grantAccess(params: {
    actor: AuthTokenPayload;
    document: DocumentRecord;
    targetUserId: string;
    permission: PermissionLevel;
    requestId?: string;
    ipAddress?: string;
  }): DocumentPermission {
    // 1. Only the document owner can grant permissions
    if (params.document.owner_id !== params.actor.userId) {
      AuditService.logEvent({
        actor_id: params.actor.userId,
        action: 'ACCESS_DENIED',
        document_id: params.document.id,
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { 
          attempted_action: 'PERMISSION_GRANT',
          target_user: params.targetUserId,
          reason: 'Only the document owner can grant permissions.' 
        }
      });
      throw new Error('Access denied: Only document owner can grant permissions.');
    }

    // 2. Prevent granting access to oneself
    if (params.targetUserId === params.actor.userId) {
      throw new Error('Owner automatically has full access; cannot grant redundant permission to oneself.');
    }

    // 3. Verify target user exists and is active
    const targetUser = db.prepare(`SELECT id, name, email, status FROM users WHERE id = ?`).get(params.targetUserId) as any;
    if (!targetUser || targetUser.status !== 'ACTIVE') {
      throw new Error('Target user does not exist or is inactive.');
    }

    const grantId = uuidv4();
    const grantedAt = new Date().toISOString();

    // 4. Atomic upsert to handle new grant or upgrade/downgrade
    const upsertStmt = db.prepare(`
      INSERT INTO document_permissions (id, document_id, user_id, permission, granted_by, granted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, user_id) DO UPDATE SET
        permission = excluded.permission,
        granted_by = excluded.granted_by,
        granted_at = excluded.granted_at
    `);

    upsertStmt.run(
      grantId,
      params.document.id,
      params.targetUserId,
      params.permission,
      params.actor.userId,
      grantedAt
    );

    // 5. Emit tamper-evident audit record
    AuditService.logEvent({
      actor_id: params.actor.userId,
      action: 'PERMISSION_GRANT',
      document_id: params.document.id,
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        target_user_id: params.targetUserId,
        target_user_email: targetUser.email,
        permission: params.permission
      }
    });

    return {
      id: grantId,
      document_id: params.document.id,
      user_id: params.targetUserId,
      permission: params.permission,
      granted_by: params.actor.userId,
      granted_at: grantedAt,
      user_name: targetUser.name,
      user_email: targetUser.email
    };
  }

  /**
   * Revokes access immediately for a recipient.
   * Subsequent requests will be rejected instantly as the grant is deleted synchronously.
   */
  public static revokeAccess(params: {
    actor: AuthTokenPayload;
    document: DocumentRecord;
    targetUserId: string;
    requestId?: string;
    ipAddress?: string;
  }): void {
    // 1. Only the document owner can revoke permissions
    if (params.document.owner_id !== params.actor.userId) {
      AuditService.logEvent({
        actor_id: params.actor.userId,
        action: 'ACCESS_DENIED',
        document_id: params.document.id,
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { 
          attempted_action: 'PERMISSION_REVOKE',
          target_user: params.targetUserId,
          reason: 'Only the document owner can revoke permissions.' 
        }
      });
      throw new Error('Access denied: Only document owner can revoke permissions.');
    }

    // 2. Synchronous delete from database
    const deleteStmt = db.prepare(`
      DELETE FROM document_permissions 
      WHERE document_id = ? AND user_id = ?
    `);

    const result = deleteStmt.run(params.document.id, params.targetUserId);

    if (result.changes === 0) {
      throw new Error('No active grant found for this user on this document.');
    }

    // 3. Emit audit record
    AuditService.logEvent({
      actor_id: params.actor.userId,
      action: 'PERMISSION_REVOKE',
      document_id: params.document.id,
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        revoked_user_id: params.targetUserId
      }
    });
  }
}
