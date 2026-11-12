import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// Lazily-created singletons (reused across hot reloads in dev, and across
// invocations of one warm serverless instance). prepare:false keeps it compatible
// with Neon's pooled (pgbouncer) endpoint.
const g = globalThis as unknown as { __sql?: postgres.Sql; __db?: PostgresJsDatabase<typeof schema> };

export function getSql(): postgres.Sql {
  if (!g.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL chưa được đặt');
    g.__sql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      // Keep DATE columns as 'yyyy-mm-dd' strings (no JS Date → no timezone shift).
      types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
    });
  }
  return g.__sql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!g.__db) g.__db = drizzle({ client: getSql(), schema });
  return g.__db;
}

export async function closeDb(): Promise<void> {
  if (g.__sql) await g.__sql.end({ timeout: 5 });
  g.__sql = undefined;
  g.__db = undefined;
}

export { schema };
