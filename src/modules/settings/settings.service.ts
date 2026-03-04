import { db } from '../../database/knex.js';
import { encrypt, decrypt } from '../../services/crypto.service.js';
import { testRconConnection } from '../../services/rcon.service.js';
import { validateMpCredentials } from '../../services/mercadopago.service.js';
import type { TenantSettings } from '../../types/db.js';

export async function getSettings(tenantId: number) {
  const settings = await db('tenant_settings').where('tenant_id', tenantId).first() as TenantSettings | undefined;
  if (!settings) return null;

  return {
    store_name: settings.store_name,
    primary_color: settings.primary_color,
    background_color: settings.background_color,
    logo_url: settings.logo_url,
    wallpaper_url: (settings as any).wallpaper_url ?? null,
    mp_configured: !!(settings.mp_client_id && settings.mp_client_secret_encrypted),
    mp_client_id: settings.mp_client_id,
    rcon_configured: !!(settings.rcon_host && settings.rcon_password_encrypted),
    rcon_host: settings.rcon_host,
    rcon_port: settings.rcon_port,
    webhook_secret: settings.webhook_secret,
  };
}

export async function updateStoreSettings(
  tenantId: number,
  data: { store_name?: string; primary_color?: string; background_color?: string; logo_url?: string | null; wallpaper_url?: string | null },
) {
  await db('tenant_settings')
    .where('tenant_id', tenantId)
    .update({ ...data, updated_at: new Date() });

  // Keep tenant name in sync
  if (data.store_name) {
    await db('tenants').where('id', tenantId).update({ name: data.store_name, updated_at: new Date() });
  }
}

export async function updateMpSettings(
  tenantId: number,
  data: { client_id: string; client_secret: string },
): Promise<void> {
  const valid = await validateMpCredentials({
    clientId: data.client_id,
    clientSecret: data.client_secret,
  });

  if (!valid) {
    throw new Error('INVALID_MP_CREDENTIALS');
  }

  await db('tenant_settings')
    .where('tenant_id', tenantId)
    .update({
      mp_client_id: data.client_id,
      mp_client_secret_encrypted: encrypt(data.client_secret),
      updated_at: new Date(),
    });
}

export async function updateRconSettings(
  tenantId: number,
  data: { host: string; port: number; password: string },
): Promise<void> {
  await db('tenant_settings')
    .where('tenant_id', tenantId)
    .update({
      rcon_host: data.host,
      rcon_port: data.port,
      rcon_password_encrypted: encrypt(data.password),
      updated_at: new Date(),
    });
}

export async function testRcon(tenantId: number): Promise<{ success: boolean; message: string }> {
  const settings = await db('tenant_settings').where('tenant_id', tenantId).first() as TenantSettings;

  if (!settings?.rcon_host || !settings?.rcon_password_encrypted) {
    return { success: false, message: 'RCON não configurado' };
  }

  const password = decrypt(settings.rcon_password_encrypted);
  return testRconConnection({
    host: settings.rcon_host,
    port: settings.rcon_port ?? 25575,
    password,
  });
}

export async function getWebhookUrl(tenantId: number, baseUrl: string): Promise<string> {
  const settings = await db('tenant_settings').where('tenant_id', tenantId).first() as TenantSettings;
  const tenant = await db('tenants').where('id', tenantId).first();
  return `${baseUrl}/webhooks/mp/${tenant.slug}/${settings.webhook_secret}`;
}

export async function getMpCredentials(tenantId: number): Promise<{ clientId: string; clientSecret: string } | null> {
  const settings = await db('tenant_settings').where('tenant_id', tenantId).first() as TenantSettings;
  if (!settings?.mp_client_id || !settings?.mp_client_secret_encrypted) return null;
  return {
    clientId: settings.mp_client_id,
    clientSecret: decrypt(settings.mp_client_secret_encrypted),
  };
}

export async function getRconConfig(tenantId: number): Promise<{ host: string; port: number; password: string } | null> {
  const settings = await db('tenant_settings').where('tenant_id', tenantId).first() as TenantSettings;
  if (!settings?.rcon_host || !settings?.rcon_password_encrypted) return null;
  return {
    host: settings.rcon_host,
    port: settings.rcon_port ?? 25575,
    password: decrypt(settings.rcon_password_encrypted),
  };
}
