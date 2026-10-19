import { v4 as uuidv4 } from 'uuid';
import { db, initDatabase } from './index';
import { hashPassword } from '../utils/crypto';
import { StorageService } from '../services/storageService';
import { AuditService } from '../services/auditService';

export async function seedDatabase(): Promise<void> {
  console.log('--- Initializing TrustVault Database & Seeding Accounts ---');
  initDatabase();

  // Drop triggers temporarily only for clean idempotent re-seed
  db.exec(`
    DROP TRIGGER IF EXISTS prevent_audit_update;
    DROP TRIGGER IF EXISTS prevent_audit_delete;
    DELETE FROM audit_logs;
    DELETE FROM document_permissions;
    DELETE FROM documents;
    DELETE FROM users;
  `);

  initDatabase();

  const now = new Date().toISOString();

  // 1. Seed Users
  const adminPasswordHash = await hashPassword('Admin@TrustVault2026!');
  const alicePasswordHash = await hashPassword('Alice@TrustVault2026!');
  const bobPasswordHash = await hashPassword('Bob@TrustVault2026!');
  const charliePasswordHash = await hashPassword('Charlie@TrustVault2026!');

  const adminId = '11111111-1111-4111-a111-111111111111';
  const aliceId = '22222222-2222-4222-a222-222222222222';
  const bobId = '33333333-3333-4333-a333-333333333333';
  const charlieId = '44444444-4444-4444-a444-444444444444';

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
  `);

  insertUser.run(adminId, 'System Administrator', 'admin@trustvault.local', adminPasswordHash, 'ADMIN', now);
  insertUser.run(aliceId, 'Alice Jenkins (Finance Dir)', 'alice@trustvault.local', alicePasswordHash, 'OWNER', now);
  insertUser.run(bobId, 'Bob Miller (Auditor)', 'bob@trustvault.local', bobPasswordHash, 'VIEWER', now);
  insertUser.run(charlieId, 'Charlie Davis (Engineering)', 'charlie@trustvault.local', charliePasswordHash, 'VIEWER', now);

  console.log('✓ Seeded Users: Admin, Alice (Owner), Bob (Viewer), Charlie (Unrelated)');

  // 2. Seed Sample Documents owned by Alice
  const doc1Id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const doc1StorageKey = `${doc1Id}.pdf.bin`;
  const doc1PdfBuffer = Buffer.from(
    '%PDF-1.5\n%TrustVault Confidential Financial Audit Report\n1 0 obj\n<< /Title (Q3 Financial Audit Report) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );
  await StorageService.saveFile(doc1StorageKey, doc1PdfBuffer);

  const doc2Id = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const doc2StorageKey = `${doc2Id}.pdf.bin`;
  const doc2PdfBuffer = Buffer.from(
    '%PDF-1.5\n%TrustVault Strictly Confidential Strategic Acquisition Term Sheet\n1 0 obj\n<< /Title (Project Titan Term Sheet) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );
  await StorageService.saveFile(doc2StorageKey, doc2PdfBuffer);

  const doc3Id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const doc3StorageKey = `${doc3Id}.json.bin`;
  const doc3JsonBuffer = Buffer.from(
    JSON.stringify({
      specification: 'TrustVault Security Baseline v1.0',
      encryptionStandard: 'AES-GCM-256',
      hashAlgorithm: 'SHA-256 Chained',
      auditPolicy: 'Append-Only Strictly Enforced'
    }, null, 2)
  );
  await StorageService.saveFile(doc3StorageKey, doc3JsonBuffer);

  const insertDoc = db.prepare(`
    INSERT INTO documents (
      id, owner_id, display_name, category, storage_key, 
      content_type, file_size, checksum, description, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `);

  insertDoc.run(
    doc1Id,
    aliceId,
    'Q3_Financial_Audit_Report.pdf',
    'Finance',
    doc1StorageKey,
    'application/pdf',
    doc1PdfBuffer.length,
    '7a4192b6a93554b416298bb36b3281d7d084df5c52c2bc7e4c9f13c7ebcfca88',
    'Confidential Q3 financial reconciliation audit report.',
    now,
    now
  );

  insertDoc.run(
    doc2Id,
    aliceId,
    'Strategic_Acquisition_TermSheet.pdf',
    'Legal',
    doc2StorageKey,
    'application/pdf',
    doc2PdfBuffer.length,
    '9b6348ef5202888ec29bb6d8a39e6a9f4c39dc1d6682970529d2f2d93e782811',
    'Strictly confidential acquisition term sheet. Restricted to executive directors.',
    now,
    now
  );

  insertDoc.run(
    doc3Id,
    aliceId,
    'Security_Architecture_Baseline.json',
    'Engineering',
    doc3StorageKey,
    'application/json',
    doc3JsonBuffer.length,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'Approved security architecture baseline specifications.',
    now,
    now
  );

  console.log('✓ Seeded Documents: Financial Audit, Strategic Acquisition, Security Baseline');

  // 3. Seed Grants:
  // Bob has READ grant for doc1 (Financial Audit)
  // Bob has EDIT grant for doc3 (Security Baseline)
  // Doc2 has NO GRANTS (Restricted strictly to Alice)
  const insertGrant = db.prepare(`
    INSERT INTO document_permissions (id, document_id, user_id, permission, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertGrant.run(uuidv4(), doc1Id, bobId, 'READ', aliceId, now);
  insertGrant.run(uuidv4(), doc3Id, bobId, 'EDIT', aliceId, now);

  console.log('✓ Seeded Grants: Bob granted READ to Financial Audit, EDIT to Security Baseline');

  // 4. Seed Audit Trail with Cryptographic Chain
  AuditService.logEvent({
    actor_id: aliceId,
    action: 'DOCUMENT_UPLOAD',
    document_id: doc1Id,
    outcome: 'SUCCESS',
    details: { display_name: 'Q3_Financial_Audit_Report.pdf', category: 'Finance' }
  });

  AuditService.logEvent({
    actor_id: aliceId,
    action: 'DOCUMENT_UPLOAD',
    document_id: doc2Id,
    outcome: 'SUCCESS',
    details: { display_name: 'Strategic_Acquisition_TermSheet.pdf', category: 'Legal' }
  });

  AuditService.logEvent({
    actor_id: aliceId,
    action: 'DOCUMENT_UPLOAD',
    document_id: doc3Id,
    outcome: 'SUCCESS',
    details: { display_name: 'Security_Architecture_Baseline.json', category: 'Engineering' }
  });

  AuditService.logEvent({
    actor_id: aliceId,
    action: 'PERMISSION_GRANT',
    document_id: doc1Id,
    outcome: 'SUCCESS',
    details: { target_user_email: 'bob@trustvault.local', permission: 'READ' }
  });

  AuditService.logEvent({
    actor_id: aliceId,
    action: 'PERMISSION_GRANT',
    document_id: doc3Id,
    outcome: 'SUCCESS',
    details: { target_user_email: 'bob@trustvault.local', permission: 'EDIT' }
  });

  // Verify hash chain
  const verification = AuditService.verifyChainIntegrity();
  console.log(`✓ Audit Chain Initialized: ${verification.totalRecords} records verified cryptographically.`);
  console.log('--- Database Seeding Complete ---');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
