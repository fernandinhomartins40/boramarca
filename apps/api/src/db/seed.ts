// Demo seed (plan section 16): see seed-demo.ts. Re-runnable: it replaces the demo salon.
// Login: phone +5511900000001 (Marina), code 123456 (outside production).
import { DEFAULT_TIMEZONE } from '@boramarca/shared';
import { loadConfig } from '../config';
import { utcToZoned } from '../lib/time';
import { createDb } from './client';
import { DEMO_PHONES, seedDemo } from './seed-demo';
import { ensureReviewAccount } from './seed-review';

const TZ = DEFAULT_TIMEZONE;
const config = loadConfig();
const { db, sql } = createDb(config.DATABASE_URL);
const { today } = await seedDemo(db);
const local = utcToZoned(new Date(), TZ);
console.log(
  `[db:seed] Espaço Aurora pronto para ${today} (agora ${Math.floor(local.minutes / 60)}h${String(local.minutes % 60).padStart(2, '0')} em ${TZ}).`,
);
console.log(`[db:seed] Login: Marina ${DEMO_PHONES.marina} (código 123456 fora de produção).`);
// Store review account (also created on its first login): only when REVIEW_PHONE/REVIEW_OTP are set.
if (config.REVIEW_PHONE && config.REVIEW_OTP) {
  await ensureReviewAccount(db, config.REVIEW_PHONE);
  console.log('[db:seed] Conta de revisão das lojas pronta (REVIEW_PHONE).');
}
await sql.end();
