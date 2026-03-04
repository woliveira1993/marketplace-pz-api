import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';

const automationSchema = z.object({
  trigger_event: z.enum(['subscription_cancelled', 'subscription_expired', 'payment_overdue']),
  name: z.string().min(1).max(200),
  rcon_command: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
});

export default async function subscriptionAutomationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const automations = await db('subscription_automations').where('tenant_id', request.tenantId).orderBy('created_at', 'asc');
    return reply.send(automations);
  });

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = automationSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    const [auto] = await db('subscription_automations').insert({ ...result.data, tenant_id: request.tenantId }).returning('*');
    return reply.code(201).send(auto);
  });

  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = automationSchema.partial().safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const [updated] = await db('subscription_automations')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .update({ ...result.data, updated_at: new Date() })
      .returning('*');
    if (!updated) return reply.code(404).send({ error: 'Automação não encontrada' });
    return reply.send(updated);
  });

  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const deleted = await db('subscription_automations')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .delete();
    if (!deleted) return reply.code(404).send({ error: 'Automação não encontrada' });
    return reply.send({ message: 'Automação removida' });
  });

  fastify.put('/:id/toggle', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const existing = await db('subscription_automations').where('id', parseInt(request.params.id)).where('tenant_id', request.tenantId).first();
    if (!existing) return reply.code(404).send({ error: 'Automação não encontrada' });
    const [updated] = await db('subscription_automations')
      .where('id', existing.id)
      .update({ enabled: !existing.enabled, updated_at: new Date() })
      .returning('*');
    return reply.send(updated);
  });
}
