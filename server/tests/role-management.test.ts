import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/app';
import { seedDatabase } from '../src/db/seed';
import { db } from '../src/db';
import { AuditService } from '../src/services/auditService';

const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
const ALICE_ID = '22222222-2222-4222-a222-222222222222';
const BOB_ID = '33333333-3333-4333-a333-333333333333';
const CHARLIE_ID = '44444444-4444-4444-a444-444444444444';

beforeEach(async () => {
  await seedDatabase();
});

describe('Role Management & Registration Security Invariants', () => {
  // Helper to obtain authentication token
  async function login(email: string, password: string): Promise<string> {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    if (res.status !== 200) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
    }
    return res.body.token;
  }

  // 1. UI Verification
  describe('Registration UI Security', () => {
    it('verifies registration page code contains no role selector or role options', () => {
      const loginPagePath = path.resolve(__dirname, '../../client/src/pages/Login.tsx');
      expect(fs.existsSync(loginPagePath)).toBe(true);
      const content = fs.readFileSync(loginPagePath, 'utf-8');

      // Ensure no role select element exists
      expect(content).not.toContain('<select');
      expect(content).not.toContain('name="role"');
      expect(content).not.toContain('setRole');
      expect(content).not.toContain('value="ADMIN"');
      expect(content).not.toContain('value="OWNER"');

      // Verify that registration explanation notice is present
      expect(content).toContain('All newly registered accounts are assigned standard');
      expect(content).toContain('Viewer');
    });
  });

  // 2. Unauthorized Role Changes
  describe('Unauthorized Role Modification Prevention', () => {
    it('denies unauthenticated requests to modify user roles', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .send({ role: 'OWNER' });

      expect(res.status).toBe(401);
    });

    it('denies Viewer from changing their own role (self-privilege escalation)', async () => {
      const bobToken = await login('bob@trustvault.local', 'Bob@TrustVault2026!');
      const res = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');

      // Verify Bob's role in DB is still VIEWER
      const bob = db.prepare(`SELECT role FROM users WHERE id = ?`).get(BOB_ID) as { role: string };
      expect(bob.role).toBe('VIEWER');
    });

    it('denies Owner from changing anyone else role', async () => {
      const aliceToken = await login('alice@trustvault.local', 'Alice@TrustVault2026!');
      const res = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ role: 'OWNER' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('denies non-admin from listing all users', async () => {
      const bobToken = await login('bob@trustvault.local', 'Bob@TrustVault2026!');
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(403);
    });
  });

  // 3. Authorized Administrator Role Changes
  describe('Administrator Role Management & Invariants', () => {
    it('allows System Administrator to view registered users and their roles', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(4);

      // Verify no password hashes are exposed in user management
      for (const u of res.body.users) {
        expect(u.password_hash).toBeUndefined();
        expect(u.role).toBeDefined();
        expect(u.email).toBeDefined();
        expect(u.status).toBeDefined();
      }
    });

    it('allows System Administrator to promote a Viewer to Owner', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      const res = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'OWNER' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('OWNER');
      expect(res.body.user.id).toBe(BOB_ID);

      // Verify DB persistence
      const userInDb = db.prepare(`SELECT role FROM users WHERE id = ?`).get(BOB_ID) as { role: string };
      expect(userInDb.role).toBe('OWNER');
    });

    it('prevents demoting the last active System Administrator', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      // Try to demote the sole seeded admin
      const res = await request(app)
        .patch(`/api/admin/users/${ADMIN_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'VIEWER' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot demote the last active System Administrator');

      // Confirm admin remains ADMIN
      const admin = db.prepare(`SELECT role FROM users WHERE id = ?`).get(ADMIN_ID) as { role: string };
      expect(admin.role).toBe('ADMIN');
    });

    it('rejects unsupported invalid role values', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      const res = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPERUSER_HACK' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid role');
    });
  });

  // 4. Real-Time Privilege Revocation (Stale Token Invalidation)
  describe('Immediate Session Privilege Revocation', () => {
    it('immediately denies Owner-only operations to an existing session token when role is demoted to Viewer', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      // Step 1: Promote Bob to OWNER so he can upload documents
      const promoRes = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'OWNER' });
      expect(promoRes.status).toBe(200);

      // Step 2: Bob signs in and receives a JWT token with OWNER privileges
      const bobOwnerToken = await login('bob@trustvault.local', 'Bob@TrustVault2026!');

      // Step 3: Verify Bob can successfully upload a document using this token
      const pdfHeader = Buffer.from('%PDF-1.7\nTest content for bob owner\n%%EOF');
      const uploadRes1 = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${bobOwnerToken}`)
        .attach('file', pdfHeader, 'bobs-doc.pdf')
        .field('displayName', "Bob's Initial Document")
        .field('category', 'Engineering')
        .field('description', 'Uploaded while Owner');

      expect(uploadRes1.status).toBe(201);
      expect(uploadRes1.body.document).toBeDefined();

      // Step 4: System Administrator demotes Bob back to VIEWER
      const demoteRes = await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'VIEWER' });

      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.user.role).toBe('VIEWER');

      // Step 5: Bob attempts another upload using his EXISTING UNEXPIRED TOKEN (without re-logging in)
      const uploadRes2 = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${bobOwnerToken}`) // Same token!
        .attach('file', pdfHeader, 'bobs-second-doc.pdf')
        .field('displayName', "Bob's Disallowed Second Document")
        .field('category', 'Engineering')
        .field('description', 'Should be blocked immediately');

      // Step 6: Verify immediate enforcement: request is rejected with 403 Forbidden!
      expect(uploadRes2.status).toBe(403);
      expect(uploadRes2.body.error).toContain('Requires one of [OWNER, ADMIN]');
    });

    it('denies Viewer from performing Owner-only operations directly via the API', async () => {
      // Bob is a VIEWER by default
      const bobToken = await login('bob@trustvault.local', 'Bob@TrustVault2026!');
      const pdfHeader = Buffer.from('%PDF-1.7\nViewer attempt\n%%EOF');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${bobToken}`)
        .attach('file', pdfHeader, 'viewer-doc.pdf')
        .field('displayName', 'Viewer Doc')
        .field('category', 'Engineering');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });

  // 5. Document Ownership Separation
  describe('Document Ownership Separation', () => {
    it('preserves existing document records and ownership intact when an account role is changed', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      // Count Alice's owned documents before role change
      const docsBefore = db.prepare(`SELECT * FROM documents WHERE owner_id = ?`).all(ALICE_ID) as any[];
      expect(docsBefore.length).toBeGreaterThan(0);

      // Admin changes Alice's role from OWNER to VIEWER
      const res = await request(app)
        .patch(`/api/admin/users/${ALICE_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'VIEWER' });

      expect(res.status).toBe(200);

      // Verify Alice's documents still exist and are still owned by Alice
      const docsAfter = db.prepare(`SELECT * FROM documents WHERE owner_id = ?`).all(ALICE_ID) as any[];
      expect(docsAfter.length).toBe(docsBefore.length);
      expect(docsAfter[0].id).toBe(docsBefore[0].id);
      expect(docsAfter[0].owner_id).toBe(ALICE_ID);
    });
  });

  // 6. Cryptographic Audit Logging
  describe('Audit Logging of Role Changes', () => {
    it('records an immutable, tamper-evident ROLE_CHANGE audit log with previous and new role', async () => {
      const adminToken = await login('admin@trustvault.local', 'Admin@TrustVault2026!');

      await request(app)
        .patch(`/api/admin/users/${BOB_ID}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'OWNER' });

      // Query audit trail for the ROLE_CHANGE event
      const logRecord = db.prepare(
        `SELECT * FROM audit_logs WHERE action = 'ROLE_CHANGE' ORDER BY rowid DESC LIMIT 1`
      ).get() as any;

      expect(logRecord).toBeDefined();
      expect(logRecord.actor_id).toBe(ADMIN_ID);
      expect(logRecord.action).toBe('ROLE_CHANGE');
      expect(logRecord.outcome).toBe('SUCCESS');

      const details = JSON.parse(logRecord.details);
      expect(details.previous_role).toBe('VIEWER');
      expect(details.new_role).toBe('OWNER');
      expect(details.target_user_id).toBe(BOB_ID);

      // Verify SHA-256 cryptographic chain integrity across entire audit trail
      const chainStatus = AuditService.verifyChainIntegrity();
      expect(chainStatus.isValid).toBe(true);
    });
  });
});
