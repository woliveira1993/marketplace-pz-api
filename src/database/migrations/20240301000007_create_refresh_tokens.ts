import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('revoked').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['tenant_id']);
    table.index(['expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
