import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../../hooks/authenticate.js';
import { db } from '../../database/knex.js';
import { processRconDelivery } from '../webhooks/webhooks.service.js';

interface PaymentsQuery {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  date?: string;
}

export default async function paymentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // GET /api/payments
  fastify.get('/', async (request: FastifyRequest<{ Querystring: PaymentsQuery }>, reply: FastifyReply) => {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '10', 10)));
    const offset = (page - 1) * limit;

    let query = db('payments')
      .where('payments.tenant_id', request.tenantId)
      .leftJoin('items', 'payments.item_id', 'items.id')
      .select(
        'payments.*',
        'items.name as item_name',
        'items.unit_label',
      );

    if (request.query.search) {
      const search = `%${request.query.search}%`;
      query = query.where((builder) => {
        builder
          .whereILike('payments.username', search)
          .orWhereILike('payments.email', search)
          .orWhere('payments.transaction_id::text', 'ilike', search);
      });
    }

    if (request.query.status) {
      query = query.where('payments.status', request.query.status);
    }

    if (request.query.date) {
      query = query.whereRaw('DATE(payments.created_at) = ?', [request.query.date]);
    }

    const [{ count }] = await db('payments')
      .where('tenant_id', request.tenantId)
      .count('id as count');

    const totalItems = parseInt(String(count), 10);
    const totalPages = Math.ceil(totalItems / limit);

    const data = await query
      .orderBy('payments.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return reply.send({
      data,
      pagination: { total_items: totalItems, total_pages: totalPages, current_page: page, limit },
    });
  });

  // GET /api/payments/:id
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const payment = await db('payments')
      .where('id', parseInt(request.params.id, 10))
      .where('tenant_id', request.tenantId)
      .leftJoin('items', 'payments.item_id', 'items.id')
      .select('payments.*', 'items.name as item_name', 'items.unit_label')
      .first();

    if (!payment) return reply.code(404).send({ error: 'Pagamento não encontrado' });

    const logs = await db('rcon_delivery_log').where('payment_id', payment.id).orderBy('executed_at', 'asc');
    return reply.send({ ...payment, delivery_logs: logs });
  });

  // POST /api/payments/:id/retry-rcon
  fastify.post('/:id/retry-rcon', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const payment = await db('payments')
      .where('id', parseInt(request.params.id, 10))
      .where('tenant_id', request.tenantId)
      .first();

    if (!payment) return reply.code(404).send({ error: 'Pagamento não encontrado' });
    if (payment.status !== 'approved') {
      return reply.code(400).send({ error: 'Apenas pagamentos aprovados podem ter entrega reprocessada' });
    }

    try {
      await processRconDelivery(payment, request.tenantId);
      return reply.send({ message: 'Entrega RCON reprocessada com sucesso' });
    } catch (err) {
      fastify.log.error(err, 'Retry RCON error');
      return reply.code(500).send({ error: 'Erro ao reprocessar entrega RCON' });
    }
  });
}
