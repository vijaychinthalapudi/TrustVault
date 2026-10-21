import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest, UserRole, User } from '../types';
import { verifyToken } from '../utils/crypto';
import { db } from '../db';
import { AuditService } from '../services/auditService';

export function extractRequestId(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const reqId = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required: Missing or malformed Bearer token.',
      code: 'UNAUTHENTICATED'
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      error: 'Invalid or expired authentication token.',
      code: 'INVALID_TOKEN'
    });
    return;
  }

  // Security Invariant: Synchronously resolve current role and account status from the database.
  // This ensures role changes and account suspensions take effect immediately on subsequent requests,
  // preventing existing JWT tokens from retaining obsolete privileges.
  const userRecord = db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').get(payload.userId) as
    | { id: string; email: string; role: UserRole; status: string }
    | undefined;

  if (!userRecord || userRecord.status !== 'ACTIVE') {
    res.status(401).json({
      error: 'Account not found or inactive.',
      code: 'ACCOUNT_INACTIVE'
    });
    return;
  }

  req.user = {
    userId: userRecord.id,
    email: userRecord.email,
    role: userRecord.role
  };

  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      // Record tamper-evident denial event for role-guarded endpoints
      AuditService.logEvent({
        actor_id: req.user.userId,
        action: 'ACCESS_DENIED',
        outcome: 'DENIED',
        request_id: req.requestId,
        ip_address: req.ip,
        details: {
          path: req.originalUrl || req.url,
          method: req.method,
          required_roles: roles,
          actor_role: req.user.role,
          reason: `Role '${req.user.role}' is not authorized. Requires one of [${roles.join(', ')}].`
        }
      });

      res.status(403).json({
        error: `Forbidden: Requires one of [${roles.join(', ')}] role. Your role is '${req.user.role}'.`,
        code: 'FORBIDDEN_ROLE'
      });
      return;
    }

    next();
  };
}
