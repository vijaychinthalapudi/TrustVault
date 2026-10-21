import { Router, Response } from 'express';
import { AuthService } from '../services/authService';
import { authenticate, extractRequestId } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { AuthenticatedRequest } from '../types';

const router = Router();
const loginRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxAttempts: 10 });

// POST /api/auth/register - Public self-registration (Strictly VIEWER role)
router.post('/register', extractRequestId, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required fields.' });
      return;
    }

    // Server assigns Viewer role by default. Client-supplied role is discarded.
    const result = await AuthService.register({
      name,
      email,
      password,
      requestId: req.requestId,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: 'User registered successfully with Viewer access.',
      user: result.user,
      token: result.token
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/init-admin - Secure bootstrap for first administrator if none exists
router.post('/init-admin', extractRequestId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    const result = await AuthService.initializeFirstAdmin({
      name,
      email,
      password,
      requestId: req.requestId,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: 'Initial System Administrator created successfully.',
      user: result.user,
      token: result.token
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', extractRequestId, loginRateLimiter, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const result = await AuthService.login({
      email,
      password,
      requestId: req.requestId,
      ipAddress: req.ip
    });

    res.json({
      message: 'Login successful.',
      user: result.user,
      token: result.token
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated.' });
    return;
  }

  const user = AuthService.getUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ user });
});

// GET /api/auth/users (for sharing user selection)
router.get('/users', extractRequestId, authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const users = AuthService.listUsers();
  res.json({ users });
});

export default router;
