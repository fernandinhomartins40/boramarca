// Demo seed (plan section 16): see seed-demo.ts. Re-runnable: it replaces the demo salon.
// Login: phone +5511900000001 (Marina), code 123456 (outside production).
import { DEFAULT_TIMEZONE } from '@boramarca/shared';
import { loadConfig } from '../config';
import { utcToZoned } from '../lib/time';
import { createDb } from './client';
import { DEMO_PHONES, seedDemo } from './seed-demo';

const TZ = DEFAULT_TIMEZONE;
const { db, sql } = createDb(loadConfig().DATABASE_URL);
const { today } = await seedDemo(db);
const local = utcToZoned(new Date(), TZ);
console.log(
  `[db:seed] Espaço Aurora pronto para ${today} (agora ${Math.floor(local.minutes / 60)}h${String(local.minutes % 60).padStart(2, '0')} em ${TZ}).`,
);
console.log(`[db:seed] Login: Marina ${DEMO_PHONES.marina} (código 123456 fora de produção).`);
await sql.end();
