import request from 'supertest';
import { app } from '../src/app';
import { seedDatabase } from '../src/db/seed';

let aliceToken: string;
let bobToken: string;
let charlieToken: string;

const DOC1_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const BOB_USER_ID = '33333333-3333-4333-a333-333333333333';
const CHARLIE_USER_ID = '44444444-4444-4444-a444-444444444444';

beforeEach(async () => {
  await seedDatabase();

  const aliceRes = await request(app).post('/api/auth/login').send({
    email: 'alice@trustvault.local',
    password: 'Alice@TrustVault2026!'
  });
  aliceToken = aliceRes.body.token;

  const bobRes = await request(app).post('/api/auth/login').send({
    email: 'bob@trustvault.local',
    password: 'Bob@TrustVault2026!'
  });
  bobToken = bobRes.body.token;

  const charlieRes = await request(app).post('/api/auth/login').send({
    email: 'charlie@trustvault.local',
    password: 'Charlie@TrustVault2026!'
  });
  charlieToken = charlieRes.body.token;
});

describe('Immediate Revocation & Dynamic Permission Changes', () => {
  it('enforces immediate revocation: request starting after revocation commits is denied instantly', async () => {
    // 1. Verify Bob can initially download DOC1 (has READ grant from seed)
    const initialDownload = await request(app)
      .get(`/api/documents/${DOC1_ID}/download`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(initialDownload.status).toBe(200);

    // 2. Alice revokes Bob's access
    const revokeRes = await request(app)
      .delete(`/api/documents/${DOC1_ID}/permissions/${BOB_USER_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.message).toContain('Access revoked successfully');

    // 3. Bob's very next request must immediately fail with 403 Forbidden
    const postRevocationDownload = await request(app)
      .get(`/api/documents/${DOC1_ID}/download`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(postRevocationDownload.status).toBe(403);
    expect(postRevocationDownload.body.error).toContain('Access denied');
    expect(postRevocationDownload.body.byteLength || 0).toBe(0);

    // 4. Bob's metadata read is also immediately denied
    const postRevocationMetadata = await request(app)
      .get(`/api/documents/${DOC1_ID}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(postRevocationMetadata.status).toBe(403);
  });

  it('supports atomic grant, upgrade, downgrade, and revocation lifecycle', async () => {
    // 1. Charlie initially has NO access to DOC1
    const charlieInit = await request(app)
      .get(`/api/documents/${DOC1_ID}/download`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(charlieInit.status).toBe(403);

    // 2. Alice grants Charlie READ access
    const grantRead = await request(app)
      .put(`/api/documents/${DOC1_ID}/permissions/${CHARLIE_USER_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ permission: 'READ' });
    expect(grantRead.status).toBe(200);

    // 3. Charlie can now download
    const charlieRead = await request(app)
      .get(`/api/documents/${DOC1_ID}/download`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(charlieRead.status).toBe(200);

    // 4. Charlie tries to edit -> Denied (READ is read-only)
    const charlieEditAttempt = await request(app)
      .patch(`/api/documents/${DOC1_ID}`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ display_name: 'Charlie_Renamed.pdf' });
    expect(charlieEditAttempt.status).toBe(403);

    // 5. Alice upgrades Charlie to EDIT
    const upgradeEdit = await request(app)
      .put(`/api/documents/${DOC1_ID}/permissions/${CHARLIE_USER_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ permission: 'EDIT' });
    expect(upgradeEdit.status).toBe(200);

    // 6. Charlie can now edit
    const charlieEditSuccess = await request(app)
      .patch(`/api/documents/${DOC1_ID}`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ description: 'Edited by Charlie under authorized EDIT grant.' });
    expect(charlieEditSuccess.status).toBe(200);

    // 7. Alice downgrades Charlie back to READ
    const downgradeRead = await request(app)
      .put(`/api/documents/${DOC1_ID}/permissions/${CHARLIE_USER_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ permission: 'READ' });
    expect(downgradeRead.status).toBe(200);

    // 8. Charlie's subsequent edit attempt is immediately denied!
    const charliePostDowngradeEdit = await request(app)
      .patch(`/api/documents/${DOC1_ID}`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ description: 'Forbidden second edit attempt' });
    expect(charliePostDowngradeEdit.status).toBe(403);

    // 9. Alice revokes Charlie completely
    await request(app)
      .delete(`/api/documents/${DOC1_ID}/permissions/${CHARLIE_USER_ID}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    // 10. Charlie is immediately denied all downloads
    const charlieFinal = await request(app)
      .get(`/api/documents/${DOC1_ID}/download`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(charlieFinal.status).toBe(403);
  });
});
