import 'dotenv/config';
import { buildServer } from './server.js';
import { config } from './config.js';
import { db } from './database/knex.js';
import { cleanExpiredTokens } from './modules/auth/auth.service.js';
import { initCronScheduler } from './services/cron.service.js';

async function main() {
  const fastify = await buildServer();

  // Clean expired refresh tokens on startup
  await cleanExpiredTokens().catch((err) => {
    fastify.log.warn(err, 'Failed to clean expired tokens on startup');
  });

  await initCronScheduler().catch((err) => {
    fastify.log.warn(err, 'Failed to initialize cron scheduler on startup');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    await db.destroy();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
