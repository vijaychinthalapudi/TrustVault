import { app } from './app';
import { config } from './config';
import { db } from './db';

const server = app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`  TrustVault Secure Document Engine`);
  console.log(`  Listening on: http://localhost:${config.port}`);
  console.log(`  Environment:  ${config.nodeEnv}`);
  console.log(`  Storage:      ${config.storageDir}`);
  console.log(`=======================================================`);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down TrustVault server...');
  server.close(() => {
    db.close();
    console.log('Database connections closed. Exiting process.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
