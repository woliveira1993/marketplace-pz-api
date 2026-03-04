import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { db } from '../../database/knex.js';
import type { Tenant } from '../../types/db.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';
import { generateSecret } from '../../services/crypto.service.js';

const SALT_ROUNDS = 12;

export async function registerTenant(input: RegisterInput): Promise<Tenant> {
  const existing = await db('tenants').where('email', input.email).orWhere('slug', input.slug).first();
  if (existing) {
    if (existing.email === input.email) {
      throw new Error('EMAIL_IN_USE');
    }
    throw new Error('SLUG_IN_USE');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const [tenant] = await db('tenants')
    .insert({
      slug: input.slug.toLowerCase(),
      name: input.name,
      email: input.email.toLowerCase(),
      password_hash: passwordHash,
      is_active: true,
    })
    .returning('*');

  // Create empty settings row with webhook_secret
  await db('tenant_settings').insert({
    tenant_id: tenant.id,
    webhook_secret: generateSecret(32),
    store_name: input.name,
    primary_color: '#4d7c0f',
    background_color: '#0f1a0a',
  });

  return tenant;
}

export async function loginTenant(input: LoginInput): Promise<Tenant> {
  const tenant = await db('tenants').where('email', input.email.toLowerCase()).first();
  if (!tenant) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!tenant.is_active) {
    throw new Error('ACCOUNT_INACTIVE');
  }

  const valid = await bcrypt.compare(input.password, tenant.password_hash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return tenant;
}

export async function createRefreshToken(tenantId: number, expiresInDays = 30): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await db('refresh_tokens').insert({
    tenant_id: tenantId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    revoked: false,
  });

  return token;
}

export async function rotateRefreshToken(token: string): Promise<{ tenant: Tenant; newToken: string }> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const stored = await db('refresh_tokens')
    .where('token_hash', tokenHash)
    .where('revoked', false)
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  const tenant = await db('tenants').where('id', stored.tenant_id).first();
  if (!tenant || !tenant.is_active) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  // Revoke old token
  await db('refresh_tokens').where('id', stored.id).update({ revoked: true });

  // Issue new refresh token
  const newToken = await createRefreshToken(tenant.id);

  return { tenant, newToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db('refresh_tokens').where('token_hash', tokenHash).update({ revoked: true });
}

// Clean expired tokens periodically (call on startup)
export async function cleanExpiredTokens(): Promise<void> {
  await db('refresh_tokens').where('expires_at', '<', new Date()).delete();
}
