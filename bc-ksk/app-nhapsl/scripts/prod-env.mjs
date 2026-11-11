// Run a command against the PRODUCTION database (Neon) without printing secrets:
//   node scripts/prod-env.mjs npm run db:migrate
// Reads .env.vercel.production (from `vercel env pull`), uses the UNPOOLED url for
// long-running admin scripts (migrate / import / users:create / export:cowork).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const env = {};
for (const line of readFileSync('.env.vercel.production', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) { console.error('Thiếu DATABASE_URL trong .env.vercel.production'); process.exit(1); }
console.error(`[prod] DB host: ${new URL(url).hostname}`);
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DB_POOL_MAX: '3' } });
process.exit(r.status ?? 1);
