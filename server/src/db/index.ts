import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// Ensure storage and database directory exist
if (!fs.existsSync(config.storageDir)) {
  fs.mkdirSync(config.storageDir, { recursive: true });
}

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.dbPath);

// Enable WAL mode for high concurrency & durability; enforce foreign key constraints
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'VIEWER' CHECK(role IN ('ADMIN', 'OWNER', 'VIEWER')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
      created_at TEXT NOT NULL
    );
  `);

  // 2. Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      storage_key TEXT UNIQUE NOT NULL,
      content_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SOFT_DELETED', 'ARCHIVED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
  `);

  // 3. Document Permissions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_permissions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL CHECK(permission IN ('READ', 'EDIT')),
      granted_by TEXT NOT NULL REFERENCES users(id),
      granted_at TEXT NOT NULL,
      UNIQUE(document_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_permissions_doc_user ON document_permissions(document_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_user ON document_permissions(user_id);
  `);

  // 4. Audit Logs table (with Cryptographic SHA-256 Hash Chaining)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      event_id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      document_id TEXT,
      outcome TEXT NOT NULL CHECK(outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
      request_id TEXT NOT NULL,
      ip_address TEXT,
      details TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_logs(document_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_logs(occurred_at);
  `);

  // 5. Database triggers to enforce append-only immutability on audit_logs
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'SECURITY_VIOLATION: Audit logs are append-only and cannot be modified.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'SECURITY_VIOLATION: Audit logs are append-only and cannot be deleted.');
    END;
  `);
}

// Auto-initialize tables
initDatabase();
