import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscription_automations', (t) => {
    t.increments('id').primary();
    t.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    // subscription_cancelled | subscription_expired | payment_overdue
    t.string('trigger_event', 50).notNullable();
    t.string('name', 200).notNullable();
    // RCON command template — vars: {{username}}, {{plan_name}}, {{email}}
    t.string('rcon_command', 500).notNullable();
    t.boolean('enabled').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('subscription_automations');
}
