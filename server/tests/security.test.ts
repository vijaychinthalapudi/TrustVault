import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import { AuditService } from '../src/services/auditService';

let aliceToken: string;
let bobToken: string;
let charlieToken: string;
let adminToken: string;

const DOC1_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; // Alice owned, Bob has READ grant
const DOC2_ID = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'; // Alice owned, NO grants (Strictly confidential)
const DOC3_ID = 'cccccccc-cccc-4ccc-accc-cccccccccccc'; // Alice owned, Bob has EDIT grant

beforeAll(async () => {
  await seedDatabase();

  // Login Alice (Owner)
  const aliceRes = await request(app).post('/api/auth/login').send({
    email: 'alice@trustvault.local',
    password: 'Alice@TrustVault2026!'
  });
  aliceToken = aliceRes.body.token;

  // Login Bob (Viewer with grants on DOC1 & DOC3)
  const bobRes = await request(app).post('/api/auth/login').send({
    email: 'bob@trustvault.local',
    password: 'Bob@TrustVault2026!'
  });
  bobToken = bobRes.body.token;

  // Login Charlie (Unrelated Viewer with NO grants)
  const charlieRes = await request(app).post('/api/auth/login').send({
    email: 'charlie@trustvault.local',
    password: 'Charlie@TrustVault2026!'
  });
  charlieToken = charlieRes.body.token;

  // Login Admin
  const adminRes = await request(app).post('/api/auth/login').send({
    email: 'admin@trustvault.local',
    password: 'Admin@TrustVault2026!'
  });
  adminToken = adminRes.body.token;
});

describe('TrustVault Security & Access Control Invariants', () => {
  describe('T-01: IDOR & Unauthorized Download Prevention', () => {
    it('denies unauthenticated user from downloading document bytes', async () => {
      const res = await request(app).get(`/api/documents/${DOC1_ID}/download`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('allows Bob to download DOC1 (has explicit READ grant)', async () => {
      const res = await request(app)
        .get(`/api/documents/${DOC1_ID}/download`)
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body.toString()).toContain('%PDF-1.5');
    });

    it('denies Charlie from downloading DOC1 (IDOR attempt: swapping document ID)', async () => {
      const res = await request(app)
        .get(`/api/documents/${DOC1_ID}/download`)
        .set('Authorization', `Bearer ${charlieToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
      // Assert zero file bytes leaked
      expect(res.body.byteLength || 0).toBe(0);
    });

    it('denies Bob from downloading DOC2 (Alice owned, strictly confidential with no grants)', async () => {
      const res = await request(app)
        .get(`/api/documents/${DOC2_ID}/download`)
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('denies Admin from downloading confidential document without explicit grant (Least Privilege)', async () => {
      const res = await request(app)
        .get(`/api/documents/${DOC2_ID}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Administrator role does not bypass confidential document content protection');
    });
  });

  describe('T-02: Privilege Escalation & Granular Rights Enforcement', () => {
    it('denies READ grantee (Bob on DOC1) from editing metadata or replacing file', async () => {
      const res = await request(app)
        .patch(`/api/documents/${DOC1_ID}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ display_name: 'Hacked_Financial_Report.pdf' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('allows EDIT grantee (Bob on DOC3) to edit document metadata', async () => {
      const res = await request(app)
        .patch(`/api/documents/${DOC3_ID}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ description: 'Updated baseline with zero-trust principles.' });

      expect(res.status).toBe(200);
      expect(res.body.document.description).toBe('Updated baseline with zero-trust principles.');
    });

    it('denies EDIT grantee (Bob on DOC3) from deleting the document (Owner only)', async () => {
      const res = await request(app)
        .delete(`/api/documents/${DOC3_ID}`)
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only document owner can delete');
    });

    it('denies non-owner from granting permissions to other users', async () => {
      const res = await request(app)
        .put(`/api/documents/${DOC1_ID}/permissions/44444444-4444-4444-a444-444444444444`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ permission: 'READ' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only document owner can grant permissions');
    });
  });

  describe('T-03: Upload Safety, Magic Bytes & Path Traversal Prevention', () => {
    it('rejects executable disguised as PDF (magic bytes mismatch)', async () => {
      // Fake executable with MZ DOS header renamed to fake.pdf
      const fakeExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${aliceToken}`)
        .attach('file', fakeExeBuffer, 'invoice.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Disguised binary/executable content detected');
    });

    it('rejects path traversal in uploaded filename', async () => {
      const samplePdf = Buffer.from('%PDF-1.5\n%test\n%%EOF');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${aliceToken}`)
        .field('display_name', '../../../etc/passwd.pdf')
        .attach('file', samplePdf, 'passwd.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Path traversal detected');
    });

    it('rejects disallowed file extensions (.sh, .exe, .bat)', async () => {
      const scriptBuffer = Buffer.from('echo "malicious"');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${aliceToken}`)
        .attach('file', scriptBuffer, 'script.sh');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('File extension \'.sh\' is not permitted');
    });

    it('accepts legitimate genuine PDF file with opaque storage key generated server-side', async () => {
      const validPdf = Buffer.from('%PDF-1.5\n1 0 obj\n<< /Title (Legitimate Document) >>\nendobj\n%%EOF');

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${aliceToken}`)
        .field('category', 'Legal')
        .field('description', 'Genuine NDA Document')
        .attach('file', validPdf, 'Mutual_NDA.pdf');

      expect(res.status).toBe(201);
      expect(res.body.document.display_name).toBe('Mutual_NDA.pdf');
      // Storage key must be opaque and not expose internal filesystem paths
      expect(res.body.document.storage_key).not.toContain('..');
      expect(res.body.document.storage_key).not.toContain('Mutual_NDA.pdf');
    });
  });

  describe('T-04: Audit Trail Immutability & Tamper Evidence', () => {
    it('denies non-admin users from accessing system-wide audit logs', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${bobToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows admin to view system audit logs', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(res.body.logs.length).toBeGreaterThan(0);
    });

    it('verifies SHA-256 cryptographic chain integrity for audit logs', async () => {
      const res = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isValid).toBe(true);
      expect(res.body.totalRecords).toBeGreaterThan(0);
    });

    it('enforces append-only trigger in SQLite rejecting direct UPDATE on audit_logs', () => {
      expect(() => {
        db.exec(`UPDATE audit_logs SET outcome = 'SUCCESS' WHERE outcome = 'DENIED'`);
      }).toThrow(/SECURITY_VIOLATION/);
    });

    it('enforces append-only trigger in SQLite rejecting direct DELETE on audit_logs', () => {
      expect(() => {
        db.exec(`DELETE FROM audit_logs WHERE rowid = 1`);
      }).toThrow(/SECURITY_VIOLATION/);
    });
  });
});
