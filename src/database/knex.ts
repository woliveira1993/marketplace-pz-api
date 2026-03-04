import Knex from 'knex';
import { config } from '../config.js';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = Knex({
  client: 'pg',
  connection: {
    connectionString: config.DATABASE_URL,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: join(__dirname, 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
});
