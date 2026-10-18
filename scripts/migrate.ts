import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { createConnection } from 'mysql2/promise';
import { config } from '../src/config/env.js';

const IGNORABLE = new Set([1050, 1060, 1061, 1091]);

async function main() {
  const dir = path.resolve(process.cwd(), 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const conn = await createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false,
  });

  console.log(`Database: ${config.db.database} @ ${config.db.host}:${config.db.port}\n`);

  for (const file of files) {
    const raw = readFileSync(path.join(dir, file), 'utf8');
    const statements = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`> ${file} (${statements.length} statement${statements.length === 1 ? '' : 's'})`);
    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err: any) {
        if (IGNORABLE.has(err?.errno)) {
          console.log(`  ↷ skipped (already applied): ${stmt.slice(0, 70)}...`);
        } else {
          console.error(`  ✗ failed: ${stmt.slice(0, 120)}`);
          console.error(`    ${err?.message}`);
          await conn.end();
          process.exit(1);
        }
      }
    }
    console.log(`  ✅ done`);
  }

  await conn.end();
  console.log('\nAll migrations applied successfully.');
}

main().catch((err) => {
  console.error('Migration failed:', err?.message ?? err);
  process.exit(1);
});
