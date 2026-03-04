import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.integer('plan_id').notNullable().references('id').inTable('subscription_plans').onDelete('RESTRICT');
    t.string('username', 100).notNullable();
    t.string('email', 255).notNullable();
    // active | pending_payment | cancelled | expired
    t.string('status', 30).notNullable().defaultTo('pending_payment');
    t.timestamp('started_at').nullable();
    t.timestamp('next_payment_due').nullable();
    t.timestamp('last_payment_at').nullable();
    t.timestamp('cancelled_at').nullable();
    t.text('cancel_reason').nullable();
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('subscriptions', (t) => {
    t.index(['tenant_id', 'username', 'email']);
    t.index(['tenant_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('subscriptions');
}
