import { db } from '../../database/knex.js';
import { getMpPayment } from '../../services/mercadopago.service.js';
import { executeRconCommands } from '../../services/rcon.service.js';
import { renderCommand } from '../../services/template.service.js';
import { getMpCredentials, getRconConfig } from '../settings/settings.service.js';
import type { Payment, RconAction, Item } from '../../types/db.js';

export async function processRconDelivery(payment: Payment, tenantId: number): Promise<void> {
  if (!payment.item_id) return;

  const item = await db('items').where('id', payment.item_id).first() as Item;
  if (!item) return;

  // Load RCON actions: item-specific + global (item_id IS NULL), ordered by exec_order
  const actions = await db('rcon_actions')
    .where('tenant_id', tenantId)
    .where((builder) => {
      builder.where('item_id', payment.item_id).orWhereNull('item_id');
    })
    .orderBy('exec_order', 'asc') as RconAction[];

  if (actions.length === 0) return;

  const rconConfig = await getRconConfig(tenantId);
  if (!rconConfig) {
    throw new Error('RCON not configured for tenant');
  }

  // Render all commands with template variables
  // Use purchased_quantity if set (custom quantity items), otherwise item default quantity
  const effectiveQuantity = payment.purchased_quantity ?? item.quantity;
  const templateVars = {
    username: payment.username ?? '',
    quantity: effectiveQuantity,
    unit_label: item.unit_label,
    item_name: item.name,
    amount: payment.amount,
    email: payment.email ?? '',
    transaction_id: payment.transaction_id?.toString() ?? '',
  };

  const renderedCommands: Array<{ actionId: number; command: string }> = [];
  for (const action of actions) {
    try {
      const command = renderCommand(action.command, templateVars);
      renderedCommands.push({ actionId: action.id, command });
    } catch (err) {
      await db('rcon_delivery_log').insert({
        payment_id: payment.id,
        rcon_action_id: action.id,
        command_sent: action.command,
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (renderedCommands.length === 0) return;

  const results = await executeRconCommands(
    rconConfig,
    renderedCommands.map((r) => r.command),
  );

  // Log each result
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const rendered = renderedCommands[i];
    await db('rcon_delivery_log').insert({
      payment_id: payment.id,
      rcon_action_id: rendered?.actionId ?? null,
      command_sent: result.command,
      response: result.response,
      success: result.success,
      error_message: result.error ?? null,
    });
  }

  const allSucceeded = results.every((r) => r.success);
  if (allSucceeded) {
    await db('payments').where('id', payment.id).update({
      delivered: true,
      updated_at: new Date(),
    });
  }
}

export async function handleMpWebhook(
  tenantId: number,
  tenantSlug: string,
  body: unknown,
  logger: { error: (obj: unknown, msg: string) => void },
): Promise<void> {
  const webhookBody = body as {
    action?: string;
    data?: { id?: string | number };
  };

  if (
    webhookBody?.action !== 'payment.updated' ||
    !webhookBody?.data?.id
  ) {
    return; // Ignore irrelevant webhook events
  }

  const mpPaymentId = webhookBody.data.id;

  const creds = await getMpCredentials(tenantId);
  if (!creds) {
    logger.error({ tenantId }, 'MP credentials not configured for tenant in webhook');
    return;
  }

  let mpPayment;
  try {
    mpPayment = await getMpPayment(tenantId, creds, mpPaymentId);
  } catch (err) {
    logger.error({ err, mpPaymentId }, 'Failed to fetch MP payment in webhook');
    // Mark payment as error if we can find it
    await db('payments')
      .where('transaction_id', String(mpPaymentId))
      .where('tenant_id', tenantId)
      .update({ status: 'error', error: 'Falha ao verificar status no MercadoPago', updated_at: new Date() });
    return;
  }

  // Only process if date_approved is present (truly approved)
  if (!mpPayment.date_approved) {
    return;
  }

  // Update payment status to approved
  const [payment] = await db('payments')
    .where('transaction_id', String(mpPaymentId))
    .where('tenant_id', tenantId)
    .update({ status: 'approved', updated_at: new Date() })
    .returning('*');

  if (!payment) {
    logger.error({ mpPaymentId, tenantId }, 'Payment not found in DB for webhook');
    return;
  }

  // Trigger RCON delivery if not already delivered
  if (!payment.delivered) {
    try {
      await processRconDelivery(payment, tenantId);
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, 'RCON delivery failed in webhook');
      // Do not rethrow — payment is marked approved, RCON can be retried manually
    }
  }
}
