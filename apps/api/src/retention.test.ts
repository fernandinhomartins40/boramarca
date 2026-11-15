// B4/B5: the daily job deletes site contacts after 12 months and audit_log rows after 90 days.
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { createDb } from './db/client';
import { auditLog, leads } from './db/schema';
import { purgeExpired } from './lib/retention';
import { randomPhone } from './test/helpers';
import { TEST_DATABASE_URL } from './test/env';

const { db, sql } = createDb(TEST_DATABASE_URL);
afterAll(() => sql.end());

it('purges leads older than 12 months and audit rows older than 90 days, keeps the rest', async () => {
  // Real clock: the test database is shared with files running in parallel.
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const lead = (createdAt: Date) => ({
    name: 'Ana',
    phone: randomPhone(),
    source: 'site',
    createdAt,
  });
  const [oldLead, newLead] = await db
    .insert(leads)
    .values([lead(ago(370)), lead(ago(300))])
    .returning();
  const [oldAudit, newAudit] = await db
    .insert(auditLog)
    .values([
      { actor: 'system', action: 'test.retention', createdAt: ago(91) },
      { actor: 'system', action: 'test.retention', createdAt: ago(80) },
    ])
    .returning();
  const out = await purgeExpired(db, now);
  expect(out.leads).toBeGreaterThanOrEqual(1);
  const leftLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(inArray(leads.id, [oldLead!.id, newLead!.id]));
  expect(leftLeads.map((l) => l.id)).toEqual([newLead!.id]);
  const leftAudit = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(eq(auditLog.action, 'test.retention'));
  expect(leftAudit.map((a) => a.id)).toContain(newAudit!.id);
  expect(leftAudit.map((a) => a.id)).not.toContain(oldAudit!.id);
});
