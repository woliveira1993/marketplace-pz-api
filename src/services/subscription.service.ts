import { db } from '../database/knex.js';
import { getRconConfig } from '../modules/settings/settings.service.js';
import { executeRconCommands } from './rcon.service.js';
import { renderCommand } from './template.service.js';
import type { Payment, SubscriptionPlan, PlanItem, Item } from '../types/db.js';

/**
 * Fire subscription automations for a given tenant+trigger.
 * Template vars: {{username}}, {{plan_name}}, {{email}}
 */
export async function fireSubscriptionAutomations(
  tenantId: number,
  trigger: 'subscription_cancelled' | 'subscription_expired' | 'payment_overdue',
  vars: { username: string; email: string; plan_name: string },
): Promise<void> {
  const automations = await db('subscription_automations')
    .where('tenant_id', tenantId)
    .where('trigger_event', trigger)
    .where('enabled', true);

  if (automations.length === 0) return;

  const rconConfig = await getRconConfig(tenantId);
  if (!rconConfig) return;

  const commands: string[] = [];
  for (const auto of automations) {
    try {
      commands.push(renderCommand(auto.rcon_command, vars));
    } catch {
      // skip bad template
    }
  }
  if (commands.length === 0) return;

  await executeRconCommands(rconConfig, commands).catch(() => {});
}

/**
 * Process subscription payment approval:
 * 1. Activate/renew subscription (status=active, update next_payment_due)
 * 2. Run rcon_actions for all plan items
 */
export async function processSubscriptionDelivery(payment: Payment, tenantId: number): Promise<void> {
  if (!payment.subscription_id || !payment.plan_id) return;

  const plan = await db('subscription_plans').where('id', payment.plan_id).first() as SubscriptionPlan | undefined;
  if (!plan) return;

  // Atomically extend next_payment_due in a single SQL UPDATE — no read-then-write,
  // so concurrent MP retry webhooks for the same payment cannot race and overwrite each other.
  // Rule: if next_payment_due is null or already past → extend from TODAY; otherwise → extend from next_payment_due.
  await db('subscriptions').where('id', payment.subscription_id).update({
    status: 'active',
    started_at: db.raw('COALESCE(started_at, NOW())'),
    last_payment_at: new Date(),
    next_payment_due: db.raw(
      `CASE
         WHEN next_payment_due IS NULL OR next_payment_due <= CURRENT_DATE
           THEN CURRENT_DATE + (? * INTERVAL '1 day')
         ELSE next_payment_due + (? * INTERVAL '1 day')
       END`,
      [plan.interval_days, plan.interval_days],
    ),
    updated_at: new Date(),
  });

  // Mark payment as delivered RIGHT AWAY so MP retry webhooks skip this payment on subsequent calls.
  await db('payments').where('id', payment.id).update({ delivered: true, updated_at: new Date() });

  // Run RCON actions for linked plan items (best-effort — does not affect subscription dates)
  const planItems = await db('plan_items')
    .where('plan_id', plan.id)
    .whereNotNull('item_id') as PlanItem[];

  if (planItems.length === 0) return;

  const itemIds = planItems.map((pi) => pi.item_id).filter(Boolean);
  const items = await db('items').whereIn('id', itemIds) as Item[];
  const subscription = await db('subscriptions').where('id', payment.subscription_id).first();

  const rconConfig = await getRconConfig(tenantId);
  if (!rconConfig) return;

  const username = subscription?.username ?? payment.username ?? '';
  const email = subscription?.email ?? payment.email ?? '';

  for (const planItem of planItems) {
    const item = items.find((i) => i.id === planItem.item_id);
    if (!item) continue;

    const actions = await db('rcon_actions')
      .where('tenant_id', tenantId)
      .where((b) => b.where('item_id', item.id).orWhereNull('item_id'))
      .orderBy('exec_order', 'asc');

    const templateVars = {
      username,
      quantity: item.quantity,
      unit_label: item.unit_label,
      item_name: item.name,
      amount: payment.amount,
      email,
      transaction_id: payment.transaction_id?.toString() ?? '',
      plan_name: plan.name,
    };

    for (const action of actions) {
      try {
        const command = renderCommand(action.command, templateVars);
        const results = await executeRconCommands(rconConfig, [command]);
        await db('rcon_delivery_log').insert({
          payment_id: payment.id,
          rcon_action_id: action.id,
          command_sent: command,
          response: results[0]?.response ?? null,
          success: results[0]?.success ?? false,
          error_message: results[0]?.error ?? null,
        });
      } catch {
        // log and continue
      }
    }
  }
}
