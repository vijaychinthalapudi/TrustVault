import { seedDatabase } from '../src/db/seed';
import { db } from '../src/db';
import { StorageService } from '../src/services/storageService';
import { DocumentService } from '../src/services/documentService';
import { AuthService } from '../src/services/authService';
import { DatabaseSyncService } from '../src/services/databaseSyncService';

describe('Data Persistence & Non-Destructive Seeding Verification', () => {
  beforeEach(async () => {
    // Tests use clean test fixture
    await seedDatabase(true);
  });

  it('guarantees that non-destructive seedDatabase(false) does not wipe user-created documents or accounts', async () => {
    // 1. Create a custom user account
    const userRes = await AuthService.register({
      name: 'Persistent Tester',
      email: 'tester@persistent.local',
      password: 'Password@2026!'
    });
    const createdUserId = userRes.user.id;

    // 2. Upload a custom confidential document as Alice (Owner)
    const alice = AuthService.getUserById('22222222-2222-4222-a222-222222222222') as any;
    expect(alice).toBeDefined();
    const pdfBytes = Buffer.from('%PDF-1.7\nPersistent User Document Bytes\n%%EOF');

    const doc = await DocumentService.uploadDocument({
      actor: { userId: alice.id, email: alice.email, role: 'OWNER' },
      originalName: 'Quarterly_Report_User_Created.pdf',
      buffer: pdfBytes,
      clientMimeType: 'application/pdf',
      category: 'Finance',
      description: 'Document created by user that must survive service restart'
    });

    const createdDocId = doc.id;

    // Verify document was saved to storage
    const downloadedBuffer = await StorageService.getFileBuffer(doc.storage_key);
    expect(downloadedBuffer.toString()).toContain('Persistent User Document Bytes');

    // 3. Simulate a server restart or redeployment: run seedDatabase(false)
    await seedDatabase(false);

    // 4. Assert that user-created account STILL EXISTS
    const userAfterRestart = AuthService.getUserById(createdUserId);
    expect(userAfterRestart).toBeDefined();
    expect(userAfterRestart?.email).toBe('tester@persistent.local');

    // 5. Assert that user-created document metadata STILL EXISTS
    const docInDb = db.prepare('SELECT * FROM documents WHERE id = ?').get(createdDocId) as any;
    expect(docInDb).toBeDefined();
    expect(docInDb.display_name).toBe('Quarterly_Report_User_Created.pdf');
    expect(docInDb.status).toBe('ACTIVE');

    // 6. Assert that document binary contents STILL EXIST in storage
    const fileBytesAfterRestart = await StorageService.getFileBuffer(doc.storage_key);
    expect(fileBytesAfterRestart.toString()).toContain('Persistent User Document Bytes');

    // 7. Assert that the 3 default seed documents also remain intact
    const allDocs = db.prepare("SELECT * FROM documents WHERE status = 'ACTIVE'").all() as any[];
    expect(allDocs.length).toBeGreaterThanOrEqual(4); // 3 seeded + 1 user-created
  });

  it('handles DatabaseSyncService scheduleSync gracefully in local mode without errors', () => {
    expect(() => {
      DatabaseSyncService.scheduleSync(10);
    }).not.toThrow();
  });
});
