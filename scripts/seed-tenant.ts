/**
 * Seed script: Creates Knox Brasil tenant from existing n8n setup
 * Run ONCE after first migration: npm run seed
 *
 * WARNING: This script contains placeholder credentials from the n8n workflows.
 * Update the RCON credentials before running in production.
 */
import 'dotenv/config';
import { db } from '../src/database/knex.js';
import bcrypt from 'bcrypt';
import { encrypt, generateSecret } from '../src/services/crypto.service.js';
import type { Tenant } from '../src/types/db.js';

async function seed() {
  console.log('Seeding NovaStack tenant...');

  // Check if already seeded
  const existing = await db('tenants').where('slug', 'novastack').first() as Tenant | undefined;
  if (existing) {
    console.log('NovaStack tenant already exists. Skipping creation.');
    console.log('Tenant ID:', existing.id);
    // Still run backfill
    await backfillPayments(existing.id);
    await db.destroy();
    return;
  }

  // Create tenant
  const passwordHash = await bcrypt.hash('NovaStack321', 12);
  const [tenant] = await db('tenants').insert({
    slug: 'novastack',
    name: 'Nova Stack',
    email: 'contato@novastack.solutions', // UPDATE to real email
    password_hash: passwordHash,
    is_active: true,
  }).returning('*') as Tenant[];

  console.log(`✓ Tenant created (ID: ${tenant.id})`);

  // Create settings with credentials from n8n workflows
  // NOTE: Update these with your actual production values if they differ
  const webhookSecret = generateSecret(32);
  await db('tenant_settings').insert({
    tenant_id: tenant.id,
    mp_client_id: '8118134748025988', // from n8n Marketplace PZ - LUMES PIX DONATE.json
    mp_client_secret_encrypted: encrypt('lujKuCiavKRBeqKPnumE7qz2wHNOlyMz'), // from n8n
    webhook_secret: webhookSecret,
    store_name: 'NovaStack',
    primary_color: '#4d7c0f',
    background_color: '#0f1a0a',
    // rcon_host, rcon_port, rcon_password: configure via dashboard settings
  });

  console.log(`✓ Settings created`);
  console.log(`  Webhook URL pattern: /webhooks/mp/knoxbrasil/${webhookSecret}`);
  console.log(`  ⚠️  Configure this URL in your MercadoPago IPN settings!`);

  // Seed Lumes items matching existing hardcoded options
  const items = [
    { name: '100 Coins', description: '100 Coins para o servidor NovaStack', price: 2.00, quantity: 100, unit_label: 'coins', sort_order: 0 },
    { name: '250 Coins', description: '250 Coins para o servidor NovaStack', price: 5.00, quantity: 250, unit_label: 'coins', sort_order: 1 },
    { name: '500 Coins', description: '500 Coins para o servidor NovaStack', price: 10.00, quantity: 500, unit_label: 'coins', sort_order: 2 },
    { name: '1000 Coins', description: '1000 Coins para o servidor NovaStack', price: 20.00, quantity: 1000, unit_label: 'coins', sort_order: 3 },
  ];

  const insertedItems = await db('items')
    .insert(items.map((item) => ({ ...item, tenant_id: tenant.id, is_active: true })))
    .returning('*');

  console.log(`✓ ${insertedItems.length} items created`);

  // Seed RCON actions for each item
  for (const item of insertedItems) {
    await db('rcon_actions').insert({
      tenant_id: tenant.id,
      item_id: item.id,
      command: 'sendcoins "{{username}}" "{{quantity}}"',
      exec_order: 0,
    });
  }

  console.log(`✓ RCON actions created`);

  // Backfill existing payments
  await backfillPayments(tenant.id);

  console.log('\n✓ Seed complete!');
  console.log('\nNext steps:');
  console.log('1. Login: POST /api/auth/login with email "contato@novastack.solutions" and password "NovaStack321"');
  console.log('2. Change password via dashboard');
  console.log('3. Configure RCON settings via dashboard');
  console.log(`4. Set MercadoPago IPN URL to: /webhooks/mp/knoxbrasil/${webhookSecret}`);
  console.log('5. Disable n8n workflows after testing');

  await db.destroy();
}

async function backfillPayments(tenantId: number) {
  const count = await db('payments')
    .whereNull('tenant_id')
    .update({ tenant_id: tenantId });

  if (count > 0) {
    console.log(`✓ Backfilled ${count} existing payments to Knox Brasil tenant`);
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
