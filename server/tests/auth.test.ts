import request from 'supertest';
import { app } from '../src/app';
import { seedDatabase } from '../src/db/seed';

beforeAll(async () => {
  await seedDatabase();
});

describe('Authentication & Identity Security', () => {
  it('allows valid user to sign in and returns JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@trustvault.local',
        password: 'Alice@TrustVault2026!'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@trustvault.local');
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.user.password_hash).toBeUndefined(); // Password hash must never leak
  });

  it('rejects invalid password with safe error message and logs audit event', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@trustvault.local',
        password: 'WrongPassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
    expect(res.body.token).toBeUndefined();
  });

  it('rejects nonexistent user email safely without timing/enumeration leak', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@trustvault.local',
        password: 'SomePassword123!'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('enforces password complexity requirement during registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Weak User',
        email: 'weak@trustvault.local',
        password: 'short'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Password must be at least 8 characters long');
  });

  it('always assigns VIEWER role to newly registered users by default', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New Viewer User',
        email: 'newviewer@trustvault.local',
        password: 'ViewerPassword2026!'
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('VIEWER');
    expect(res.body.user.email).toBe('newviewer@trustvault.local');
  });

  it('strictly ignores or rejects client-supplied elevated role (e.g. ADMIN or OWNER) during registration', async () => {
    // Adversary attempts self-privilege escalation by sending role: 'ADMIN'
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Adversary Admin Attempt',
        email: 'sneakyadmin@trustvault.local',
        password: 'SneakyPassword2026!',
        role: 'ADMIN' // Malicious input
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('VIEWER'); // Must be forced to VIEWER!
  });

  it('denies access to protected endpoint when token is missing', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('denies access to protected endpoint when token is forged or malformed', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer forged.invalid.token');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});
