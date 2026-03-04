import cron from 'node-cron';
import { db } from '../database/knex.js';
import { getRconConfig } from '../modules/settings/settings.service.js';
import { executeRconCommands } from './rcon.service.js';
import type { ServerCron } from '../types/db.js';

const scheduledTasks = new Map<number, cron.ScheduledTask>();

async function runCronJob(cronJob: ServerCron): Promise<void> {
  let success = false;
  let response = '';

  try {
    const rconConfig = await getRconConfig(cronJob.tenant_id);
    if (!rconConfig) {
      response = 'RCON não configurado para este tenant';
    } else {
      const results = await executeRconCommands(rconConfig, [cronJob.command]);
      const result = results[0];
      success = result?.success ?? false;
      response = result?.response ?? result?.error ?? '';
    }
  } catch (err) {
    response = err instanceof Error ? err.message : String(err);
  }

  await db('server_command_logs').insert({
    tenant_id: cronJob.tenant_id,
    command: cronJob.command,
    response,
    success,
    source: 'cron',
    reference_id: cronJob.id,
    executed_at: new Date(),
  });

  await db('server_crons')
    .where('id', cronJob.id)
    .update({
      last_run_at: new Date(),
      last_status: success ? 'success' : 'error',
      updated_at: new Date(),
    });
}

export function scheduleJob(cronJob: ServerCron): void {
  if (!cron.validate(cronJob.cron_expression)) {
    console.warn(`[cron] Expressão inválida para job ${cronJob.id}: ${cronJob.cron_expression}`);
    return;
  }

  unscheduleJob(cronJob.id);

  if (!cronJob.enabled) return;

  const task = cron.schedule(cronJob.cron_expression, () => {
    runCronJob(cronJob).catch((err) => {
      console.error(`[cron] Job ${cronJob.id} falhou:`, err);
    });
  });

  scheduledTasks.set(cronJob.id, task);
  console.info(`[cron] Job ${cronJob.id} "${cronJob.name}" agendado: ${cronJob.cron_expression}`);
}

export function unscheduleJob(cronId: number): void {
  const task = scheduledTasks.get(cronId);
  if (task) {
    task.stop();
    scheduledTasks.delete(cronId);
  }
}

async function checkExpiredSubscriptions(): Promise<void> {
  const { fireSubscriptionAutomations } = await import('./subscription.service.js');

  // Find subscriptions that are 'active' but past next_payment_due by more than 1 day
  const now = new Date();
  const overdueThreshold = new Date(now);
  overdueThreshold.setDate(overdueThreshold.getDate() - 1);

  const expired = await db('subscriptions')
    .where('status', 'active')
    .where('next_payment_due', '<', overdueThreshold)
    .join('subscription_plans', 'subscriptions.plan_id', 'subscription_plans.id')
    .select('subscriptions.*', 'subscription_plans.name as plan_name');

  for (const sub of expired) {
    await db('subscriptions').where('id', sub.id).update({
      status: 'expired',
      updated_at: new Date(),
    });

    await fireSubscriptionAutomations(sub.tenant_id, 'subscription_expired', {
      username: sub.username,
      email: sub.email,
      plan_name: sub.plan_name,
    }).catch(() => {});

    console.info(`[subscription-check] Assinatura ${sub.id} (${sub.username}) expirada e automações disparadas`);
  }
}

export async function initCronScheduler(): Promise<void> {
  const crons = await db('server_crons').where('enabled', true) as ServerCron[];
  for (const cronJob of crons) {
    scheduleJob(cronJob);
  }
  console.info(`[cron] Scheduler iniciado com ${crons.length} job(s) ativos`);

  // System job: check expired subscriptions daily at midnight
  cron.schedule('0 0 * * *', async () => {
    await checkExpiredSubscriptions().catch((err) => {
      console.error('[subscription-check] Error:', err);
    });
  });
  console.info('[cron] Subscription expiry checker agendado (diariamente à meia-noite)');
}
