import request from 'supertest';
import { app } from '../src/app';
import { seedDatabase } from '../src/db/seed';

let aliceToken: string;
let bobToken: string;
let charlieToken: string;

beforeAll(async () => {
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

describe('Search & Discovery Boundary (Zero Information Leakage)', () => {
  it('prevents non-grantees from discovering confidential document titles via search', async () => {
    // Charlie searches for confidential term 'Acquisition'
    const charlieRes = await request(app)
      .get('/api/documents?search=Acquisition')
      .set('Authorization', `Bearer ${charlieToken}`);

    expect(charlieRes.status).toBe(200);
    expect(charlieRes.body.documents).toHaveLength(0); // Strictly ZERO results

    // Bob also searches for 'Acquisition' (not granted to Bob)
    const bobRes = await request(app)
      .get('/api/documents?search=Acquisition')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(bobRes.status).toBe(200);
    expect(bobRes.body.documents).toHaveLength(0);

    // Alice (Owner) searches for 'Acquisition' -> Found
    const aliceRes = await request(app)
      .get('/api/documents?search=Acquisition')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.documents).toHaveLength(1);
    expect(aliceRes.body.documents[0].display_name).toBe('Strategic_Acquisition_TermSheet.pdf');
  });

  it('prevents category filter from leaking existence of confidential documents', async () => {
    // 'Legal' category only contains the confidential acquisition document
    const charlieRes = await request(app)
      .get('/api/documents?category=Legal')
      .set('Authorization', `Bearer ${charlieToken}`);

    expect(charlieRes.status).toBe(200);
    expect(charlieRes.body.documents).toHaveLength(0);

    // Alice sees it
    const aliceRes = await request(app)
      .get('/api/documents?category=Legal')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.documents).toHaveLength(1);
  });

  it('allows granted users to discover only their authorized documents in list/search', async () => {
    // Bob has READ grant for Financial Audit and EDIT grant for Security Baseline
    const bobRes = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(bobRes.status).toBe(200);
    expect(bobRes.body.documents).toHaveLength(2);

    const docNames = bobRes.body.documents.map((d: any) => d.display_name);
    expect(docNames).toContain('Q3_Financial_Audit_Report.pdf');
    expect(docNames).toContain('Security_Architecture_Baseline.json');
    expect(docNames).not.toContain('Strategic_Acquisition_TermSheet.pdf'); // Unrevealed!
  });

  it('ensures unrelated user sees zero documents in default document list', async () => {
    const charlieRes = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${charlieToken}`);

    expect(charlieRes.status).toBe(200);
    expect(charlieRes.body.documents).toHaveLength(0);
  });
});
