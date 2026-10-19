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
    role?: UserRole;
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

    const role: UserRole = params.role || 'VIEWER';
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
}
