import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string) {
  // postgres-js connects lazily, on the first query.
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>['db'];
/** A transaction handle (same query API as `Db`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
