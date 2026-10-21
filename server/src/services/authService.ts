import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { User, SafeUser, UserRole, AuthTokenPayload } from '../types';
import { hashPassword, comparePassword, generateToken } from '../utils/crypto';
import { AuditService } from './auditService';

export class AuthService {
  public static async register(params: {
    name: string;
    email: string;
    password: string;
    role?: UserRole; // Ignored if supplied; registration always assigns VIEWER
    requestId?: string;
    ipAddress?: string;
  }): Promise<{ user: SafeUser; token: string }> {
    const email = params.email.trim().toLowerCase();
    const name = params.name.trim();

    // Password complexity check
    if (params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      throw new Error('A user with this email address already exists.');
    }

    // Security Invariant: New users are always assigned the VIEWER role.
    // Client-supplied role selections are strictly ignored on the server.
    const role: UserRole = 'VIEWER';
    const passwordHash = await hashPassword(params.password);
    const userId = uuidv4();
    const createdAt = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
    `);

    insertStmt.run(userId, name, email, passwordHash, role, createdAt);

    const safeUser: SafeUser = {
      id: userId,
      name,
      email,
      role,
      status: 'ACTIVE',
      created_at: createdAt
    };

    const token = generateToken({
      userId: safeUser.id,
      email: safeUser.email,
      role: safeUser.role
    });

    return { user: safeUser, token };
  }

  public static async login(params: {
    email: string;
    password: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<{ user: SafeUser; token: string }> {
    const email = params.email.trim().toLowerCase();

    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as User | undefined;

    if (!user) {
      AuditService.logEvent({
        actor_id: 'ANONYMOUS',
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { attempted_email: email, reason: 'User not found' }
      });
      throw new Error('Invalid email or password.');
    }

    if (user.status !== 'ACTIVE') {
      AuditService.logEvent({
        actor_id: user.id,
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { email, reason: `Account status: ${user.status}` }
      });
      throw new Error('Account is inactive or suspended.');
    }

    const isValid = await comparePassword(params.password, user.password_hash);
    if (!isValid) {
      AuditService.logEvent({
        actor_id: user.id,
        action: 'AUTH_LOGIN_FAILED',
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: { email, reason: 'Password mismatch' }
      });
      throw new Error('Invalid email or password.');
    }

    // Success login event
    AuditService.logEvent({
      actor_id: user.id,
      action: 'AUTH_LOGIN',
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: { email: user.email, role: user.role }
    });

    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      created_at: user.created_at
    };

    const token = generateToken({
      userId: safeUser.id,
      email: safeUser.email,
      role: safeUser.role
    });

    return { user: safeUser, token };
  }

  public static getUserById(userId: string): SafeUser | null {
    const row = db.prepare(`
      SELECT id, name, email, role, status, created_at 
      FROM users WHERE id = ?
    `).get(userId) as SafeUser | undefined;

    return row || null;
  }

  public static listUsers(): SafeUser[] {
    return db.prepare(`
      SELECT id, name, email, role, status, created_at 
      FROM users 
      WHERE status = 'ACTIVE'
      ORDER BY name ASC
    `).all() as SafeUser[];
  }

  public static listAllUsersForAdmin(): SafeUser[] {
    return db.prepare(`
      SELECT id, name, email, role, status, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all() as SafeUser[];
  }

  /**
   * Allows an authorized System Administrator to change a user's role.
   * Records a tamper-evident audit event with previous and new role.
   */
  public static async updateUserRole(params: {
    adminActor: AuthTokenPayload;
    targetUserId: string;
    newRole: UserRole;
    requestId?: string;
    ipAddress?: string;
  }): Promise<SafeUser> {
    // 1. Verify that the actor is an administrator
    if (params.adminActor.role !== 'ADMIN') {
      AuditService.logEvent({
        actor_id: params.adminActor.userId,
        action: 'ACCESS_DENIED',
        outcome: 'DENIED',
        request_id: params.requestId,
        ip_address: params.ipAddress,
        details: {
          attempted_action: 'ROLE_CHANGE',
          target_user_id: params.targetUserId,
          attempted_role: params.newRole,
          reason: 'Only System Administrators can change user roles.'
        }
      });
      throw new Error('Access denied: Only System Administrators can change user roles.');
    }

    // 2. Validate role is one of the supported roles
    const validRoles: UserRole[] = ['ADMIN', 'OWNER', 'VIEWER'];
    if (!validRoles.includes(params.newRole)) {
      throw new Error(`Invalid role '${params.newRole}'. Supported roles are: ${validRoles.join(', ')}.`);
    }

    // 3. Fetch target user
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(params.targetUserId) as User | undefined;
    if (!targetUser) {
      throw new Error('Target user not found.');
    }

    // 4. Guard against locking out the system: If demoting self or another admin, ensure at least one active admin remains
    if (targetUser.role === 'ADMIN' && params.newRole !== 'ADMIN') {
      const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'").get() as any).count;
      if (adminCount <= 1) {
        throw new Error('Cannot demote the last active System Administrator.');
      }
    }

    const previousRole = targetUser.role;

    // 5. Update user role in database (Document ownership and document_permissions remain intact)
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(params.newRole, params.targetUserId);

    // 6. Record tamper-evident audit event
    AuditService.logEvent({
      actor_id: params.adminActor.userId,
      action: 'ROLE_CHANGE',
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        target_user_id: params.targetUserId,
        target_user_email: targetUser.email,
        previous_role: previousRole,
        new_role: params.newRole
      }
    });

    return {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: params.newRole,
      status: targetUser.status,
      created_at: targetUser.created_at
    };
  }

  /**
   * Secure initialization for the first System Administrator if no admin exists.
   * Public self-registration as admin is forbidden once an admin exists.
   */
  public static async initializeFirstAdmin(params: {
    name: string;
    email: string;
    password: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<{ user: SafeUser; token: string }> {
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get() as any).count;
    if (adminCount > 0) {
      throw new Error('System Administrator already initialized. Public registration of administrators is forbidden.');
    }

    const email = params.email.trim().toLowerCase();
    const name = params.name.trim();

    if (params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const passwordHash = await hashPassword(params.password);
    const userId = uuidv4();
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?)
    `).run(userId, name, email, passwordHash, createdAt);

    AuditService.logEvent({
      actor_id: userId,
      action: 'ROLE_CHANGE',
      outcome: 'SUCCESS',
      request_id: params.requestId,
      ip_address: params.ipAddress,
      details: {
        action: 'FIRST_ADMIN_INITIALIZATION',
        admin_email: email
      }
    });

    const safeUser: SafeUser = {
      id: userId,
      name,
      email,
      role: 'ADMIN',
      status: 'ACTIVE',
      created_at: createdAt
    };

    const token = generateToken({
      userId: safeUser.id,
      email: safeUser.email,
      role: safeUser.role
    });

    return { user: safeUser, token };
  }
}
