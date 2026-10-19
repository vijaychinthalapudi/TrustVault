import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuditLog, AuditAction, AuditOutcome } from '../types';
import { calculateAuditHash, GENESIS_HASH } from '../utils/crypto';

export interface LogEventParams {
  actor_id: string;
  action: AuditAction;
  document_id?: string | null;
  outcome: AuditOutcome;
  request_id?: string;
  ip_address?: string;
  details?: Record<string, any>;
}

export class AuditService {
  /**
   * Sanitizes structured details to ensure no credentials, tokens, or raw secrets are recorded.
   */
  private static sanitizeDetails(details?: Record<string, any>): string {
    if (!details) return '{}';
    const clean: Record<string, any> = {};
    const FORBIDDEN_KEYS = ['password', 'token', 'secret', 'auth', 'authorization', 'bearer'];

    for (const [key, value] of Object.entries(details)) {
      if (FORBIDDEN_KEYS.some(f => key.toLowerCase().includes(f))) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = value;
      }
    }
    return JSON.stringify(clean);
  }

  /**
   * Records a tamper-evident, SHA-256 hash-chained audit log entry.
   */
  public static logEvent(params: LogEventParams): AuditLog {
    const eventId = uuidv4();
    const occurredAt = new Date().toISOString();
    const requestId = params.request_id || uuidv4();
    const ipAddress = params.ip_address || 'unknown';
    const documentId = params.document_id || null;
    const sanitizedDetails = this.sanitizeDetails(params.details);

    // Synchronously fetch the most recent audit log's hash within a transaction
    const getLatestHashStmt = db.prepare(`
      SELECT hash FROM audit_logs ORDER BY rowid DESC LIMIT 1
    `);

    const latest = getLatestHashStmt.get() as { hash: string } | undefined;
    const prevHash = latest ? latest.hash : GENESIS_HASH;

    // Calculate cryptographic SHA-256 block hash
    const currentHash = calculateAuditHash({
      event_id: eventId,
      occurred_at: occurredAt,
      actor_id: params.actor_id,
      action: params.action,
      document_id: documentId,
      outcome: params.outcome,
      details: sanitizedDetails,
      prev_hash: prevHash
    });

    const insertStmt = db.prepare(`
      INSERT INTO audit_logs (
        event_id, occurred_at, actor_id, action, document_id, 
        outcome, request_id, ip_address, details, prev_hash, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      insertStmt.run(
        eventId,
        occurredAt,
        params.actor_id,
        params.action,
        documentId,
        params.outcome,
        requestId,
        ipAddress,
        sanitizedDetails,
        prevHash,
        currentHash
      );
    } catch (err: any) {
      // Security fail-closed: sensitive operations must not proceed if auditing fails
      console.error('CRITICAL: Audit log emission failed:', err.message);
      throw new Error(`Audit recording failed: ${err.message}`);
    }

    return {
      event_id: eventId,
      occurred_at: occurredAt,
      actor_id: params.actor_id,
      action: params.action,
      document_id: documentId,
      outcome: params.outcome,
      request_id: requestId,
      ip_address: ipAddress,
      details: sanitizedDetails,
      prev_hash: prevHash,
      hash: currentHash
    };
  }

  /**
   * Cryptographically verifies the integrity of the entire audit chain.
   * Detects any altered records, deletions, or injected logs.
   */
  public static verifyChainIntegrity(): {
    isValid: boolean;
    totalRecords: number;
    brokenAtEventId?: string;
    message: string;
  } {
    const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY rowid ASC`).all() as AuditLog[];

    if (logs.length === 0) {
      return { isValid: true, totalRecords: 0, message: 'Audit log is empty (genesis state).' };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
      const record = logs[i];

      // 1. Verify that prev_hash matches the previous record's hash
      if (record.prev_hash !== expectedPrevHash) {
        return {
          isValid: false,
          totalRecords: logs.length,
          brokenAtEventId: record.event_id,
          message: `Chain broken at event ${record.event_id}: prev_hash mismatch. Expected ${expectedPrevHash}, found ${record.prev_hash}`
        };
      }

      // 2. Re-compute hash and assert it matches recorded hash
      const computedHash = calculateAuditHash({
        event_id: record.event_id,
        occurred_at: record.occurred_at,
        actor_id: record.actor_id,
        action: record.action,
        document_id: record.document_id,
        outcome: record.outcome,
        details: record.details,
        prev_hash: record.prev_hash
      });

      if (computedHash !== record.hash) {
        return {
          isValid: false,
          totalRecords: logs.length,
          brokenAtEventId: record.event_id,
          message: `Data tampering detected at event ${record.event_id}: hash recalculation mismatch.`
        };
      }

      expectedPrevHash = record.hash;
    }

    return {
      isValid: true,
      totalRecords: logs.length,
      message: `Audit chain fully verified. ${logs.length} records verified with cryptographic SHA-256 integrity.`
    };
  }

  /**
   * Retrieves audit logs with optional filters and actor name enrichment.
   */
  public static getLogs(filter: {
    actor_id?: string;
    document_id?: string;
    action?: string;
    outcome?: string;
    limit?: number;
    offset?: number;
  }): { logs: any[]; total: number } {
    let whereClause = '1=1';
    const params: any[] = [];

    if (filter.actor_id) {
      whereClause += ' AND a.actor_id = ?';
      params.push(filter.actor_id);
    }
    if (filter.document_id) {
      whereClause += ' AND a.document_id = ?';
      params.push(filter.document_id);
    }
    if (filter.action) {
      whereClause += ' AND a.action = ?';
      params.push(filter.action);
    }
    if (filter.outcome) {
      whereClause += ' AND a.outcome = ?';
      params.push(filter.outcome);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs a WHERE ${whereClause}`);
    const { total } = countStmt.get(...params) as { total: number };

    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const query = `
      SELECT 
        a.*,
        u.name as actor_name,
        u.email as actor_email,
        d.display_name as document_name
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_id = u.id
      LEFT JOIN documents d ON a.document_id = d.id
      WHERE ${whereClause}
      ORDER BY a.rowid DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(query).all(...params, limit, offset);
    return { logs, total };
  }

  /**
   * Retrieves audit trail for a specific document.
   */
  public static getDocumentAudit(documentId: string): any[] {
    const query = `
      SELECT 
        a.*,
        u.name as actor_name,
        u.email as actor_email
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_id = u.id
      WHERE a.document_id = ?
      ORDER BY a.rowid DESC
    `;
    return db.prepare(query).all(documentId);
  }
}
