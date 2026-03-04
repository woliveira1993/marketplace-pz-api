import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('server_command_logs', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable();
    table.text('command').notNullable();
    table.text('response').nullable();
    table.boolean('success').notNullable().defaultTo(false);
    table.string('source', 20).notNullable().defaultTo('manual');
    table.integer('reference_id').nullable();
    table.timestamp('executed_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('server_command_logs');
}
