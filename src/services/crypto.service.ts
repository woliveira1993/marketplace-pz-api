import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';

function getMasterKey(): Buffer {
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const key = getMasterKey();
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
