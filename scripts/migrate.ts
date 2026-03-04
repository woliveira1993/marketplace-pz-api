import 'dotenv/config';
import { db } from '../src/database/knex.js';

async function migrate() {
  console.log('Running migrations...');
  try {
    const [batchNo, migrations] = await db.migrate.latest();
    if (migrations.length === 0) {
      console.log('Already up to date.');
    } else {
      console.log(`Batch ${batchNo} run: ${migrations.length} migrations`);
      migrations.forEach((m: string) => console.log(`  ✓ ${m}`));
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

migrate();
