import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { config } from '../config';
import { getSupabaseClient, ensureStorageBucket } from './supabaseClient';

export class DatabaseSyncService {
  private static syncTimeout: NodeJS.Timeout | null = null;
  private static isSyncing = false;

  /**
   * On startup, pulls down the latest persistent SQLite database snapshot from Supabase Storage
   * before the local database instance is queried or modified.
   */
  public static async restoreDatabaseIfAvailable(): Promise<boolean> {
    if (!config.isCloudPersistenceEnabled) {
      return false;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return false;

    try {
      await ensureStorageBucket();

      const bucket = config.supabaseStorageBucket;
      console.log(`[Database Persistence] Checking for remote database snapshot in '${bucket}/database/trustvault.db'...`);

      const { data, error } = await supabase.storage
        .from(bucket)
        .download('database/trustvault.db');

      if (error || !data) {
        console.log(`[Database Persistence] No remote database snapshot found. Using local/fresh database.`);
        return false;
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 100) {
        console.warn(`[Database Persistence] Remote database snapshot is suspiciously small (${buffer.length} bytes), ignoring.`);
        return false;
      }

      // Ensure directory exists
      const dbDir = path.dirname(config.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Write snapshot to local dbPath
      fs.writeFileSync(config.dbPath, buffer);
      console.log(`[Database Persistence] Successfully restored persistent database snapshot (${buffer.length} bytes) from Supabase.`);
      return true;
    } catch (err: any) {
      console.warn(`[Database Persistence] Could not restore database from cloud: ${err.message}`);
      return false;
    }
  }

  /**
   * Synchronizes the current SQLite database (after WAL checkpoint) to Supabase Storage.
   */
  public static async syncDatabase(): Promise<boolean> {
    if (!config.isCloudPersistenceEnabled) {
      return false;
    }

    const supabase = getSupabaseClient();
    if (!supabase || this.isSyncing) return false;

    this.isSyncing = true;
    try {
      await ensureStorageBucket();

      // Checkpoint WAL so all pending transactions are committed into main .db file
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (checkpointErr: any) {
        console.warn(`[Database Persistence] WAL checkpoint notice: ${checkpointErr.message}`);
      }

      if (!fs.existsSync(config.dbPath)) {
        this.isSyncing = false;
        return false;
      }

      const dbBuffer = fs.readFileSync(config.dbPath);
      const bucket = config.supabaseStorageBucket;

      const { error } = await supabase.storage
        .from(bucket)
        .upload('database/trustvault.db', dbBuffer, {
          upsert: true,
          contentType: 'application/x-sqlite3'
        });

      if (error) {
        console.warn(`[Database Persistence] Warning uploading database snapshot: ${error.message}`);
        this.isSyncing = false;
        return false;
      }

      console.log(`[Database Persistence] Persisted database snapshot (${dbBuffer.length} bytes) to Supabase Storage.`);
      this.isSyncing = false;
      return true;
    } catch (err: any) {
      console.warn(`[Database Persistence] Error syncing database: ${err.message}`);
      this.isSyncing = false;
      return false;
    }
  }

  /**
   * Debounced sync: schedules a cloud snapshot after state mutations (uploads, user creation, role changes, grants)
   */
  public static scheduleSync(delayMs = 1500): void {
    if (!config.isCloudPersistenceEnabled) {
      return;
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this.syncDatabase().catch(err => {
        console.warn(`[Database Persistence] Background sync error: ${err.message}`);
      });
    }, delayMs);
  }
}
