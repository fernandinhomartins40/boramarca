import type { AuthTokens } from '@boramarca/shared';
import { createApiData } from '@/data/api';
import { createApiClient, type TokenStore } from './api/client';
import { firebasePhoneSignIn } from './firebase-phone';

const mockConfirm = jest.fn();
const mockSignIn = jest.fn();
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({}),
  signInWithPhoneNumber: (...a: unknown[]) => mockSignIn(...a),
  signOut: async () => undefined,
}));

const BASE = 'http://api.test';
const later = new Date(Date.now() + 3600_000).toISOString();
const session = {
  accessToken: 'a',
  refreshToken: 'r',
  accessTokenExpiresAt: later,
  refreshTokenExpiresAt: later,
};
const otpSent = { ok: true, expiresInSeconds: 600, retryAfterSeconds: 60 };

/** Fake API: answers per path; remembers each call (path + JSON body). */
function fakeApi(provider?: 'firebase') {
  const calls: { path: string; body: unknown }[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace(`${BASE}/v1`, '');
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const body =
      path === '/auth/otp/request'
        ? { ...otpSent, ...(provider && { provider }) }
        : path === '/me'
          ? { ok: true, completedAt: later }
          : { ...session, isNewUser: false };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
  });
  const tokens = {
    get: () => session as AuthTokens,
    set: () => undefined,
    expired: () => undefined,
  };
  const client = createApiClient({
    baseUrl: BASE,
    tokens: tokens as TokenStore,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { client, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue({ user: { getIdToken: async () => 'id-token' } });
});

describe('Firebase phone login (app)', () => {
  it('provider firebase: Firebase sends the SMS and the code becomes POST /auth/firebase', async () => {
    const { client, calls } = fakeApi('firebase');
    const data = createApiData(client, firebasePhoneSignIn);
    await data.auth.requestOtp({ phone: '+5511987654321', purpose: 'login' });
    expect(mockSignIn.mock.calls[0]![1]).toBe('+5511987654321');
    await data.auth.verifyOtp({ phone: '+5511987654321', code: '123456' });
    expect(mockConfirm).toHaveBeenCalledWith('123456');
    expect(calls.at(-1)).toEqual({
      path: '/auth/firebase',
      body: { idToken: 'id-token', purpose: 'login' },
    });
  });

  it('without provider (review account, development) the code goes to /auth/otp/verify', async () => {
    const { client, calls } = fakeApi();
    const data = createApiData(client, firebasePhoneSignIn);
    await data.auth.requestOtp({ phone: '+5511900000099', purpose: 'login' });
    await data.auth.verifyOtp({ phone: '+5511900000099', code: '424242' });
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(calls.at(-1)!.path).toBe('/auth/otp/verify');
  });

  it('provider firebase in a build without Firebase: clear error', async () => {
    const data = createApiData(fakeApi('firebase').client);
    await expect(
      data.auth.requestOtp({ phone: '+5511987654321', purpose: 'login' }),
    ).rejects.toMatchObject({ code: 'OTP_UNAVAILABLE' });
  });

  it('account deletion sends the ID token instead of the code, and reuses it', async () => {
    const { client, calls } = fakeApi('firebase');
    const data = createApiData(client, firebasePhoneSignIn);
    await data.auth.requestOtp({ phone: '+5511987654321', purpose: 'delete_account' });
    await data.account.deleteMe({ code: '654321', origin: 'app' });
    await data.account.deleteMe({ code: '654321', origin: 'app', deleteWholeSalon: true });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(calls.at(-1)).toEqual({
      path: '/me',
      body: { idToken: 'id-token', origin: 'app', deleteWholeSalon: true },
    });
  });

  it.each([
    ['auth/invalid-verification-code', 'Código errado. Confira o SMS e tente de novo.'],
    ['auth/too-many-requests', 'Muitas tentativas. Espere alguns minutos e tente de novo.'],
  ])('%s has a clear message', async (code, message) => {
    mockConfirm.mockRejectedValue({ code });
    const confirm = await firebasePhoneSignIn('+5511987654321');
    await expect(confirm('000000')).rejects.toMatchObject({ code, message });
  });

  it('invalid number has a clear message', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-phone-number' });
    await expect(firebasePhoneSignIn('+55')).rejects.toMatchObject({
      message: 'Número inválido. Confira o DDD e o celular.',
    });
  });
});
