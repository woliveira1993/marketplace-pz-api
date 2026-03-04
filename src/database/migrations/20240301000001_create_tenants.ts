import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenants', (table) => {
    table.increments('id').primary();
    table.string('slug', 60).notNullable().unique();
    table.string('name', 200).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenants');
}
