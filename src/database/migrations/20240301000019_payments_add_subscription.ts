import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payments', (t) => {
    t.integer('subscription_id').nullable().references('id').inTable('subscriptions').onDelete('SET NULL');
    t.integer('plan_id').nullable().references('id').inTable('subscription_plans').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payments', (t) => {
    t.dropColumn('subscription_id');
    t.dropColumn('plan_id');
  });
}
