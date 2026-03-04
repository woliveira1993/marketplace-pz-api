import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../database/knex.js';
import {
  createPixPayment,
  buildExpirationDate,
} from '../../services/mercadopago.service.js';
import { getMpCredentials } from '../settings/settings.service.js';
import { randomBytes } from 'crypto';
import type { Tenant } from '../../types/db.js';

const paySchema = z.object({
  username: z.string().min(1).max(50).transform((s) => s.trim()),
  email: z.string().email(),
  item_id: z.number().int().positive(),
  // custom_quantity: only used when item.allow_custom_quantity = true
  custom_quantity: z.coerce.number().int().positive().optional(),
});

export default async function storeRoutes(fastify: FastifyInstance) {
  // GET /api/store/:slug — public config
  fastify.get('/:slug', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const tenant = await db('tenants')
      .where('slug', request.params.slug.toLowerCase())
      .where('is_active', true)
      .first() as Tenant | undefined;

    if (!tenant) return reply.code(404).send({ error: 'Loja não encontrada' });

    const settings = await db('tenant_settings').where('tenant_id', tenant.id).first();
    const items = await db('items')
      .where('tenant_id', tenant.id)
      .where('is_active', true)
      .orderBy('sort_order', 'asc')
      .select('id', 'name', 'description', 'price', 'quantity', 'unit_label', 'sort_order',
              'allow_custom_quantity', 'min_quantity', 'max_quantity', 'image_url');

    return reply.send({
      store_name: settings?.store_name ?? tenant.name,
      primary_color: settings?.primary_color ?? '#4d7c0f',
      background_color: settings?.background_color ?? '#0f1a0a',
      logo_url: settings?.logo_url ?? null,
      items,
    });
  });

  // POST /api/store/:slug/pay
  fastify.post('/:slug/pay', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const result = paySchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: result.error.flatten().fieldErrors });
    }

    const tenant = await db('tenants')
      .where('slug', request.params.slug.toLowerCase())
      .where('is_active', true)
      .first() as Tenant | undefined;

    if (!tenant) return reply.code(404).send({ error: 'Loja não encontrada' });

    const item = await db('items')
      .where('id', result.data.item_id)
      .where('tenant_id', tenant.id)
      .where('is_active', true)
      .first();

    if (!item) return reply.code(404).send({ error: 'Item não encontrado ou indisponível' });

    // Determine quantity and amount — backend is the source of truth for price
    let purchasedQuantity: number;
    let amount: number;

    if (item.allow_custom_quantity) {
      const reqQty = result.data.custom_quantity;
      if (!reqQty || reqQty < 1) {
        return reply.code(400).send({ error: 'Informe a quantidade desejada' });
      }
      const minQty = item.min_quantity ?? 1;
      const maxQty = item.max_quantity;
      if (reqQty < minQty) {
        return reply.code(400).send({ error: `Quantidade mínima é ${minQty} ${item.unit_label}` });
      }
      if (maxQty && reqQty > maxQty) {
        return reply.code(400).send({ error: `Quantidade máxima é ${maxQty} ${item.unit_label}` });
      }
      purchasedQuantity = reqQty;
      // price = unit price; backend calculates total
      amount = parseFloat((parseFloat(item.price) * reqQty).toFixed(2));
    } else {
      purchasedQuantity = item.quantity;
      amount = parseFloat(item.price);
    }

    const creds = await getMpCredentials(tenant.id);
    if (!creds) {
      return reply.code(503).send({ error: 'Pagamento não disponível no momento. Tente mais tarde.' });
    }

    const randomNum = randomBytes(4).readUInt32BE(0);
    const externalReference = `${result.data.username}-${randomNum}`;
    const idempotencyKey = `${result.data.email}-${randomNum}`;
    const dateOfExpiration = buildExpirationDate();

    // Insert pending payment first
    const [payment] = await db('payments').insert({
      external_reference: externalReference,
      amount,
      status: 'pending',
      delivered: false,
      lumes: item.unit_label === 'lumes' ? purchasedQuantity : null,
      purchased_quantity: purchasedQuantity,
      username: result.data.username,
      email: result.data.email,
      tenant_id: tenant.id,
      item_id: item.id,
      expiration_date: dateOfExpiration,
    }).returning('*');

    try {
      const pixResponse = await createPixPayment(tenant.id, creds, {
        amount,
        externalReference,
        email: result.data.email,
        description: `${item.name} - ${purchasedQuantity} ${item.unit_label}`,
        idempotencyKey,
        dateOfExpiration,
      });

      // Update with transaction_id from MP
      await db('payments').where('id', payment.id).update({
        transaction_id: pixResponse.transactionId,
        expiration_date: pixResponse.expirationDate,
        updated_at: new Date(),
      });

      return reply.code(201).send({
        pixCopiaECola: pixResponse.pixCopiaECola,
        transactionId: pixResponse.transactionId,
        qrCodeBase64: pixResponse.qrCodeBase64,
        expirationDate: pixResponse.expirationDate,
      });
    } catch (err) {
      // Mark payment as error
      const errMsg = err instanceof Error ? err.message : String(err);
      await db('payments').where('id', payment.id).update({
        status: 'error',
        error: errMsg.substring(0, 600),
        updated_at: new Date(),
      });
      fastify.log.error(err, 'PIX creation error');
      return reply.code(502).send({ error: 'Erro ao criar cobrança PIX. Tente novamente.' });
    }
  });

  // GET /api/store/:slug/payment/:transactionId — public status check
  fastify.get('/:slug/payment/:transactionId', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { slug: string; transactionId: string } }>,
    reply: FastifyReply,
  ) => {
    const tenant = await db('tenants')
      .where('slug', request.params.slug.toLowerCase())
      .where('is_active', true)
      .first() as Tenant | undefined;

    if (!tenant) return reply.code(404).send({ error: 'Loja não encontrada' });

    const payment = await db('payments')
      .where('payments.transaction_id', request.params.transactionId)
      .where('payments.tenant_id', tenant.id)
      .leftJoin('items', 'payments.item_id', 'items.id')
      .select(
        'payments.id',
        'payments.status',
        'payments.delivered',
        'payments.amount',
        'payments.username',
        'payments.lumes',
        'payments.expiration_date',
        'payments.error',
        'payments.created_at',
        'items.name as item_name',
        'items.quantity as item_quantity',
        'items.unit_label',
      )
      .first();

    if (!payment) return reply.code(404).send({ error: 'Pagamento não encontrado' });
    return reply.send(payment);
  });
}
