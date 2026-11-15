// DELETE /me (plan section 9): fresh code, WhatsApp instance removed, no personal data of the
// professional or of their clients left in any table; owner with a team must choose.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm } from '@boramarca/ia';
import { OWNER_HAS_TEAM_ERROR } from '@boramarca/shared';
import { buildApp } from './app';
import {
  accountDeletions,
  aiDecisions,
  conversations,
  devices,
  kitLeads,
  leads,
  messages,
  professionals,
  salons,
  waitlistEntries,
} from './db/schema';
import { zonedToUtc } from './lib/time';
import { FakePush } from './modules/devices/push';
import { connectedPro, WEBHOOK_SECRET } from './test/connected';
import { captureSender, randomPhone, testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 180_000 });

const TZ = 'America/Sao_Paulo';
const at = (hhmm: string) => zonedToUtc('2030-03-13', hhmm, TZ).toISOString();
const now = new Date(at('09:00'));
const gw = testGateway();
const { sender, codes } = captureSender();
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(testConfig({ WHATSAPP_WEBHOOK_SECRET: WEBHOOK_SECRET }), {
    gateway: gw,
    llm: new FakeLlm(),
    push: new FakePush(),
    otpSender: sender,
    now: () => now,
  });
});
afterAll(() => app.close());

/** Rows of any public table whose text contains `needle`. */
async function leftovers(needle: string) {
  const tables = await app.db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const hits: string[] = [];
  for (const { table_name } of tables) {
    const [r] = await app.db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table_name)} t where t::text like ${`%${needle}%`}`,
    );
    if (r && r.n > 0) hits.push(`${table_name}: ${r.n}`);
  }
  return hits;
}

async function deleteCode(app2: typeof app, phone: string) {
  const r = await app2.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    payload: { phone, purpose: 'delete_account' },
  });
  expect(r.statusCode, r.body).toBe(200);
  return codes.get(phone)!;
}

describe('DELETE /me', () => {
  it('erases the professional and everything of their clients; the instance is deleted', async () => {
    const t = await connectedPro(app, gw);
    const ctx = { professionalId: t.professionalId, actor: 'professional' as const };
    const clientName = `Zuleica ${randomPhone().slice(-6)}`;
    const c = await t.addClient(clientName);
    await app.agenda.book(ctx, {
      clientId: c.id,
      serviceIds: [t.serviceId],
      startsAt: at('15:00'),
    });
    await t.receive(c.phone, 'oi, tudo bem?', clientName);
    const [conv] = await app.db
      .select()
      .from(conversations)
      .where(eq(conversations.clientId, c.id));
    await app.db.insert(messages).values({
      conversationId: conv!.id,
      direction: 'out',
      author: 'ai',
      text: `Oi ${clientName}`,
    });
    await app.db.insert(aiDecisions).values({
      professionalId: t.professionalId,
      clientId: c.id,
      conversationId: conv!.id,
      type: 'duvida',
      question: `${clientName} quer saber o preço`,
      context: { clientFirstName: clientName, messages: [] },
      options: [{ id: 'assumir', label: 'Eu respondo', action: null }],
      deadlineAt: new Date(now.getTime() + 600_000),
    });
    await app.db.insert(waitlistEntries).values({
      professionalId: t.professionalId,
      clientId: c.id,
      preference: { weekdays: [], periods: [] },
      optedInAt: now,
    });
    await app.db.insert(devices).values({
      professionalId: t.professionalId,
      pushToken: `tok-${t.phone}`,
      platform: 'android',
    });
    await app.db.insert(kitLeads).values({ professionalId: t.professionalId, note: 'kit' });
    await app.db.insert(leads).values({ name: 'Eu mesmo', phone: t.phone, source: 'site_contato' });

    const code = await deleteCode(app, t.phone);
    const wrong = await t.call('DELETE', '/v1/me', {
      code: code === '000000' ? '111111' : '000000',
      origin: 'app',
    });
    expect(wrong.json().code).toBe('OTP_INVALID');
    const r = await t.call('DELETE', '/v1/me', { code, origin: 'app' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ok).toBe(true);

    await expect(gw.getStatus(t.instance)).rejects.toMatchObject({ code: 'not_found' });
    for (const needle of [t.phone, c.phone, clientName, t.professionalId, c.id, t.salonId])
      expect(await leftovers(needle), needle).toEqual([]);
    const [rec] = await app.db
      .select()
      .from(accountDeletions)
      .orderBy(sql`${accountDeletions.createdAt} desc`)
      .limit(1);
    expect(rec).toMatchObject({ origin: 'app' });
    expect(rec!.phoneHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec!.completedAt).not.toBeNull();
    // The old session cannot refresh anymore and /me is gone.
    expect((await t.call('GET', '/v1/me')).statusCode).toBe(404);
  });

  it('an owner with a team must transfer or delete the whole space', async () => {
    const t = await connectedPro(app, gw);
    const add = async (name: string) => {
      const r = await t.call('POST', '/v1/salon/team', {
        name,
        phone: randomPhone(),
        professions: ['manicure'],
      });
      expect(r.statusCode, r.body).toBe(200);
      return r.json() as { id: string; phone: string };
    };
    const ju = await add('Júlia');
    const pe = await add('Pedro');

    const code = await deleteCode(app, t.phone);
    const blocked = await t.call('DELETE', '/v1/me', { code, origin: 'web' });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe(OWNER_HAS_TEAM_ERROR);
    // The code was not spent by the refused request.
    const r = await t.call('DELETE', '/v1/me', { code, origin: 'web', transferOwnershipTo: ju.id });
    expect(r.statusCode, r.body).toBe(200);
    const [heir] = await app.db.select().from(professionals).where(eq(professionals.id, ju.id));
    expect(heir!.role).toBe('owner');
    expect(await app.db.select().from(salons).where(eq(salons.id, t.salonId))).toHaveLength(1);
    expect(await leftovers(t.phone)).toEqual([]);

    // Júlia (now owner) deletes the whole space: Pedro goes too.
    const juToken = app.issueTokens({
      professionalId: ju.id,
      salonId: t.salonId,
      role: 'owner',
    }).accessToken;
    const juCode = await deleteCode(app, ju.phone);
    const all = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      payload: { code: juCode, origin: 'app', deleteWholeSalon: true },
      headers: { authorization: `Bearer ${juToken}` },
    });
    expect(all.statusCode, all.body).toBe(200);
    expect(await app.db.select().from(salons).where(eq(salons.id, t.salonId))).toHaveLength(0);
    for (const needle of [ju.phone, pe.phone, t.salonId])
      expect(await leftovers(needle)).toEqual([]);
  });
});
