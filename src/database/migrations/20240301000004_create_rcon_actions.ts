import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('rcon_actions', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    // NULL item_id means this action applies to ALL items for this tenant
    table.integer('item_id').nullable().references('id').inTable('items').onDelete('SET NULL');
    // Template: e.g. 'sendcoins "{{username}}" "{{quantity}}"'
    // Available: {{username}}, {{quantity}}, {{unit_label}}, {{item_name}}, {{amount}}, {{email}}, {{transaction_id}}
    table.text('command').notNullable();
    table.integer('exec_order').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['tenant_id', 'exec_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rcon_actions');
}
