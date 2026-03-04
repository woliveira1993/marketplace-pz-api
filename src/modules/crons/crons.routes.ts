import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import cron from 'node-cron';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { scheduleJob, unscheduleJob } from '../../services/cron.service.js';
import type { ServerCron } from '../../types/db.js';

const cronSchema = z.object({
  name: z.string().min(1).max(100),
  command: z.string().min(1).max(500),
  cron_expression: z.string().min(1).refine((expr) => cron.validate(expr), { message: 'Expressão cron inválida' }),
  enabled: z.boolean().default(true),
});

export default async function cronsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const crons = await db('server_crons').where('tenant_id', request.tenantId).orderBy('created_at', 'asc');
    return reply.send(crons);
  });

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = cronSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    const [cronJob] = await db('server_crons').insert({ ...result.data, tenant_id: request.tenantId }).returning('*') as ServerCron[];
    if (cronJob.enabled) scheduleJob(cronJob);
    return reply.code(201).send(cronJob);
  });

  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = cronSchema.partial().safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    const id = parseInt(request.params.id);
    const [updated] = await db('server_crons').where('id', id).where('tenant_id', request.tenantId).update({ ...result.data, updated_at: new Date() }).returning('*') as ServerCron[];
    if (!updated) return reply.code(404).send({ error: 'Automação não encontrada' });
    unscheduleJob(id);
    if (updated.enabled) scheduleJob(updated);
    return reply.send(updated);
  });

  fastify.put('/:id/toggle', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const existing = await db('server_crons').where('id', id).where('tenant_id', request.tenantId).first() as ServerCron | undefined;
    if (!existing) return reply.code(404).send({ error: 'Automação não encontrada' });
    const [updated] = await db('server_crons').where('id', id).update({ enabled: !existing.enabled, updated_at: new Date() }).returning('*') as ServerCron[];
    unscheduleJob(id);
    if (updated.enabled) scheduleJob(updated);
    return reply.send(updated);
  });

  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id);
    const deleted = await db('server_crons').where('id', id).where('tenant_id', request.tenantId).delete();
    if (!deleted) return reply.code(404).send({ error: 'Automação não encontrada' });
    unscheduleJob(id);
    return reply.send({ message: 'Automação removida' });
  });
}
