import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Lightweight sliding window rate limiter
 * Protects login and sensitive auth endpoints against brute force attempts
 */
export function createRateLimiter(options: { windowMs: number; maxAttempts: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetAt) {
      rateLimitMap.set(ip, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (record.count >= options.maxAttempts) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.status(429).json({
        error: `Too many requests from this IP. Please try again after ${waitSeconds} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED'
      });
      return;
    }

    record.count++;
    next();
  };
}
