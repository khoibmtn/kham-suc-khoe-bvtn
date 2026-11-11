// npm run db:migrate — apply src/db/migrations/*.sql in order, each once, in a transaction.
import './_env';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL chưa được đặt (.env.local hoặc biến môi trường)');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    const dir = path.join(process.cwd(), 'src/db/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) { console.log(`= ${f} (đã áp dụng)`); continue; }
      const body = readFileSync(path.join(dir, f), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations (name) VALUES (${f})`;
      });
      console.log(`+ ${f}`);
    }
    console.log('Migrate xong.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
