import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthTokenPayload } from '../types';

const SALT_ROUNDS = 12;
export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
  } catch (err) {
    return null;
  }
}

export function calculateBufferSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function calculateAuditHash(data: {
  event_id: string;
  occurred_at: string;
  actor_id: string;
  action: string;
  document_id: string | null;
  outcome: string;
  details: string;
  prev_hash: string;
}): string {
  const content = [
    data.event_id,
    data.occurred_at,
    data.actor_id,
    data.action,
    data.document_id || 'NULL',
    data.outcome,
    data.details,
    data.prev_hash
  ].join('|');

  return crypto.createHash('sha256').update(content).digest('hex');
}
