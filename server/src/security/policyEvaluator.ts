import { AuthTokenPayload, DocumentRecord, DocumentPermission } from '../types';

export type PolicyAction =
  | 'READ_METADATA'
  | 'DOWNLOAD_CONTENT'
  | 'EDIT'
  | 'DELETE'
  | 'MANAGE_PERMISSIONS';

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason: string;
  effectivePermission?: 'OWNER' | 'EDIT' | 'READ' | 'ADMIN';
}

/**
 * Centralized Server-Side Policy Evaluator
 * Enforces least-privilege, IDOR/BOLA protection, and role separation.
 */
export class PolicyEvaluator {
  public static evaluateDocumentAccess(
    actor: AuthTokenPayload,
    document: DocumentRecord,
    action: PolicyAction,
    activeGrant?: DocumentPermission | null
  ): PolicyEvaluationResult {
    // 1. Soft-deleted documents check
    if (document.status === 'SOFT_DELETED' && action !== 'READ_METADATA') {
      return {
        allowed: false,
        reason: 'Document has been deleted and cannot be accessed or modified.'
      };
    }

    // 2. Document Owner has full authority over their document
    if (document.owner_id === actor.userId) {
      return {
        allowed: true,
        reason: 'Authorized as document owner.',
        effectivePermission: 'OWNER'
      };
    }

    // 3. Evaluate Explicit Per-Document Grants
    if (activeGrant && activeGrant.user_id === actor.userId) {
      if (activeGrant.permission === 'EDIT') {
        if (action === 'READ_METADATA' || action === 'DOWNLOAD_CONTENT' || action === 'EDIT') {
          return {
            allowed: true,
            reason: `Authorized via active '${activeGrant.permission}' grant.`,
            effectivePermission: 'EDIT'
          };
        }
        return {
          allowed: false,
          reason: 'EDIT grant does not permit document deletion or permission management.'
        };
      }

      if (activeGrant.permission === 'READ') {
        if (action === 'READ_METADATA' || action === 'DOWNLOAD_CONTENT') {
          return {
            allowed: true,
            reason: `Authorized via active '${activeGrant.permission}' grant.`,
            effectivePermission: 'READ'
          };
        }
        return {
          allowed: false,
          reason: 'READ grant is read-only and does not permit editing, deletion, or permission changes.'
        };
      }
    }

    // 4. Administrator Role Scope
    // Rule: Admins monitor audit activity, manage platform users, but DO NOT have an automatic
    // silent backdoor to read/download confidential document bytes without an explicit grant.
    if (actor.role === 'ADMIN') {
      if (action === 'READ_METADATA') {
        return {
          allowed: true,
          reason: 'Authorized as administrator for metadata governance.',
          effectivePermission: 'ADMIN'
        };
      }
      return {
        allowed: false,
        reason: 'Administrator role does not bypass confidential document content protection without an explicit grant.'
      };
    }

    // Default Deny
    return {
      allowed: false,
      reason: 'Access denied: No valid ownership or active permission grant for this document.'
    };
  }

  /**
   * Evaluates if a user can view the system audit trail
   */
  public static canViewAuditLogs(actor: AuthTokenPayload): boolean {
    return actor.role === 'ADMIN';
  }

  /**
   * Evaluates if a user can view audit logs for a specific document
   */
  public static canViewDocumentAudit(actor: AuthTokenPayload, document: DocumentRecord): boolean {
    return actor.role === 'ADMIN' || actor.userId === document.owner_id;
  }
}
