import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenant_settings', (table) => {
    table.increments('id').primary();
    table.integer('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    // MercadoPago credentials (client_secret encrypted at rest)
    table.string('mp_client_id', 100).nullable();
    table.text('mp_client_secret_encrypted').nullable();
    // Webhook secret (random token in MP IPN URL)
    table.string('webhook_secret', 64).nullable();
    // RCON configuration (password encrypted at rest)
    table.string('rcon_host', 255).nullable();
    table.integer('rcon_port').nullable().defaultTo(25575);
    table.text('rcon_password_encrypted').nullable();
    // Store customization
    table.string('store_name', 200).nullable();
    table.string('primary_color', 7).nullable().defaultTo('#4d7c0f');
    table.string('background_color', 7).nullable().defaultTo('#0f1a0a');
    table.string('logo_url', 500).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['tenant_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_settings');
}
