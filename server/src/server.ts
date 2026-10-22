import { app } from './app';
import { config } from './config';
import { db } from './db';
import { seedDatabase } from './db/seed';
import { DatabaseSyncService } from './services/databaseSyncService';

async function bootstrap() {
  console.log(`=======================================================`);
  console.log(`  TrustVault Secure Document Engine`);
  console.log(`  Environment:       ${config.nodeEnv}`);
  console.log(`  Port:              ${config.port}`);
  console.log(`  Storage Directory: ${config.storageDir}`);
  console.log(`  Cloud Persistence: ${config.isCloudPersistenceEnabled ? 'ENABLED (Supabase Storage)' : 'LOCAL DISK (Fallback)'}`);
  console.log(`=======================================================`);

  // 1. Rehydrate database from durable cloud storage if configured
  if (config.isCloudPersistenceEnabled) {
    try {
      await DatabaseSyncService.restoreDatabaseIfAvailable();
    } catch (err: any) {
      console.warn(`[Bootstrap] Notice during cloud database rehydration: ${err.message}`);
    }
  }

  // 2. Safe, non-destructive seed verification (preserves user-created data)
  try {
    await seedDatabase(false);
  } catch (err: any) {
    console.warn(`[Bootstrap] Notice during database verification: ${err.message}`);
  }

  // 3. Sync initial state to cloud storage if enabled
  if (config.isCloudPersistenceEnabled) {
    try {
      await DatabaseSyncService.syncDatabase();
    } catch (err: any) {
      console.warn(`[Bootstrap] Initial cloud sync notice: ${err.message}`);
    }
  }

  const server = app.listen(config.port, () => {
    console.log(`TrustVault server actively listening on: http://localhost:${config.port}`);
  });

  // Graceful shutdown with state flush
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down TrustVault server...`);

    if (config.isCloudPersistenceEnabled) {
      try {
        console.log('[Shutdown] Flushing final database state to durable cloud storage...');
        await DatabaseSyncService.syncDatabase();
      } catch (err: any) {
        console.warn(`[Shutdown] Error flushing state: ${err.message}`);
      }
    }

    server.close(() => {
      try {
        db.close();
      } catch {}
      console.log('Database connection closed. Process exited safely.');
      process.exit(0);
    });

    // Hard fallback timeout
    setTimeout(() => {
      console.error('Graceful shutdown timeout exceeded, forcing exit.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal error during TrustVault startup:', err);
  process.exit(1);
});
