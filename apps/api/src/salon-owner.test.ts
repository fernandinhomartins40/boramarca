// Owner panel actions on the team (plan section 12): answer a Decision of a professional of the
// salon, drag to reschedule, waitlist filter. Only the owner, only inside the same salon.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from './app';
import { auditLog, clients, professionals, waitlistEntries } from './db/schema';
import { loadPro } from './lib/core';
import { zonedToUtc } from './lib/time';
import { randomPhone, seedProfessional, testConfig, testGateway } from './test/helpers';

const TZ = 'America/Sao_Paulo';
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp(testConfig(), { gateway: testGateway() });
  await app.ready();
});
afterAll(() => app.close());

const bearer = (
  p: { professionalId: string; salonId: string },
  role: 'owner' | 'professional',
) => ({
  authorization: `Bearer ${app.issueTokens({ professionalId: p.professionalId, salonId: p.salonId, role }).accessToken}`,
});

/** Owner + one professional in salon A; another owner in salon B. */
async function setup() {
  const owner = await seedProfessional(app.db);
  const member = await seedProfessional(app.db);
  await app.db
    .update(professionals)
    .set({ salonId: owner.salonId, role: 'professional' })
    .where(eq(professionals.id, member.professionalId));
  const m = { ...member, salonId: owner.salonId };
  const stranger = await seedProfessional(app.db);
  const [client] = await app.db
    .insert(clients)
    .values({ professionalId: m.professionalId, name: 'Beatriz Lima', phone: randomPhone() })
    .returning();
  return { owner, member: m, stranger, client: client! };
}

it('owner answers a decision of a team member; other salons and non-owners cannot', async () => {
  const { owner, member, stranger } = await setup();
  const d = await app.messaging.decisions.create({
    pro: await loadPro(app.db, member.professionalId),
    conversationId: null,
    clientId: null,
    type: 'duvida',
    question: 'Pode abrir mais cedo?',
    options: [
      { id: 'sim', label: 'Sim', action: null },
      { id: 'nao', label: 'Não', action: null },
    ],
    proposedAction: null,
  });
  const url = `/v1/salon/decisions/${d.id}/answer`;
  const payload = { optionId: 'sim', via: 'app' };
  expect(
    (await app.inject({ method: 'POST', url, payload, headers: bearer(stranger, 'owner') }))
      .statusCode,
  ).toBe(404);
  expect(
    (await app.inject({ method: 'POST', url, payload, headers: bearer(member, 'professional') }))
      .statusCode,
  ).toBe(403);
  const r = await app.inject({ method: 'POST', url, payload, headers: bearer(owner, 'owner') });
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json().decision.status).toBe('resolved');
  const [log] = await app.db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.professionalId, member.professionalId),
        eq(auditLog.action, 'salon.decision_answered_by_owner'),
      ),
    );
  expect(log!.payload).toMatchObject({ decisionId: d.id, ownerId: owner.professionalId });
});

it('owner reschedules a team member’s appointment through the agenda motor', async () => {
  const { owner, member, stranger, client } = await setup();
  const appt = await app.agenda.book(
    { professionalId: member.professionalId, actor: 'professional' },
    {
      clientId: client.id,
      serviceIds: [member.serviceId],
      startsAt: zonedToUtc('2031-01-15', '10:00', TZ).toISOString(),
      isFitIn: false,
    },
  );
  const url = `/v1/salon/appointments/${appt.id}/reschedule`;
  const to = zonedToUtc('2031-01-15', '14:00', TZ).toISOString();
  const payload = { startsAt: to, notifyClient: false };
  expect(
    (await app.inject({ method: 'POST', url, payload, headers: bearer(stranger, 'owner') }))
      .statusCode,
  ).toBe(404);
  // During lunch: the motor refuses (409), as for the professional.
  const lunch = await app.inject({
    method: 'POST',
    url,
    payload: { ...payload, startsAt: zonedToUtc('2031-01-15', '12:10', TZ).toISOString() },
    headers: bearer(owner, 'owner'),
  });
  expect(lunch.statusCode).toBe(409);
  const r = await app.inject({ method: 'POST', url, payload, headers: bearer(owner, 'owner') });
  expect(r.statusCode, r.body).toBe(200);
  expect((await app.agenda.getAppointment(member.professionalId, appt.id)).startsAt).toBe(to);
});

it('GET /salon/clients?onWaitlist filters by waitlist', async () => {
  const { owner, member, client } = await setup();
  await app.db
    .insert(clients)
    .values({ professionalId: member.professionalId, name: 'Carla Nunes', phone: randomPhone() });
  await app.db.insert(waitlistEntries).values({
    professionalId: member.professionalId,
    clientId: client.id,
    preference: { weekdays: [], periods: ['tarde'] },
    optedInAt: new Date(),
  });
  const get = async (q: string) =>
    (
      await app.inject({
        method: 'GET',
        url: `/v1/salon/clients?${q}`,
        headers: bearer(owner, 'owner'),
      })
    )
      .json()
      .items.map((i: { name: string }) => i.name);
  expect(await get('onWaitlist=true')).toEqual(['Beatriz Lima']);
  expect(await get('onWaitlist=false')).toEqual(['Carla Nunes']);
  expect((await get('')).length).toBe(2);
});
