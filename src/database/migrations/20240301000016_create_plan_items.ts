import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('plan_items', (t) => {
    t.increments('id').primary();
    t.integer('plan_id').notNullable().references('id').inTable('subscription_plans').onDelete('CASCADE');
    t.integer('item_id').nullable().references('id').inTable('items').onDelete('SET NULL');
    t.string('name', 200).nullable(); // free-text perk description (if no item_id)
    t.text('description').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('plan_items');
}
