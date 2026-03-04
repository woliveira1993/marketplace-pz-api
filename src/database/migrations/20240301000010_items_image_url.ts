import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.string('image_url', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('image_url');
  });
}
