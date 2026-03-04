import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../hooks/authenticate.js';
import {
  getSettings,
  updateStoreSettings,
  updateMpSettings,
  updateRconSettings,
  testRcon,
  getWebhookUrl,
} from './settings.service.js';
import { config } from '../../config.js';

const storeSchema = z.object({
  store_name: z.string().min(1).max(200).optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const mpSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

const rconSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(25575),
  password: z.string().min(1),
});

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await getSettings(request.tenantId);
    if (!settings) return reply.code(404).send({ error: 'Configurações não encontradas' });
    return reply.send(settings);
  });

  fastify.put('/store', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = storeSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }
    await updateStoreSettings(request.tenantId, result.data);
    return reply.send({ message: 'Configurações da loja atualizadas' });
  });

  fastify.put('/mercadopago', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = mpSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'client_id e client_secret são obrigatórios' });
    }
    try {
      await updateMpSettings(request.tenantId, result.data);
      return reply.send({ message: 'Credenciais MercadoPago salvas com sucesso' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_MP_CREDENTIALS') {
        return reply.code(400).send({ error: 'Credenciais MercadoPago inválidas. Verifique client_id e client_secret.' });
      }
      fastify.log.error(err, 'Error saving MP credentials');
      return reply.code(500).send({ error: 'Erro ao salvar credenciais' });
    }
  });

  fastify.put('/rcon', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = rconSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }
    await updateRconSettings(request.tenantId, result.data);
    return reply.send({ message: 'Configurações RCON salvas com sucesso' });
  });

  fastify.post('/rcon/test', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await testRcon(request.tenantId);
    return reply.send(result);
  });

  fastify.get('/webhook-url', async (request: FastifyRequest, reply: FastifyReply) => {
    const baseUrl = `${request.protocol}://${request.hostname}`;
    const url = await getWebhookUrl(request.tenantId, baseUrl);
    return reply.send({ webhook_url: url });
  });
}
