import { describe, expect, it, vi } from 'vitest';
import { NO_ACCOUNT, requestDeleteCode, signInToDelete } from './DeleteAccountFlow';

const tokens = {
  accessToken: 'tok',
  refreshToken: 'r',
  accessTokenExpiresAt: '2026-11-15T00:10:00.000Z',
  refreshTokenExpiresAt: '2026-12-15T00:00:00.000Z',
  isNewUser: false,
};

describe('/excluir-conta', () => {
  it('asks for a delete_account code before entering the account', async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) =>
      Response.json({ ok: true, expiresInSeconds: 600, retryAfterSeconds: 60 }),
    );
    await requestDeleteCode('+5511987654321', fetchMock);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3333/v1/auth/otp/request');
    expect(JSON.parse(String(init?.body))).toEqual({
      phone: '+5511987654321',
      purpose: 'delete_account',
    });
  });

  it('returns the session of an existing account', async () => {
    const fetchMock = vi.fn(async () => Response.json(tokens));
    await expect(signInToDelete('+5511987654321', '123456', fetchMock)).resolves.toBe('tok');
  });

  it('with Firebase, enters with the ID token on POST /auth/firebase (delete_account)', async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) =>
      Response.json(tokens),
    );
    await expect(signInToDelete('+5511987654321', '123456', fetchMock, 'id-tok')).resolves.toBe(
      'tok',
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3333/v1/auth/firebase');
    expect(JSON.parse(String(init?.body))).toEqual({
      idToken: 'id-tok',
      purpose: 'delete_account',
    });
  });

  it('says there is no account on 404 ACCOUNT_NOT_FOUND', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ statusCode: 404, code: 'ACCOUNT_NOT_FOUND', message: 'x' }, { status: 404 }),
    );
    await expect(signInToDelete('+5511987654321', '123456', fetchMock)).rejects.toMatchObject({
      status: 404,
      code: 'ACCOUNT_NOT_FOUND',
      message: NO_ACCOUNT,
    });
    expect(NO_ACCOUNT).toBe('Não existe conta com este número.');
  });
});
