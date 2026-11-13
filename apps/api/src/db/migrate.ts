import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from '../config';
import { createDb } from './client';

const folder = fileURLToPath(new URL('../../drizzle', import.meta.url));

if (!existsSync(`${folder}/meta/_journal.json`)) {
  console.log('[db:migrate] Nenhuma migração ainda (apps/api/drizzle). Nada a fazer.');
} else {
  const { db, sql } = createDb(loadConfig().DATABASE_URL);
  await migrate(db, { migrationsFolder: folder });
  await sql.end();
  console.log('[db:migrate] Migrações aplicadas.');
}
