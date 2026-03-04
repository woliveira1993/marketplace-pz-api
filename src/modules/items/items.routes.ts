import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { extname, join } from 'path';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { config } from '../../config.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  price: z.coerce.number().positive().multipleOf(0.01),
  quantity: z.coerce.number().int().positive(),
  unit_label: z.string().min(1).max(50).default('unidade'),
  sort_order: z.coerce.number().int().default(0),
  allow_custom_quantity: z.boolean().default(false),
  min_quantity: z.coerce.number().int().positive().nullable().optional(),
  max_quantity: z.coerce.number().int().positive().nullable().optional(),
  image_url: z.string().url().max(500).nullable().optional(),
});

const reorderSchema = z.array(z.object({
  id: z.number().int(),
  sort_order: z.number().int(),
})).min(1);

export default async function itemsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // POST /api/items/upload-image — must be before /:id routes
  fastify.post('/upload-image', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ error: 'Nenhum arquivo enviado' });
    }

    if (!ALLOWED_MIME.has(part.mimetype)) {
      part.file.resume(); // drain the stream
      return reply.code(400).send({ error: 'Tipo de arquivo não permitido. Use JPG, PNG, WebP, GIF ou SVG.' });
    }

    const ext = extname(part.filename).toLowerCase() || `.${part.mimetype.split('/')[1]}`;
    const filename = `${request.tenantId}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    const filepath = join(process.cwd(), config.UPLOADS_DIR, 'items', filename);

    await pipeline(part.file, createWriteStream(filepath));

    const url = `${config.APP_PUBLIC_URL}/uploads/items/${filename}`;
    return reply.code(201).send({ url });
  });

  // GET /api/items
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await db('items')
      .where('tenant_id', request.tenantId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc');
    return reply.send(items);
  });

  // POST /api/items
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = itemSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }

    const [item] = await db('items')
      .insert({ ...result.data, tenant_id: request.tenantId, is_active: true })
      .returning('*');

    return reply.code(201).send(item);
  });

  // PUT /api/items/reorder — must be before /:id
  fastify.put('/reorder', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = reorderSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos' });
    }

    await Promise.all(
      result.data.map(({ id, sort_order }) =>
        db('items')
          .where('id', id)
          .where('tenant_id', request.tenantId)
          .update({ sort_order, updated_at: new Date() })
      )
    );

    return reply.send({ message: 'Ordem atualizada' });
  });

  // PUT /api/items/:id
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const itemId = parseInt(request.params.id, 10);
    const result = itemSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }

    const [updated] = await db('items')
      .where('id', itemId)
      .where('tenant_id', request.tenantId)
      .update({ ...result.data, updated_at: new Date() })
      .returning('*');

    if (!updated) return reply.code(404).send({ error: 'Item não encontrado' });
    return reply.send(updated);
  });

  // DELETE /api/items/:id
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const itemId = parseInt(request.params.id, 10);

      const [item] = await db('items')
        .select('is_active')
        .where('id', itemId)
        .where('tenant_id', request.tenantId)

      if (!item) {
        throw new Error('Item não encontrado')
      }

      const toggleIsActive = !item.is_active

      const [updated] = await db('items')
        .where('id', itemId)
        .where('tenant_id', request.tenantId)
        .update({
          is_active: toggleIsActive,
          updated_at: new Date(),
        })
        .returning('*')

    if (!updated) return reply.code(404).send({ error: 'Item não encontrado' });
    return reply.send({ message: 'Item desativado com sucesso' });
  });
}
