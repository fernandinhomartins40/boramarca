// Owner panel against the demo seed (plan sections 8, 12 and 16) with a fixed "today":
// report numbers, team, clients CSV, plan and day view.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeLlm } from '@boramarca/ia';
import { buildApp } from './app';
import { professionals } from './db/schema';
import { DEMO_PHONES, seedDemo } from './db/seed-demo';
import { weekdayOf, zonedToUtc } from './lib/time';
import { FakePush } from './modules/devices/push';
import { monthDates } from './modules/salon/reports';
import { testConfig, testGateway } from './test/helpers';

vi.setConfig({ testTimeout: 180_000 });

const TZ = 'America/Sao_Paulo';
const TODAY = '2030-03-13'; // Wednesday
const now = zonedToUtc(TODAY, '12:00', TZ);
let app: Awaited<ReturnType<typeof buildApp>>;
let seeded: Awaited<ReturnType<typeof seedDemo>>;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  app = await buildApp(testConfig(), {
    gateway: testGateway(),
    llm: new FakeLlm(),
    push: new FakePush(),
    now: () => now,
  });
  seeded = await seedDemo(app.db, now);
  for (const [key, phone] of Object.entries(DEMO_PHONES)) {
    const [p] = await app.db.select().from(professionals).where(eq(professionals.phone, phone));
    tokens[key] = app.issueTokens({
      professionalId: p!.id,
      salonId: p!.salonId,
      role: p!.role,
    }).accessToken;
  }
}, 300_000); // the seed is ~150 sequential inserts: slow under load
afterAll(() => app.close());

const get = (url: string, who = 'marina') =>
  app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tokens[who]}` } });

describe('owner panel with the demo seed', () => {
  it('report numbers for the month', async () => {
    const r = await get('/v1/salon/reports?month=2030-03');
    expect(r.statusCode, r.body).toBe(200);
    const rep = r.json();
    // Seed, March 2030: 11 done today (Marina 5 + 2 per team member) and Ricardo's no-show on the 3rd.
    expect(rep.noShowRate).toBeCloseTo(1 / 12, 10);
    expect(rep.recoveredFitInsCount).toBe(0);
    // Everyone works Mon–Sat 08–19 with 1 h lunch: 600 min per working day.
    const workingDays = monthDates('2030-03').filter((d) => weekdayOf(d) !== 0).length;
    const available = workingDays * 600;
    const occ = Object.fromEntries(
      rep.occupancyByProfessional.map((o: { name: string; occupancyRate: number }) => [
        o.name,
        o.occupancyRate,
      ]),
    );
    expect(occ['Marina Costa']).toBeCloseTo((8 * 50) / available, 10); // 8 active today, 50 min
    expect(occ['Camila']).toBeCloseTo((4 * 60) / available, 10);
    expect(occ['Pedro']).toBeCloseTo((5 * 60) / available, 10);
    // Wednesday 08h: only Marina's 08:00 (50 min) out of 4 Wednesdays x 4 people x 60 min.
    const wed8 = rep.heatmap.find(
      (h: { weekday: number; hour: number }) => h.weekday === 3 && h.hour === 8,
    );
    expect(wed8.occupancyRate).toBeCloseTo(50 / (4 * 4 * 60), 10);
    expect(rep.heatmap.some((h: { weekday: number }) => h.weekday === 0)).toBe(false);

    // A fit-in (after closing, so the seeded 16h decision stays pending) counts as recovered.
    await app.agenda.book(
      { professionalId: seeded.pros.marina!.id, actor: 'professional' },
      {
        clientId: await clientOfMarina(),
        serviceIds: [seeded.pros.marina!.serviceId],
        startsAt: zonedToUtc(TODAY, '19:00', TZ),
        isFitIn: true,
      },
    );
    const after = (await get('/v1/salon/reports?month=2030-03')).json();
    expect(after).toMatchObject({ recoveredFitInsCount: 1, recoveredValueCents: 15000 });
  });

  it('day, team, plan and the clients CSV; owner only', async () => {
    const day = (await get(`/v1/salon/day?date=${TODAY}`)).json();
    expect(day.columns).toHaveLength(4);
    expect(day.columns[0].professional.name).toBe('Marina Costa');
    expect(day.pendingDecisions).toHaveLength(1);

    const team = (await get('/v1/salon/team')).json();
    expect(team.items.map((m: { name: string }) => m.name)).toEqual([
      'Marina Costa',
      'Camila',
      'Júlia',
      'Pedro',
    ]);
    expect(team.items[0]).toMatchObject({
      role: 'owner',
      servicesCount: 2,
      whatsappStatus: 'disconnected',
    });

    const plan = (await get('/v1/salon/plan')).json();
    expect(plan).toMatchObject({ plan: 'salao', activeProfessionals: 4, kitInterestSent: false });

    const json = (await get('/v1/salon/clients?limit=5')).json();
    expect(json.items).toHaveLength(5);
    expect(json.nextCursor).toBe('5');
    const csv = await get('/v1/salon/clients?format=csv');
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'nome,telefone,profissional,ultima_visita,ultimo_servico,visitas,faltas,lista_de_espera',
    );
    expect(lines).toHaveLength(1 + 12 + 4 + 4 + 5); // Marina 12, Camila 4, Júlia 4, Pedro 5
    expect(lines.find((l) => l.startsWith('Ana Paula,'))).toContain(',Marina Costa,');

    expect((await get('/v1/salon/reports?month=2030-03', 'camila')).statusCode).toBe(403);
    expect((await get('/v1/salon/clients?format=csv', 'camila')).statusCode).toBe(403);
  });
});

async function clientOfMarina() {
  const list = (await get('/v1/clients?search=Helena')).json();
  return list.items[0].id as string;
}
