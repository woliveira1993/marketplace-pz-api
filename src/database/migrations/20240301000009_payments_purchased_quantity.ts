import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('payments');
  if (!hasTable) return;

  const hasCol = await knex.schema.hasColumn('payments', 'purchased_quantity');
  if (!hasCol) {
    await knex.schema.alterTable('payments', (table) => {
      // Stores the actual quantity purchased (for custom quantity items)
      table.integer('purchased_quantity').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('payments');
  if (!hasTable) return;
  await knex.schema.alterTable('payments', (table) => {
    table.dropColumn('purchased_quantity');
  });
}
