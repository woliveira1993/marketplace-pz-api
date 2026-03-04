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
  logo_url: z.string().url().max(500).nullable().optional(),
  wallpaper_url: z.string().url().max(500).nullable().optional(),
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

  // POST /api/settings/upload-image?type=logo|wallpaper
  fastify.post('/upload-image', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Querystring: { type?: string } }>, reply: FastifyReply) => {
    const type = request.query.type;
    if (!['logo', 'wallpaper'].includes(type ?? '')) {
      return reply.code(400).send({ error: 'type deve ser "logo" ou "wallpaper"' });
    }

    const part = await request.file();
    if (!part) return reply.code(400).send({ error: 'Nenhum arquivo enviado' });

    const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
    if (!ALLOWED_MIME.has(part.mimetype)) {
      part.file.resume();
      return reply.code(400).send({ error: 'Tipo de arquivo não permitido' });
    }

    const { randomBytes } = await import('crypto');
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    const { extname, join } = await import('path');
    const { mkdirSync } = await import('fs');

    const uploadDir = join(process.cwd(), config.UPLOADS_DIR, 'store');
    mkdirSync(uploadDir, { recursive: true });

    const ext = extname(part.filename).toLowerCase() || `.${part.mimetype.split('/')[1]}`;
    const filename = `${request.tenantId}-${type}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    const filepath = join(uploadDir, filename);

    await pipeline(part.file, createWriteStream(filepath));

    const url = `${config.APP_PUBLIC_URL}/uploads/store/${filename}`;

    // Save directly to tenant_settings
    const field = type === 'logo' ? 'logo_url' : 'wallpaper_url';
    await import('../../database/knex.js').then(({ db }) =>
      db('tenant_settings').where('tenant_id', request.tenantId).update({ [field]: url, updated_at: new Date() })
    );

    return reply.code(201).send({ url, type });
  });
}
