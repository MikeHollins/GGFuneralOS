import { sql } from './client';
import * as fs from 'fs';
import * as path from 'path';

async function pushSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split on semicolons but skip empty statements
  const statements = schemaSql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`[db] Pushing ${statements.length} statements to Neon...`);

  for (const stmt of statements) {
    try {
      await sql(stmt);
      const preview = stmt.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ✅ ${preview}...`);
    } catch (err: any) {
      // Skip "already exists" errors for idempotency
      if (err.message?.includes('already exists')) {
        const preview = stmt.slice(0, 60).replace(/\n/g, ' ');
        console.log(`  ⏭️  ${preview}... (already exists)`);
      } else {
        console.error(`  ❌ Error: ${err.message}`);
        console.error(`     Statement: ${stmt.slice(0, 100)}`);
      }
    }
  }

  console.log('[db] Schema push complete.');
}

pushSchema().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
