import { Request } from 'express';

export type UserRole = 'ADMIN' | 'OWNER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

export type PermissionLevel = 'READ' | 'EDIT';

export interface DocumentPermission {
  id: string;
  document_id: string;
  user_id: string;
  permission: PermissionLevel;
  granted_by: string;
  granted_at: string;
  user_name?: string;
  user_email?: string;
}

export type DocumentStatus = 'ACTIVE' | 'SOFT_DELETED' | 'ARCHIVED';

export interface DocumentRecord {
  id: string;
  owner_id: string;
  display_name: string;
  category: string;
  storage_key: string;
  content_type: string;
  file_size: number;
  checksum: string;
  description: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  owner_email?: string;
}

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_READ'
  | 'DOCUMENT_DOWNLOAD'
  | 'DOCUMENT_EDIT'
  | 'DOCUMENT_DELETE'
  | 'PERMISSION_GRANT'
  | 'PERMISSION_REVOKE'
  | 'ACCESS_DENIED'
  | 'ADMIN_AUDIT_VIEW'
  | 'CHAIN_INTEGRITY_VERIFIED';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED';

export interface AuditLog {
  event_id: string;
  occurred_at: string;
  actor_id: string;
  action: AuditAction;
  document_id: string | null;
  outcome: AuditOutcome;
  request_id: string;
  ip_address: string;
  details: string; // JSON string
  prev_hash: string;
  hash: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
  requestId?: string;
}
