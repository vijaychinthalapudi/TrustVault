import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getSupabaseClient, ensureStorageBucket } from './supabaseClient';

export class StorageService {
  /**
   * Resolves and verifies that a storage path remains strictly within config.storageDir
   */
  private static getSafePath(storageKey: string): string {
    const resolvedPath = path.resolve(config.storageDir, storageKey);
    const relative = path.relative(config.storageDir, resolvedPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('SECURITY VIOLATION: Path traversal detected in storage key resolution.');
    }

    return resolvedPath;
  }

  /**
   * Saves a file buffer locally and syncs to Supabase Storage if configured.
   */
  public static async saveFile(storageKey: string, buffer: Buffer): Promise<void> {
    const filePath = this.getSafePath(storageKey);
    await fs.promises.writeFile(filePath, buffer);

    if (config.isCloudPersistenceEnabled) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await ensureStorageBucket();
          const bucket = config.supabaseStorageBucket;
          const { error } = await supabase.storage
            .from(bucket)
            .upload(`documents/${storageKey}`, buffer, {
              upsert: true,
              contentType: 'application/octet-stream'
            });

          if (error) {
            console.warn(`[StorageService] Warning uploading to Supabase Storage: ${error.message}`);
          }
        } catch (err: any) {
          console.warn(`[StorageService] Cloud upload notice: ${err.message}`);
        }
      }
    }
  }

  public static getFileStream(storageKey: string): fs.ReadStream {
    const filePath = this.getSafePath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error('Stored file does not exist.');
    }
    return fs.createReadStream(filePath);
  }

  /**
   * Retrieves file buffer from local cache or pulls from durable cloud storage if missing.
   */
  public static async getFileBuffer(storageKey: string): Promise<Buffer> {
    const filePath = this.getSafePath(storageKey);

    // Fast-path: local cache hit
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }

    // Cloud pull if local file missing (e.g. after container restart)
    if (config.isCloudPersistenceEnabled) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await ensureStorageBucket();
          const bucket = config.supabaseStorageBucket;
          const { data, error } = await supabase.storage
            .from(bucket)
            .download(`documents/${storageKey}`);

          if (!error && data) {
            const arrayBuffer = await data.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            // Cache locally for subsequent reads
            await fs.promises.writeFile(filePath, buffer);
            return buffer;
          }
        } catch (err: any) {
          console.warn(`[StorageService] Could not fetch file from cloud storage: ${err.message}`);
        }
      }
    }

    throw new Error('Stored file does not exist.');
  }

  public static async fileExists(storageKey: string): Promise<boolean> {
    const filePath = this.getSafePath(storageKey);
    if (fs.existsSync(filePath)) {
      return true;
    }

    if (config.isCloudPersistenceEnabled) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const bucket = config.supabaseStorageBucket;
          const { data } = await supabase.storage
            .from(bucket)
            .list('documents', { search: storageKey });
          return Boolean(data && data.length > 0);
        } catch {
          return false;
        }
      }
    }

    return false;
  }

  public static async deleteFile(storageKey: string): Promise<void> {
    const filePath = this.getSafePath(storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }

    if (config.isCloudPersistenceEnabled) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const bucket = config.supabaseStorageBucket;
          await supabase.storage.from(bucket).remove([`documents/${storageKey}`]);
        } catch (err: any) {
          console.warn(`[StorageService] Cloud file deletion notice: ${err.message}`);
        }
      }
    }
  }
}
