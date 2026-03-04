import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('items', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.text('description').nullable();
    table.decimal('price', 10, 2).notNullable();
    table.integer('quantity').notNullable().defaultTo(1);
    table.string('unit_label', 50).notNullable().defaultTo('unidade');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['tenant_id']);
    table.index(['tenant_id', 'is_active', 'sort_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('items');
}
