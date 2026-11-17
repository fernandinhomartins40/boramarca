import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test re-imports the module (vi.resetModules): slow under the parallel root `pnpm test`.
vi.setConfig({ testTimeout: 30_000 });

const fb = vi.hoisted(() => ({
  confirm: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
  clear: vi.fn(),
  signOut: vi.fn(async () => {}),
}));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  signInWithPhoneNumber: fb.signInWithPhoneNumber,
  signOut: fb.signOut,
  RecaptchaVerifier: class {
    clear = fb.clear;
  },
}));

const ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'k',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'boramarca-app.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'boramarca-app',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:2:web:3',
};
const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./firebase-phone');
};
const el = {} as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  fb.signInWithPhoneNumber.mockResolvedValue({ confirm: fb.confirm });
  fb.confirm.mockResolvedValue({ user: { getIdToken: async () => 'id-token' } });
});
afterEach(() => vi.unstubAllEnvs());

describe('Firebase phone login (web)', () => {
  it('without the NEXT_PUBLIC_FIREBASE_* variables it is off', async () => {
    const m = await load({ NEXT_PUBLIC_FIREBASE_API_KEY: '' });
    expect(m.firebaseConfigured()).toBe(false);
    await expect(m.sendFirebaseCode('+5511987654321', el)).rejects.toMatchObject({
      code: 'OTP_UNAVAILABLE',
    });
    expect(fb.signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it('sends the SMS, then turns the typed code into an ID token', async () => {
    const m = await load(ENV);
    const confirm = await m.sendFirebaseCode('+5511987654321', el);
    expect(fb.signInWithPhoneNumber.mock.calls[0]![1]).toBe('+5511987654321');
    expect(fb.clear).toHaveBeenCalled();
    await expect(confirm('123456')).resolves.toBe('id-token');
    expect(fb.confirm).toHaveBeenCalledWith('123456');
    expect(fb.signOut).toHaveBeenCalled();
  });

  it.each([
    ['auth/invalid-verification-code', 'Código errado. Confira e tente de novo.'],
    ['auth/too-many-requests', 'Muitas tentativas. Espere alguns minutos e tente de novo.'],
  ])('wrong code: %s has a clear message', async (code, message) => {
    const m = await load(ENV);
    fb.confirm.mockRejectedValue(Object.assign(new Error('x'), { code }));
    const confirm = await m.sendFirebaseCode('+5511987654321', el);
    await expect(confirm('000000')).rejects.toMatchObject({ code, message });
  });

  it('invalid number has a clear message and the widget is cleared', async () => {
    const m = await load(ENV);
    fb.signInWithPhoneNumber.mockRejectedValue({ code: 'auth/invalid-phone-number' });
    await expect(m.sendFirebaseCode('+55', el)).rejects.toMatchObject({
      message: 'Número inválido. Informe o celular com DDD.',
    });
    expect(fb.clear).toHaveBeenCalled();
  });
});
