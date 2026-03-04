import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../database/knex.js';
import { handleMpWebhook } from './webhooks.service.js';
import type { TenantSettings } from '../../types/db.js';

export default async function webhooksRoutes(fastify: FastifyInstance) {
  // POST /webhooks/mp/:slug/:secret
  fastify.post('/mp/:slug/:secret', async (
    request: FastifyRequest<{ Params: { slug: string; secret: string } }>,
    reply: FastifyReply,
  ) => {
    // Always return 200 immediately — MP retries on non-200
    // Process asynchronously
    reply.code(200).send({ received: true });

    const { slug, secret } = request.params;

    try {
      const tenant = await db('tenants')
        .where('slug', slug.toLowerCase())
        .where('is_active', true)
        .first();

      if (!tenant) return;

      const settings = await db('tenant_settings')
        .where('tenant_id', tenant.id)
        .first() as TenantSettings | undefined;

      if (!settings?.webhook_secret || settings.webhook_secret !== secret) {
        fastify.log.warn({ slug, secret }, 'Webhook secret mismatch');
        return;
      }

      await handleMpWebhook(tenant.id, tenant.slug, request.body, fastify.log);
    } catch (err) {
      fastify.log.error(err, 'Unexpected error in webhook handler');
    }
  });
}
