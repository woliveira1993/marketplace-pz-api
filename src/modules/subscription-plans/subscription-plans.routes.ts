import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';

const planSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  interval_days: z.number().int().positive().default(30),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

const planItemSchema = z.object({
  item_id: z.number().int().positive().nullable().optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().default(0),
});

export default async function subscriptionPlansRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET / — list plans with their items
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const plans = await db('subscription_plans')
      .where('tenant_id', request.tenantId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc');

    // Attach plan_items to each plan
    const planIds = plans.map((p: { id: number }) => p.id);
    const planItems = planIds.length
      ? await db('plan_items')
          .whereIn('plan_id', planIds)
          .leftJoin('items', 'plan_items.item_id', 'items.id')
          .select(
            'plan_items.id',
            'plan_items.plan_id',
            'plan_items.item_id',
            'plan_items.name',
            'plan_items.description',
            'plan_items.sort_order',
            'items.name as item_name',
            'items.unit_label',
          )
          .orderBy('plan_items.sort_order', 'asc')
      : [];

    const result = plans.map((plan: { id: number }) => ({
      ...plan,
      items: planItems.filter((pi: { plan_id: number }) => pi.plan_id === plan.id),
    }));

    return reply.send(result);
  });

  // POST / — create plan
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = planSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    const [plan] = await db('subscription_plans').insert({ ...result.data, tenant_id: request.tenantId }).returning('*');
    return reply.code(201).send({ ...plan, items: [] });
  });

  // PUT /:id — update plan
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = planSchema.partial().safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const [updated] = await db('subscription_plans')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .update({ ...result.data, updated_at: new Date() })
      .returning('*');
    if (!updated) return reply.code(404).send({ error: 'Plano não encontrado' });
    return reply.send(updated);
  });

  // DELETE /:id — delete plan (only if no active subscriptions)
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const activeCount = await db('subscriptions')
      .where('plan_id', id)
      .where('tenant_id', request.tenantId)
      .whereIn('status', ['active', 'pending_payment'])
      .count('id as count')
      .first();
    if (Number(activeCount?.count) > 0) {
      return reply.code(409).send({ error: 'Plano possui assinaturas ativas. Cancele-as antes de deletar.' });
    }
    const deleted = await db('subscription_plans')
      .where('id', id)
      .where('tenant_id', request.tenantId)
      .delete();
    if (!deleted) return reply.code(404).send({ error: 'Plano não encontrado' });
    return reply.send({ message: 'Plano removido' });
  });

  // POST /:id/items — add item to plan
  fastify.post('/:id/items', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const planId = parseInt(request.params.id);
    const plan = await db('subscription_plans').where('id', planId).where('tenant_id', request.tenantId).first();
    if (!plan) return reply.code(404).send({ error: 'Plano não encontrado' });

    const result = planItemSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });
    if (!result.data.item_id && !result.data.name) {
      return reply.code(400).send({ error: 'Informe item_id ou name' });
    }
    const [planItem] = await db('plan_items').insert({ ...result.data, plan_id: planId }).returning('*');
    return reply.code(201).send(planItem);
  });

  // DELETE /:id/items/:itemId — remove item from plan
  fastify.delete('/:id/items/:itemId', async (request: FastifyRequest<{ Params: { id: string; itemId: string } }>, reply: FastifyReply) => {
    const planId = parseInt(request.params.id);
    const plan = await db('subscription_plans').where('id', planId).where('tenant_id', request.tenantId).first();
    if (!plan) return reply.code(404).send({ error: 'Plano não encontrado' });

    const deleted = await db('plan_items')
      .where('id', parseInt(request.params.itemId))
      .where('plan_id', planId)
      .delete();
    if (!deleted) return reply.code(404).send({ error: 'Item não encontrado no plano' });
    return reply.send({ message: 'Item removido do plano' });
  });
}
