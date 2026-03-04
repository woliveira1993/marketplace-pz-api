import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('payments');
  if (!hasTable) {
    // Create payments table from scratch if it doesn't exist yet
    await knex.schema.createTable('payments', (table) => {
      table.increments('id').primary();
      table.string('external_reference', 100).notNullable();
      table.bigInteger('transaction_id').nullable().unique();
      table.decimal('amount', 10, 2).notNullable();
      table.string('status', 50).notNullable().defaultTo('pending');
      table.boolean('delivered').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.bigInteger('lumes').nullable();
      table.string('username', 100).nullable();
      table.string('email', 100).nullable();
      table.string('error', 600).nullable();
      table.timestamp('expiration_date', { useTz: true }).nullable();
      table.integer('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
      table.integer('item_id').nullable().references('id').inTable('items').onDelete('SET NULL');
      table.index(['external_reference']);
      table.index(['tenant_id']);
      table.index(['tenant_id', 'status']);
      table.index(['tenant_id', 'created_at']);
    });
  } else {
    // Alter existing table to add multi-tenant columns
    const hasTenantId = await knex.schema.hasColumn('payments', 'tenant_id');
    if (!hasTenantId) {
      await knex.schema.alterTable('payments', (table) => {
        table.integer('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
        table.integer('item_id').nullable().references('id').inTable('items').onDelete('SET NULL');
        table.index(['tenant_id']);
        table.index(['tenant_id', 'status']);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('payments');
  if (hasTable) {
    const hasTenantId = await knex.schema.hasColumn('payments', 'tenant_id');
    if (hasTenantId) {
      await knex.schema.alterTable('payments', (table) => {
        table.dropColumn('item_id');
        table.dropColumn('tenant_id');
      });
    }
  }
}
