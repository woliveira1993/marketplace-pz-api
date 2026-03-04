import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { AVAILABLE_TEMPLATE_VARS } from '../../services/template.service.js';

const actionSchema = z.object({
  item_id: z.number().int().nullable().optional(),
  command: z.string().min(1).max(1000),
  exec_order: z.coerce.number().int().default(0),
});

export default async function rconActionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /api/rcon-actions
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { item_id?: string } }>, reply: FastifyReply) => {
    let query = db('rcon_actions')
      .where('tenant_id', request.tenantId)
      .orderBy('exec_order', 'asc');

    if (request.query.item_id !== undefined) {
      query = query.where('item_id', request.query.item_id === 'null' ? null : parseInt(request.query.item_id, 10));
    }

    const actions = await query;
    return reply.send(actions);
  });

  // GET /api/rcon-actions/template-vars
  fastify.get('/template-vars', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(AVAILABLE_TEMPLATE_VARS);
  });

  // POST /api/rcon-actions
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = actionSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }

    // Validate item_id belongs to this tenant if provided
    if (result.data.item_id) {
      const item = await db('items')
        .where('id', result.data.item_id)
        .where('tenant_id', request.tenantId)
        .first();
      if (!item) return reply.code(404).send({ error: 'Item não encontrado' });
    }

    const [action] = await db('rcon_actions')
      .insert({ ...result.data, tenant_id: request.tenantId })
      .returning('*');

    return reply.code(201).send(action);
  });

  // PUT /api/rcon-actions/:id
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const actionId = parseInt(request.params.id, 10);
    const result = actionSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }

    if (result.data.item_id) {
      const item = await db('items')
        .where('id', result.data.item_id)
        .where('tenant_id', request.tenantId)
        .first();
      if (!item) return reply.code(404).send({ error: 'Item não encontrado' });
    }

    const [updated] = await db('rcon_actions')
      .where('id', actionId)
      .where('tenant_id', request.tenantId)
      .update({ ...result.data, updated_at: new Date() })
      .returning('*');

    if (!updated) return reply.code(404).send({ error: 'Ação RCON não encontrada' });
    return reply.send(updated);
  });

  // DELETE /api/rcon-actions/:id
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const actionId = parseInt(request.params.id, 10);
    const deleted = await db('rcon_actions')
      .where('id', actionId)
      .where('tenant_id', request.tenantId)
      .delete();

    if (!deleted) return reply.code(404).send({ error: 'Ação RCON não encontrada' });
    return reply.send({ message: 'Ação removida com sucesso' });
  });
}
