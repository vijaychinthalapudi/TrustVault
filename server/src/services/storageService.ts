import fs from 'fs';
import path from 'path';
import { config } from '../config';

export class StorageService {
  /**
   * Resolves and verifies that a storage path remains strictly within config.storageDir
   */
  private static getSafePath(storageKey: string): string {
    // Storage key should be an opaque UUID / filename
    const resolvedPath = path.resolve(config.storageDir, storageKey);
    const relative = path.relative(config.storageDir, resolvedPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('SECURITY VIOLATION: Path traversal detected in storage key resolution.');
    }

    return resolvedPath;
  }

  public static async saveFile(storageKey: string, buffer: Buffer): Promise<void> {
    const filePath = this.getSafePath(storageKey);
    await fs.promises.writeFile(filePath, buffer);
  }

  public static getFileStream(storageKey: string): fs.ReadStream {
    const filePath = this.getSafePath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error('Stored file does not exist.');
    }
    return fs.createReadStream(filePath);
  }

  public static getFileBuffer(storageKey: string): Buffer {
    const filePath = this.getSafePath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error('Stored file does not exist.');
    }
    return fs.readFileSync(filePath);
  }

  public static fileExists(storageKey: string): boolean {
    try {
      const filePath = this.getSafePath(storageKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  public static async deleteFile(storageKey: string): Promise<void> {
    const filePath = this.getSafePath(storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}
