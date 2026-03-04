import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import fp from 'fastify-plugin';
import { join } from 'path';
import { mkdirSync } from 'fs';
import corsPlugin from './plugins/cors.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import authRoutes from './modules/auth/auth.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import itemsRoutes from './modules/items/items.routes.js';
import rconActionsRoutes from './modules/rcon-actions/rcon-actions.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import storeRoutes from './modules/store/store.routes.js';
import webhooksRoutes from './modules/webhooks/webhooks.routes.js';
import serverRoutes from './modules/server/server.routes.js';
import cronsRoutes from './modules/crons/crons.routes.js';
import subscriptionPlansRoutes from './modules/subscription-plans/subscription-plans.routes.js';
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes.js';
import subscriptionAutomationsRoutes from './modules/subscription-automations/subscription-automations.routes.js';
import { config } from './config.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    },
  });

  // Ensure uploads directory exists
  const uploadsDir = join(process.cwd(), config.UPLOADS_DIR);
  mkdirSync(join(uploadsDir, 'items'), { recursive: true });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // handled by frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow images from other origins
  });

  // File upload support (5 MB limit per file)
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });

  // Serve uploaded files as static assets
  await fastify.register(staticPlugin, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // Plugins
  await fastify.register(corsPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(rateLimitPlugin);

  // Routes
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(settingsRoutes, { prefix: '/api/settings' });
  fastify.register(itemsRoutes, { prefix: '/api/items' });
  fastify.register(rconActionsRoutes, { prefix: '/api/rcon-actions' });
  fastify.register(paymentsRoutes, { prefix: '/api/payments' });
  fastify.register(storeRoutes, { prefix: '/api/store' });
  fastify.register(webhooksRoutes, { prefix: '/webhooks' });
  fastify.register(serverRoutes, { prefix: '/api/server' });
  fastify.register(cronsRoutes, { prefix: '/api/crons' });
  fastify.register(subscriptionPlansRoutes, { prefix: '/api/subscription-plans' });
  fastify.register(subscriptionsRoutes, { prefix: '/api/subscriptions' });
  fastify.register(subscriptionAutomationsRoutes, { prefix: '/api/subscription-automations' });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return fastify;
}
