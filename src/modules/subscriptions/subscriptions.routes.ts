import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { fireSubscriptionAutomations } from '../../services/subscription.service.js';

const cancelSchema = z.object({
  cancel_reason: z.string().max(500).optional(),
});

export default async function subscriptionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET / — list with filters
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: { page?: string; limit?: string; status?: string; plan_id?: string; search?: string } }>,
    reply: FastifyReply,
  ) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '30')));
    const offset = (page - 1) * limit;

    let query = db('subscriptions')
      .where('subscriptions.tenant_id', request.tenantId)
      .join('subscription_plans', 'subscriptions.plan_id', 'subscription_plans.id')
      .select(
        'subscriptions.*',
        'subscription_plans.name as plan_name',
        'subscription_plans.price as plan_price',
        'subscription_plans.interval_days',
      );

    if (request.query.status) query = query.where('subscriptions.status', request.query.status);
    if (request.query.plan_id) query = query.where('subscriptions.plan_id', parseInt(request.query.plan_id));
    if (request.query.search) {
      const s = `%${request.query.search}%`;
      query = query.where((b) => b.whereLike('subscriptions.username', s).orWhereLike('subscriptions.email', s));
    }

    const [{ count }] = await query.clone().count('subscriptions.id as count');
    const data = await query.orderBy('subscriptions.created_at', 'desc').limit(limit).offset(offset);

    return reply.send({
      data,
      pagination: { total_items: Number(count), total_pages: Math.ceil(Number(count) / limit), current_page: page, limit },
    });
  });

  // GET /:id — details
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const sub = await db('subscriptions')
      .where('subscriptions.id', parseInt(request.params.id))
      .where('subscriptions.tenant_id', request.tenantId)
      .join('subscription_plans', 'subscriptions.plan_id', 'subscription_plans.id')
      .select('subscriptions.*', 'subscription_plans.name as plan_name', 'subscription_plans.price as plan_price', 'subscription_plans.interval_days')
      .first();
    if (!sub) return reply.code(404).send({ error: 'Assinatura não encontrada' });

    const payments = await db('payments')
      .where('subscription_id', sub.id)
      .orderBy('created_at', 'desc')
      .select('id', 'amount', 'status', 'delivered', 'created_at', 'updated_at');

    return reply.send({ ...sub, payments });
  });

  // PUT /:id/cancel — cancel subscription + fire automations
  fastify.put('/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = cancelSchema.safeParse(request.body ?? {});
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const [updated] = await db('subscriptions')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .whereNotIn('status', ['cancelled'])
      .update({
        status: 'cancelled',
        cancelled_at: new Date(),
        cancel_reason: result.data.cancel_reason ?? null,
        updated_at: new Date(),
      })
      .returning('*');

    if (!updated) return reply.code(404).send({ error: 'Assinatura não encontrada ou já cancelada' });

    // Fire automations async (don't block response)
    fireSubscriptionAutomations(request.tenantId, 'subscription_cancelled', {
      username: updated.username,
      email: updated.email,
      plan_name: '',
    }).catch(() => {});

    return reply.send(updated);
  });
}
