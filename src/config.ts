import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('30d'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  UPLOADS_DIR: z.string().default('uploads'),
});

function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const [field, errors] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${field}: ${errors?.join(', ')}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
