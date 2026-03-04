import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { getRconConfig } from '../settings/settings.service.js';
import { executeRconCommands } from '../../services/rcon.service.js';
import type { PzCommand } from '../../types/db.js';

function parsePlayers(response: string): string[] {
  const match = response.match(/Players connected \(\d+\):\s*(.*)/s);
  if (!match || !match[1].trim()) return [];
  return match[1].split(',').map((p) => p.trim()).filter(Boolean);
}

const executeSchema = z.object({
  command: z.string().min(1).max(500).trim(),
});

const customCommandSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: z.string().max(50).default('custom'),
  command_template: z.string().min(1).max(500),
  params: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'select', 'number']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    default: z.string().optional(),
  })).default([]),
  is_dangerous: z.boolean().default(false),
});

export default async function serverRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /api/server/status — player list via RCON
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const rconConfig = await getRconConfig(request.tenantId);
    if (!rconConfig) {
      return reply.send({ online: false, players: [], player_count: 0, error: 'RCON não configurado' });
    }
    try {
      const results = await executeRconCommands(rconConfig, ['players']);
      const result = results[0];
      if (!result?.success) {
        return reply.send({ online: false, players: [], player_count: 0, error: result?.error ?? 'Falha ao conectar' });
      }
      const players = parsePlayers(result.response ?? '');
      return reply.send({ online: true, players, player_count: players.length });
    } catch (err) {
      return reply.send({ online: false, players: [], player_count: 0, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/server/execute — execute any RCON command
  fastify.post('/execute', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = executeSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const rconConfig = await getRconConfig(request.tenantId);
    if (!rconConfig) return reply.code(503).send({ error: 'RCON não configurado' });

    let success = false;
    let response = '';
    try {
      const results = await executeRconCommands(rconConfig, [result.data.command]);
      const r = results[0];
      success = r?.success ?? false;
      response = r?.response ?? r?.error ?? '';
    } catch (err) {
      response = err instanceof Error ? err.message : String(err);
    }

    await db('server_command_logs').insert({
      tenant_id: request.tenantId,
      command: result.data.command,
      response,
      success,
      source: 'manual',
      executed_at: new Date(),
    });

    return reply.send({ command: result.data.command, response, success });
  });

  // GET /api/server/commands — built-in + tenant custom commands
  fastify.get('/commands', async (request: FastifyRequest, reply: FastifyReply) => {
    const commands = await db('pz_commands')
      .where(function () {
        this.whereNull('tenant_id').orWhere('tenant_id', request.tenantId);
      })
      .orderBy('category', 'asc')
      .orderBy('label', 'asc') as PzCommand[];
    return reply.send(commands);
  });

  // POST /api/server/commands — create custom command
  fastify.post('/commands', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = customCommandSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    const [cmd] = await db('pz_commands')
      .insert({ ...result.data, params: JSON.stringify(result.data.params), tenant_id: request.tenantId })
      .returning('*');
    return reply.code(201).send(cmd);
  });

  // PUT /api/server/commands/:id — update (only own custom commands)
  fastify.put('/commands/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const result = customCommandSchema.partial().safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const updateData: Record<string, unknown> = { ...result.data, updated_at: new Date() };
    if (result.data.params) updateData.params = JSON.stringify(result.data.params);
    const [updated] = await db('pz_commands')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .update(updateData)
      .returning('*');
    if (!updated) return reply.code(404).send({ error: 'Comando não encontrado ou não editável' });
    return reply.send(updated);
  });

  // DELETE /api/server/commands/:id — delete (only own custom commands)
  fastify.delete('/commands/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const deleted = await db('pz_commands')
      .where('id', parseInt(request.params.id))
      .where('tenant_id', request.tenantId)
      .delete();
    if (!deleted) return reply.code(404).send({ error: 'Comando não encontrado ou não editável' });
    return reply.send({ message: 'Comando removido' });
  });

  // GET /api/server/logs — paginated execution log
  fastify.get('/logs', async (
    request: FastifyRequest<{ Querystring: { page?: string; limit?: string; source?: string } }>,
    reply: FastifyReply,
  ) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '50')));
    const offset = (page - 1) * limit;

    let query = db('server_command_logs').where('tenant_id', request.tenantId);
    if (request.query.source) query = query.where('source', request.query.source);

    const [{ count }] = await query.clone().count('id as count');
    const logs = await query.orderBy('executed_at', 'desc').limit(limit).offset(offset);

    return reply.send({
      data: logs,
      pagination: { total_items: Number(count), total_pages: Math.ceil(Number(count) / limit), current_page: page, limit },
    });
  });
}
