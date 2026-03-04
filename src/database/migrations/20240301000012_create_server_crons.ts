import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('server_crons', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.text('command').notNullable();
    table.string('cron_expression', 100).notNullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamp('last_run_at').nullable();
    table.string('last_status', 20).nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('server_crons');
}
