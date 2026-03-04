import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    // When true: buyer chooses how many units they want
    // 'price' column becomes the unit price (per 1 unit)
    table.boolean('allow_custom_quantity').notNullable().defaultTo(false);
    // Minimum quantity the buyer can choose (only relevant when allow_custom_quantity = true)
    table.integer('min_quantity').nullable().defaultTo(1);
    // Maximum quantity (null = no limit)
    table.integer('max_quantity').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('allow_custom_quantity');
    table.dropColumn('min_quantity');
    table.dropColumn('max_quantity');
  });
}
