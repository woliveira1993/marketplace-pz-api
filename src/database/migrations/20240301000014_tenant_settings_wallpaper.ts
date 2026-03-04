import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tenant_settings', (table) => {
    table.string('wallpaper_url', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tenant_settings', (table) => {
    table.dropColumn('wallpaper_url');
  });
}
