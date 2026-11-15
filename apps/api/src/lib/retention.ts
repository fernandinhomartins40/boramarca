// Retention (privacy policy, section 9): a daily job deletes what is past its time.
import { lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog, leads, otpCodes, refreshFamilies } from '../db/schema';

/** Site contacts: "até 12 meses" (B4). */
export const LEAD_RETENTION_MONTHS = 12;
/** audit_log (ids, reasons, no message content): kept 90 days (B5). */
export const AUDIT_RETENTION_DAYS = 90;
/** Daily, 04:15 UTC (01:15 in São Paulo). */
export const RETENTION_CRON = '15 4 * * *';

export async function purgeExpired(db: Db, now: Date) {
  const at = now.toISOString();
  const count = async (q: Promise<unknown[]>) => (await q).length;
  return {
    leads: await count(
      db
        .delete(leads)
        .where(
          lt(
            leads.createdAt,
            sql`${at}::timestamptz - make_interval(months => ${LEAD_RETENTION_MONTHS})`,
          ),
        )
        .returning({ id: leads.id }),
    ),
    audit: await count(
      db
        .delete(auditLog)
        .where(
          lt(
            auditLog.createdAt,
            sql`${at}::timestamptz - make_interval(days => ${AUDIT_RETENTION_DAYS})`,
          ),
        )
        .returning({ id: auditLog.id }),
    ),
    otpCodes: await count(
      db.delete(otpCodes).where(lt(otpCodes.expiresAt, now)).returning({ id: otpCodes.id }),
    ),
    refreshFamilies: await count(
      db
        .delete(refreshFamilies)
        .where(lt(refreshFamilies.expiresAt, now))
        .returning({ id: refreshFamilies.id }),
    ),
  };
}
