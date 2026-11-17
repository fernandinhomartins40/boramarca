import { SUGGESTED_SERVICES } from '@boramarca/shared';
import { data } from '@/data';
import { mockWhatsAppState } from '@/data/whatsapp';
import { formatPhone, maskBrPhone, toE164 } from '@/features/auth/phone';
import { completeSignUp, suggestedServicesFor } from '@/features/auth/signup';
import { redirectFor } from '@/features/auth/useAuthGuard';
import { pauseUntil } from '@/features/settings/aiStore';
import {
  DEFAULT_WEEK,
  describeWeek,
  formatPrice,
  parsePrice,
  validateWeek,
} from '@/features/settings/format';
import { runSimulation } from '@/dev/simulations';
import '@/features/whatsapp/simulations';
import { atMinute } from '@/utils/agenda';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

it('masks and normalizes Brazilian phones', () => {
  expect(maskBrPhone('11987654321')).toBe('(11) 98765-4321');
  expect(maskBrPhone('1131234567')).toBe('(11) 3123-4567');
  expect(maskBrPhone('119')).toBe('(11) 9');
  expect(toE164('(11) 98765-4321')).toBe('+5511987654321');
  expect(toE164('(11) 9876')).toBeNull();
  expect(formatPhone('+5511987654321')).toBe('+55 (11) 98765-4321');
});

it('sends each session status to its route group', () => {
  expect(redirectFor('signedOut', '(tabs)')).toBe('/boas-vindas');
  expect(redirectFor('signedOut', '(auth)')).toBeNull();
  expect(redirectFor('onboarding', '(tabs)')).toBe('/cadastro');
  expect(redirectFor('onboarding', '(onboarding)')).toBeNull();
  expect(redirectFor('signedIn', '(auth)')).toBe('/');
  expect(redirectFor('signedIn', '(onboarding)')).toBeNull();
  expect(redirectFor('signedIn', 'agendamento')).toBeNull();
});

it('formats and parses prices and weeks', () => {
  expect(formatPrice(15000)).toBe('R$ 150,00');
  expect(formatPrice(15000, true)).toBe('R$ 150');
  expect(formatPrice(150050)).toBe('R$ 1.500,50');
  expect(parsePrice('150')).toBe(15000);
  expect(parsePrice('R$ 1.500,50')).toBe(150050);
  expect(parsePrice('abc')).toBeNull();
  expect(validateWeek(DEFAULT_WEEK)).toBeNull();
  expect(validateWeek({ ...DEFAULT_WEEK, days: [] })).toMatch(/pelo menos um dia/);
  expect(validateWeek({ ...DEFAULT_WEEK, start: '19:00', end: '09:00' })).toBe(
    'O fim vem depois do início',
  );
  expect(describeWeek(DEFAULT_WEEK)).toEqual({
    days: 'Seg a Sex, das 09h às 19h',
    lunch: 'Almoço das 12h às 13h',
  });
});

it('quick pause ends in 1h, at midnight, or never', () => {
  // salon time (America/Sao_Paulo): midnight is the salon's, not the phone's
  const now = new Date(atMinute('2026-11-14', 15 * 60 + 30));
  expect(pauseUntil('1h', now)).toBe(atMinute('2026-11-14', 16 * 60 + 30));
  expect(pauseUntil('tomorrow', now)).toBe(atMinute('2026-11-15', 0));
  expect(pauseUntil('indefinitely', now)).toBeNull();
});

it('sign-up creates the chosen services from SUGGESTED_SERVICES (server does not)', async () => {
  const services = suggestedServicesFor(['fisioterapeuta', 'dentista']);
  // "Avaliação" exists in both professions: suggested once.
  expect(services.filter((s) => s.name === 'Avaliação')).toHaveLength(1);
  expect(services).toHaveLength(
    SUGGESTED_SERVICES.fisioterapeuta.length + SUGGESTED_SERVICES.dentista.length - 1,
  );

  const before = (await data.profile.listServices()).length;
  const progress = jest.fn();
  await completeSignUp(
    {
      name: ' Marina Costa ',
      professions: ['fisioterapeuta'],
      services: suggestedServicesFor(['fisioterapeuta']),
      week: DEFAULT_WEEK,
    },
    { profile: false, hours: false, services: 0 },
    progress,
  );
  const after = await data.profile.listServices();
  expect(after).toHaveLength(before + SUGGESTED_SERVICES.fisioterapeuta.length);
  expect(after.map((s) => s.name)).toContain('Avaliação');
  expect((await data.profile.getMe()).professional.name).toBe('Marina Costa');
  expect(await data.profile.getWorkingHours()).toHaveLength(5);
  expect(progress).toHaveBeenLastCalledWith({ profile: true, hours: true, services: 3 });
});

it('sign-up retry continues after the last saved service (no duplicates)', async () => {
  const before = (await data.profile.listServices()).length;
  const services = suggestedServicesFor(['barbeiro']);
  await completeSignUp(
    { name: 'Rafa', professions: ['barbeiro'], services, week: DEFAULT_WEEK },
    { profile: true, hours: true, services: 2 },
    () => undefined,
  );
  expect((await data.profile.listServices()).length).toBe(before + services.length - 2);
});

it('dev menu simulations drive the WhatsApp mock (prompt 02 situations)', async () => {
  await runSimulation('whatsapp-code-expired');
  const code = await data.whatsapp.getPairingCode('+5511987654321');
  expect(Date.parse(code.expiresAt) - Date.now()).toBeLessThanOrEqual(5000);
  const next = await data.whatsapp.getPairingCode('+5511987654321');
  expect(Date.parse(next.expiresAt) - Date.now()).toBeGreaterThan(30_000);

  await runSimulation('whatsapp-drop');
  expect((await data.whatsapp.getStatus()).status).toBe('disconnected');
  await runSimulation('whatsapp-pairing-error');
  expect(mockWhatsAppState.failNextPairing).toBe(true);
  await runSimulation('whatsapp-pairing-success');
  expect(mockWhatsAppState.failNextPairing).toBe(false);
});
