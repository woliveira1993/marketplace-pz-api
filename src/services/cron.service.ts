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

export async function initCronScheduler(): Promise<void> {
  const crons = await db('server_crons').where('enabled', true) as ServerCron[];
  for (const cronJob of crons) {
    scheduleJob(cronJob);
  }
  console.info(`[cron] Scheduler iniciado com ${crons.length} job(s) ativos`);
}
