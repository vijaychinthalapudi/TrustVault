import path from 'path';
import { config } from '../config';

export interface FileValidationResult {
  valid: boolean;
  sanitizedName?: string;
  detectedMimeType?: string;
  error?: string;
}

// Magic bytes definitions
const MAGIC_SIGNATURES: Record<string, { signature: number[]; offset?: number }> = {
  pdf: { signature: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  png: { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  jpeg: { signature: [0xff, 0xd8, 0xff] },
  docx: { signature: [0x50, 0x4b, 0x03, 0x04] } // Zip format standard
};

// Dangerous executable signatures to reject unconditionally
const EXECUTABLE_SIGNATURES = [
  { name: 'Windows PE/EXE', signature: [0x4d, 0x5a] }, // MZ
  { name: 'Linux ELF', signature: [0x7f, 0x45, 0x4c, 0x46] }, // .ELF
  { name: 'Java Class', signature: [0xca, 0xfe, 0xba, 0xbe] }
];

export function sanitizeFileName(originalName: string): string {
  // 1. Strip path components
  const baseName = path.basename(originalName);

  // 2. Reject path traversal sequences explicitly
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    // Return sanitized clean name
  }

  // 3. Remove null bytes and non-printable control characters
  const clean = baseName.replace(/[\x00-\x1f\x80-\x9f]/g, '').trim();

  // 4. Ensure it has a safe name
  return clean.length > 0 ? clean : 'unnamed_file';
}

export function validateUploadedFile(
  originalName: string,
  buffer: Buffer,
  clientMimeType: string
): FileValidationResult {
  // Check 1: Size
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  if (buffer.length > config.maxFileSizeBytes) {
    return { valid: false, error: `File exceeds maximum allowed size of ${config.maxFileSizeBytes / (1024 * 1024)}MB.` };
  }

  // Check 2: Path traversal detection
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    return { valid: false, error: 'Security violation: Path traversal detected in filename.' };
  }

  const sanitized = sanitizeFileName(originalName);
  const ext = path.extname(sanitized).toLowerCase();

  // Check 3: Extension whitelist
  if (!config.allowedExtensions.includes(ext)) {
    return { 
      valid: false, 
      error: `File extension '${ext}' is not permitted. Permitted: ${config.allowedExtensions.join(', ')}` 
    };
  }

  // Check 4: Executable header check (disallow disguised binaries)
  for (const exe of EXECUTABLE_SIGNATURES) {
    if (buffer.length >= exe.signature.length) {
      let matches = true;
      for (let i = 0; i < exe.signature.length; i++) {
        if (buffer[i] !== exe.signature[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return { 
          valid: false, 
          error: `Security violation: Disguised binary/executable content detected (${exe.name}).` 
        };
      }
    }
  }

  // Check 5: Magic bytes inspection based on claimed extension
  if (ext === '.pdf') {
    const sig = MAGIC_SIGNATURES.pdf.signature;
    const matches = buffer.length >= sig.length && sig.every((byte, idx) => buffer[idx] === byte);
    if (!matches) {
      return { valid: false, error: 'File content does not match genuine PDF signature.' };
    }
    return { valid: true, sanitizedName: sanitized, detectedMimeType: 'application/pdf' };
  }

  if (ext === '.png') {
    const sig = MAGIC_SIGNATURES.png.signature;
    const matches = buffer.length >= sig.length && sig.every((byte, idx) => buffer[idx] === byte);
    if (!matches) {
      return { valid: false, error: 'File content does not match genuine PNG signature.' };
    }
    return { valid: true, sanitizedName: sanitized, detectedMimeType: 'image/png' };
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    const sig = MAGIC_SIGNATURES.jpeg.signature;
    const matches = buffer.length >= sig.length && sig.every((byte, idx) => buffer[idx] === byte);
    if (!matches) {
      return { valid: false, error: 'File content does not match genuine JPEG signature.' };
    }
    return { valid: true, sanitizedName: sanitized, detectedMimeType: 'image/jpeg' };
  }

  if (ext === '.docx') {
    const sig = MAGIC_SIGNATURES.docx.signature;
    const matches = buffer.length >= sig.length && sig.every((byte, idx) => buffer[idx] === byte);
    if (!matches) {
      return { valid: false, error: 'File content does not match genuine DOCX package signature.' };
    }
    return { valid: true, sanitizedName: sanitized, detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  if (ext === '.txt' || ext === '.csv' || ext === '.json') {
    // Check for null bytes to prevent binary smuggling in text files
    for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
      if (buffer[i] === 0x00) {
        return { valid: false, error: 'Security violation: Null bytes detected in plain text file.' };
      }
    }

    if (ext === '.json') {
      try {
        JSON.parse(buffer.toString('utf-8'));
      } catch {
        return { valid: false, error: 'File content is not valid JSON.' };
      }
      return { valid: true, sanitizedName: sanitized, detectedMimeType: 'application/json' };
    }

    return { 
      valid: true, 
      sanitizedName: sanitized, 
      detectedMimeType: ext === '.csv' ? 'text/csv' : 'text/plain' 
    };
  }

  return { valid: false, error: 'Unsupported file format.' };
}
