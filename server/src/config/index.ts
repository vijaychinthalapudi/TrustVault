import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'trustvault-super-secure-jwt-secret-key-2026-snovasys',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  storageDir: path.resolve(__dirname, '../../storage'),
  dbPath: process.env.NODE_ENV === 'test' 
    ? path.resolve(__dirname, '../../trustvault_test.db')
    : path.resolve(__dirname, '../../trustvault.db'),
  maxFileSizeBytes: 15 * 1024 * 1024, // 15MB
  allowedMimeTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  allowedExtensions: [
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.txt',
    '.csv',
    '.json',
    '.docx'
  ]
};
