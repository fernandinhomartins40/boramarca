import { randomInt } from 'node:crypto';
import { FakeGateway } from '@boramarca/whatsapp';
import { buildApp } from '../app';
import { loadConfig, type Config } from '../config';
import type { Db } from '../db/client';
import { professionals, salons, services, workingHours } from '../db/schema';
import type { OtpSender } from '../modules/auth/otp';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './env';

export const testConfig = (over: Record<string, string> = {}): Config =>
  loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'r'.repeat(32),
    ...over,
  });

export const randomPhone = () => `+55119${String(randomInt(0, 1e8)).padStart(8, '0')}`;

/** OtpSender that remembers the last code per phone. */
export function captureSender() {
  const codes = new Map<string, string>();
  const sender: OtpSender = { send: async (phone, code) => void codes.set(phone, code) };
  return { sender, codes };
}

export async function testApp(over: Record<string, string> = {}, otpSender?: OtpSender) {
  return buildApp(testConfig(over), { otpSender });
}

/**
 * A professional with its own salon, a 50 min service (R$ 150) and the same hours every day:
 * 08:00–18:00 with lunch 12:00–13:00 (salon timezone).
 */
export async function seedProfessional(
  db: Db,
  opts: { timezone?: string; start?: string; end?: string; lunch?: [string, string] | null } = {},
) {
  const [salon] = await db
    .insert(salons)
    // Billing-agnostic: active (tests run with clocks years ahead; billing.test covers the trial).
    .values({
      name: 'Teste',
      timezone: opts.timezone ?? 'America/Sao_Paulo',
      subscriptionStatus: 'active',
      trialEndsAt: null,
    })
    .returning();
  const [p] = await db
    .insert(professionals)
    .values({ salonId: salon!.id, role: 'owner', name: 'Teste', phone: randomPhone() })
    .returning();
  const lunch = opts.lunch === undefined ? ['12:00', '13:00'] : opts.lunch;
  await db.insert(workingHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      professionalId: p!.id,
      weekday,
      start: opts.start ?? '08:00',
      end: opts.end ?? '18:00',
      lunchStart: lunch?.[0] ?? null,
      lunchEnd: lunch?.[1] ?? null,
    })),
  );
  const [s] = await db
    .insert(services)
    .values({ professionalId: p!.id, name: 'Sessão', durationMin: 50, priceCents: 15000 })
    .returning();
  return { professionalId: p!.id, salonId: salon!.id, phone: p!.phone, serviceId: s!.id };
}

/**
 * FakeGateway whose message ids do not repeat across test files: they all share one database,
 * where `messages.provider_message_id` is unique (each FakeGateway counts from 1 otherwise).
 */
export function testGateway() {
  const gw = new FakeGateway();
  // shortcut: reaches the private counter; ask packages/whatsapp for an id prefix option.
  (gw as unknown as { seq: number }).seq = randomInt(1, 2 ** 40) * 1000;
  return gw;
}
