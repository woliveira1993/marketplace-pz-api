import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('rcon_delivery_log', (table) => {
    table.increments('id').primary();
    table.integer('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    table.integer('rcon_action_id').nullable().references('id').inTable('rcon_actions').onDelete('SET NULL');
    table.text('command_sent').notNullable();
    table.text('response').nullable();
    table.boolean('success').notNullable().defaultTo(false);
    table.text('error_message').nullable();
    table.timestamp('executed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['payment_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rcon_delivery_log');
}
